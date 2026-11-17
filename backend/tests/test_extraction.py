"""
Automated unit and integration test suite for AI Invoice Extraction.
Enforces QA Auditor, API Tester, and Senior Backend Developer standards.
"""
import pytest
from backend.app.schemas.invoice import (
    CanonicalInvoice,
    InvoiceMetadata,
    LineItem,
    SupplierDetails,
    TaxBreakdown,
)
from backend.app.services.gemini_extractor import GeminiExtractor


class TestInvoiceExtractionAPI:
    """Tests the /api/v1/extract endpoints and extraction services."""

    def test_extraction_status(self, client):
        """Verifies GET /api/v1/extract/status returns active engine status."""
        response = client.get("/api/v1/extract/status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["active_mode"] in ("mock", "gemini_api", "vertex_ai")
        assert "model_name" in data

    def test_extract_invoice_image(self, client, sample_image_bytes):
        """Verifies POST /api/v1/extract extracts canonical invoice from an image."""
        response = client.post(
            "/api/v1/extract",
            files={"file": ("invoice.png", sample_image_bytes, "image/png")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["invoice"] is not None

        inv = data["invoice"]
        assert inv["supplier"]["name"] is not None
        assert inv["metadata"]["invoice_number"] is not None
        assert inv["grand_total"] > 0
        assert len(inv["line_items"]) >= 1
        assert "validation_passed" in data

    def test_extract_b2b_qr_fastpath(self, client, sample_gst_einvoice_qr_image_bytes):
        """Verifies that an invoice with a B2B QR code bypasses LLM and returns instantly with provider='b2b_qr'."""
        response = client.post(
            "/api/v1/extract",
            files={"file": ("einvoice_qr.png", sample_gst_einvoice_qr_image_bytes, "image/png")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["provider"] == "b2b_qr"
        assert data["invoice"]["supplier"]["gstin"] == "33AAAAA0000A1Z5"
        assert data["invoice"]["metadata"]["invoice_number"] == "INV-2026-QR-001"
        assert data["invoice"]["grand_total"] == 11800.0

    def test_extract_empty_file(self, client):
        """Verifies HTTP 400 when uploading an empty file for extraction."""
        response = client.post(
            "/api/v1/extract",
            files={"file": ("empty.pdf", b"", "application/pdf")}
        )
        assert response.status_code == 400

    def test_arithmetic_validator_matching(self):
        """Unit test: verifies arithmetic validator passes on correct calculations."""
        inv = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC LTD"),
            metadata=InvoiceMetadata(invoice_number="INV-1"),
            subtotal=1000.0,
            tax=TaxBreakdown(cgst=90.0, sgst=90.0),
            round_off=0.0,
            grand_total=1180.0
        )
        valid, errors = GeminiExtractor.validate_arithmetic(inv)
        assert valid is True
        assert len(errors) == 0

    def test_arithmetic_validator_mismatch(self):
        """Unit test: verifies arithmetic validator catches mismatched calculations."""
        inv = CanonicalInvoice(
            supplier=SupplierDetails(name="ABC LTD"),
            metadata=InvoiceMetadata(invoice_number="INV-1"),
            subtotal=1000.0,
            tax=TaxBreakdown(cgst=90.0, sgst=90.0),
            round_off=0.0,
            grand_total=1500.0  # Intentional error: should be 1180.0
        )
        valid, errors = GeminiExtractor.validate_arithmetic(inv)
        assert valid is False
        assert len(errors) == 1
        assert "Grand total mismatch" in errors[0]
