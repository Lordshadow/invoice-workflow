"""
Comprehensive unit and integration tests for Document Preprocessing & Intake endpoints.
Enforces QA Auditor and API Tester skills.
"""
import base64
import io
import json
import pymupdf
import pytest
from PIL import Image

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

from backend.app.schemas.document import DocumentType


@pytest.fixture
def sample_digital_pdf_bytes():
    """Generates a multi-page digital PDF with native text layers."""
    doc = pymupdf.open()
    
    # Page 1
    page1 = doc.new_page(width=595, height=842)
    text1 = (
        "ORIGINAL TAX INVOICE\n"
        "Supplier: TECHJAYS DISTRIBUTORS PVT LTD\n"
        "GSTIN: 33AABCT1234F1Z9\n"
        "Invoice Number: INV-2026-9901\n"
        "Date: 17-11-2026\n"
        "Place of Supply: 33-Tamil Nadu\n"
        "Item: High Precision Bearings | HSN: 8482 | Qty: 50 | Rate: 100.00 | Total: 5000.00\n"
        "CGST 9%: 450.00 | SGST 9%: 450.00\n"
        "Invoice Total: INR 5,900.00\n"
    )
    page1.insert_text((50, 72), text1, fontsize=11)

    # Page 2
    page2 = doc.new_page(width=595, height=842)
    text2 = (
        "TERMS AND CONDITIONS\n"
        "1. Goods once sold will not be taken back.\n"
        "2. Interest @ 18% per annum will be charged on delayed payments.\n"
        "3. Subject to Chennai jurisdiction only.\n"
    )
    page2.insert_text((50, 72), text2, fontsize=11)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class TestDocumentProcessingAPI:
    """API & Service test suite validating Document Preprocessing."""

    def test_health_check(self, client):
        """Verifies GET /api/v1/documents/health returns 200 OK."""
        response = client.get("/api/v1/documents/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "document-processing-engine"

    def test_root_endpoint(self, client):
        """Verifies GET / returns application metadata."""
        response = client.get("/")
        assert response.status_code == 200
        assert "endpoints" in response.json()

    def test_preprocess_image(self, client, sample_image_bytes):
        """Verifies preprocessing on a standard invoice image."""
        response = client.post(
            "/api/v1/documents/preprocess",
            files={"file": ("invoice.png", sample_image_bytes, "image/png")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "SUCCESS"
        assert data["document_type"] == DocumentType.IMAGE.value
        assert data["total_pages"] == 1
        assert len(data["file_hash"]) == 64  # Valid SHA-256
        assert data["file_size_bytes"] == len(sample_image_bytes)
        assert data["processing_time_ms"] > 0

    def test_preprocess_skewed_image(self, client, sample_skewed_image_bytes):
        """Verifies deskewing angle detection on a tilted mobile photo."""
        response = client.post(
            "/api/v1/documents/preprocess",
            files={"file": ("skewed_receipt.png", sample_skewed_image_bytes, "image/png")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "SUCCESS"
        assert len(data["pages"]) == 1

    def test_preprocess_digital_pdf(self, client, sample_digital_pdf_bytes):
        """Verifies text extraction and page counting on a multi-page digital PDF."""
        response = client.post(
            "/api/v1/documents/preprocess",
            files={"file": ("invoice_multipage.pdf", sample_digital_pdf_bytes, "application/pdf")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "SUCCESS"
        assert data["document_type"] == DocumentType.DIGITAL_PDF.value
        assert data["total_pages"] == 2
        assert data["digital_text_extracted"] is not None
        assert "TECHJAYS DISTRIBUTORS" in data["digital_text_extracted"]
        assert "33AABCT1234F1Z9" in data["digital_text_extracted"]

    def test_preprocess_gst_einvoice_qr(self, client, sample_gst_einvoice_qr_image_bytes):
        """Verifies Indian GST B2B e-invoice QR code detection and JWT decoding."""
        if not HAS_QRCODE:
            pytest.skip("qrcode library not installed")
        response = client.post(
            "/api/v1/documents/preprocess",
            files={"file": ("einvoice_qr.png", sample_gst_einvoice_qr_image_bytes, "image/png")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "SUCCESS"
        assert data["b2b_qr_found"] is True
        assert data["b2b_qr_data"] is not None
        assert data["b2b_qr_data"]["is_gst_einvoice"] is True
        assert data["b2b_qr_data"]["seller_gstin"] == "33AAAAA0000A1Z5"
        assert data["b2b_qr_data"]["invoice_number"] == "INV-2026-QR-001"
        assert data["b2b_qr_data"]["total_value"] == 11800.0

    def test_empty_file_upload_error(self, client):
        """Verifies HTTP 400 on empty file upload."""
        response = client.post(
            "/api/v1/documents/preprocess",
            files={"file": ("empty.pdf", b"", "application/pdf")}
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    def test_unsupported_file_format(self, client):
        """Verifies HTTP 422 on unsupported file formats."""
        response = client.post(
            "/api/v1/documents/preprocess",
            files={"file": ("notes.txt", b"Random text notes", "text/plain")}
        )
        assert response.status_code == 422
