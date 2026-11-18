"""
Unit tests for unified InvoiceValidator service.
Enforces QA Auditor, Financial Compliance, and Senior Backend standards.
"""
import pytest
from backend.app.schemas.invoice import (
    CanonicalInvoice,
    InvoiceMetadata,
    LineItem,
    SupplierDetails,
    TaxBreakdown,
)
from backend.app.services.invoice_validator import InvoiceValidator


class TestInvoiceValidator:
    """Tests arithmetic, date normalization, and tax ID validation."""

    def test_date_normalization(self):
        """Verifies ISO-8601 YYYY-MM-DD date normalization."""
        assert InvoiceValidator.normalize_date("22-Feb-2026") == "2026-02-22"
        assert InvoiceValidator.normalize_date("07/24/2018") == "2018-07-24"
        assert InvoiceValidator.normalize_date("2026-11-17") == "2026-11-17"
        assert InvoiceValidator.normalize_date("14 Nov 2026") == "2026-11-14"
        # Indian DD/MM/YYYY dayfirst check (05/11/2026 should be Nov 5, not May 11)
        assert InvoiceValidator.normalize_date("05/11/2026") == "2026-11-05"
        assert InvoiceValidator.normalize_date("2026.11.15") == "2026-11-15"
        assert InvoiceValidator.normalize_date(None) is None

    def test_missing_or_corrupted_invoice_date(self):
        """Verifies unparseable/corrupted invoice date is flagged by validator."""
        # Corrupted date format
        inv_bad_date = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC SUPPLIES", gstin="33AABCT1234F1Z9"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="not-a-date", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0),
            grand_total=118.0,
        )
        is_valid, errors = InvoiceValidator.validate(inv_bad_date)
        assert is_valid is False
        assert any("valid ISO-8601" in e for e in errors)

    def test_indian_gstin_validation(self):
        """Verifies strict 15-character GSTIN enforcement for INR invoices."""
        valid_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC SUPPLIES", gstin="33AABCT1234F1Z9"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0),
            grand_total=118.0,
        )
        is_valid, errors = InvoiceValidator.validate(valid_inv)
        assert is_valid is True
        assert len(errors) == 0

        invalid_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC SUPPLIES", gstin="INVALID_GSTIN"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0),
            grand_total=118.0,
        )
        is_valid, errors = InvoiceValidator.validate(invalid_inv)
        assert is_valid is False
        assert any("GSTIN" in e for e in errors)

    def test_buyer_gstin_validation(self):
        """Verifies strict 15-character GSTIN enforcement for Buyer on INR invoices."""
        from backend.app.schemas.invoice import BuyerDetails

        # Valid Buyer GSTIN (Inter-state supply with IGST)
        valid_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC SUPPLIES", gstin="33AABCT1234F1Z9"),
            buyer=BuyerDetails(name="XYZ CLIENT", gstin="27BBBBB0000A1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(igst=18.0),
            grand_total=118.0,
        )
        is_valid, errors = InvoiceValidator.validate(valid_inv)
        assert is_valid is True
        assert len(errors) == 0

        # Invalid Buyer GSTIN
        invalid_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC SUPPLIES", gstin="33AABCT1234F1Z9"),
            buyer=BuyerDetails(name="XYZ CLIENT", gstin="BAD_BUYER_GSTIN"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0),
            grand_total=118.0,
        )
        is_valid, errors = InvoiceValidator.validate(invalid_inv)
        assert is_valid is False
        assert any("Buyer GSTIN" in e for e in errors)

    def test_gstin_state_code_vs_place_of_supply(self):
        """Verifies state code prefix matches place of supply."""
        from backend.app.schemas.invoice import BuyerDetails

        # Matching Supplier state code (33 = Tamil Nadu)
        valid_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="TN SUPPLIER", gstin="33AABCT1234F1Z9"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", place_of_supply="33-Tamil Nadu", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0),
            grand_total=118.0,
        )
        is_valid, errors = InvoiceValidator.validate(valid_inv)
        assert is_valid is True
        assert len(errors) == 0

        # Conflicting state code in place of supply (27-Maharashtra vs 33-Tamil Nadu supplier and 33 buyer)
        invalid_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="TN SUPPLIER", gstin="33AABCT1234F1Z9"),
            buyer=BuyerDetails(name="TN BUYER", gstin="33XYZAB1234F1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", place_of_supply="27-Maharashtra", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0),
            grand_total=118.0,
        )
        is_valid, errors = InvoiceValidator.validate(invalid_inv)
        assert is_valid is False
        assert any("Place of supply state code" in e for e in errors)

    def test_individual_line_item_arithmetic(self):
        """Verifies individual line item quantity * unit_price - discount == total_amount."""
        # Line item arithmetic error: Qty 10 * 10 = 100, but line total is 500
        inv_bad_line = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC SUPPLIES", gstin="33AABCT1234F1Z9"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", currency="INR"),
            line_items=[
                LineItem(description="Widget A", quantity=10.0, unit_price=10.0, discount=0.0, total_amount=500.0)
            ],
            subtotal=500.0,
            tax=TaxBreakdown(),
            grand_total=500.0
        )
        is_valid, errors = InvoiceValidator.validate(inv_bad_line)
        assert is_valid is False
        assert any("arithmetic mismatch" in e and "MATH_ERROR" in e for e in errors)

    def test_intra_and_inter_state_tax_consistency(self):
        """Verifies CGST=SGST for intra-state and IGST for inter-state."""
        from backend.app.schemas.invoice import BuyerDetails

        # Intra-state error: Both state 33 (TN), but CGST=18, SGST=0
        inv_intra_bad = CanonicalInvoice(
            supplier=SupplierDetails(name="TN SUPPLIER", gstin="33AABCT1234F1Z9"),
            buyer=BuyerDetails(name="TN BUYER", gstin="33XYZAB1234F1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=18.0, sgst=0.0, igst=0.0),
            grand_total=118.0
        )
        is_valid, errors = InvoiceValidator.validate(inv_intra_bad)
        assert is_valid is False
        assert any("Intra-state GST mismatch" in e for e in errors)

        # Inter-state error: Supplier 33 (TN), Buyer 27 (MH), but charges CGST/SGST instead of IGST
        inv_inter_bad = CanonicalInvoice(
            supplier=SupplierDetails(name="TN SUPPLIER", gstin="33AABCT1234F1Z9"),
            buyer=BuyerDetails(name="MH BUYER", gstin="27XYZAB1234F1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-2", invoice_date="2026-11-17", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0, igst=0.0),
            grand_total=118.0
        )
        is_valid, errors = InvoiceValidator.validate(inv_inter_bad)
        assert is_valid is False
        assert any("Inter-state invoice" in e and "IGST" in e for e in errors)

    def test_precision_tolerance_allows_small_variance(self):
        """Verifies variance <= 1.00 INR is allowed while larger discrepancies are flagged."""
        # 0.40 INR discrepancy is within ₹1.00 tolerance
        inv_tolerated = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC SUPPLIES", gstin="33AABCT1234F1Z9"),
            metadata=InvoiceMetadata(invoice_number="INV-1", invoice_date="2026-11-17", currency="INR"),
            subtotal=100.0,
            tax=TaxBreakdown(cgst=9.0, sgst=9.0),
            grand_total=118.40  # 40 paise variance
        )
        is_valid, errors = InvoiceValidator.validate(inv_tolerated)
        assert is_valid is True
        assert len(errors) == 0

    def test_international_tax_id_accepted_for_foreign_currencies(self):
        """Verifies foreign tax/VAT numbers are accepted for USD/NAD/EUR invoices."""
        foreign_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="GLOBAL CORP", gstin="4704177085"),
            metadata=InvoiceMetadata(invoice_number="INV-2", invoice_date="2026-11-17", currency="NAD"),
            subtotal=1000.0,
            tax=TaxBreakdown(igst=150.0),
            grand_total=1150.0,
        )
        is_valid, errors = InvoiceValidator.validate(foreign_inv)
        assert is_valid is True
        assert len(errors) == 0

    def test_line_items_matching_subtotal_accepted(self):
        """Verifies line items summing to subtotal (tax-exclusive) pass validation."""
        inv = CanonicalInvoice(
            supplier=SupplierDetails(name="TECH LTD", gstin="33AABCT1234F1Z9"),
            metadata=InvoiceMetadata(invoice_number="INV-3", invoice_date="2026-11-17", currency="INR"),
            line_items=[
                LineItem(description="Item 1", quantity=1.0, unit_price=500.0, total_amount=500.0),
                LineItem(description="Item 2", quantity=1.0, unit_price=500.0, total_amount=500.0),
            ],
            subtotal=1000.0,
            tax=TaxBreakdown(cgst=90.0, sgst=90.0),
            grand_total=1180.0,
        )
        is_valid, errors = InvoiceValidator.validate(inv)
        assert is_valid is True

    def test_arithmetic_mismatch_detected(self):
        """Verifies mathematical discrepancy is flagged."""
        inv = CanonicalInvoice(
            supplier=SupplierDetails(name="MATH ERROR LTD", gstin="33AABCT1234F1Z9"),
            metadata=InvoiceMetadata(invoice_number="INV-4", invoice_date="2026-11-17", currency="INR"),
            subtotal=1000.0,
            tax=TaxBreakdown(cgst=90.0, sgst=90.0),
            grand_total=1500.0,  # Intentional discrepancy
        )
        is_valid, errors = InvoiceValidator.validate(inv)
        assert is_valid is False
        assert any("Grand total mismatch" in e for e in errors)

    def test_none_invoice_handling(self):
        """Verifies that passing None to validate returns False with an error message and does not crash."""
        is_valid, errors = InvoiceValidator.validate(None)
        assert is_valid is False
        assert "Invoice object is None" in errors

    def test_partial_invoice_defensive_null_safety(self):
        """Verifies that an invoice with None tax or optional fields does not raise AttributeError."""
        # Test null safety when attributes are None
        dummy_inv = type("DummyInvoice", (), {
            "metadata": None,
            "supplier": None,
            "tax": None,
            "subtotal": 100.0,
            "grand_total": 100.0,
            "round_off": 0.0,
            "line_items": []
        })()
        is_valid, errors = InvoiceValidator.validate(dummy_inv)
        # Should execute safely without raising any exception
        assert isinstance(is_valid, bool)
        assert isinstance(errors, list)

    def test_date_normalization_edge_cases(self):
        """Verifies null string variations return None safely."""
        assert InvoiceValidator.normalize_date("null") is None
        assert InvoiceValidator.normalize_date("none") is None
        assert InvoiceValidator.normalize_date("N/A") is None
        assert InvoiceValidator.normalize_date("unknown") is None
        assert InvoiceValidator.normalize_date("   ") is None
