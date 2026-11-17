"""
Escalation and Straight-Through Processing (STP) Service.
Enforces intelligent routing:
- Clean, mathematically verified invoices with high confidence straight-through process (STP).
- Invoices with validation errors, duplicates, low confidence, or policy thresholds are escalated
  to the Human-in-the-Loop (HITL) review queue with clear categorization and audit logging.
"""
import enum
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.models.invoice import AuditLog, Invoice, InvoiceStatus
from backend.app.schemas.invoice import CanonicalInvoice, ExtractionResponse
from backend.app.services.deduplication_service import DuplicateType

logger = logging.getLogger("invoice_processor.escalation_service")


class EscalationCategory(str, enum.Enum):
    MATH_MISMATCH = "MATH_MISMATCH"
    DUPLICATE_SUSPECTED = "DUPLICATE_SUSPECTED"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    MISSING_FIELDS = "MISSING_FIELDS"
    HIGH_VALUE_AUDIT = "HIGH_VALUE_AUDIT"
    MANUAL_ESCALATION = "MANUAL_ESCALATION"


@dataclass
class EscalationDecision:
    is_escalated: bool
    is_stp_eligible: bool
    escalation_category: Optional[str] = None
    escalation_reason: Optional[str] = None
    target_status: InvoiceStatus = InvoiceStatus.PENDING_APPROVAL
    audit_metadata: Dict[str, Any] = field(default_factory=dict)


class EscalationService:
    """
    Evaluates extracted invoice data and determines whether it can proceed via
    Straight-Through Processing (STP) or must be escalated for Human-in-the-Loop review.
    """

    GENERIC_SUPPLIERS = {
        "UNKNOWN", "UNKNOWNSUPPLIER", "UNKNOWN SUPPLIER",
        "NA", "NOT AVAILABLE", "NOTAVAILABLE", "NONE",
        "CUSTOMER", "BUYER", "VENDOR"
    }

    @classmethod
    def evaluate(
        cls,
        invoice_model: Optional[CanonicalInvoice],
        ext_res: ExtractionResponse,
        dup_type: DuplicateType = DuplicateType.NONE,
        enable_stp: bool = False,
        min_confidence: Optional[float] = None,
        max_amount: Optional[float] = None,
    ) -> EscalationDecision:
        """
        Evaluates an invoice against STP criteria and escalation rules.
        Returns an EscalationDecision indicating eligibility, status, and reason.
        """
        logger.debug(
            f"Evaluating invoice for STP/Escalation. dup_type={dup_type.value}, "
            f"validation_passed={ext_res.validation_passed}, enable_stp={enable_stp}"
        )

        # Rule 1: Suspected or Confirmed Duplicates
        if dup_type != DuplicateType.NONE:
            reason = f"Duplicate suspected: {dup_type.value}"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.DUPLICATE_SUSPECTED.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.DUPLICATE_INVESTIGATION,
                audit_metadata={"duplicate_type": dup_type.value}
            )

        # Rule 2: Validation & Arithmetic Failures
        if not ext_res.validation_passed or ext_res.validation_errors:
            err_summary = "; ".join(ext_res.validation_errors[:2]) if ext_res.validation_errors else "Validation failed"
            reason = f"Arithmetic or tax mismatch: {err_summary}"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.MATH_MISMATCH.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_CORRECTION,
                audit_metadata={"validation_errors": ext_res.validation_errors}
            )

        # Rule 3: Mandatory Header Fields & Non-Empty Line Items
        if not invoice_model:
            reason = "Extraction yielded null invoice model"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.MISSING_FIELDS.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_CORRECTION
            )

        inv_num = (invoice_model.metadata.invoice_number or "").strip() if invoice_model.metadata else ""
        if not inv_num or inv_num.upper() in ("UNKNOWN", "NONE", "NA"):
            reason = "Missing or unextracted invoice number"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.MISSING_FIELDS.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_CORRECTION
            )

        supplier_name = (invoice_model.supplier.name or "").strip() if invoice_model.supplier else ""
        cleaned_supp = supplier_name.upper().replace(" ", "").replace("_", "")
        if not supplier_name or cleaned_supp in cls.GENERIC_SUPPLIERS:
            reason = "Missing or generic supplier name"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.MISSING_FIELDS.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_CORRECTION
            )

        grand_total = float(invoice_model.grand_total or 0.0)
        if grand_total <= 0.0:
            reason = f"Invalid non-positive grand total (₹{grand_total})"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.MISSING_FIELDS.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_CORRECTION
            )

        if not invoice_model.line_items or len(invoice_model.line_items) == 0:
            reason = "Invoice has zero extracted line items"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.MISSING_FIELDS.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_CORRECTION
            )

        # Rule 4: Extraction Confidence Score Threshold
        confidence = float(invoice_model.confidence_score or 0.0)
        threshold_conf = min_confidence if min_confidence is not None else settings.STP_MIN_CONFIDENCE_THRESHOLD
        if confidence < threshold_conf:
            reason = f"Extraction confidence {confidence:.2f} is below STP threshold {threshold_conf:.2f}"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.LOW_CONFIDENCE.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_APPROVAL,
                audit_metadata={"confidence": confidence, "threshold": threshold_conf}
            )

        # Rule 5: Financial Threshold / High Value Audit Mandate
        threshold_limit = max_amount if max_amount is not None else settings.STP_MAX_AMOUNT_LIMIT
        if grand_total > threshold_limit:
            reason = f"Grand total ₹{grand_total:,.2f} exceeds STP limit of ₹{threshold_limit:,.2f}; human authorization required"
            logger.info(f"Escalation triggered: {reason}")
            return EscalationDecision(
                is_escalated=True,
                is_stp_eligible=False,
                escalation_category=EscalationCategory.HIGH_VALUE_AUDIT.value,
                escalation_reason=reason,
                target_status=InvoiceStatus.PENDING_APPROVAL,
                audit_metadata={"grand_total": grand_total, "threshold_limit": threshold_limit}
            )

        # Rule 6: Straight-Through Processing (STP) Qualified
        if enable_stp:
            logger.info(f"Invoice qualifies for Straight-Through Processing (STP). Total: ₹{grand_total}")
            return EscalationDecision(
                is_escalated=False,
                is_stp_eligible=True,
                escalation_category=None,
                escalation_reason=None,
                target_status=InvoiceStatus.APPROVED,
                audit_metadata={
                    "stp_applied": True,
                    "confidence": confidence,
                    "grand_total": grand_total,
                }
            )
        else:
            logger.debug("Invoice is clean but STP is disabled. Routing to PENDING_APPROVAL for human review.")
            return EscalationDecision(
                is_escalated=False,
                is_stp_eligible=False,
                escalation_category=None,
                escalation_reason=None,
                target_status=InvoiceStatus.PENDING_APPROVAL,
                audit_metadata={"stp_applied": False, "reason": "STP disabled"}
            )

    @classmethod
    def manual_escalate(
        cls,
        invoice: Invoice,
        actor: str,
        reason: str,
        category: str = EscalationCategory.MANUAL_ESCALATION.value,
        db: Optional[Session] = None,
    ) -> Invoice:
        """Manually escalates an invoice for human supervisor attention."""
        invoice.is_escalated = True
        invoice.escalation_reason = reason.strip()
        invoice.escalation_category = category

        if db:
            audit = AuditLog(
                entity_type="invoice",
                entity_id=invoice.id,
                actor=actor,
                action="MANUAL_ESCALATION",
                changes_json=json.dumps({"reason": invoice.escalation_reason, "category": invoice.escalation_category})
            )
            db.add(audit)
            db.flush()

        logger.info(f"Invoice {invoice.id} manually escalated by {actor}: {reason}")
        return invoice

    @classmethod
    def resolve_escalation(
        cls,
        invoice: Invoice,
        actor: str,
        notes: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Invoice:
        """Resolves an escalation on an invoice."""
        prev_reason = invoice.escalation_reason
        prev_category = invoice.escalation_category

        invoice.is_escalated = False
        invoice.escalation_reason = None
        invoice.escalation_category = None

        if db:
            audit = AuditLog(
                entity_type="invoice",
                entity_id=invoice.id,
                actor=actor,
                action="ESCALATION_RESOLVED",
                changes_json=json.dumps({
                    "notes": notes,
                    "resolved_reason": prev_reason,
                    "resolved_category": prev_category
                })
            )
            db.add(audit)
            db.flush()

        logger.info(f"Escalation resolved for invoice {invoice.id} by {actor}")
        return invoice
