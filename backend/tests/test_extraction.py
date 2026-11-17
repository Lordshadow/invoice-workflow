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
        """Verifies that an optional B2B QR code enriches and verifies the full extraction without omitting line items."""
        response = client.post(
            "/api/v1/extract",
            files={"file": ("einvoice_qr.png", sample_gst_einvoice_qr_image_bytes, "image/png")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "qr_verified" in data["provider"]
        assert data["invoice"]["supplier"]["name"] is not None
        assert data["invoice"]["supplier"]["gstin"] is not None
        assert len(data["invoice"]["line_items"]) >= 1  # Full line items are preserved!
        assert "Verified against Indian GST" in data["invoice"]["extraction_notes"]

    def test_extract_b2b_qr_synthesis_when_zero_total(self, client, sample_gst_einvoice_qr_image_bytes, monkeypatch):
        """Verifies that if an invoice only contains a QR code with 0 total, line items and totals are synthesized safely."""
        from unittest.mock import MagicMock
        from backend.app.schemas.invoice import ExtractionResponse
        from backend.app.routers.extraction import service

        # Mock AI extraction returning 0 total
        zero_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="QR Supplier"),
            metadata=InvoiceMetadata(invoice_number="QR-001"),
            line_items=[],
            subtotal=0.0,
            grand_total=0.0
        )
        mock_resp = ExtractionResponse(
            success=True,
            provider="mock",
            model_name="mock",
            latency_ms=10.0,
            invoice=zero_inv,
            validation_passed=True
        )
        monkeypatch.setattr(service.groq_extractor, "extract_from_text", lambda *a, **k: mock_resp)
        monkeypatch.setattr(service.gemini_extractor, "extract_from_text", lambda *a, **k: mock_resp)
        monkeypatch.setattr(service.gemini_extractor, "extract_invoice", lambda *a, **k: mock_resp)

        response = client.post(
            "/api/v1/extract",
            files={"file": ("einvoice_qr.png", sample_gst_einvoice_qr_image_bytes, "image/png")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["invoice"]["grand_total"] == 11800.0
        assert len(data["invoice"]["line_items"]) >= 1
        assert data["invoice"]["line_items"][0]["total_amount"] == 11800.0

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
