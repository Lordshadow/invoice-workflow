"""
FastAPI Router for Corporate Authentication, Role-Based Access, and Session Management.
Supports Staff Accountants (Makers), Executive Approvers (Checkers), and Finance Administrators.
"""
import uuid
from typing import Dict
from fastapi import APIRouter, HTTPException, status
from backend.app.schemas.auth import LoginRequest, LoginResponse, UserSessionDTO

router = APIRouter(prefix="/auth", tags=["Authentication & Access Control"])

# Pre-configured enterprise users
ENTERPRISE_USERS: Dict[str, dict] = {
    "sarah.approver": {
        "username": "sarah.approver",
        "fullName": "Sarah Jenkins",
        "role": "APPROVER",
        "title": "Financial Controller / Executive Approver",
        "email": "sarah.jenkins@enterprise.com",
        "department": "Corporate Financial Governance",
    },
    "approver": {
        "username": "sarah.approver",
        "fullName": "Sarah Jenkins",
        "role": "APPROVER",
        "title": "Financial Controller / Executive Approver",
        "email": "sarah.jenkins@enterprise.com",
        "department": "Corporate Financial Governance",
    },
    "john.accountant": {
        "username": "john.accountant",
        "fullName": "John Doe",
        "role": "ACCOUNTANT",
        "title": "Senior Accounts Payable Specialist",
        "email": "john.doe@enterprise.com",
        "department": "Accounts Payable Operations",
    },
    "accountant": {
        "username": "john.accountant",
        "fullName": "John Doe",
        "role": "ACCOUNTANT",
        "title": "Senior Accounts Payable Specialist",
        "email": "john.doe@enterprise.com",
        "department": "Accounts Payable Operations",
    },
    "alex.supervisor": {
        "username": "alex.supervisor",
        "fullName": "Alex Vance",
        "role": "SUPERVISOR",
        "title": "Chief Financial Controller & Administrator",
        "email": "alex.vance@enterprise.com",
        "department": "Executive Leadership & Audit",
    },
    "admin": {
        "username": "alex.supervisor",
        "fullName": "Alex Vance",
        "role": "SUPERVISOR",
        "title": "Chief Financial Controller & Administrator",
        "email": "alex.vance@enterprise.com",
        "department": "Executive Leadership & Audit",
    },
}


@router.post("/login", response_model=LoginResponse, summary="Authenticate Enterprise User")
def login(request: LoginRequest):
    """
    Authenticates corporate users (Accountants, Executive Approvers, Administrators)
    and returns a session token with role-based permissions.
    """
    key = request.username.strip().lower()
    
    # Check if user exists in directory
    user_info = ENTERPRISE_USERS.get(key)
    if not user_info:
        # Allow default enterprise test password if valid username pattern
        if "@" in key:
            prefix = key.split("@")[0].lower()
            user_info = ENTERPRISE_USERS.get(prefix)
            
    if not user_info:
        # Default fallback for testing with explicit credentials
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid corporate credentials. Please select a valid profile: sarah.approver, john.accountant, or admin."
        )

    # In enterprise demo mode, allow valid non-empty passwords
    if not request.password or len(request.password.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 3 characters."
        )

    session_token = f"lf_tok_{uuid.uuid4().hex}"
    
    return LoginResponse(
        token=session_token,
        user=UserSessionDTO(
            username=user_info["username"],
            fullName=user_info["fullName"],
            role=user_info["role"],
            title=user_info["title"],
            email=user_info["email"],
            department=user_info["department"],
        ),
        message=f"Welcome back, {user_info['fullName']}."
    )


@router.get("/users", summary="List Available Corporate Personas")
def list_personas():
    """Returns available corporate personas for quick switcher and role governance."""
    unique_users = [
        ENTERPRISE_USERS["sarah.approver"],
        ENTERPRISE_USERS["john.accountant"],
        ENTERPRISE_USERS["alex.supervisor"],
    ]
    return unique_users
