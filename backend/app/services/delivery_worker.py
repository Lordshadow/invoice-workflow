"""
Transactional Delivery Worker & Target/Dummy DB Egress Service.
Ensures absolute delivery idempotency and transactional outbox processing.
"""
import json
import logging
from typing import Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.invoice import (
    Invoice,
    InvoiceStatus,
    OutboxEvent,
    OutboxStatus,
)
from backend.app.models.target_company import (
    CompanyInvoice,
    CompanyInvoiceLine,
)
from backend.app.services.invoice_state_machine import InvoiceStateMachine

logger = logging.getLogger("invoice_processor.delivery")


class DeliveryWorker:
    """
    Delivers approved invoices to the Target Company / ERP database.
    Guarantees ACID transaction semantics and idempotent posting.
    """

    @classmethod
    def deliver_invoice(
        cls,
        invoice_id: str,
        primary_db: Session,
        target_db: Session,
        actor: str = "delivery_worker",
    ) -> Tuple[bool, Optional[str], Optional[CompanyInvoice]]:
        """
        Idempotently posts an APPROVED invoice into the Target Company DB:
        1. Checks if (supplier_gstin, invoice_number) already exists in target DB.
        2. If not, writes CompanyInvoice and CompanyInvoiceLines atomically.
        3. Updates primary DB invoice status to DELIVERED and OutboxEvent to PUBLISHED.
        """
        invoice = primary_db.get(Invoice, invoice_id)
        if not invoice:
            return False, f"Invoice {invoice_id} not found in primary database.", None

        if invoice.status not in (InvoiceStatus.APPROVED, InvoiceStatus.DELIVERED):
            return False, f"Cannot deliver invoice with status '{invoice.status.value}'. Must be 'APPROVED' or 'DELIVERED'.", None

        # 1. Target DB Idempotency Check
        # First check by exact internal pipeline reference ID
        ref_stmt = select(CompanyInvoice).where(CompanyInvoice.ext_reference_id == invoice.id).limit(1)
        existing_target = target_db.scalars(ref_stmt).first()

        # If not found by reference ID, check by business key (supplier_gstin + invoice_number)
        norm_gstin = (invoice.supplier_gstin or "").strip().upper()
        if not existing_target and invoice.invoice_number and invoice.invoice_number.strip().upper() != "UNKNOWN":
            num_match = invoice.invoice_number.strip()
            if norm_gstin == "":
                biz_stmt = select(CompanyInvoice).where(
                    CompanyInvoice.invoice_number == num_match,
                    (CompanyInvoice.supplier_gstin == "") | (CompanyInvoice.supplier_gstin.is_(None))
                )
            else:
                biz_stmt = select(CompanyInvoice).where(
                    CompanyInvoice.invoice_number == num_match,
                    CompanyInvoice.supplier_gstin == norm_gstin
                )
            existing_target = target_db.scalars(biz_stmt.limit(1)).first()

        if existing_target:
            logger.info(
                f"Idempotent delivery check: Invoice {invoice.invoice_number} (Supplier: {invoice.supplier_gstin}) "
                f"already posted in Target DB as ID {existing_target.id}."
            )
            # Reconcile status in primary DB if not already DELIVERED
            if invoice.status != InvoiceStatus.DELIVERED:
                InvoiceStateMachine.transition(
                    invoice=invoice,
                    target_status=InvoiceStatus.DELIVERED,
                    actor=actor,
                    reason="Reconciled with existing Target DB record (idempotent)",
                    db=primary_db
                )

            # Mark any pending approval outbox events as published
            outbox_stmt = (
                select(OutboxEvent)
                .where(
                    OutboxEvent.aggregate_id == invoice.id,
                    OutboxEvent.event_type == "INVOICE_APPROVED",
                    OutboxEvent.status == OutboxStatus.PENDING,
                )
            )
            for pending_outbox in primary_db.scalars(outbox_stmt).all():
                pending_outbox.status = OutboxStatus.PUBLISHED

            primary_db.commit()
            return True, "Already delivered (idempotent match)", existing_target

        try:
            # 2. Write to Target DB in ACID transaction
            comp_invoice_num = (
                invoice.invoice_number.strip()
                if (invoice.invoice_number and invoice.invoice_number.strip().upper() != "UNKNOWN")
                else f"UNKNOWN-{invoice.id[:8]}"
            )
            comp_inv = CompanyInvoice(
                ext_reference_id=invoice.id,
                supplier_gstin=norm_gstin,
                supplier_name=invoice.supplier_name or "Unknown Supplier",
                invoice_number=comp_invoice_num,
                invoice_date=invoice.invoice_date,
                currency=invoice.currency,
                subtotal=invoice.subtotal,
                tax_amount=round(invoice.cgst + invoice.sgst + invoice.igst + invoice.cess, 2),
                grand_total=invoice.grand_total,
            )
            target_db.add(comp_inv)
            target_db.flush()  # Populates comp_inv.id

            for item in invoice.line_items:
                line = CompanyInvoiceLine(
                    company_invoice_id=comp_inv.id,
                    item_description=item.description,
                    hsn_code=item.hsn_code,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.total_amount,
                )
                target_db.add(line)

            target_db.commit()
            logger.info(f"Successfully posted invoice {invoice.invoice_number} to Target DB (ID: {comp_inv.id})")

            # 3. Transition Primary DB State and resolve Outbox Event
            if invoice.status != InvoiceStatus.DELIVERED:
                InvoiceStateMachine.transition(
                    invoice=invoice,
                    target_status=InvoiceStatus.DELIVERED,
                    actor=actor,
                    reason=f"Delivered to Target DB record {comp_inv.id}",
                    db=primary_db
                )

            # Mark outbox event as published
            outbox_stmt = (
                select(OutboxEvent)
                .where(
                    OutboxEvent.aggregate_id == invoice.id,
                    OutboxEvent.event_type == "INVOICE_APPROVED",
                    OutboxEvent.status == OutboxStatus.PENDING,
                )
            )
            for pending_outbox in primary_db.scalars(outbox_stmt).all():
                pending_outbox.status = OutboxStatus.PUBLISHED

            primary_db.commit()
            return True, "Delivered successfully", comp_inv

        except Exception as exc:
            try:
                target_db.rollback()
            except Exception:
                pass
            logger.error(f"Failed to deliver invoice {invoice.id} to Target DB: {exc}", exc_info=True)
            return False, str(exc), None

    @classmethod
    def process_pending_outbox(
        cls,
        primary_db: Session,
        target_db: Session,
        batch_size: int = 20,
    ) -> int:
        """
        Polls pending outbox events and delivers associated approved invoices.
        Supports SKIP LOCKED on PostgreSQL and resilient retry updates.
        Returns the count of successfully delivered events.
        """
        from backend.app.db.session import is_sqlite_primary

        stmt = (
            select(OutboxEvent)
            .where(
                OutboxEvent.status == OutboxStatus.PENDING,
                OutboxEvent.event_type == "INVOICE_APPROVED",
            )
            .order_by(OutboxEvent.created_at)
            .limit(batch_size)
        )
        if not is_sqlite_primary:
            stmt = stmt.with_for_update(skip_locked=True)

        events = primary_db.scalars(stmt).all()
        delivered_count = 0

        for evt in events:
            evt_id = evt.id
            try:
                payload = json.loads(evt.payload)
                inv_id = payload.get("invoice_id")
                if not inv_id:
                    current_evt = primary_db.get(OutboxEvent, evt_id)
                    if current_evt:
                        current_evt.retry_count += 1
                        current_evt.error_message = "Missing invoice_id in outbox payload"
                        if current_evt.retry_count >= 5:
                            current_evt.status = OutboxStatus.FAILED
                        primary_db.commit()
                    continue

                ok, msg, _ = cls.deliver_invoice(inv_id, primary_db, target_db)
                if ok:
                    delivered_count += 1
                else:
                    current_evt = primary_db.get(OutboxEvent, evt_id)
                    if current_evt:
                        current_evt.retry_count += 1
                        current_evt.error_message = msg
                        if current_evt.retry_count >= 5:
                            current_evt.status = OutboxStatus.FAILED
                        primary_db.commit()
            except Exception as e:
                current_evt = primary_db.get(OutboxEvent, evt_id)
                if current_evt:
                    current_evt.retry_count += 1
                    current_evt.error_message = str(e)
                    if current_evt.retry_count >= 5:
                        current_evt.status = OutboxStatus.FAILED
                    primary_db.commit()

        return delivered_count

    @classmethod
    async def run_outbox_publisher_loop(cls, interval_seconds: float = 3.0):
        """Asynchronous background outbox event processing loop."""
        import asyncio
        from backend.app.db.session import SessionLocal, TargetSessionLocal
        logger.info("Outbox publisher background worker started.")
        while True:
            try:
                with SessionLocal() as primary_db, TargetSessionLocal() as target_db:
                    delivered = cls.process_pending_outbox(primary_db, target_db, batch_size=20)
                    if delivered > 0:
                        logger.debug(f"Outbox worker delivered {delivered} event(s).")
            except Exception as e:
                logger.error(f"Error in outbox worker loop: {e}", exc_info=False)
            await asyncio.sleep(interval_seconds)
