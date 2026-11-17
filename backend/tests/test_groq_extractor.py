"""
Unit and integration tests for Groq LPU text-LLM extraction service.
Enforces Senior Backend Developer, QA Auditor, and API Tester standards.
"""
import pytest
from unittest.mock import MagicMock, patch
from backend.app.schemas.invoice import CanonicalInvoice, ExtractionResponse
from backend.app.services.groq_extractor import GroqExtractor


class TestGroqExtractor:
    """Tests the GroqExtractor class and its low-token pipeline."""

    def test_groq_initialization(self):
        """Verifies Groq extractor initializes and identifies active API key."""
        extractor = GroqExtractor()
        assert extractor.primary_model == "qwen/qwen3.8-27b"
        assert extractor.fallback_model == "openai/gpt-oss-20b"
        assert extractor.is_active is True
        assert extractor.client is not None

    def test_groq_extract_from_text_success(self):
        """Verifies live text extraction using Groq's low-token LPU endpoint."""
        extractor = GroqExtractor()
        sample_text = """
        ABC INDUSTRIAL DISTRIBUTORS PVT LTD
        GSTIN: 33AABCT1234F1Z9
        Invoice No: INV-2026-891
        Date: 2026-11-17
        Bill To: Southern Logistics Corp
        Item: Ball Bearings
        Qty: 10
        Price: 500.00
        Subtotal: 5000.00
        CGST: 450.00
        SGST: 450.00
        Total: 5900.00
        """
        response = extractor.extract_from_text(sample_text, filename="test_invoice.txt")
        assert response.success is True
        assert response.invoice is not None
        assert "groq" in response.provider
        assert response.invoice.supplier.name is not None
        assert response.invoice.metadata.invoice_number == "INV-2026-891"
        assert response.invoice.metadata.invoice_date == "2026-11-17"
        assert response.invoice.grand_total == 5900.0
        assert response.validation_passed is True

    def test_groq_fallback_on_client_failure(self):
        """Verifies graceful fallback to deterministic local parsing if Groq client fails."""
        extractor = GroqExtractor()
        with patch.object(extractor.client.chat.completions, "create", side_effect=Exception("Groq rate limit simulated")):
            response = extractor.extract_from_text("Dummy invoice text", filename="dummy.txt")
            assert response.success is True
            assert response.provider == "local_ocr_fallback"
            assert response.invoice is not None

    def test_groq_status_endpoint(self, client):
        """Verifies GET /api/v1/extract/status includes Groq configuration."""
        response = client.get("/api/v1/extract/status")
        assert response.status_code == 200
        data = response.json()
        assert "groq_active" in data
        assert "groq_model" in data
        assert data["groq_model"] == "qwen/qwen3.8-27b"
        assert data["groq_api_key_configured"] is True
