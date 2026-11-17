"""
Pytest configuration and test fixtures for Document Processing.
"""
import io
import pytest
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
