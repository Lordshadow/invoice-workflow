"""
SQLAlchemy Models for the Target Company / ERP Destination Database.
Enforces absolute delivery idempotency via UNIQUE (supplier_gstin, invoice_number).
"""
import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from backend.app.db.base import utc_now


class TargetBase(DeclarativeBase):
    """Separate Declarative Base for the external Target Company Database."""
    pass


class CompanyInvoice(TargetBase):
    __tablename__ = "company_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ext_reference_id: Mapped[str] = mapped_column(String(36), index=True, comment="Internal pipeline invoice_id")

    supplier_gstin: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    invoice_date: Mapped[Optional[str]] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(10), default="INR")

    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    grand_total: Mapped[float] = mapped_column(Float, default=0.0)
    posted_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)

    # Relationships
    lines: Mapped[List["CompanyInvoiceLine"]] = relationship(
        "CompanyInvoiceLine", back_populates="company_invoice", cascade="all, delete-orphan"
    )

    # Absolute Idempotency Constraint
    __table_args__ = (
        UniqueConstraint("supplier_gstin", "invoice_number", name="uq_target_supplier_invoice"),
    )


class CompanyInvoiceLine(TargetBase):
    __tablename__ = "company_invoice_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("company_invoices.id", ondelete="CASCADE"), index=True)

    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    hsn_code: Mapped[Optional[str]] = mapped_column(String(50))
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    line_total: Mapped[float] = mapped_column(Float, default=0.0)

    company_invoice: Mapped["CompanyInvoice"] = relationship("CompanyInvoice", back_populates="lines")
