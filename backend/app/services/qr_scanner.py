"""
QR Code Scanner service for Indian GST B2B e-invoices.
Decodes standard QR codes and parses signed GSTN e-invoice payloads.
"""
import base64
import json
import logging
from typing import Optional
import cv2
import numpy as np

from backend.app.schemas.document import QRCodeData

logger = logging.getLogger("invoice_processor.qr")


class QRCodeScanner:
    """
    Decodes QR codes on invoices and extracts Indian GST e-invoice metadata.
    """

    def __init__(self):
        self._detector = cv2.QRCodeDetector()

    def scan_image(self, image: np.ndarray) -> Optional[QRCodeData]:
        """
        Scans an image array for QR codes and returns decoded data if found.
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Attempt standard detection
        data, points, _ = self._detector.detectAndDecode(gray)
        if not data and points is not None:
            # Try multi-detection as fallback
            success, decoded_info, _, _ = self._detector.detectAndDecodeMulti(gray)
            if success and decoded_info and decoded_info[0]:
                data = decoded_info[0]

        # Fallback to Otsu binary thresholding if direct grayscale didn't find it
        if not data:
            thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
            data, _, _ = self._detector.detectAndDecode(thresh)

        if not data:
            logger.debug("[DEV_DEBUG] No QR code detected on page")
            return None

        logger.debug(f"[DEV_DEBUG] Found QR Code data length: {len(data)} characters")
        return self.parse_qr_payload(data)

    def parse_qr_payload(self, raw_data: str) -> QRCodeData:
        """
        Parses raw QR string, checking if it is a signed Indian GST B2B e-invoice (JWT or JSON).
        """
        qr_data = QRCodeData(raw_text=raw_data)

        # Check if the QR code is a JWT (three segments separated by periods)
        parts = raw_data.strip().split(".")
        if len(parts) == 3:
            try:
                # The second segment is base64-encoded payload
                payload_segment = parts[1]
                # Pad base64 if needed
                padded = payload_segment + "=" * (-len(payload_segment) % 4)
                decoded_bytes = base64.urlsafe_b64decode(padded)
                payload_json = json.loads(decoded_bytes.decode("utf-8", errors="ignore"))

                # Standard GSTN e-invoice keys
                # {"SellerGstin": "...", "BuyerGstin": "...", "DocNo": "...", "DocTyp": "INV", "DocDt": "...", "TotInvVal": 1180.0, "ItemCnt": 1, "Irn": "..."}
                data_dict = payload_json.get("data", payload_json)
                if isinstance(data_dict, str):
                    try:
                        data_dict = json.loads(data_dict)
                    except Exception:
                        pass

                if "SellerGstin" in data_dict or "DocNo" in data_dict or "Irn" in data_dict:
                    qr_data.is_gst_einvoice = True
                    qr_data.seller_gstin = data_dict.get("SellerGstin")
                    qr_data.buyer_gstin = data_dict.get("BuyerGstin")
                    qr_data.invoice_number = data_dict.get("DocNo")
                    qr_data.invoice_date = data_dict.get("DocDt")
                    qr_data.total_value = float(data_dict.get("TotInvVal", 0.0)) if data_dict.get("TotInvVal") is not None else None
                    qr_data.item_count = int(data_dict.get("ItemCnt", 0)) if data_dict.get("ItemCnt") is not None else None
                    qr_data.irn = data_dict.get("Irn")
                    logger.debug(f"[DEV_DEBUG] Successfully decoded GST B2B e-invoice QR: INV={qr_data.invoice_number}, GSTIN={qr_data.seller_gstin}, Total={qr_data.total_value}")
                    return qr_data

            except Exception as e:
                logger.debug(f"[DEV_DEBUG] Failed to parse QR payload as JWT GST format: {e}")

        # Check for plain JSON format
        if raw_data.strip().startswith("{") and raw_data.strip().endswith("}"):
            try:
                parsed = json.loads(raw_data)
                if "SellerGstin" in parsed or "seller_gstin" in parsed:
                    qr_data.is_gst_einvoice = True
                    qr_data.seller_gstin = parsed.get("SellerGstin") or parsed.get("seller_gstin")
                    qr_data.buyer_gstin = parsed.get("BuyerGstin") or parsed.get("buyer_gstin")
                    qr_data.invoice_number = parsed.get("DocNo") or parsed.get("invoice_number")
                    qr_data.invoice_date = parsed.get("DocDt") or parsed.get("invoice_date")
                    val = parsed.get("TotInvVal") or parsed.get("total_value")
                    qr_data.total_value = float(val) if val is not None else None
                    qr_data.irn = parsed.get("Irn") or parsed.get("irn")
                    return qr_data
            except Exception as e:
                logger.debug(f"[DEV_DEBUG] Failed to parse QR payload as plain JSON: {e}")

        return qr_data
