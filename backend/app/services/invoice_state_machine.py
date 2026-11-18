"""
Invoice State Machine Service.
Enforces strict lifecycle state transitions, guard conditions, optimistic locking, and audit logging.
"""
import json
import logging
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from backend.app.models.invoice import (
    AuditLog,
    Invoice,
    InvoiceStatus,
    OutboxEvent,
    OutboxStatus,
)

logger = logging.getLogger("invoice_processor.state_machine")


class InvalidStateTransitionError(ValueError):
    """Raised when an illegal lifecycle transition is attempted."""
    pass


class ConcurrencyConflictError(ValueError):
    """Raised when optimistic concurrency check fails (version mismatch)."""
    pass


class InvoiceStateMachine:
    """
    Coordinates state transitions for Invoice entities.
    Enforces ACID atomicity, audit logging, and outbox event creation.
    """

    ALLOWED_TRANSITIONS: Dict[InvoiceStatus, List[InvoiceStatus]] = {
        InvoiceStatus.RECEIVED: [
            InvoiceStatus.PREPROCESSING,
            InvoiceStatus.DUPLICATE_INVESTIGATION,
            InvoiceStatus.REJECTED,
        ],
        InvoiceStatus.PREPROCESSING: [
            InvoiceStatus.EXTRACTED,
            InvoiceStatus.PENDING_CORRECTION,
            InvoiceStatus.REJECTED,
        ],
        InvoiceStatus.EXTRACTED: [
            InvoiceStatus.VALIDATED,
            InvoiceStatus.PENDING_CORRECTION,
            InvoiceStatus.REJECTED,
        ],
        InvoiceStatus.VALIDATED: [
            InvoiceStatus.PENDING_APPROVAL,
            InvoiceStatus.APPROVED,  # Allowed for straight-through processing (STP)
            InvoiceStatus.PENDING_CORRECTION,
            InvoiceStatus.DUPLICATE_INVESTIGATION,
            InvoiceStatus.REJECTED,
        ],
        InvoiceStatus.PENDING_APPROVAL: [
            InvoiceStatus.APPROVED,
            InvoiceStatus.REJECTED,
            InvoiceStatus.PENDING_CORRECTION,
        ],
        InvoiceStatus.PENDING_CORRECTION: [
            InvoiceStatus.VALIDATED,
            InvoiceStatus.PENDING_APPROVAL,
            InvoiceStatus.REJECTED,
        ],
        InvoiceStatus.DUPLICATE_INVESTIGATION: [
            InvoiceStatus.PENDING_APPROVAL,
            InvoiceStatus.PENDING_CORRECTION,
            InvoiceStatus.REJECTED,
        ],
        InvoiceStatus.APPROVED: [
            InvoiceStatus.DELIVERED,
            InvoiceStatus.REJECTED,
        ],
        InvoiceStatus.REJECTED: [],  # Terminal
        InvoiceStatus.DELIVERED: [],  # Terminal
    }

    @classmethod
    def can_transition(cls, current_status: InvoiceStatus, target_status: InvoiceStatus) -> bool:
        """Checks if a transition from current_status to target_status is permissible."""
        return target_status in cls.ALLOWED_TRANSITIONS.get(current_status, [])

    @classmethod
    def transition(
        cls,
        invoice: Invoice,
        target_status: InvoiceStatus,
        actor: str = "system",
        reason: Optional[str] = None,
        expected_version: Optional[int] = None,
        db: Optional[Session] = None,
    ) -> Invoice:
        """
        Executes a state transition inside an explicit ACID transaction:
        - Validates state machine rules.
        - Checks OCC versioning if expected_version is provided.
        - Records an immutable AuditLog entry.
        - Emits an OutboxEvent if transitioned to APPROVED or DELIVERED.
        - Increments the version counter.
        """
        current_status = invoice.status

        # 1. Check Optimistic Concurrency Control
        if expected_version is not None:
            try:
                exp_v_int = int(expected_version)
            except (ValueError, TypeError):
                exp_v_int = expected_version
            if invoice.version != exp_v_int:
                raise ConcurrencyConflictError(
                    f"Version conflict for invoice {invoice.id}: expected {expected_version}, got {invoice.version}"
                )

        # 2. Check Allowed Transitions
        if not cls.can_transition(current_status, target_status):
            allowed = [s.value for s in cls.ALLOWED_TRANSITIONS.get(current_status, [])]
            raise InvalidStateTransitionError(
                f"Cannot transition invoice {invoice.id} from '{current_status.value}' to '{target_status.value}'. "
                f"Allowed target states: {allowed}"
            )

        logger.info(
            f"Transitioning invoice {invoice.id} from {current_status.value} -> {target_status.value} (actor={actor})"
        )

        old_status_val = current_status.value
        invoice.status = target_status
        invoice.version += 1

        if db is not None:
            # 3. Create Audit Log
            audit_changes = {
                "old_status": old_status_val,
                "new_status": target_status.value,
                "reason": reason,
                "version": invoice.version,
            }
            audit_entry = AuditLog(
                entity_type="invoice",
                entity_id=invoice.id,
                actor=actor,
                action=f"TRANSITION_{target_status.value}",
                changes_json=json.dumps(audit_changes),
            )
            db.add(audit_entry)

            # 4. Outbox Event generation on actionable milestones
            if target_status == InvoiceStatus.APPROVED:
                outbox_evt = OutboxEvent(
                    aggregate_type="invoice",
                    aggregate_id=invoice.id,
                    event_type="INVOICE_APPROVED",
                    payload=json.dumps({
                        "invoice_id": invoice.id,
                        "invoice_number": invoice.invoice_number,
                        "supplier_gstin": invoice.supplier_gstin,
                        "supplier_name": invoice.supplier_name,
                        "grand_total": invoice.grand_total,
                        "currency": invoice.currency,
                        "actor": actor,
                    }),
                    status=OutboxStatus.PENDING,
                )
                db.add(outbox_evt)

        return invoice
