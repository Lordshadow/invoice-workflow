"""
SQLAlchemy Models for Invoices, Line Items, Extraction Logs, Outbox Events, and Audit Trails.
Enforces Senior Backend Standards: ACID transactions, optimistic locking (versioning), and transactional outbox.
"""
import enum
import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base, utc_now

if TYPE_CHECKING:
    from backend.app.models.document import Document


class InvoiceStatus(str, enum.Enum):
    RECEIVED = "RECEIVED"
    PREPROCESSING = "PREPROCESSING"
    EXTRACTED = "EXTRACTED"
    VALIDATED = "VALIDATED"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    PENDING_CORRECTION = "PENDING_CORRECTION"
    DUPLICATE_INVESTIGATION = "DUPLICATE_INVESTIGATION"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    DELIVERED = "DELIVERED"


class OutboxStatus(str, enum.Enum):
    PENDING = "PENDING"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True)

    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus),
        default=InvoiceStatus.RECEIVED,
        nullable=False,
        index=True
    )

    # Supplier Header
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    supplier_gstin: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    supplier_address: Mapped[Optional[str]] = mapped_column(Text)

    # Buyer Header
    buyer_name: Mapped[Optional[str]] = mapped_column(String(255))
    buyer_gstin: Mapped[Optional[str]] = mapped_column(String(50))
    buyer_address: Mapped[Optional[str]] = mapped_column(Text)

    # Invoice Metadata
    invoice_number: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    invoice_date: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    due_date: Mapped[Optional[str]] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    place_of_supply: Mapped[Optional[str]] = mapped_column(String(100))

    # Financial Totals
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    cgst: Mapped[float] = mapped_column(Float, default=0.0)
    sgst: Mapped[float] = mapped_column(Float, default=0.0)
    igst: Mapped[float] = mapped_column(Float, default=0.0)
    cess: Mapped[float] = mapped_column(Float, default=0.0)
    round_off: Mapped[float] = mapped_column(Float, default=0.0)
    grand_total: Mapped[float] = mapped_column(Float, default=0.0, index=True)

    # Validation & Quality
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    validation_errors: Mapped[Optional[str]] = mapped_column(Text, comment="JSON array of validation error strings")
    extraction_notes: Mapped[Optional[str]] = mapped_column(Text)

    # Human-in-the-Loop (HITL) & Escalation Management
    is_escalated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    escalation_reason: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    escalation_category: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    duplicate_of_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)

    # Optimistic Concurrency Control (OCC)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="invoices")
    line_items: Mapped[List["InvoiceLineItem"]] = relationship("InvoiceLineItem", back_populates="invoice", cascade="all, delete-orphan")
    extractions: Mapped[List["ExtractionLog"]] = relationship("ExtractionLog", back_populates="invoice", cascade="all, delete-orphan")

    # Compound index for Tier-2 business deduplication
    __table_args__ = (
        Index("idx_invoice_supplier_num", "supplier_gstin", "invoice_number"),
    )


class InvoiceLineItem(Base):
    __tablename__ = "line_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), index=True)

    description: Mapped[str] = mapped_column(Text, nullable=False)
    hsn_code: Mapped[Optional[str]] = mapped_column(String(50))
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_rate: Mapped[float] = mapped_column(Float, default=0.0)
    cgst_amount: Mapped[float] = mapped_column(Float, default=0.0)
    sgst_amount: Mapped[float] = mapped_column(Float, default=0.0)
    igst_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)

    # Relationship
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="line_items")


class ExtractionLog(Base):
    __tablename__ = "extractions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), index=True)

    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    raw_payload: Mapped[Optional[str]] = mapped_column(Text)
    normalized_payload: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="extractions")


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    aggregate_type: Mapped[str] = mapped_column(String(50), default="invoice", index=True)
    aggregate_id: Mapped[str] = mapped_column(String(36), index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False, comment="Serialized event data JSON")
    status: Mapped[OutboxStatus] = mapped_column(Enum(OutboxStatus), default=OutboxStatus.PENDING, index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    actor: Mapped[str] = mapped_column(String(100), default="system")
    action: Mapped[str] = mapped_column(String(50), index=True)
    changes_json: Mapped[Optional[str]] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
