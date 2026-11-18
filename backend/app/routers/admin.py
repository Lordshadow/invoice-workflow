"""
FastAPI Router for Administrator Staff Governance & Access Control.
Provides dedicated endpoints for reviewing pending registrations, approving makers/checkers,
updating roles, suspending accounts, and inspecting staff rosters.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_

from backend.app.db.session import get_db
from backend.app.models.user import User, UserRole, UserStatus
from backend.app.models.invoice import AuditLog
from backend.app.schemas.auth import (
    AdminRegisterStaffRequest,
    StaffApprovalRequest,
    StaffRoleUpdateRequest,
    StaffStatusUpdateRequest,
    StaffListResponse,
    UserSessionDTO
)
from backend.app.routers.auth import require_admin
from backend.app.services.security import hash_password

logger = logging.getLogger("invoice_processor.admin")
router = APIRouter(prefix="/admin/staff", tags=["Administrator & Staff Governance"])


@router.get("", response_model=StaffListResponse, summary="List Registered Staff & Pending Queue")
def list_staff(
    status_filter: Optional[str] = Query(None, description="Filter by status (ALL, PENDING_APPROVAL, ACTIVE, SUSPENDED, REJECTED)"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Returns the complete directory of staff members with counts for pending approval applications,
    active makers (Accountants), and active checkers (Approvers).
    """
    stmt = select(User).order_by(User.created_at.desc())
    if status_filter and status_filter.upper() != "ALL":
        stmt = stmt.where(User.status == status_filter.upper())
    
    users = db.scalars(stmt).all()

    # Calculate overall metrics
    all_users = db.scalars(select(User)).all()
    total = len(all_users)
    pending_count = sum(1 for u in all_users if u.status == UserStatus.PENDING_APPROVAL.value)
    active_makers = sum(1 for u in all_users if u.status == UserStatus.ACTIVE.value and u.role == UserRole.ACCOUNTANT.value)
    active_checkers = sum(1 for u in all_users if u.status == UserStatus.ACTIVE.value and u.role in (UserRole.APPROVER.value, UserRole.ADMIN.value))

    return StaffListResponse(
        total=total,
        pending_count=pending_count,
        active_makers=active_makers,
        active_checkers=active_checkers,
        staff=[UserSessionDTO(**u.to_session_dict()) for u in users]
    )


@router.post("/register", response_model=UserSessionDTO, status_code=status.HTTP_201_CREATED, summary="Admin Direct Staff Registration & Provisioning")
def admin_register_staff(
    body: AdminRegisterStaffRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Administrator directly registers and provisions a new staff member account.
    Validates username and email uniqueness, hashes password, and persists active staff.
    """
    clean_username = body.username.strip().lower()
    clean_email = body.email.strip().lower()

    existing_user = db.scalars(
        select(User).where(
            or_(
                func.lower(User.username) == clean_username,
                func.lower(User.email) == clean_email
            )
        )
    ).first()

    if existing_user:
        if existing_user.username.lower() == clean_username:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Staff username '{body.username}' is already registered."
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Corporate email '{body.email}' is already in use."
        )

    target_role = body.role.strip().upper()
    if target_role not in (UserRole.ACCOUNTANT.value, UserRole.APPROVER.value, UserRole.ADMIN.value):
        target_role = UserRole.ACCOUNTANT.value

    target_status = body.status.strip().upper()
    if target_status not in (UserStatus.ACTIVE.value, UserStatus.PENDING_APPROVAL.value):
        target_status = UserStatus.ACTIVE.value

    pwd_hash, pwd_salt = hash_password(body.password)

    new_user = User(
        username=clean_username,
        email=clean_email,
        full_name=body.full_name.strip(),
        password_hash=pwd_hash,
        password_salt=pwd_salt,
        role=target_role,
        status=target_status,
        department=body.department.strip() or "Accounts Payable Operations",
        approved_at=datetime.now(timezone.utc) if target_status == UserStatus.ACTIVE.value else None,
        approved_by=admin.username if target_status == UserStatus.ACTIVE.value else None
    )

    db.add(new_user)
    db.flush()

    audit = AuditLog(
        entity_type="user",
        entity_id=new_user.id,
        actor=admin.username,
        action="STAFF_PROVISIONED_BY_ADMIN",
        changes_json=f'{{"created_username":"{new_user.username}","role":"{new_user.role}","status":"{new_user.status}","department":"{new_user.department}"}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)

    logger.info(f"Admin {admin.username} successfully provisioned new staff account {new_user.username} ({new_user.role})")
    return UserSessionDTO(**new_user.to_session_dict())


@router.post("/{user_id}/approve", response_model=UserSessionDTO, summary="Approve Pending Staff Member")
def approve_staff(
    user_id: str,
    body: StaffApprovalRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Administrator approves a pending staff registration:
    - Sets account status to ACTIVE.
    - Confirms or alters assigned role (Maker/Accountant vs Checker/Approver).
    - Records administrator attribution and timestamp.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found.")

    old_status = user.status
    old_role = user.role

    target_role = body.approved_role.strip().upper()
    if target_role not in (UserRole.ACCOUNTANT.value, UserRole.APPROVER.value, UserRole.ADMIN.value):
        target_role = UserRole.ACCOUNTANT.value

    user.status = UserStatus.ACTIVE.value
    user.role = target_role
    user.approved_at = datetime.now(timezone.utc)
    user.approved_by = admin.username
    if body.department:
        user.department = body.department.strip()

    # Audit Trail
    audit = AuditLog(
        entity_type="user",
        entity_id=user.id,
        actor=admin.username,
        action="STAFF_APPROVED",
        changes_json=f'{{"from_status":"{old_status}","to_status":"ACTIVE","role":"{target_role}","notes":"{body.notes or ""}"}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    logger.info(f"Staff member {user.username} approved by {admin.username} as {user.role}")
    return UserSessionDTO(**user.to_session_dict())


@router.post("/{user_id}/reject", response_model=UserSessionDTO, summary="Reject Staff Registration Application")
def reject_staff(
    user_id: str,
    reason: Optional[str] = Query(None, description="Optional rejection reason"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Administrator rejects a staff registration application, setting status to REJECTED.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found.")

    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reject your own account.")

    old_status = user.status
    user.status = UserStatus.REJECTED.value

    audit = AuditLog(
        entity_type="user",
        entity_id=user.id,
        actor=admin.username,
        action="STAFF_REJECTED",
        changes_json=f'{{"from_status":"{old_status}","to_status":"REJECTED","reason":"{reason or ""}"}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    logger.info(f"Staff registration {user.username} rejected by {admin.username}")
    return UserSessionDTO(**user.to_session_dict())


@router.patch("/{user_id}/role", response_model=UserSessionDTO, summary="Update Staff Role")
def update_staff_role(
    user_id: str,
    body: StaffRoleUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Modifies staff role between Maker (ACCOUNTANT), Checker (APPROVER), or ADMIN.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found.")

    new_role = body.role.strip().upper()
    if new_role not in (UserRole.ACCOUNTANT.value, UserRole.APPROVER.value, UserRole.ADMIN.value):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid role specified.")

    # Guard: Don't allow demoting the master admin if it's the caller
    if user.username == "admin" and new_role != UserRole.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify primary system administrator role.")

    old_role = user.role
    user.role = new_role

    audit = AuditLog(
        entity_type="user",
        entity_id=user.id,
        actor=admin.username,
        action="ROLE_UPDATED",
        changes_json=f'{{"old_role":"{old_role}","new_role":"{new_role}"}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    logger.info(f"User {user.username} role changed from {old_role} to {new_role} by {admin.username}")
    return UserSessionDTO(**user.to_session_dict())


@router.patch("/{user_id}/status", response_model=UserSessionDTO, summary="Update Staff Status (Suspend / Reactivate)")
def update_staff_status(
    user_id: str,
    body: StaffStatusUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Suspends or reactivates an existing staff account.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found.")

    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify status of your own currently active account.")

    target_status = body.status.strip().upper()
    if target_status not in (UserStatus.ACTIVE.value, UserStatus.SUSPENDED.value, UserStatus.REJECTED.value):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid status specified.")

    old_status = user.status
    user.status = target_status

    audit = AuditLog(
        entity_type="user",
        entity_id=user.id,
        actor=admin.username,
        action="STATUS_UPDATED",
        changes_json=f'{{"old_status":"{old_status}","new_status":"{target_status}","reason":"{body.reason or ""}"}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    logger.info(f"User {user.username} status changed from {old_status} to {target_status} by {admin.username}")
    return UserSessionDTO(**user.to_session_dict())


@router.delete("/{user_id}", summary="Delete Staff Account")
def delete_staff(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Deletes a staff account permanently from the directory.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found.")

    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own active administrator account.")
    if user.username == "admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete primary system administrator account.")

    audit = AuditLog(
        entity_type="user",
        entity_id=user.id,
        actor=admin.username,
        action="STAFF_DELETED",
        changes_json=f'{{"deleted_username":"{user.username}","deleted_email":"{user.email}"}}'
    )
    db.add(audit)
    db.delete(user)
    db.commit()

    logger.info(f"Staff member {user.username} permanently deleted by {admin.username}")
    return {"success": True, "message": f"Staff account '{user.username}' successfully deleted."}
