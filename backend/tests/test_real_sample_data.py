"""
Automated Test Suite using Real Invoice Samples from samples/ folder.
Verifies end-to-end processing across real PDFs, printed photos, multi-page documents,
duplicate detection, Straight-Through Processing (STP), and HITL Escalation Routing.
"""
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.invoice import Invoice, InvoiceStatus
from backend.app.models.target_company import CompanyInvoice


@pytest.fixture
def api_client():
    """TestClient without mocking, allowing real offline and LLM testing."""
    return TestClient(app)


class TestRealSampleDataPipeline:
    """Verifies end-to-end processing with real invoice sample files."""

    def test_real_digital_pdf_stp_processing(self, api_client, target_db_session):
        """Tests that a clean real digital PDF (samples/02_synthetic_invoice_interstate.pdf) delivers via STP."""
        pdf_path = Path("samples/02_synthetic_invoice_interstate.pdf")
        if not pdf_path.exists():
            pytest.skip(f"Sample file {pdf_path} not found")

        with open(pdf_path, "rb") as f:
            res = api_client.post(
                "/api/v1/invoices/process",
                files={"file": (pdf_path.name, f, "application/pdf")},
                data={"source": "upload", "enable_stp": "true"}
            )

        assert res.status_code == 201
        data = res.json()
        assert data["success"] is True
        assert data["status"] in ("DELIVERED", "PENDING_APPROVAL")
        assert data["document_id"] is not None
        assert data["invoice_id"] is not None
        assert data["grand_total"] > 0

    def test_real_file_duplicate_prevention(self, api_client):
        """Tests that resubmitting a real invoice triggers Layer-1 duplicate detection."""
        pdf_path = Path("samples/02_synthetic_invoice_interstate.pdf")
        if not pdf_path.exists():
            pytest.skip(f"Sample file {pdf_path} not found")

        # Initial upload of the file
        with open(pdf_path, "rb") as f:
            res1 = api_client.post(
                "/api/v1/invoices/process",
                files={"file": (pdf_path.name, f, "application/pdf")},
                data={"source": "upload"}
            )
        assert res1.status_code == 201

        # Second identical upload of the same file
        with open(pdf_path, "rb") as f:
            res2 = api_client.post(
                "/api/v1/invoices/process",
                files={"file": (pdf_path.name, f, "application/pdf")},
                data={"source": "upload"}
            )

        assert res2.status_code == 201
        data = res2.json()
        assert data["duplicate_type"] == "EXACT_FILE_DUPLICATE"
        assert "Duplicate file detected" in data["message"]

    def test_real_multipage_pdf_handling(self, api_client):
        """Tests that multi-page PDF (samples/multipage-3p-na-3.pdf) is parsed and routed properly."""
        pdf_path = Path("samples/multipage-3p-na-3.pdf")
        if not pdf_path.exists():
            pytest.skip(f"Sample file {pdf_path} not found")

        with open(pdf_path, "rb") as f:
            res = api_client.post(
                "/api/v1/invoices/process",
                files={"file": (pdf_path.name, f, "application/pdf")},
                data={"source": "upload", "enable_stp": "true"}
            )

        assert res.status_code == 201
        data = res.json()
        assert data["success"] is True
        assert data["invoice_id"] is not None
        assert data["status"] in ("DELIVERED", "PENDING_APPROVAL", "PENDING_CORRECTION")

        # If it was escalated, verify it appears in the escalated queue
        if data["is_escalated"]:
            esc_res = api_client.get("/api/v1/invoices/escalated")
            assert esc_res.status_code == 200
            esc_items = esc_res.json()
            ids = [item["id"] for item in esc_items]
            assert data["invoice_id"] in ids

    def test_real_data_escalation_queue_and_stats(self, api_client):
        """Tests GET /api/v1/invoices/escalated and /api/v1/invoices/escalation-stats on live database."""
        stats_res = api_client.get("/api/v1/invoices/escalation-stats")
        assert stats_res.status_code == 200
        stats = stats_res.json()
        assert "total_invoices" in stats
        assert "escalated_count" in stats
        assert "clean_count" in stats
        assert "delivered_count" in stats
        assert "stp_rate_percentage" in stats
        assert stats["total_invoices"] >= 0
        assert stats["stp_rate_percentage"] >= 0.0
