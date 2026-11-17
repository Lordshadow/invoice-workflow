"""
Pydantic Schemas for Invoice Management, Workflow, and Delivery APIs.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

from backend.app.models.invoice import InvoiceStatus


class LineItemDTO(BaseModel):
    id: Optional[str] = None
    description: str
    hsn_code: Optional[str] = None
    quantity: float = 1.0
    unit_price: float = 0.0
    discount: float = 0.0
    tax_rate: float = 0.0
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    igst_amount: float = 0.0
    total_amount: float = 0.0

    @field_validator("hsn_code", mode="before")
    @classmethod
    def coerce_hsn(cls, v):
        if v is None:
            return None
        return str(v).strip()


class AuditLogDTO(BaseModel):
    id: str
    actor: str
    action: str
    changes: Optional[Dict[str, Any]] = None
    timestamp: datetime


class ExtractionLogDTO(BaseModel):
    id: str
    provider: str
    model_name: str
    latency_ms: float
    created_at: datetime


class InvoiceSummaryDTO(BaseModel):
    id: str
    document_id: str
    file_name: Optional[str] = None
    status: InvoiceStatus
    supplier_name: Optional[str] = None
    supplier_gstin: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    currency: str = "INR"
    grand_total: float = 0.0
    confidence_score: float = 1.0
    is_valid: bool = True
    version: int = 1
    created_at: datetime


class InvoiceDetailDTO(BaseModel):
    id: str
    document_id: str
    file_name: Optional[str] = None
    file_path: Optional[str] = None
    file_hash: Optional[str] = None
    status: InvoiceStatus
    supplier_name: Optional[str] = None
    supplier_gstin: Optional[str] = None
    supplier_address: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_gstin: Optional[str] = None
    buyer_address: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: str = "INR"
    place_of_supply: Optional[str] = None
    subtotal: float = 0.0
    cgst: float = 0.0
    sgst: float = 0.0
    igst: float = 0.0
    cess: float = 0.0
    round_off: float = 0.0
    grand_total: float = 0.0
    confidence_score: float = 1.0
    is_valid: bool = True
    validation_errors: List[str] = Field(default_factory=list)
    extraction_notes: Optional[str] = None
    version: int = 1
    created_at: datetime
    updated_at: datetime
    line_items: List[LineItemDTO] = Field(default_factory=list)
    extractions: List[ExtractionLogDTO] = Field(default_factory=list)
    audit_logs: List[AuditLogDTO] = Field(default_factory=list)


class InvoiceApprovalRequest(BaseModel):
    actor: str = Field(description="Username or user ID of approver")
    notes: Optional[str] = Field(default=None, description="Optional approval notes or sign-off remarks")
    expected_version: int = Field(description="OCC expected version for race condition prevention")


class InvoiceRejectionRequest(BaseModel):
    actor: str = Field(description="Username or user ID of rejecting user")
    reason: str = Field(description="Mandatory rejection rationale")


class InvoiceUpdateRequest(BaseModel):
    actor: str = Field(description="Username or user ID of accountant/editor")
    expected_version: int = Field(description="OCC expected version for race condition prevention")
    notes: Optional[str] = Field(default=None, description="Reason or explanation for edit/correction")
    supplier_name: Optional[str] = None
    supplier_gstin: Optional[str] = None
    supplier_address: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_gstin: Optional[str] = None
    buyer_address: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: Optional[str] = None
    place_of_supply: Optional[str] = None
    subtotal: Optional[float] = None
    cgst: Optional[float] = None
    sgst: Optional[float] = None
    igst: Optional[float] = None
    cess: Optional[float] = None
    round_off: Optional[float] = None
    grand_total: Optional[float] = None
    line_items: Optional[List[LineItemDTO]] = None



class ProcessInvoiceResponse(BaseModel):
    success: bool
    document_id: str
    invoice_id: Optional[str] = None
    file_name: str
    file_hash: str
    status: InvoiceStatus
    duplicate_type: str = "NONE"
    duplicate_of_id: Optional[str] = None
    validation_passed: bool = True
    validation_errors: List[str] = Field(default_factory=list)
    grand_total: float = 0.0
    currency: str = "INR"
    message: str


class CompanyInvoiceDTO(BaseModel):
    id: str
    ext_reference_id: str
    supplier_gstin: Optional[str] = None
    supplier_name: str
    invoice_number: str
    invoice_date: Optional[str] = None
    currency: str
    subtotal: float
    tax_amount: float
    grand_total: float
    posted_at: datetime
    lines: List[Dict[str, Any]] = Field(default_factory=list)
