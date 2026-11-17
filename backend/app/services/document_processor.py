"""
Unified Document Processor service.
Coordinates hashing, format classification, digital text extraction,
OpenCV image preprocessing, and Indian B2B QR code decoding.
"""
import hashlib
import io
import logging
import time
from typing import Optional
import cv2
import numpy as np
from PIL import Image

from backend.app.config import settings
from backend.app.schemas.document import (
    DocumentProcessingResult,
    DocumentType,
    PageInfo,
    QRCodeData,
)
from backend.app.services.image_preprocessor import ImagePreprocessor
from backend.app.services.pdf_extractor import PDFExtractor
from backend.app.services.qr_scanner import QRCodeScanner

logger = logging.getLogger("invoice_processor.core")


class DocumentProcessor:
    """
    Unified entry point for document preprocessing and ingestion.
    """

    def __init__(self):
        self.pdf_extractor = PDFExtractor(
            dpi=settings.PDF_DPI,
            text_density_threshold=settings.TEXT_DENSITY_THRESHOLD_CHARS,
        )
        self.qr_scanner = QRCodeScanner()
        self.image_preprocessor = ImagePreprocessor()

    @staticmethod
    def compute_sha256(data: bytes) -> str:
        """Computes the hex SHA-256 checksum of raw file bytes."""
        hasher = hashlib.sha256()
        hasher.update(data)
        return hasher.hexdigest()

    @staticmethod
    def detect_mime_type(filename: str, data: bytes) -> str:
        """Detects MIME type from file header magic bytes or filename extension."""
        if data.startswith(b"%PDF"):
            return "application/pdf"
        elif data.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        elif data.startswith(b"RIFF") and b"WEBP" in data[:12]:
            return "image/webp"
        elif data.startswith(b"PK\x03\x04") and (filename.lower().endswith(".docx") or b"word/" in data[:1000]):
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        # Fallback to extension check
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        if ext == "pdf":
            return "application/pdf"
        elif ext in ("jpg", "jpeg"):
            return "image/jpeg"
        elif ext == "png":
            return "image/png"
        elif ext == "webp":
            return "image/webp"
        elif ext == "docx":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        return "application/octet-stream"

    def process(self, filename: str, file_bytes: bytes) -> DocumentProcessingResult:
        """
        Executes the full preprocessing pipeline on incoming file bytes.
        """
        start_time = time.perf_counter()
        file_hash = self.compute_sha256(file_bytes)
        file_size = len(file_bytes)
        mime_type = self.detect_mime_type(filename, file_bytes)

        logger.debug(f"[DEV_DEBUG] Processing document '{filename}' (size={file_size} bytes, mime={mime_type}, hash={file_hash[:12]}...)")

        pages_info = []
        digital_text = None
        doc_type = DocumentType.UNKNOWN
        b2b_qr_found = False
        b2b_qr_data: Optional[QRCodeData] = None
        preprocessed_bytes: Optional[bytes] = None

        try:
            if mime_type == "application/pdf":
                is_digital, full_text, page_images, page_meta = self.pdf_extractor.inspect_and_render(file_bytes)
                doc_type = DocumentType.DIGITAL_PDF if is_digital else DocumentType.SCANNED_PDF
                digital_text = full_text if is_digital else None

                for idx, bgr_img in enumerate(page_images):
                    meta = page_meta[idx]
                    # Check for optional QR code on this page if enabled
                    qr_result = None
                    if settings.ENABLE_QR_SCANNER:
                        qr_result = self.qr_scanner.scan_image(bgr_img)
                    has_qr = qr_result is not None
                    if qr_result and qr_result.is_gst_einvoice and not b2b_qr_found:
                        b2b_qr_found = True
                        b2b_qr_data = qr_result

                    # Detect deskew angle
                    angle = self.image_preprocessor.detect_skew_angle(bgr_img)

                    pages_info.append(
                        PageInfo(
                            page_number=meta["page_number"],
                            width=meta["width"],
                            height=meta["height"],
                            text_char_count=meta["char_count"],
                            deskew_angle=angle,
                            has_qr_code=has_qr,
                            qr_data=qr_result,
                        )
                    )

                # For scanned PDFs, deskew and encode page(s) into preprocessed_bytes for OCR
                if not is_digital and page_images:
                    deskewed_pages = []
                    for bgr_img in page_images[:3]:
                        angle = self.image_preprocessor.detect_skew_angle(bgr_img)
                        deskewed = self.image_preprocessor.rotate_image(bgr_img, angle)
                        deskewed_pages.append(deskewed)

                    if len(deskewed_pages) == 1:
                        final_img = deskewed_pages[0]
                    else:
                        target_w = min(img.shape[1] for img in deskewed_pages)
                        resized_pages = [
                            cv2.resize(img, (target_w, int(img.shape[0] * target_w / img.shape[1])))
                            for img in deskewed_pages
                        ]
                        final_img = np.vstack(resized_pages)

                    ok, encoded_buf = cv2.imencode(".png", final_img)
                    if ok:
                        preprocessed_bytes = encoded_buf.tobytes()

            elif mime_type in ("image/jpeg", "image/png", "image/webp"):
                doc_type = DocumentType.IMAGE
                # Process single image
                processed_img, angle = self.image_preprocessor.preprocess_image(file_bytes)
                h, w = processed_img.shape[:2]

                # Encode cleaned/deskewed image for passing to AI
                ok, encoded_buf = cv2.imencode(".png", processed_img)
                if ok:
                    preprocessed_bytes = encoded_buf.tobytes()

                qr_result = None
                if settings.ENABLE_QR_SCANNER:
                    qr_result = self.qr_scanner.scan_image(processed_img)
                has_qr = qr_result is not None
                if qr_result and qr_result.is_gst_einvoice:
                    b2b_qr_found = True
                    b2b_qr_data = qr_result

                pages_info.append(
                    PageInfo(
                        page_number=1,
                        width=w,
                        height=h,
                        text_char_count=0,
                        deskew_angle=angle,
                        has_qr_code=has_qr,
                        qr_data=qr_result,
                    )
                )

            elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                doc_type = DocumentType.DOCX
                import zipfile
                import xml.etree.ElementTree as ET
                try:
                    with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                        xml_content = z.read("word/document.xml")
                        tree = ET.fromstring(xml_content)
                        digital_text = "".join(tree.itertext())
                except Exception as e:
                    logger.warning(f"Failed to read DOCX XML: {e}")
                    digital_text = ""

                pages_info.append(
                    PageInfo(
                        page_number=1,
                        width=800,
                        height=1000,
                        text_char_count=len(digital_text),
                        deskew_angle=0.0,
                        has_qr_code=False,
                    )
                )

            else:
                logger.warning(f"Unsupported MIME type '{mime_type}' for file '{filename}'")
                return DocumentProcessingResult(
                    file_name=filename,
                    file_hash=file_hash,
                    file_size_bytes=file_size,
                    mime_type=mime_type,
                    document_type=DocumentType.UNKNOWN,
                    total_pages=0,
                    processing_time_ms=(time.perf_counter() - start_time) * 1000.0,
                    status="FAILED",
                    error_message=f"Unsupported file format: {mime_type}",
                )

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            logger.debug(f"[DEV_DEBUG] Preprocessing completed in {elapsed_ms:.2f}ms: doc_type={doc_type}, pages={len(pages_info)}, b2b_qr={b2b_qr_found}")

            return DocumentProcessingResult(
                file_name=filename,
                file_hash=file_hash,
                file_size_bytes=file_size,
                mime_type=mime_type,
                document_type=doc_type,
                total_pages=len(pages_info),
                pages=pages_info,
                digital_text_extracted=digital_text,
                b2b_qr_found=b2b_qr_found,
                b2b_qr_data=b2b_qr_data,
                preprocessed_bytes=preprocessed_bytes,
                processing_time_ms=elapsed_ms,
                status="SUCCESS",
            )

        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            logger.error(f"Error during document preprocessing: {exc}", exc_info=True)
            return DocumentProcessingResult(
                file_name=filename,
                file_hash=file_hash,
                file_size_bytes=file_size,
                mime_type=mime_type,
                document_type=DocumentType.UNKNOWN,
                total_pages=0,
                processing_time_ms=elapsed_ms,
                status="FAILED",
                error_message=str(exc),
            )
