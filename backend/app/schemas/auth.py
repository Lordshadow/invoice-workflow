"""
Pydantic schemas for User Authentication, Roles, Self-Registration, and Staff Governance.
"""
from typing import Optional, List
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, description="Alphanumeric corporate username")
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", description="Corporate email address")
    password: str = Field(..., min_length=6, max_length=128, description="Secure account password")
    full_name: str = Field(..., min_length=2, max_length=128, description="Full legal name of the staff member")
    requested_role: str = Field(default="ACCOUNTANT", description="Requested role: ACCOUNTANT (Maker) or APPROVER (Checker)")
    department: str = Field(default="Finance & Accounts", description="Corporate department")


class LoginRequest(BaseModel):
    username: str = Field(..., description="Corporate username or email")
    password: str = Field(..., description="Account password")


class UserSessionDTO(BaseModel):
    id: str
    username: str
    fullName: str
    role: str = Field(description="ADMIN, ACCOUNTANT (Maker), or APPROVER (Checker)")
    title: str
    email: str
    department: str = "Finance & Accounts"
    status: str = Field(description="PENDING_APPROVAL, ACTIVE, REJECTED, or SUSPENDED")
    createdAt: Optional[str] = None
    approvedAt: Optional[str] = None
    approvedBy: Optional[str] = None


class LoginResponse(BaseModel):
    success: bool = True
    token: str
    token_type: str = "bearer"
    user: UserSessionDTO
    message: str = "Authentication successful"


class RegisterResponse(BaseModel):
    success: bool = True
    user_id: str
    username: str
    status: str = "PENDING_APPROVAL"
    message: str = "Registration submitted successfully. Account pending Administrator review and approval."


# Admin Staff Governance Schemas
class StaffApprovalRequest(BaseModel):
    approved_role: str = Field(default="ACCOUNTANT", description="Confirmed role: ACCOUNTANT or APPROVER")
    department: Optional[str] = Field(default=None, description="Assigned department")
    notes: Optional[str] = Field(default=None, description="Administrator approval notes")


class StaffRoleUpdateRequest(BaseModel):
    role: str = Field(..., description="Target role: ACCOUNTANT, APPROVER, or ADMIN")


class StaffStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Target status: ACTIVE, SUSPENDED, or REJECTED")
    reason: Optional[str] = Field(default=None, description="Reason for status change")


class StaffListResponse(BaseModel):
    total: int
    pending_count: int
    active_makers: int
    active_checkers: int
    staff: List[UserSessionDTO]
