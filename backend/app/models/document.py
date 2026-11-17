"""
SQLAlchemy Model for Ingested Documents.
Enforces Tier-1 SHA-256 deduplication and source auditing.
"""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, TYPE_CHECKING

from backend.app.db.base import Base, utc_now

if TYPE_CHECKING:
    from backend.app.models.invoice import Invoice


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source: Mapped[str] = mapped_column(String(50), default="upload", index=True, comment="whatsapp, upload, or email")
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True, comment="SHA-256 checksum for Tier-1 duplicate detection")
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)

    # Relationships
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="document", cascade="all, delete-orphan")
