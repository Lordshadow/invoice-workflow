"""
FastAPI Router for AI Invoice Extraction endpoints.
"""
import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from backend.app.config import settings
from backend.app.schemas.invoice import ExtractionResponse
from backend.app.services.extraction_service import ExtractionService

logger = logging.getLogger("invoice_processor.router.extract")

router = APIRouter(prefix="/extract", tags=["AI Invoice Extraction"])
service = ExtractionService()


@router.get("/status", status_code=status.HTTP_200_OK)
async def get_extraction_status():
    """Returns active AI extraction engine status, mode, and model name."""
    return {
        "status": "online",
        "active_mode": service.gemini_extractor.mode,
        "model_name": service.gemini_extractor.model_name,
        "groq_active": service.groq_extractor.is_active,
        "groq_model": service.groq_extractor.primary_model,
        "groq_api_key_configured": bool(settings.GROQ_API_KEY),
        "paddle_ocr_active": True,
        "vertex_ai_enabled": settings.USE_VERTEX_AI,
        "gcp_project_id": settings.GCP_PROJECT_ID or None,
        "gemini_api_key_configured": bool(settings.GEMINI_API_KEY)
    }


@router.post(
    "",
    response_model=ExtractionResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract structured invoice data using AI",
    description="Preprocesses document, executes B2B QR fast-path or Gemini Multimodal extraction, and returns canonical invoice."
)
async def extract_invoice(
    file: UploadFile = File(..., description="Invoice PDF or photo (PNG, JPEG, WEBP)")
):
    """
    Accepts an uploaded invoice document, pre-processes it, and performs AI extraction.
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

    logger.info(f"Received extraction request for '{file.filename}' ({len(file_bytes)} bytes)")
    result = service.process_and_extract(file.filename, file_bytes)

    if not result.success:
        detail = result.error_message or (", ".join(result.validation_errors) if result.validation_errors else "Failed to extract invoice.")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail
        )

    return result
