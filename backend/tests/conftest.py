"""
Pytest configuration and test fixtures for Document Processing and AI Extraction.
"""
import base64
import io
import json
import pytest
import qrcode
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.app.main import app


@pytest.fixture
def client():
    """FastAPI TestClient fixture."""
    return TestClient(app)


@pytest.fixture
def sample_image_bytes():
    """Generates a clean synthetic invoice receipt image in bytes."""
    img = Image.new("RGB", (600, 800), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), "TAX INVOICE - ABC DISTRIBUTORS", fill=(0, 0, 0))
    draw.text((50, 80), "GSTIN: 33AAAAA0000A1Z5", fill=(0, 0, 0))
    draw.text((50, 110), "Invoice No: INV-2026-001", fill=(0, 0, 0))
    draw.text((50, 140), "Date: 15-11-2026", fill=(0, 0, 0))
    draw.line((50, 170, 550, 170), fill=(0, 0, 0), width=2)
    draw.text((50, 190), "Item 1: Industrial Widget x 10 = INR 1,000.00", fill=(0, 0, 0))
    draw.text((50, 220), "CGST 9%: INR 90.00 | SGST 9%: INR 90.00", fill=(0, 0, 0))
    draw.text((50, 250), "Total Amount: INR 1,180.00", fill=(0, 0, 0))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def sample_skewed_image_bytes(sample_image_bytes):
    """Generates a rotated (skewed) invoice image to test deskewing."""
    img = Image.open(io.BytesIO(sample_image_bytes))
    # Rotate by 5 degrees with white border
    rotated = img.rotate(5, expand=True, fillcolor=(255, 255, 255))
    buf = io.BytesIO()
    rotated.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def sample_gst_einvoice_qr_image_bytes():
    """Generates an image containing a real-world structured Indian GST B2B e-invoice QR code."""
    gstn_payload = {
        "SellerGstin": "33AAAAA0000A1Z5",
        "BuyerGstin": "33BBBBB1111B2Z6",
        "DocNo": "INV-2026-QR-001",
        "DocTyp": "INV",
        "DocDt": "17/11/2026",
        "TotInvVal": 11800.0,
        "ItemCnt": 2,
        "MainHsnCode": "8482",
        "Irn": "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef"
    }
    header_b64 = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).decode()
    payload_b64 = base64.urlsafe_b64encode(json.dumps(gstn_payload).encode()).decode()
    dummy_jwt = f"{header_b64}.{payload_b64}.dummy_signature"

    qr = qrcode.QRCode(box_size=6, border=4)
    qr.add_data(dummy_jwt)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_pil = qr_img.get_image() if hasattr(qr_img, "get_image") else getattr(qr_img, "_img", qr_img)
    if hasattr(qr_pil, "convert"):
        qr_pil = qr_pil.convert("RGB")

    canvas = Image.new("RGB", (800, 1000), color=(255, 255, 255))
    canvas.paste(qr_pil, (50, 50))

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()
