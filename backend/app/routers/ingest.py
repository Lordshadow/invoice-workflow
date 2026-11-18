"""
FastAPI Router for Automated Email and WhatsApp Ingestion Channels.
Provides inbound webhook endpoints for programmatic and bridge intake.
"""
import base64
import logging
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.db.session import get_db, get_target_db
from backend.app.schemas.ingest import InboundEmailWebhookPayload, IngestChannelResponse
from backend.app.services.email_poller import email_poller_service
from backend.app.services.ingestion_service import IngestionService

logger = logging.getLogger("invoice_processor.router.ingest")

router = APIRouter(prefix="/ingest", tags=["Automated Ingestion Channels"])


@router.post(
    "/email",
    response_model=IngestChannelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Inbound Email Webhook (Multipart)",
)
async def ingest_email_multipart(
    file: UploadFile = File(..., description="Invoice attachment (PDF, JPEG, PNG, WEBP, DOCX)"),
    from_email: str = Form(default="ap-inbox@enterprise.local", description="Sender email address"),
    subject: str = Form(default="Inbound AP Invoice", description="Email subject"),
    message_id: Optional[str] = Form(default=None, description="Mail header Message-ID"),
    enable_stp: Optional[bool] = Form(default=None, description="Override STP evaluation"),
    db: Session = Depends(get_db),
    target_db: Session = Depends(get_target_db),
):
    """
    Ingests invoice attachments received via inbound email webhook (SendGrid, Mailgun, AWS SES).
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment must include a valid filename."
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded email attachment is empty (0 bytes)."
        )

    try:
        res = IngestionService.ingest_invoice(
            file_bytes=file_bytes,
            filename=file.filename,
            source="email",
            db=db,
            target_db=target_db,
            enable_stp=enable_stp,
            source_metadata={
                "from_email": from_email,
                "subject": subject,
                "message_id": message_id,
            },
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Inbound email ingestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Email processing failed: {str(e)}")

    auto_reply = (
        f"Thank you. Your invoice '{file.filename}' was received and posted to Target ERP (ID: {res.invoice_id})."
        if res.delivered_to_target
        else f"Thank you. Your invoice '{file.filename}' was received and logged under Tracking ID: {res.invoice_id or res.document_id}."
    )

    return IngestChannelResponse(
        success=res.success,
        channel="email",
        document_id=res.document_id,
        invoice_id=res.invoice_id,
        file_name=res.file_name,
        status=res.status.value if hasattr(res.status, "value") else str(res.status),
        is_escalated=res.is_escalated,
        delivered_to_target=res.delivered_to_target,
        grand_total=res.grand_total,
        currency=res.currency,
        message=res.message,
        auto_reply_text=auto_reply,
    )


@router.post(
    "/email/json",
    response_model=IngestChannelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Inbound Email Webhook (JSON Base64)",
)
async def ingest_email_json(
    payload: InboundEmailWebhookPayload,
    db: Session = Depends(get_db),
    target_db: Session = Depends(get_target_db),
):
    """
    Ingests invoice attachments via JSON payload with base64-encoded file data.
    """
    try:
        file_bytes = base64.b64decode(payload.file_base64)
    except Exception as b64_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid base64 payload: {str(b64_err)}"
        )

    try:
        res = IngestionService.ingest_invoice(
            file_bytes=file_bytes,
            filename=payload.filename,
            source="email",
            db=db,
            target_db=target_db,
            enable_stp=payload.enable_stp,
            source_metadata={
                "from_email": payload.from_email,
                "subject": payload.subject,
                "metadata": payload.metadata or {},
            },
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Inbound JSON email ingestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Email processing failed: {str(e)}")

    auto_reply = (
        f"Thank you. Your invoice '{payload.filename}' was received and posted to Target ERP (ID: {res.invoice_id})."
        if res.delivered_to_target
        else f"Thank you. Your invoice '{payload.filename}' was received and logged under Tracking ID: {res.invoice_id or res.document_id}."
    )

    return IngestChannelResponse(
        success=res.success,
        channel="email",
        document_id=res.document_id,
        invoice_id=res.invoice_id,
        file_name=res.file_name,
        status=res.status.value if hasattr(res.status, "value") else str(res.status),
        is_escalated=res.is_escalated,
        delivered_to_target=res.delivered_to_target,
        grand_total=res.grand_total,
        currency=res.currency,
        message=res.message,
        auto_reply_text=auto_reply,
    )


@router.post(
    "/whatsapp",
    response_model=IngestChannelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Inbound WhatsApp Media Webhook",
)
async def ingest_whatsapp_media(
    file: UploadFile = File(..., description="Decrypted WhatsApp media attachment"),
    sender_phone: str = Form(..., description="Sender WhatsApp phone number (e.g. +919876543210)"),
    sender_name: Optional[str] = Form(default="WhatsApp Contact", description="Sender display name"),
    message_id: Optional[str] = Form(default=None, description="WhatsApp Message ID"),
    timestamp: Optional[str] = Form(default=None, description="Message timestamp"),
    enable_stp: Optional[bool] = Form(default=None, description="Override STP evaluation"),
    db: Session = Depends(get_db),
    target_db: Session = Depends(get_target_db),
):
    """
    Ingests invoice photos or PDFs sent via WhatsApp through the OpenWA bridge.
    Returns an immediate auto-reply message formatted for WhatsApp text response.
    """
    if not file.filename:
        filename = f"whatsapp_{sender_phone}_{message_id or 'media'}.pdf"
    else:
        filename = file.filename

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded WhatsApp media is empty (0 bytes)."
        )

    try:
        res = IngestionService.ingest_invoice(
            file_bytes=file_bytes,
            filename=filename,
            source="whatsapp",
            db=db,
            target_db=target_db,
            enable_stp=enable_stp,
            source_metadata={
                "sender_phone": sender_phone,
                "sender_name": sender_name,
                "message_id": message_id,
                "timestamp": timestamp,
            },
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Inbound WhatsApp ingestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"WhatsApp processing failed: {str(e)}")

    # Formulate contextual auto-reply for WhatsApp chat
    if res.delivered_to_target:
        auto_reply = (
            f"✅ *Invoice Processed & Settled!*\n"
            f"📄 *File:* {filename}\n"
            f"💰 *Gross Value:* ₹{res.grand_total:,.2f}\n"
            f"🚀 *Status:* Straight-Through Posted to Target ERP\n"
            f"🆔 *Tracking ID:* {res.invoice_id}"
        )
    elif res.is_escalated:
        auto_reply = (
            f"⚠️ *Invoice Received — Review Required*\n"
            f"📄 *File:* {filename}\n"
            f"💰 *Gross Value:* ₹{res.grand_total:,.2f}\n"
            f"📋 *Reason:* {res.escalation_reason}\n"
            f"🧑‍💼 *Status:* Routed to AP Accounts Team for human verification\n"
            f"🆔 *Tracking ID:* {res.invoice_id or res.document_id}"
        )
    else:
        auto_reply = (
            f"📥 *Invoice Received*\n"
            f"📄 *File:* {filename}\n"
            f"💰 *Gross Value:* ₹{res.grand_total:,.2f}\n"
            f"⏳ *Status:* Processing in pipeline\n"
            f"🆔 *Tracking ID:* {res.invoice_id or res.document_id}"
        )

    return IngestChannelResponse(
        success=res.success,
        channel="whatsapp",
        document_id=res.document_id,
        invoice_id=res.invoice_id,
        file_name=res.file_name,
        status=res.status.value if hasattr(res.status, "value") else str(res.status),
        is_escalated=res.is_escalated,
        delivered_to_target=res.delivered_to_target,
        grand_total=res.grand_total,
        currency=res.currency,
        message=res.message,
        auto_reply_text=auto_reply,
    )


@router.get(
    "/channels/status",
    summary="Operational Status of All Ingestion Channels",
)
def get_channels_status():
    """
    Returns live health & configuration status for all intake channels.
    """
    return {
        "channels": {
            "web_upload": {
                "enabled": True,
                "status": "OPERATIONAL",
                "mode": "Direct Multipart HTTP",
            },
            "email_poller": {
                "enabled": settings.ENABLE_EMAIL_POLLER,
                "status": "RUNNING" if settings.ENABLE_EMAIL_POLLER else "IDLE",
                "imap_host": settings.IMAP_HOST or "Not Configured",
                "imap_user": settings.IMAP_USER or "Not Configured",
                "poll_interval_seconds": settings.IMAP_POLL_INTERVAL_SECONDS,
            },
            "email_webhook": {
                "enabled": True,
                "status": "OPERATIONAL",
                "endpoint": "/api/v1/ingest/email",
            },
            "whatsapp_webhook": {
                "enabled": True,
                "status": "OPERATIONAL",
                "endpoint": "/api/v1/ingest/whatsapp",
                "auto_reply": settings.WHATSAPP_AUTO_REPLY,
            },
        }
    }
