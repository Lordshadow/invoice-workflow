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
        assert InvoiceValidator.normalize_date(None) is None

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
