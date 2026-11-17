"""
Invoice Extraction Orchestration Service.
Integrates Document Preprocessing, B2B e-Invoice QR fast-path, and Gemini Multimodal AI.
"""
import logging
from backend.app.schemas.document import DocumentProcessingResult
from backend.app.schemas.invoice import (
    BuyerDetails,
    CanonicalInvoice,
    ExtractionResponse,
    InvoiceMetadata,
    LineItem,
    SupplierDetails,
    TaxBreakdown,
)
from backend.app.services.document_processor import DocumentProcessor
from backend.app.services.gemini_extractor import GeminiExtractor

logger = logging.getLogger("invoice_processor.orchestrator")


class ExtractionService:
    """
    Orchestrates the entire extraction pipeline:
    File -> Preprocessing -> B2B QR Fast-Path -> Gemini Multimodal AI -> Validated Canonical Invoice.
    """

    def __init__(self):
        self.doc_processor = DocumentProcessor()
        self.gemini_extractor = GeminiExtractor()

    def process_and_extract(self, filename: str, file_bytes: bytes) -> ExtractionResponse:
        """
        Runs document preprocessing, attempts QR fast-path, then invokes Gemini multimodal model.
        """
        # Step 1: Document Preprocessing (Deskew, PDF inspect, QR scan)
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

        # Step 2: B2B e-Invoice QR Fast-Path
        if doc_result.b2b_qr_found and doc_result.b2b_qr_data:
            qr = doc_result.b2b_qr_data
            logger.info(f"B2B e-Invoice QR fast-path triggered for '{filename}' (INV: {qr.invoice_number})")

            # Calculate basic GST split if total_value is known
            total_val = qr.total_value or 0.0
            subtotal = round(total_val / 1.18, 2)
            gst_total = round(total_val - subtotal, 2)
            cgst = round(gst_total / 2.0, 2)
            sgst = round(gst_total / 2.0, 2)

            invoice = CanonicalInvoice(
                supplier=SupplierDetails(
                    name="VERIFIED GST SUPPLIER",
                    gstin=qr.seller_gstin
                ),
                buyer=BuyerDetails(
                    name="VERIFIED BUYER",
                    gstin=qr.buyer_gstin
                ),
                metadata=InvoiceMetadata(
                    invoice_number=qr.invoice_number or "UNKNOWN",
                    invoice_date=qr.invoice_date,
                    currency="INR"
                ),
                line_items=[
                    LineItem(
                        description=f"Standard Goods (IRN: {qr.irn[:16]}...)" if qr.irn else "Standard Goods",
                        quantity=float(qr.item_count or 1),
                        unit_price=subtotal,
                        tax_rate=18.0,
                        cgst_amount=cgst,
                        sgst_amount=sgst,
                        total_amount=total_val
                    )
                ],
                subtotal=subtotal,
                tax=TaxBreakdown(cgst=cgst, sgst=sgst, igst=0.0),
                grand_total=total_val,
                confidence_score=1.0,
                extraction_notes=f"Extracted deterministically via Indian GST B2B e-Invoice QR Code (IRN: {qr.irn})"
            )

            valid, errors = self.gemini_extractor.validate_arithmetic(invoice)

            return ExtractionResponse(
                success=True,
                provider="b2b_qr",
                model_name="gstn-qr-decoder",
                latency_ms=doc_result.processing_time_ms,
                invoice=invoice,
                validation_passed=valid,
                validation_errors=errors,
                raw_response={"qr_data": qr.model_dump()}
            )

        # Step 3: Multimodal AI Extraction with Gemini (or Vertex AI)
        return self.gemini_extractor.extract_invoice(
            file_bytes=file_bytes,
            mime_type=doc_result.mime_type,
            filename=filename
        )
