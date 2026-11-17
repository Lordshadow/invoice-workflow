"""
FastAPI Router for Document Preprocessing & Intake endpoints.
"""
import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from backend.app.config import settings
from backend.app.schemas.document import DocumentProcessingResult
from backend.app.services.document_processor import DocumentProcessor

logger = logging.getLogger("invoice_processor.router")

router = APIRouter(prefix="/documents", tags=["Document Processing"])
processor = DocumentProcessor()


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """Health check endpoint for the document preprocessing service."""
    return {
        "status": "healthy",
        "service": "document-processing-engine",
        "version": "1.0.0"
    }


@router.post(
    "/preprocess",
    response_model=DocumentProcessingResult,
    status_code=status.HTTP_200_OK,
    summary="Preprocess an uploaded invoice document",
    description="Inspects file, computes SHA-256 hash, extracts digital PDF text, deskews images, and decodes B2B e-invoice QR codes."
)
async def preprocess_document(
    file: UploadFile = File(..., description="Invoice document (PDF, PNG, JPEG, WEBP)")
):
    """
    Handles file upload, validates payload, and executes document preprocessing pipeline.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename."
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty (0 bytes)."
        )

    if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_BYTES / (1024 * 1024):.1f} MB."
        )

    logger.info(f"Received document preprocessing request for '{file.filename}' ({len(file_bytes)} bytes)")
    result = processor.process(file.filename, file_bytes)

    if result.status == "FAILED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.error_message or "Failed to process document."
        )

    return result
