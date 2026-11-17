"""
Pydantic Schemas for Document Preprocessing & Intake.
"""
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    DIGITAL_PDF = "DIGITAL_PDF"
    SCANNED_PDF = "SCANNED_PDF"
    IMAGE = "IMAGE"
    UNKNOWN = "UNKNOWN"


class QRCodeData(BaseModel):
    raw_text: str = Field(description="Raw decoded QR string or JWT payload")
    is_gst_einvoice: bool = Field(default=False, description="Whether this is a verified Indian GST B2B e-invoice QR")
    seller_gstin: Optional[str] = None
    buyer_gstin: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    total_value: Optional[float] = None
    item_count: Optional[int] = None
    irn: Optional[str] = None


class PageInfo(BaseModel):
    page_number: int
    width: int
    height: int
    text_char_count: int = 0
    deskew_angle: float = 0.0
    has_qr_code: bool = False
    qr_data: Optional[QRCodeData] = None
    preview_image_path: Optional[str] = None


class DocumentProcessingResult(BaseModel):
    file_name: str
    file_hash: str = Field(description="SHA-256 checksum of original file")
    file_size_bytes: int
    mime_type: str
    document_type: DocumentType
    total_pages: int
    pages: List[PageInfo] = Field(default_factory=list)
    digital_text_extracted: Optional[str] = Field(default=None, description="Concatenated text extracted directly from digital PDF layer")
    b2b_qr_found: bool = False
    b2b_qr_data: Optional[QRCodeData] = None
    processing_time_ms: float
    status: str = "SUCCESS"
    error_message: Optional[str] = None
