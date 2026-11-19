"""
FastAPI Router for Corporate Authentication, Role-Based Access, and Session Management.
Backbone for Staff Self-Registration, Password Hashing, and Administrator Approval Enforcement.
"""
import hashlib
import hmac
import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func

from backend.app.config import settings
from backend.app.db.session import get_db
from backend.app.models.user import User, UserRole, UserStatus
from backend.app.schemas.auth import (
    LoginRequest, 
    LoginResponse, 
    OtpRequiredResponse,
    VerifyOtpRequest,
    ResendOtpRequest,
    RegisterRequest, 
    RegisterResponse, 
    UserSessionDTO
)
from backend.app.services.email_sender import send_otp_email, mask_email
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


@router.post("/login", response_model=Union[LoginResponse, OtpRequiredResponse], summary="Authenticate Corporate User & Dispatch 2FA OTP")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates corporate users against persistent database credentials.
    Rejects pending, suspended, or rejected staff accounts.
    Enforces Two-Factor Authentication (2FA) via 6-digit email OTP for Admins and Staff.
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

    # Two-Factor Authentication (2FA OTP) Enforcement
    if getattr(settings, "ENABLE_2FA", True):
        # Generate cryptographically secure 6-digit OTP
        otp_code = f"{secrets.randbelow(1_000_000):06d}"
        pre_auth_token = f"pre_{secrets.token_urlsafe(32)}"
        now = datetime.now(timezone.utc)

        user.otp_code_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()
        user.otp_expires_at = now + timedelta(minutes=5)
        user.otp_attempts = 0
        user.pre_auth_token = pre_auth_token
        db.commit()

        # Send OTP code to user's registered corporate email in background
        threading.Thread(
            target=send_otp_email,
            args=(user.email, user.full_name, otp_code),
            daemon=True
        ).start()

        masked = mask_email(user.email)
        logger.info(f"2FA OTP generated for user '{user.username}' (dispatched to {masked})")

        return OtpRequiredResponse(
            success=True,
            requires_2fa=True,
            pre_auth_token=pre_auth_token,
            masked_email=masked,
            message=f"A 6-digit verification code has been dispatched to your email ({masked}).",
            expires_in_seconds=300,
            dev_otp_hint=otp_code if (settings.DEBUG or getattr(settings, "IS_TESTING", False)) else None
        )

    # Fallback when 2FA is explicitly disabled
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    token = generate_session_token(user)

    return LoginResponse(
        token=token,
        user=UserSessionDTO(**user.to_session_dict()),
        message=f"Welcome back, {user.full_name}."
    )


@router.post("/verify-otp", response_model=LoginResponse, summary="Verify 6-Digit 2FA Code & Issue Bearer Token")
def verify_otp(request: VerifyOtpRequest, db: Session = Depends(get_db)):
    """
    Verifies 6-digit OTP code against pre-auth session and issues bearer JWT.
    Enforces 5-minute expiration and maximum 5 invalid attempt lockout.
    """
    clean_token = request.pre_auth_token.strip()
    clean_code = request.otp_code.strip()

    stmt = select(User).where(User.pre_auth_token == clean_token)
    user = db.scalar(stmt)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired session. Please sign in again."
        )

    now = datetime.now(timezone.utc)
    exp = user.otp_expires_at
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if not exp or now > exp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code."
        )

    if user.otp_attempts >= 5:
        user.pre_auth_token = None
        user.otp_code_hash = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum verification attempts exceeded. Please sign in again."
        )

    code_hash = hashlib.sha256(clean_code.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(code_hash, user.otp_code_hash or ""):
        user.otp_attempts += 1
        db.commit()
        remaining = max(0, 5 - user.otp_attempts)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining."
        )

    # Success! Clear OTP state and record login timestamp
    user.pre_auth_token = None
    user.otp_code_hash = None
    user.otp_expires_at = None
    user.otp_attempts = 0
    user.last_login_at = now
    db.commit()

    token = generate_session_token(user)
    logger.info(f"User '{user.username}' successfully verified 2FA OTP.")

    return LoginResponse(
        token=token,
        user=UserSessionDTO(**user.to_session_dict()),
        message=f"Two-Factor Authentication verified. Welcome back, {user.full_name}."
    )


@router.post("/resend-otp", summary="Resend Fresh 2FA OTP Code")
def resend_otp(request: ResendOtpRequest, db: Session = Depends(get_db)):
    """
    Dispatches a fresh 6-digit OTP code to the user's email address.
    """
    clean_token = request.pre_auth_token.strip()
    stmt = select(User).where(User.pre_auth_token == clean_token)
    user = db.scalar(stmt)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired session. Please sign in again."
        )

    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.now(timezone.utc)
    user.otp_code_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()
    user.otp_expires_at = now + timedelta(minutes=5)
    user.otp_attempts = 0
    db.commit()

    threading.Thread(
        target=send_otp_email,
        args=(user.email, user.full_name, otp_code),
        daemon=True
    ).start()

    masked = mask_email(user.email)
    logger.info(f"Fresh 2FA OTP dispatched for user '{user.username}' to {masked}")

    return {
        "success": True,
        "message": f"A new verification code has been dispatched to {masked}.",
        "expires_in_seconds": 300,
        "dev_otp_hint": otp_code if (settings.DEBUG or getattr(settings, "IS_TESTING", False)) else None
    }


@router.get("/me", response_model=UserSessionDTO, summary="Get Current Authenticated User Profile")
def get_me(current_user: User = Depends(get_current_user)):
    """Returns the profile of the currently authenticated session user."""
    return UserSessionDTO(**current_user.to_session_dict())
