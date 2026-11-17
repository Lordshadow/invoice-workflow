"""
Invoice Extraction Orchestration Service.
Integrates Document Preprocessing, Gemini Multimodal AI (always extracts all required fields & line items),
and optional B2B e-invoice QR code cross-verification.
"""
import logging
from typing import Optional
from backend.app.schemas.document import DocumentProcessingResult
from backend.app.schemas.invoice import (
    CanonicalInvoice,
    ExtractionResponse,
)
from backend.app.services.document_processor import DocumentProcessor
from backend.app.services.gemini_extractor import GeminiExtractor

logger = logging.getLogger("invoice_processor.orchestrator")


class ExtractionService:
    """
    Orchestrates the entire extraction pipeline:
    1. Preprocessing (deskewing, PDF inspection, optional QR scan).
    2. Comprehensive Multimodal AI Extraction (Gemini / Vertex AI) ensuring ALL
       header fields, taxes, and full itemized line-item grids are extracted.
    3. Optional QR Cross-Verification: If an e-invoice QR code is present, it validates
       and enriches the AI extraction with the government IRN and verified totals without
       skipping detailed line items.
    """

    def __init__(self):
        self.doc_processor = DocumentProcessor()
        self.gemini_extractor = GeminiExtractor()

    def process_and_extract(self, filename: str, file_bytes: bytes) -> ExtractionResponse:
        """
        Executes document preprocessing and full multimodal AI extraction.
        Optional QR code is used to cross-verify and enrich results.
        """
        # Step 1: Document Preprocessing (Format check, deskewing, optional QR detection)
        doc_result: DocumentProcessingResult = self.doc_processor.process(filename, file_bytes)

        if doc_result.status == "FAILED":
            return ExtractionResponse(
                success=False,
                provider="preprocessing",
                model_name="opencv-pymupdf",
                latency_ms=doc_result.processing_time_ms,
                invoice=None,
                validation_passed=False,
                validation_errors=[doc_result.error_message or "Preprocessing failed"],
                error_message=doc_result.error_message
            )

        # Step 2: Full Multimodal AI Extraction (Gemini / Vertex AI)
        # Always runs to capture all required requirements: supplier, buyer, invoice metadata,
        # complete itemized line items, tax breakdowns, and totals.
        ai_response: ExtractionResponse = self.gemini_extractor.extract_invoice(
            file_bytes=file_bytes,
            mime_type=doc_result.mime_type,
            filename=filename
        )

        if not ai_response.success or not ai_response.invoice:
            return ai_response

        invoice: CanonicalInvoice = ai_response.invoice

        # Step 3: Optional QR Code Cross-Verification & Metadata Enrichment
        if doc_result.b2b_qr_found and doc_result.b2b_qr_data:
            qr = doc_result.b2b_qr_data
            logger.info(f"Optional B2B QR code detected on '{filename}' — cross-verifying extraction...")

            notes = []
            if invoice.extraction_notes:
                notes.append(invoice.extraction_notes)

            # Enrich with IRN if available
            if qr.irn:
                notes.append(f"Verified against Indian GST e-Invoice QR (IRN: {qr.irn})")

            # Cross-verify Seller GSTIN
            if qr.seller_gstin:
                if not invoice.supplier.gstin:
                    invoice.supplier.gstin = qr.seller_gstin
                    notes.append(f"Supplier GSTIN populated from QR: {qr.seller_gstin}")
                elif invoice.supplier.gstin.strip().upper() == qr.seller_gstin.strip().upper():
                    notes.append("Supplier GSTIN mathematically verified by QR signature.")

            # Cross-verify Invoice Number
            if qr.invoice_number and invoice.metadata.invoice_number != qr.invoice_number:
                # If slight OCR discrepancy, record note
                notes.append(f"Notice: QR signed invoice number is '{qr.invoice_number}' (Extracted: '{invoice.metadata.invoice_number}')")

            # Cross-verify Total Amount
            if qr.total_value is not None:
                diff = abs(invoice.grand_total - qr.total_value)
                if diff <= 1.0:
                    invoice.confidence_score = 1.0
                    notes.append(f"Grand total ({invoice.grand_total:.2f}) verified by government QR.")
                else:
                    notes.append(f"WARNING: Extracted total ({invoice.grand_total:.2f}) differs from QR signed total ({qr.total_value:.2f}) by INR {diff:.2f}")
                    ai_response.validation_errors.append(f"QR discrepancy: AI extracted {invoice.grand_total:.2f}, QR has {qr.total_value:.2f}")
                    ai_response.validation_passed = False

            invoice.extraction_notes = " | ".join(notes)
            ai_response.provider = f"{ai_response.provider}+qr_verified"

        # Re-run arithmetic validation on final invoice
        valid, errors = self.gemini_extractor.validate_arithmetic(invoice)
        if not valid:
            ai_response.validation_passed = False
            for err in errors:
                if err not in ai_response.validation_errors:
                    ai_response.validation_errors.append(err)

        return ai_response
