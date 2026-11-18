"""
Pydantic Schemas for Inbound Email and WhatsApp Ingestion Webhooks.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InboundEmailWebhookPayload(BaseModel):
    """
    JSON payload for programmatic email ingestion webhooks.
    """
    from_email: str = Field(..., description="Sender email address")
    subject: Optional[str] = Field(default="", description="Email subject line")
    filename: str = Field(..., description="Original filename of the invoice attachment")
    file_base64: str = Field(..., description="Base64-encoded file content")
    enable_stp: Optional[bool] = Field(default=None, description="Force or override STP evaluation")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional email headers or routing metadata")


class IngestChannelResponse(BaseModel):
    """
    Unified response for email and WhatsApp intake webhooks.
    """
    success: bool
    channel: str
    document_id: str
    invoice_id: Optional[str] = None
    file_name: str
    status: str
    is_escalated: bool = False
    delivered_to_target: bool = False
    grand_total: float = 0.0
    currency: str = "INR"
    message: str
    auto_reply_text: Optional[str] = None
