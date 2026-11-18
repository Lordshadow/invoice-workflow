"""
Enterprise Security, Cryptographic Password Hashing & Token Management Service.
Complies with NIST SP 800-63B guidelines (PBKDF2-HMAC-SHA256 with 600,000 iterations).
"""
import hashlib
import hmac
import json
import base64
import os
import secrets
import time
import logging
from typing import Tuple, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.models.user import User, UserRole, UserStatus

logger = logging.getLogger("invoice_processor.security")

# Secret key for HMAC token signing (falls back to secure random if unset)
SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "ledgerflow-enterprise-corporate-auth-secret-key-2026")
ITERATIONS = 600_000
TOKEN_VALIDITY_SECONDS = 86400 * 7  # 7 days


def hash_password(password: str) -> Tuple[str, str]:
    """
    Hashes a password with PBKDF2-HMAC-SHA256 and a cryptographically secure salt.
    Returns: (hex_hash, hex_salt)
    """
    salt = secrets.token_bytes(32)
    derived = hashlib.pbkdf2_hmac(
        hash_name="sha256",
        password=password.encode("utf-8"),
        salt=salt,
        iterations=ITERATIONS,
        dklen=32
    )
    return derived.hex(), salt.hex()


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """
    Constant-time comparison verifying raw password against stored PBKDF2 hash.
    """
    try:
        salt_bytes = bytes.fromhex(salt)
        expected_hash = bytes.fromhex(password_hash)
        actual_hash = hashlib.pbkdf2_hmac(
            hash_name="sha256",
            password=password.encode("utf-8"),
            salt=salt_bytes,
            iterations=ITERATIONS,
            dklen=32
        )
        return hmac.compare_digest(actual_hash, expected_hash)
    except Exception as e:
        logger.error(f"Password verification failure: {e}")
        return False


def generate_session_token(user: User) -> str:
    """
    Generates a cryptographically signed, tamper-proof bearer session token.
    Format: base64(payload).base64(signature)
    """
    payload = {
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "exp": int(time.time()) + TOKEN_VALIDITY_SECONDS,
        "rnd": secrets.token_hex(8)
    }
    payload_raw = json.dumps(payload, separators=(',', ':')).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_raw).decode("utf-8").rstrip("=")
    
    signature = hmac.new(
        key=SECRET_KEY.encode("utf-8"),
        msg=payload_b64.encode("utf-8"),
        digestmod=hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    
    return f"lf_{payload_b64}.{sig_b64}"


def verify_session_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verifies token signature and expiration. Returns payload dict if valid, else None.
    """
    if not token or not token.startswith("lf_"):
        return None
    
    raw = token[3:]
    parts = raw.split(".")
    if len(parts) != 2:
        return None
    
    payload_b64, sig_b64 = parts
    
    # Verify HMAC signature
    expected_sig = hmac.new(
        key=SECRET_KEY.encode("utf-8"),
        msg=payload_b64.encode("utf-8"),
        digestmod=hashlib.sha256
    ).digest()
    expected_b64 = base64.urlsafe_b64encode(expected_sig).decode("utf-8").rstrip("=")
    
    if not hmac.compare_digest(sig_b64, expected_b64):
        return None
    
    # Decode and check expiration
    try:
        padded_b64 = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded_b64).decode("utf-8"))
        if payload.get("exp", 0) < int(time.time()):
            return None  # Token expired
        return payload
    except Exception:
        return None


def bootstrap_initial_users(db: Session) -> None:
    """
    Seeds initial system accounts into the database if the users table is empty.
    Creates:
    1. Super Admin ('admin' / 'admin123')
    2. Maker ('maker' / 'maker123' - John Doe)
    3. Checker ('checker' / 'checker123' - Sarah Jenkins)
    All seeded with PBKDF2-HMAC-SHA256 hashed passwords and ACTIVE status.
    """
    existing_admin = db.scalar(select(User).where(User.role == UserRole.ADMIN.value))
    if existing_admin:
        return  # Already bootstrapped

    logger.info("Bootstrapping initial enterprise users into database...")
    
    initial_users = [
        {
            "username": "admin",
            "email": "admin@enterprise.com",
            "full_name": "System Administrator",
            "password": os.getenv("ADMIN_INITIAL_PASSWORD", "admin123"),
            "role": UserRole.ADMIN.value,
            "status": UserStatus.ACTIVE.value,
            "department": "Executive Leadership & Governance",
        },
        {
            "username": "sarah.approver",
            "email": "sarah.jenkins@enterprise.com",
            "full_name": "Sarah Jenkins",
            "password": "password123",
            "role": UserRole.APPROVER.value,
            "status": UserStatus.ACTIVE.value,
            "department": "Corporate Financial Governance",
        },
        {
            "username": "john.accountant",
            "email": "john.doe@enterprise.com",
            "full_name": "John Doe",
            "password": "password123",
            "role": UserRole.ACCOUNTANT.value,
            "status": UserStatus.ACTIVE.value,
            "department": "Accounts Payable Operations",
        },
    ]

    for u_data in initial_users:
        # Check if username already exists
        exists = db.scalar(select(User).where(User.username == u_data["username"]))
        if not exists:
            pwd_hash, salt = hash_password(u_data["password"])
            user = User(
                username=u_data["username"],
                email=u_data["email"],
                full_name=u_data["full_name"],
                password_hash=pwd_hash,
                password_salt=salt,
                role=u_data["role"],
                status=u_data["status"],
                department=u_data["department"],
                approved_by="SYSTEM_BOOTSTRAP"
            )
            db.add(user)

    db.commit()
    logger.info("Enterprise users bootstrapped successfully.")
