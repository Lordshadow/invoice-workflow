"""
PDF extraction and rendering service using PyMuPDF (fitz).
Extracts digital text layers and renders page images for OCR/Computer Vision.
"""
import io
import logging
from typing import List, Tuple
import pymupdf
import numpy as np
from PIL import Image

logger = logging.getLogger("invoice_processor.pdf")


class PDFExtractor:
    """
    Handles PDF inspection, text layer extraction, and page rendering.
    """

    def __init__(self, dpi: int = 300, text_density_threshold: int = 80):
        self.dpi = dpi
        self.text_density_threshold = text_density_threshold

    def inspect_and_render(self, pdf_bytes: bytes) -> Tuple[bool, str, List[np.ndarray], List[dict]]:
        """
        Processes a PDF document:
        - Extracts text from each page
        - Determines if the document is a native digital PDF
        - Renders each page into a high-resolution NumPy image for vision processing

        Returns:
            is_digital (bool): True if searchable text is present
            full_text (str): Extracted text concatenated across all pages
            page_images (List[np.ndarray]): Rendered BGR images of each page
            page_metadata (List[dict]): Page-level statistics (char count, dimensions)
        """
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        logger.debug(f"[DEV_DEBUG] Opened PDF with {total_pages} pages")

        full_text_list = []
        page_images = []
        page_metadata = []
        digital_pages_count = 0

        # Zoom matrix for high-res 300 DPI rendering (72 DPI base)
        zoom = self.dpi / 72.0
        mat = pymupdf.Matrix(zoom, zoom)

        for page_idx in range(total_pages):
            page = doc[page_idx]
            page_text = page.get_text()
            char_count = len(page_text.strip())
            full_text_list.append(page_text)

            if char_count >= self.text_density_threshold:
                digital_pages_count += 1

            # Render page to pixmap
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_data = pix.tobytes("png")

            # Convert to numpy array (BGR for OpenCV)
            pil_img = Image.open(io.BytesIO(img_data)).convert("RGB")
            np_img = np.array(pil_img)
            bgr_img = np_img[:, :, ::-1].copy()  # RGB to BGR
            page_images.append(bgr_img)

            page_metadata.append({
                "page_number": page_idx + 1,
                "width": pix.width,
                "height": pix.height,
                "char_count": char_count
            })

            logger.debug(f"[DEV_DEBUG] Page {page_idx + 1}: chars={char_count}, dimensions={pix.width}x{pix.height}")

        doc.close()

        # Document is classified as digital if more than 50% of pages contain dense text
        is_digital = (digital_pages_count / total_pages) >= 0.5 if total_pages > 0 else False
        full_text = "\n--- PAGE BREAK ---\n".join(full_text_list)

        logger.debug(f"[DEV_DEBUG] PDF classification: is_digital={is_digital} (digital_pages={digital_pages_count}/{total_pages})")
        return is_digital, full_text, page_images, page_metadata
