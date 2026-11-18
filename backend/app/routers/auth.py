"""
FastAPI Router for Corporate Authentication, Role-Based Access, and Session Management.
Backbone for Staff Self-Registration, Password Hashing, and Administrator Approval Enforcement.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func

from backend.app.db.session import get_db
from backend.app.models.user import User, UserRole, UserStatus
from backend.app.schemas.auth import (
    LoginRequest, 
    LoginResponse, 
    RegisterRequest, 
    RegisterResponse, 
    UserSessionDTO
)
from backend.app.services.security import (
    hash_password, 
    verify_password, 
    generate_session_token, 
    verify_session_token
)

logger = logging.getLogger("invoice_processor.auth")
router = APIRouter(prefix="/auth", tags=["Authentication & Access Control"])


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency resolving the authenticated User entity from the Bearer token.
    Enforces token validity and active account status.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header. Expected 'Bearer <token>'."
        )
    
    token = authorization.split(" ")[1].strip()
    payload = verify_session_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or tampered session token. Please log in again."
        )
    
    user = db.get(User, payload["user_id"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with this token no longer exists."
        )
    
    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is inactive ({user.status}). Please contact an Administrator."
        )
    
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency restricting endpoint execution strictly to Administrators.
    """
    if current_user.role not in (UserRole.ADMIN.value, "SUPERVISOR"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required to perform this action."
        )
    return current_user


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED, summary="Staff Self-Registration")
def register_staff(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Registers a new staff member (Accountant Maker or Executive Approver).
    All self-registered accounts are created in 'PENDING_APPROVAL' state,
    requiring review and activation by an Administrator before login is permitted.
    """
    clean_username = request.username.strip().lower()
    clean_email = request.email.strip().lower()

    # Check for existing username or email
    stmt = select(User).where(
        or_(
            func.lower(User.username) == clean_username,
            func.lower(User.email) == clean_email
        )
    )
    existing = db.scalar(stmt)
    if existing:
        if existing.username.lower() == clean_username:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{clean_username}' is already registered."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Email '{clean_email}' is already associated with an account."
            )

    # Validate requested role
    role_normalized = request.requested_role.strip().upper()
    if role_normalized not in (UserRole.ACCOUNTANT.value, UserRole.APPROVER.value):
        role_normalized = UserRole.ACCOUNTANT.value

    # Hash password with PBKDF2-HMAC-SHA256
    pwd_hash, salt = hash_password(request.password)

    new_user = User(
        username=clean_username,
        email=clean_email,
        full_name=request.full_name.strip(),
        password_hash=pwd_hash,
        password_salt=salt,
        role=role_normalized,
        status=UserStatus.PENDING_APPROVAL.value,
        department=request.department.strip() or "Finance & Accounts"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info(f"New staff account registered: {new_user.username} (role={new_user.role}, status=PENDING_APPROVAL)")

    return RegisterResponse(
        user_id=new_user.id,
        username=new_user.username,
        status=new_user.status,
        message="Registration submitted successfully. Your account is pending Administrator review and approval."
    )


@router.post("/login", response_model=LoginResponse, summary="Authenticate Corporate User")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates corporate users against persistent database credentials.
    Rejects pending, suspended, or rejected staff accounts.
    """
    query_str = request.username.strip().lower()
    
    # Locate user by username or email
    stmt = select(User).where(
        or_(
            func.lower(User.username) == query_str,
            func.lower(User.email) == query_str
        )
    )
    user = db.scalar(stmt)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid corporate username or password."
        )

    # Verify password hash
    if not verify_password(request.password, user.password_hash, user.password_salt):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid corporate username or password."
        )

    # Governance check: Is the user active?
    if user.status == UserStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your staff registration is pending Administrator approval. Please contact the Financial Controller or Administrator."
        )
    elif user.status == UserStatus.SUSPENDED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended by the Administrator. Please contact corporate security."
        )
    elif user.status == UserStatus.REJECTED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your staff registration application was not approved by the Administrator."
        )
    elif user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account status is '{user.status}'. Cannot log in."
        )

    # Update last login timestamp
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    # Generate cryptographically signed bearer token
    token = generate_session_token(user)

    return LoginResponse(
        token=token,
        user=UserSessionDTO(**user.to_session_dict()),
        message=f"Welcome back, {user.full_name}."
    )


@router.get("/me", response_model=UserSessionDTO, summary="Get Current Authenticated User Profile")
def get_me(current_user: User = Depends(get_current_user)):
    """Returns the profile of the currently authenticated session user."""
    return UserSessionDTO(**current_user.to_session_dict())
