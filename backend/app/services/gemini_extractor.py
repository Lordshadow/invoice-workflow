"""
Unified Google Gemini Extractor Service.
Supports both Google Gemini Developer API (local testing) and GCP Vertex AI (production),
with native Pydantic structured output enforcement and offline mock fallback.
"""
import json
import logging
import random
import re
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

            # Prepare contents: handle DOCX/Text directly, or multimodal Part for PDF/Images
            if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                import io
                import zipfile
                import xml.etree.ElementTree as ET
                try:
                    with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                        xml_content = z.read("word/document.xml")
                        tree = ET.fromstring(xml_content)
                        doc_text = "".join(tree.itertext())
                except Exception:
                    doc_text = "DOCX invoice document"

                content_items = [
                    f"Invoice Document Text Content:\n{doc_text}",
                    "Extract all invoice details from this document into the required canonical JSON schema."
                ]
            else:
                # Prepare multimodal document part (PDF, JPEG, PNG, WEBP)
                doc_part = types.Part.from_bytes(
                    data=file_bytes,
                    mime_type=mime_type
                )
                content_items = [
                    doc_part,
                    "Extract all invoice details from this document into the required canonical JSON schema."
                ]

            # Enforce structured output via Pydantic model
            config = types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=CanonicalInvoice,
                temperature=0.0
            )

            # Candidate models with automatic retry and fallback on transient 503/429 spikes
            candidate_models = [self.model_name]
            for alt in ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.5-flash"]:
                if alt not in candidate_models:
                    candidate_models.append(alt)

            response = None
            last_err = None
            used_model = self.model_name

            for model_to_try in candidate_models:
                for attempt in range(2):
                    try:
                        response = self.client.models.generate_content(
                            model=model_to_try,
                            contents=content_items,
                            config=config
                        )
                        used_model = model_to_try
                        break
                    except Exception as e:
                        last_err = e
                        if "503" in str(e) or "429" in str(e):
                            backoff = (2 ** attempt) * 1.5 + random.uniform(0.2, 0.8)
                            logger.warning(f"Model {model_to_try} returned transient overload ({e}). Retrying in {backoff:.1f}s...")
                            time.sleep(backoff)
                        else:
                            break
                if response is not None:
                    break

            if response is None:
                raise last_err or RuntimeError("Extraction failed across all candidate models")

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            raw_text = response.text or "{}"
            logger.debug(f"[DEV_DEBUG] Gemini response ({used_model}) received in {elapsed_ms:.2f}ms: length={len(raw_text)} chars")

            parsed_dict = json.loads(raw_text)
            invoice_model = CanonicalInvoice.model_validate(parsed_dict)

            # Ensure at least 1 line item exists for database relational integrity
            if not invoice_model.line_items and (invoice_model.subtotal > 0 or invoice_model.grand_total > 0):
                fallback_amt = round(invoice_model.subtotal if invoice_model.subtotal > 0 else invoice_model.grand_total, 2)
                invoice_model.line_items.append(
                    LineItem(
                        description="General Invoice Amount (Un-itemized Receipt)",
                        hsn_code=None,
                        quantity=1.0,
                        unit_price=fallback_amt,
                        discount=0.0,
                        tax_rate=0.0,
                        cgst_amount=invoice_model.tax.cgst,
                        sgst_amount=invoice_model.tax.sgst,
                        igst_amount=invoice_model.tax.igst,
                        total_amount=fallback_amt
                    )
                )
                note = "Synthesized fallback line item for un-itemized invoice."
                invoice_model.extraction_notes = f"{invoice_model.extraction_notes} | {note}" if invoice_model.extraction_notes else note

            # Run deterministic validation
            valid, errors = self.validate_arithmetic(invoice_model)

            return ExtractionResponse(
                success=True,
                provider=self.mode,
                model_name=used_model,
                latency_ms=elapsed_ms,
                invoice=invoice_model,
                validation_passed=valid,
                validation_errors=errors,
                raw_response=parsed_dict
            )

        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            logger.error(f"Gemini extraction failed for '{filename}': {exc}", exc_info=True)

            # If quota exhausted, unauthenticated, or rate-limited and in DEBUG mode, gracefully fall back to mock
            exc_str = str(exc)
            if ("UNAUTHENTICATED" in exc_str or "RESOURCE_EXHAUSTED" in exc_str or "402" in exc_str or "429" in exc_str) and settings.DEBUG:
                logger.warning(f"Live API quota/auth issue ({exc_str}). Falling back to mock extraction in DEBUG mode.")
                mock_resp = self._generate_mock_extraction(filename, start_time)
                mock_resp.error_message = f"API Quota/Auth Notice: {exc_str}"
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
        Deterministic business & arithmetic checks:
        1. Subtotal + Taxes +/- RoundOff == Grand Total (with strict 2-decimal rounding)
        2. Line items total coherence
        3. Indian 15-character GSTIN format validation
        """
        errors = []

        # 1. Floating-point safe arithmetic verification (rounded to 2 decimals)
        subtotal = round(invoice.subtotal, 2)
        calc_taxes = round(invoice.tax.cgst + invoice.tax.sgst + invoice.tax.igst + invoice.tax.cess, 2)
        round_off = round(invoice.round_off, 2)
        grand_total = round(invoice.grand_total, 2)
        expected_total = round(subtotal + calc_taxes + round_off, 2)

        # Check total equation with tolerance of +/- 1.00 for currency rounding
        if abs(round(expected_total - grand_total, 2)) > 1.00:
            errors.append(
                f"Grand total mismatch: Extracted {grand_total:.2f}, expected {expected_total:.2f} (Subtotal: {subtotal:.2f} + Taxes: {calc_taxes:.2f} + RoundOff: {round_off:.2f})"
            )

        # 2. Check line items sum coherence
        if invoice.line_items:
            items_sum = round(sum(round(item.total_amount, 2) for item in invoice.line_items), 2)
            if abs(round(items_sum - subtotal, 2)) > 2.0 and abs(round(items_sum - grand_total, 2)) > 2.0:
                logger.debug(f"[DEV_DEBUG] Line items sum ({items_sum:.2f}) differs from subtotal ({subtotal:.2f})")

        # 3. Indian GSTIN structure validation (15 characters: 2 state + 10 PAN + 1 entity + 'Z' + 1 checksum)
        if invoice.supplier.gstin:
            gstin_clean = invoice.supplier.gstin.strip().upper()
            gstin_regex = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
            if not re.match(gstin_regex, gstin_clean):
                errors.append(
                    f"Non-standard Supplier GSTIN format: '{invoice.supplier.gstin}' (Expected 15-character Indian GST format)"
                )

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
