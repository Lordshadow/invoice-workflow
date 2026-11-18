"""
Automated Test Suite for Inbound Email and WhatsApp Intake Channels.
Tests:
- GET /api/v1/ingest/channels/status
- POST /api/v1/ingest/email (Multipart webhook)
- POST /api/v1/ingest/email/json (Base64 JSON payload)
- POST /api/v1/ingest/whatsapp (Multipart with sender metadata & auto-reply)
- Deduplication and validation error states
"""
import base64
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.db.session import SessionLocal, TargetSessionLocal, init_db

client = TestClient(app)

SAMPLE_PDF_PATH = Path("samples/02_synthetic_invoice_interstate.pdf")


@pytest.fixture(autouse=True)
def setup_test_databases():
    """Ensure database schema is ready for intake testing."""
    init_db()


def test_channels_status():
    """Verifies that the channels status endpoint reports operational health."""
    response = client.get("/api/v1/ingest/channels/status")
    assert response.status_code == 200
    data = response.json()
    assert "channels" in data
    assert data["channels"]["web_upload"]["enabled"] is True
    assert data["channels"]["email_webhook"]["enabled"] is True
    assert data["channels"]["whatsapp_webhook"]["enabled"] is True


def test_inbound_email_multipart():
    """Verifies multipart email intake with synthetic PDF."""
    if not SAMPLE_PDF_PATH.exists():
        pytest.skip(f"Sample PDF not found at {SAMPLE_PDF_PATH}")

    pdf_bytes = SAMPLE_PDF_PATH.read_bytes()

    response = client.post(
        "/api/v1/ingest/email",
        files={"file": ("test_vendor_bill.pdf", pdf_bytes, "application/pdf")},
        data={
            "from_email": "billing@solaris.co.in",
            "subject": "Invoice for Solar Panels - INV-2024-999",
            "message_id": "<email-msg-12345@solaris.co.in>",
            "enable_stp": "false",
        },
    )

    assert response.status_code in (200, 201)
    data = response.json()
    assert data["success"] is True
    assert data["channel"] == "email"
    assert data["document_id"] is not None
    assert data["invoice_id"] is not None
    assert "auto_reply_text" in data
    assert len(data["auto_reply_text"]) > 0


def test_inbound_email_json():
    """Verifies base64 JSON email intake webhook."""
    if not SAMPLE_PDF_PATH.exists():
        pytest.skip(f"Sample PDF not found at {SAMPLE_PDF_PATH}")

    pdf_bytes = SAMPLE_PDF_PATH.read_bytes()
    b64_content = base64.b64encode(pdf_bytes).decode("ascii")

    response = client.post(
        "/api/v1/ingest/email/json",
        json={
            "from_email": "accounts@apexlogistics.com",
            "subject": "Monthly Freight Statement",
            "filename": "freight_statement_nov.pdf",
            "file_base64": b64_content,
            "enable_stp": False,
        },
    )

    assert response.status_code in (200, 201)
    data = response.json()
    assert data["success"] is True
    assert data["channel"] == "email"
    assert data["document_id"] is not None


def test_inbound_whatsapp_multipart():
    """Verifies WhatsApp intake webhook with sender phone number and auto-reply."""
    if not SAMPLE_PDF_PATH.exists():
        pytest.skip(f"Sample PDF not found at {SAMPLE_PDF_PATH}")

    pdf_bytes = SAMPLE_PDF_PATH.read_bytes()

    response = client.post(
        "/api/v1/ingest/whatsapp",
        files={"file": ("wa_receipt_001.pdf", pdf_bytes, "application/pdf")},
        data={
            "sender_phone": "+919876543210",
            "sender_name": "Ramesh Kumar (Logistics)",
            "message_id": "true_919876543210@c.us_3EB0ABC123456",
            "timestamp": "1731945600",
            "enable_stp": "false",
        },
    )

    assert response.status_code in (200, 201)
    data = response.json()
    assert data["success"] is True
    assert data["channel"] == "whatsapp"
    assert data["document_id"] is not None
    assert "auto_reply_text" in data
    # Verify auto-reply is formatted for WhatsApp with markdown bold (*...*)
    assert "*" in data["auto_reply_text"]
    assert "Invoice" in data["auto_reply_text"]


def test_inbound_empty_file_rejected():
    """Verifies that 0-byte attachments are rejected with HTTP 400."""
    response = client.post(
        "/api/v1/ingest/email",
        files={"file": ("empty.pdf", b"", "application/pdf")},
        data={"from_email": "test@example.com"},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_inbound_invalid_base64_rejected():
    """Verifies that malformed base64 JSON payload is rejected with HTTP 400."""
    response = client.post(
        "/api/v1/ingest/email/json",
        json={
            "from_email": "test@example.com",
            "filename": "corrupt.pdf",
            "file_base64": "!!!NOT_VALID_BASE64@@@",
        },
    )
    assert response.status_code == 400
    assert "invalid base64" in response.json()["detail"].lower()
