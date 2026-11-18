"""
Pydantic schemas for User Authentication, Roles, and Session Management.
"""
from typing import Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., description="Corporate username or email")
    password: str = Field(..., description="Account password")


class UserSessionDTO(BaseModel):
    username: str
    fullName: str
    role: str = Field(description="ACCOUNTANT, APPROVER, or SUPERVISOR")
    title: str
    email: str
    department: str = "Finance & Accounts"


class LoginResponse(BaseModel):
    success: bool = True
    token: str
    token_type: str = "bearer"
    user: UserSessionDTO
    message: str = "Authentication successful"
