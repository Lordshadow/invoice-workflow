"""
SQLAlchemy Model for Enterprise Users & Staff Governance.
Enforces Role-Based Access Control (Admin, Maker, Checker) and Administrator Approval Lifecycles.
"""
import enum
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.base import Base, utc_now


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    ACCOUNTANT = "ACCOUNTANT"  # Staff Maker
    APPROVER = "APPROVER"      # Executive Checker / Approver


class UserStatus(str, enum.Enum):
    PENDING_APPROVAL = "PENDING_APPROVAL"
    ACTIVE = "ACTIVE"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    password_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default=UserRole.ACCOUNTANT.value, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=UserStatus.PENDING_APPROVAL.value, index=True, nullable=False)
    department: Mapped[str] = mapped_column(String(64), default="Finance & Accounts", nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Two-Factor Authentication (2FA OTP)
    otp_code_hash: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    otp_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    otp_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pre_auth_token: Mapped[Optional[str]] = mapped_column(String(128), index=True, nullable=True)

    def to_session_dict(self) -> dict:
        """Returns standard session dictionary for authentication payloads."""
        title = "Chief Financial Controller & Administrator" if self.role == UserRole.ADMIN.value else (
            "Financial Controller / Executive Approver" if self.role == UserRole.APPROVER.value else
            "Senior Accounts Payable Specialist"
        )
        return {
            "id": self.id,
            "username": self.username,
            "fullName": self.full_name,
            "role": self.role,
            "title": title,
            "email": self.email,
            "department": self.department,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "approvedAt": self.approved_at.isoformat() if self.approved_at else None,
            "approvedBy": self.approved_by,
        }
