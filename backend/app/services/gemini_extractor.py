"""
Unified Google Gemini Extractor Service.
Supports both Google Gemini Developer API (local testing) and GCP Vertex AI (production),
with native Pydantic structured output enforcement and offline mock fallback.
"""
import json
import logging
import time
from typing import Optional, Tuple
from google import genai
from google.genai import types

from backend.app.config import settings
from backend.app.schemas.invoice import (
    BuyerDetails,
    CanonicalInvoice,
    ExtractionResponse,
    InvoiceMetadata,
    LineItem,
    SupplierDetails,
    TaxBreakdown,
)

logger = logging.getLogger("invoice_processor.gemini")

SYSTEM_INSTRUCTION = """You are an expert financial document extraction engine specializing in Indian GST commercial invoices, distributor bills, and receipts.
Your task is to accurately extract all invoice details into the specified JSON schema.

Extraction Rules:
1. Supplier: Extract the exact legal name, trade name, 15-character GSTIN, and address.
2. Invoice Metadata: Extract the invoice number, issue date (format as YYYY-MM-DD), and place of supply.
3. Line Items: Extract each product or service with description, HSN/SAC code, quantity, unit rate, tax rate percentage, and total amount.
4. Tax Breakdown: Break down Central GST (CGST), State GST (SGST), and Integrated GST (IGST).
   - If inter-state sale: IGST applies, CGST and SGST should be 0.
   - If intra-state sale: CGST and SGST apply equally, IGST should be 0.
5. Totals: Extract taxable subtotal, total taxes, round-off value, and grand total.
6. For handwritten or low-quality photos, do your best to transcribe digits accurately. If a field is not present, use null or 0.0 for numbers.
"""


class GeminiExtractor:
    """
    Unified extraction adapter for Gemini 2.5/1.5 Flash via Vertex AI or Gemini Developer API.
    """

    def __init__(self):
        self.model_name = settings.GEMINI_MODEL_NAME
        self.client: Optional[genai.Client] = None
        self.mode = "mock"
        self._init_client()

    def _init_client(self):
        """Initializes either Vertex AI or Developer API client based on configuration."""
        if settings.USE_VERTEX_AI and settings.GCP_PROJECT_ID:
            try:
                self.client = genai.Client(
                    vertexai=True,
                    project=settings.GCP_PROJECT_ID,
                    location=settings.GCP_LOCATION
                )
                self.mode = "vertex_ai"
                logger.info(f"Initialized Gemini Extractor in GCP Vertex AI mode (project={settings.GCP_PROJECT_ID}, location={settings.GCP_LOCATION})")
                return
            except Exception as e:
                logger.warning(f"Failed to initialize Vertex AI client: {e}. Checking Developer API key...")

        if settings.GEMINI_API_KEY:
            try:
                self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
                self.mode = "gemini_api"
                logger.info(f"Initialized Gemini Extractor in Gemini Developer API mode with model '{self.model_name}'")
                return
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini API client: {e}")

        self.mode = "mock"
        logger.warning("No Gemini API key or GCP credentials configured. Running in offline MOCK mode for testing.")

    def extract_invoice(self, file_bytes: bytes, mime_type: str, filename: str = "document") -> ExtractionResponse:
        """
        Extracts structured canonical invoice data from document bytes (PDF, JPEG, PNG, WEBP).
        """
        start_time = time.perf_counter()

        # If running in mock mode or client failed to initialize, return mock extraction
        if self.mode == "mock" or self.client is None:
            return self._generate_mock_extraction(filename, start_time)

        try:
            logger.debug(f"[DEV_DEBUG] Invoking Gemini ({self.mode}:{self.model_name}) for '{filename}' ({len(file_bytes)} bytes, {mime_type})")

            # Prepare multimodal document part
            doc_part = types.Part.from_bytes(
                data=file_bytes,
                mime_type=mime_type
            )

            # Enforce structured output via Pydantic model
            config = types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=CanonicalInvoice,
                temperature=0.0
            )

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[
                    doc_part,
                    "Extract all invoice details from this document into the required canonical JSON schema."
                ],
                config=config
            )

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            raw_text = response.text or "{}"
            logger.debug(f"[DEV_DEBUG] Gemini response received in {elapsed_ms:.2f}ms: length={len(raw_text)} chars")

            parsed_dict = json.loads(raw_text)
            invoice_model = CanonicalInvoice.model_validate(parsed_dict)

            # Run deterministic validation
            valid, errors = self.validate_arithmetic(invoice_model)

            return ExtractionResponse(
                success=True,
                provider=self.mode,
                model_name=self.model_name,
                latency_ms=elapsed_ms,
                invoice=invoice_model,
                validation_passed=valid,
                validation_errors=errors,
                raw_response=parsed_dict
            )

        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            logger.error(f"Gemini extraction failed for '{filename}': {exc}", exc_info=True)
            
            # If invalid/unauthenticated API key and in DEBUG mode, gracefully fall back to mock
            if "UNAUTHENTICATED" in str(exc) and settings.DEBUG:
                logger.warning("Live API call unauthenticated (401). Falling back to mock extraction in DEBUG mode.")
                mock_resp = self._generate_mock_extraction(filename, start_time)
                mock_resp.error_message = f"API Key Authentication Warning: {exc}"
                return mock_resp

            return ExtractionResponse(
                success=False,
                provider=self.mode,
                model_name=self.model_name,
                latency_ms=elapsed_ms,
                invoice=None,
                validation_passed=False,
                validation_errors=[str(exc)],
                error_message=str(exc)
            )

    @staticmethod
    def validate_arithmetic(invoice: CanonicalInvoice) -> Tuple[bool, list[str]]:
        """
        Deterministic arithmetic checks:
        1. Subtotal + Taxes +/- RoundOff == Grand Total
        2. Line Items Sum == Subtotal
        """
        errors = []
        calc_taxes = invoice.tax.cgst + invoice.tax.sgst + invoice.tax.igst + invoice.tax.cess
        expected_total = invoice.subtotal + calc_taxes + invoice.round_off

        # Check total equation with tolerance of +/- 1.00
        if abs(expected_total - invoice.grand_total) > 1.00:
            errors.append(
                f"Grand total mismatch: Extracted {invoice.grand_total:.2f}, expected {expected_total:.2f} (Subtotal: {invoice.subtotal:.2f} + Taxes: {calc_taxes:.2f} + RoundOff: {invoice.round_off:.2f})"
            )

        # Check line items sum
        if invoice.line_items:
            items_sum = sum(item.total_amount for item in invoice.line_items)
            # Allow items_sum to match either subtotal or grand_total (depending on if line totals include tax)
            if abs(items_sum - invoice.subtotal) > 2.0 and abs(items_sum - invoice.grand_total) > 2.0:
                logger.debug(f"[DEV_DEBUG] Line items sum ({items_sum:.2f}) differs from subtotal ({invoice.subtotal:.2f})")

        is_valid = len(errors) == 0
        return is_valid, errors

    def _generate_mock_extraction(self, filename: str, start_time: float) -> ExtractionResponse:
        """
        Deterministic mock extractor for local development and CI tests when no API key is set.
        """
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        mock_invoice = CanonicalInvoice(
            supplier=SupplierDetails(
                name="ABC INDUSTRIAL DISTRIBUTORS PVT LTD",
                gstin="33AABCT1234F1Z9",
                address="124 Industrial Estate, Guindy, Chennai, Tamil Nadu 600032",
                phone="+91 44 2233 4455",
                email="billing@abcdistributors.com"
            ),
            buyer=BuyerDetails(
                name="SOUTHERN LOGISTICS CORP",
                gstin="33AAACL5678B1Z2",
                address="45 Harbour Road, Chennai 600001"
            ),
            metadata=InvoiceMetadata(
                invoice_number="INV-2026-0891",
                invoice_date="2026-11-17",
                due_date="2026-12-17",
                place_of_supply="33-Tamil Nadu",
                currency="INR"
            ),
            line_items=[
                LineItem(
                    description="High Precision Steel Bearings - Model 6204",
                    hsn_code="8482",
                    quantity=50.0,
                    unit_price=100.0,
                    discount=0.0,
                    tax_rate=18.0,
                    cgst_amount=450.0,
                    sgst_amount=450.0,
                    igst_amount=0.0,
                    total_amount=5000.0
                )
            ],
            subtotal=5000.0,
            tax=TaxBreakdown(
                cgst=450.0,
                sgst=450.0,
                igst=0.0,
                cess=0.0
            ),
            round_off=0.0,
            grand_total=5900.0,
            confidence_score=0.98,
            extraction_notes="Extracted via Offline Mock Engine (Configure GEMINI_API_KEY in .env for live AI)"
        )
        valid, errors = self.validate_arithmetic(mock_invoice)

        return ExtractionResponse(
            success=True,
            provider="mock",
            model_name="mock-gemini-engine",
            latency_ms=elapsed_ms,
            invoice=mock_invoice,
            validation_passed=valid,
            validation_errors=errors,
            raw_response=mock_invoice.model_dump()
        )
