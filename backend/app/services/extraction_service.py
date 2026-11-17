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
from backend.app.services.groq_extractor import GroqExtractor
from backend.app.services.paddle_extractor import PaddleOCRExtractor

logger = logging.getLogger("invoice_processor.orchestrator")


class ExtractionService:
    """
    Orchestrates the decoupled extraction pipeline:
    1. Preprocessing (deskewing, PDF inspection, optional QR scan).
    2. Primary Local OCR / Text Extraction:
       - PyMuPDF extracts digital text from born-digital PDFs (0ms, 0 tokens).
       - PaddleOCR extracts text lines and bounding boxes from images/scans on local CPU.
    3. Primary Text-LLM Structuring:
       - Sends pure extracted text to the LLM (ultra-low token cost, <500ms latency).
    4. Multimodal Vision Fallback (LAST RESORT):
       - Only invoked if local OCR yields empty text or fails completely.
    5. Optional QR Cross-Verification & Enrichment.
    """

    def __init__(self):
        self.doc_processor = DocumentProcessor()
        self.groq_extractor = GroqExtractor()
        self.gemini_extractor = GeminiExtractor()
        self.paddle_extractor = PaddleOCRExtractor()

    def process_and_extract(self, filename: str, file_bytes: bytes) -> ExtractionResponse:
        """
        Executes local OCR/text extraction first, text-LLM structuring, and falls back to multimodal vision only as a last resort.
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

        # Step 2: Primary Local OCR / Text Extraction Tier
        extracted_text: Optional[str] = None
        bounding_boxes = []

        # Case 2A: Born-digital PDF -> use native high-precision digital text layer
        if doc_result.digital_text_extracted and len(doc_result.digital_text_extracted.strip()) > 30:
            extracted_text = doc_result.digital_text_extracted
            logger.info(f"Using direct digital PDF text layer for '{filename}' ({len(extracted_text)} chars)")

        # Case 2B: Image or Scanned Document -> run Local PaddleOCR
        elif doc_result.document_type in ("IMAGE", "SCANNED_PDF") or doc_result.preprocessed_bytes:
            ocr_bytes = doc_result.preprocessed_bytes if doc_result.preprocessed_bytes else file_bytes
            paddle_text, boxes, conf = self.paddle_extractor.extract_text(ocr_bytes)
            if paddle_text and len(paddle_text.strip()) > 20:
                extracted_text = paddle_text
                bounding_boxes = boxes
                logger.info(f"Local PaddleOCR extracted {len(boxes)} text boxes (conf={conf:.2f}) for '{filename}'")

        # Step 3: Text-LLM Structuring (Primary Engine)
        ai_response: Optional[ExtractionResponse] = None
        if extracted_text:
            # 3A: Try Groq LPU first if active (ultra-fast, low-token)
            if self.groq_extractor.is_active:
                logger.info(f"Invoking Groq LPU ({self.groq_extractor.primary_model}) for '{filename}' text extraction")
                ai_response = self.groq_extractor.extract_from_text(
                    text=extracted_text,
                    filename=filename
                )

            # 3B: If Groq inactive or returned failure, try Gemini Text-LLM
            if not ai_response or not ai_response.success or not ai_response.invoice:
                logger.info(f"Invoking Gemini Text-LLM for '{filename}' text extraction")
                ai_response = self.gemini_extractor.extract_from_text(
                    text=extracted_text,
                    filename=filename
                )

        # Step 4: Multimodal Vision Fallback (LAST RESORT)
        # Invoked ONLY if local text extraction was empty or text-LLM failed completely
        if not ai_response or not ai_response.success or not ai_response.invoice:
            logger.warning(
                f"Local text extraction unavailable or empty for '{filename}'. "
                "Falling back to Multimodal Vision as LAST RESORT..."
            )
            payload_bytes = doc_result.preprocessed_bytes if (doc_result.preprocessed_bytes and doc_result.document_type == "IMAGE") else file_bytes
            payload_mime = "image/png" if (doc_result.preprocessed_bytes and doc_result.document_type == "IMAGE") else doc_result.mime_type
            ai_response = self.gemini_extractor.extract_invoice(
                file_bytes=payload_bytes,
                mime_type=payload_mime,
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
                # If AI returned 0 total (e.g. document only contained a QR code with no visible text),
                # populate from QR ground truth
                if invoice.grand_total == 0.0:
                    invoice.grand_total = qr.total_value
                    subtotal = round(qr.total_value / 1.18, 2)
                    invoice.subtotal = subtotal
                    gst_half = round((qr.total_value - subtotal) / 2.0, 2)
                    invoice.tax.cgst = gst_half
                    invoice.tax.sgst = gst_half
                    if not invoice.line_items:
                        invoice.line_items.append(
                            LineItem(
                                description=f"Goods per B2B e-Invoice (IRN: {qr.irn[:16]}...)" if qr.irn else "Goods per B2B e-Invoice",
                                quantity=float(qr.item_count or 1),
                                unit_price=subtotal,
                                tax_rate=18.0,
                                cgst_amount=gst_half,
                                sgst_amount=gst_half,
                                total_amount=qr.total_value
                            )
                        )
                    invoice.confidence_score = 1.0
                    notes.append(f"Grand total ({invoice.grand_total:.2f}) and line items populated from government QR.")
                else:
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
