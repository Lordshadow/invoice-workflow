"""
Image preprocessing service using OpenCV.
Handles deskewing, noise reduction, adaptive contrast, and orientation corrections.
"""
import logging
import cv2
import numpy as np
from typing import Tuple

logger = logging.getLogger("invoice_processor.image")


class ImagePreprocessor:
    """
    OpenCV-based image preprocessor for invoice receipts and photos.
    """

    @staticmethod
    def detect_skew_angle(image: np.ndarray, max_angle: float = 45.0) -> float:
        """
        Calculates the skew angle of an image using minimum area rectangle on text contours.
        Returns the angle in degrees to rotate the image counter-clockwise.
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Apply threshold to isolate text pixels
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

        # Dilate text to form solid connected components
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 5))
        dilated = cv2.dilate(thresh, kernel, iterations=2)

        # Find all contours
        contours, _ = cv2.findContours(dilated, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        angles = []
        for c in contours:
            area = cv2.contourArea(c)
            if area > 1000:  # Ignore tiny noise contours
                min_rect = cv2.minAreaRect(c)
                angle = min_rect[-1]
                # Adjust OpenCV angle convention
                if angle < -45:
                    angle = -(90 + angle)
                else:
                    angle = -angle
                if abs(angle) <= max_angle:
                    angles.append(angle)

        if not angles:
            logger.debug("[DEV_DEBUG] No dominant contours found for skew detection, angle=0.0")
            return 0.0

        median_angle = float(np.median(angles))
        logger.debug(f"[DEV_DEBUG] Detected skew angle: {median_angle:.2f} degrees across {len(angles)} contours")
        return median_angle

    @staticmethod
    def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
        """
        Rotates an image around its center by the specified angle, filling borders with white.
        """
        if abs(angle) < 0.5:
            return image

        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)

        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        # Compute new bounding dimensions
        cos = np.abs(matrix[0, 0])
        sin = np.abs(matrix[0, 1])
        new_w = int((h * sin) + (w * cos))
        new_h = int((h * cos) + (w * sin))

        # Adjust the rotation matrix to take into account translation
        matrix[0, 2] += (new_w / 2) - center[0]
        matrix[1, 2] += (new_h / 2) - center[1]

        # White background (255, 255, 255) for invoices
        border_color = (255, 255, 255) if len(image.shape) == 3 else 255
        rotated = cv2.warpAffine(
            image, matrix, (new_w, new_h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=border_color
        )
        logger.debug(f"[DEV_DEBUG] Image rotated by {angle:.2f} deg, new shape: {rotated.shape}")
        return rotated

    @staticmethod
    def enhance_contrast(image: np.ndarray) -> np.ndarray:
        """
        Applies Contrast Limited Adaptive Histogram Equalization (CLAHE)
        to improve readability of poorly lit mobile photos.
        """
        if len(image.shape) == 3:
            # Convert to LAB color space to equalize luminosity channel only
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            limg = cv2.merge((cl, a, b))
            enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(image)

        logger.debug("[DEV_DEBUG] CLAHE contrast enhancement applied successfully")
        return enhanced

    @classmethod
    def preprocess_image(cls, image_bytes: bytes, deskew: bool = True, enhance: bool = True) -> Tuple[np.ndarray, float]:
        """
        Full preprocessing pipeline: decode -> deskew -> enhance contrast.
        Returns the processed numpy image and the applied rotation angle.
        """
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image from bytes.")

        angle = 0.0
        if deskew:
            angle = cls.detect_skew_angle(img)
            img = cls.rotate_image(img, angle)

        if enhance:
            img = cls.enhance_contrast(img)

        return img, angle
