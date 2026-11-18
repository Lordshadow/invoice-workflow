"""
Core Ingestion Service.
Decoupled end-to-end processing pipeline for all ingestion channels:
- Direct Web / API Upload (source="upload")
- Automated Email IMAP Poller & Inbound Webhooks (source="email")
- Automated WhatsApp Headless Client & Webhooks (source="whatsapp")
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.models.document import Document
from backend.app.models.invoice import (
    AuditLog,
    ExtractionLog,
    Invoice,
    InvoiceApproval,
    InvoiceLineItem,
    InvoiceStatus,
    OutboxEvent,
    OutboxStatus,
    ValidationResult,
)
from backend.app.schemas.invoice_api import ProcessInvoiceResponse
from backend.app.services.deduplication_service import DeduplicationService, DuplicateType
from backend.app.services.delivery_worker import DeliveryWorker
from backend.app.services.document_processor import DocumentProcessor
from backend.app.services.escalation_service import EscalationService
from backend.app.services.extraction_service import ExtractionService
from backend.app.services.storage import get_storage_provider

logger = logging.getLogger("invoice_processor.services.ingestion")

extraction_service = ExtractionService()


class IngestionService:
    """
    Centralized, transactional processor for invoice documents ingested
    from any source channel.
    """

    @classmethod
    def ingest_invoice(
        cls,
        file_bytes: bytes,
        filename: str,
        source: str = "upload",
        db: Session = None,
        target_db: Session = None,
        enable_stp: Optional[bool] = None,
        source_metadata: Optional[Dict[str, Any]] = None,
    ) -> ProcessInvoiceResponse:
        """
        Executes end-to-end document intake, duplicate detection, AI extraction,
        deterministic validation, Maker-Checker escalation routing, and STP delivery.
        """
        if not filename:
            filename = f"invoice_{source}.pdf"

        if not file_bytes:
            raise ValueError("Provided file is empty (0 bytes).")

        if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
            max_mb = settings.MAX_FILE_SIZE_BYTES / (1024 * 1024)
            raise ValueError(f"File exceeds maximum allowed size of {max_mb:.1f} MB.")

        file_hash = DocumentProcessor.compute_sha256(file_bytes)

        # 1. Layer 1 Deduplication Check (Exact file hash match)
        is_dup_file, existing_doc = DeduplicationService.check_file_duplicate(file_hash, db)
        if is_dup_file and existing_doc:
            existing_inv = db.scalars(
                select(Invoice).where(Invoice.document_id == existing_doc.id).limit(1)
            ).first()

            val_errors = []
            if existing_inv and existing_inv.validation_errors:
                try:
                    val_errors = json.loads(existing_inv.validation_errors)
                except Exception:
                    val_errors = [existing_inv.validation_errors]

            audit_entry = AuditLog(
                entity_type="document",
                entity_id=existing_doc.id,
                actor=f"{source}_intake",
                action="LAYER1_DUPLICATE_FILE_DETECTED",
                changes_json=json.dumps({
                    "file_name": filename,
                    "file_hash": file_hash,
                    "source": source,
                    "metadata": source_metadata or {},
                    "existing_invoice_id": existing_inv.id if existing_inv else None,
                }),
            )
            db.add(audit_entry)
            db.commit()

            return ProcessInvoiceResponse(
                success=True,
                document_id=existing_doc.id,
                invoice_id=existing_inv.id if existing_inv else None,
                file_name=existing_doc.file_name,
                file_hash=file_hash,
                status=existing_inv.status if existing_inv else InvoiceStatus.RECEIVED,
                duplicate_type=DuplicateType.EXACT_FILE_DUPLICATE.value,
                duplicate_of_id=existing_inv.id if existing_inv else existing_doc.id,
                validation_passed=existing_inv.is_valid if existing_inv else True,
                validation_errors=val_errors,
                grand_total=existing_inv.grand_total if existing_inv else 0.0,
                currency=existing_inv.currency if existing_inv else "INR",
                is_escalated=existing_inv.is_escalated if existing_inv else False,
                escalation_reason=existing_inv.escalation_reason if existing_inv else None,
                escalation_category=existing_inv.escalation_category if existing_inv else None,
                delivered_to_target=(existing_inv.status == InvoiceStatus.DELIVERED) if existing_inv else False,
                message=f"Duplicate file detected: Document already exists as ID {existing_doc.id}.",
            )

        # 2. Persist File via Storage Abstraction Layer
        clean_filename = Path(filename).name
        storage = get_storage_provider()
        storage_key = f"{file_hash[:16]}_{clean_filename}"
        mime_type = DocumentProcessor.detect_mime_type(clean_filename, file_bytes)
        stored_path = storage.upload(storage_key, file_bytes, content_type=mime_type)

        # 3. Create Document Record
        doc = Document(
            source=source,
            file_name=clean_filename,
            file_path=stored_path,
            file_hash=file_hash,
            file_size_bytes=len(file_bytes),
            mime_type=mime_type,
        )
        db.add(doc)
        db.flush()

        # 4. Decoupled Extraction & Optical Validation Pipeline
        ext_res = extraction_service.process_and_extract(clean_filename, file_bytes)
        inv_model = ext_res.invoice

        supplier_name = (
            inv_model.supplier.name.strip()
            if (inv_model and inv_model.supplier and inv_model.supplier.name)
            else "Unknown Supplier"
        )
        supplier_gstin = (
            inv_model.supplier.gstin.strip().upper()
            if (inv_model and inv_model.supplier and inv_model.supplier.gstin)
            else None
        )
        inv_number = (
            inv_model.metadata.invoice_number.strip()
            if (inv_model and inv_model.metadata and inv_model.metadata.invoice_number)
            else None
        )

        # 5. Layer 2 Business Identity Deduplication Check
        dup_type, existing_business_dup = DeduplicationService.check_business_duplicate(
            supplier_gstin=supplier_gstin,
            invoice_number=inv_number,
            current_invoice_id=None,
            db=db,
            supplier_name=supplier_name,
            invoice_date=inv_model.metadata.invoice_date if (inv_model and inv_model.metadata) else None,
            grand_total=inv_model.grand_total if inv_model else None,
        )

        # 6. Straight-Through Processing (STP) vs Human Review Routing
        stp_active = enable_stp if enable_stp is not None else settings.STP_DEFAULT_ENABLED
        decision = EscalationService.evaluate(
            invoice_model=inv_model,
            ext_res=ext_res,
            dup_type=dup_type,
            enable_stp=stp_active,
        )
        initial_status = decision.target_status

        # 7. ACID Persist Invoice
        db_invoice = Invoice(
            document_id=doc.id,
            status=initial_status,
            supplier_name=supplier_name,
            supplier_gstin=supplier_gstin,
            supplier_address=inv_model.supplier.address if (inv_model and inv_model.supplier) else None,
            buyer_name=inv_model.buyer.name if (inv_model and inv_model.buyer) else None,
            buyer_gstin=inv_model.buyer.gstin if (inv_model and inv_model.buyer) else None,
            buyer_address=inv_model.buyer.address if (inv_model and inv_model.buyer) else None,
            invoice_number=inv_number,
            invoice_date=inv_model.metadata.invoice_date if (inv_model and inv_model.metadata) else None,
            due_date=inv_model.metadata.due_date if (inv_model and inv_model.metadata) else None,
            currency=(inv_model.metadata.currency if (inv_model and inv_model.metadata) else None) or "INR",
            place_of_supply=inv_model.metadata.place_of_supply if (inv_model and inv_model.metadata) else None,
            subtotal=inv_model.subtotal if inv_model else 0.0,
            cgst=inv_model.tax.cgst if (inv_model and inv_model.tax) else 0.0,
            sgst=inv_model.tax.sgst if (inv_model and inv_model.tax) else 0.0,
            igst=inv_model.tax.igst if (inv_model and inv_model.tax) else 0.0,
            cess=inv_model.tax.cess if (inv_model and inv_model.tax) else 0.0,
            round_off=inv_model.round_off if inv_model else 0.0,
            grand_total=inv_model.grand_total if inv_model else 0.0,
            confidence_score=inv_model.confidence_score if inv_model else 0.0,
            is_valid=ext_res.validation_passed,
            validation_errors=json.dumps(ext_res.validation_errors),
            extraction_notes=inv_model.extraction_notes if inv_model else None,
            is_escalated=decision.is_escalated,
            escalation_reason=decision.escalation_reason,
            escalation_category=decision.escalation_category,
            duplicate_of_id=existing_business_dup.id if existing_business_dup else None,
            version=1,
        )
        db.add(db_invoice)
        db.flush()

        # Line items
        if inv_model and inv_model.line_items:
            for item in inv_model.line_items:
                db_item = InvoiceLineItem(
                    invoice_id=db_invoice.id,
                    description=item.description,
                    hsn_code=item.hsn_code,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    discount=item.discount,
                    tax_rate=item.tax_rate,
                    cgst_amount=item.cgst_amount,
                    sgst_amount=item.sgst_amount,
                    igst_amount=item.igst_amount,
                    total_amount=item.total_amount,
                )
                db.add(db_item)

        # Extraction log
        ext_log = ExtractionLog(
            invoice_id=db_invoice.id,
            provider=ext_res.provider,
            model_name=ext_res.model_name,
            latency_ms=ext_res.latency_ms,
            raw_payload=json.dumps(ext_res.raw_response or {}),
            normalized_payload=json.dumps(inv_model.model_dump() if inv_model else {}),
        )
        db.add(ext_log)

        # Relational Validation results
        if ext_res.validation_passed:
            db.add(
                ValidationResult(
                    invoice_id=db_invoice.id,
                    rule_name="DETERMINISTIC_RULES_PASS",
                    status="PASS",
                    error_details=None,
                )
            )
        else:
            for err in ext_res.validation_errors:
                rule_name = err.split(":")[0].strip() if ":" in err else "GENERAL_VALIDATION_ERROR"
                db.add(
                    ValidationResult(
                        invoice_id=db_invoice.id,
                        rule_name=rule_name,
                        status="FAIL",
                        error_details=err,
                    )
                )

        # STP Approval and Outbox entry
        if decision.is_stp_eligible and initial_status == InvoiceStatus.APPROVED:
            db.add(
                InvoiceApproval(
                    invoice_id=db_invoice.id,
                    user_id=f"system_stp_{source}",
                    action="APPROVE",
                    notes=f"Autonomous Straight-Through Processing (STP) via {source} intake",
                    snapshot_version=db_invoice.version,
                )
            )
            db.add(
                OutboxEvent(
                    aggregate_type="invoice",
                    aggregate_id=db_invoice.id,
                    event_type="INVOICE_APPROVED",
                    payload=json.dumps({
                        "invoice_id": db_invoice.id,
                        "invoice_number": db_invoice.invoice_number,
                        "supplier_gstin": db_invoice.supplier_gstin,
                        "supplier_name": db_invoice.supplier_name,
                        "grand_total": db_invoice.grand_total,
                        "currency": db_invoice.currency,
                        "actor": f"system_stp_{source}",
                    }),
                    status=OutboxStatus.PENDING,
                )
            )

        # Audit entry
        audit = AuditLog(
            entity_type="invoice",
            entity_id=db_invoice.id,
            actor=f"system_{source}",
            action="STP_AUTO_APPROVED"
            if decision.is_stp_eligible
            else ("INVOICE_ESCALATED" if decision.is_escalated else "INVOICE_INGESTED"),
            changes_json=json.dumps({
                "source": source,
                "metadata": source_metadata or {},
                "status": initial_status.value,
                "provider": ext_res.provider,
                "validation_passed": ext_res.validation_passed,
                "duplicate_type": dup_type.value,
                "is_escalated": decision.is_escalated,
                "escalation_reason": decision.escalation_reason,
                "escalation_category": decision.escalation_category,
                "is_stp_eligible": decision.is_stp_eligible,
            }),
        )
        db.add(audit)
        db.commit()

        # 8. Automated Straight-Through Delivery if STP Qualified
        delivered_to_target = False
        if decision.is_stp_eligible and initial_status == InvoiceStatus.APPROVED and target_db:
            try:
                DeliveryWorker.deliver_invoice(db_invoice.id, db, target_db)
                db.refresh(db_invoice)
                delivered_to_target = (db_invoice.status == InvoiceStatus.DELIVERED)
                audit_stp = AuditLog(
                    entity_type="invoice",
                    entity_id=db_invoice.id,
                    actor=f"system_stp_{source}",
                    action="STP_AUTO_DELIVERED",
                    changes_json=json.dumps({
                        "source": source,
                        "grand_total": db_invoice.grand_total,
                        "target_status": db_invoice.status.value,
                        "delivered": delivered_to_target,
                    }),
                )
                db.add(audit_stp)
                db.commit()
            except Exception as stp_err:
                logger.error(f"STP auto-delivery failed for invoice {db_invoice.id}: {stp_err}")

        msg = (
            f"Invoice qualified for Straight-Through Processing (STP) and was delivered to Target DB (ID: {db_invoice.id})."
            if delivered_to_target
            else (
                f"Invoice escalated for Human-in-the-Loop review: {db_invoice.escalation_reason}"
                if db_invoice.is_escalated
                else f"Invoice successfully ingested from {source} and processed into state '{db_invoice.status.value}'."
            )
        )

        return ProcessInvoiceResponse(
            success=True,
            document_id=doc.id,
            invoice_id=db_invoice.id,
            file_name=doc.file_name,
            file_hash=file_hash,
            status=db_invoice.status,
            duplicate_type=dup_type.value,
            duplicate_of_id=existing_business_dup.id if existing_business_dup else None,
            validation_passed=ext_res.validation_passed,
            validation_errors=ext_res.validation_errors,
            grand_total=db_invoice.grand_total,
            currency=db_invoice.currency,
            is_escalated=db_invoice.is_escalated,
            escalation_reason=db_invoice.escalation_reason,
            escalation_category=db_invoice.escalation_category,
            delivered_to_target=delivered_to_target,
            message=msg,
        )
