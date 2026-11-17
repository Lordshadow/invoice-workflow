"""
FastAPI Router for Invoice Lifecycle Management, Approval, and Target Delivery.
Enforces ACID database transactions, maker-checker governance, OCC, and two-tier deduplication.
"""
import json
import logging
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload, selectinload

from backend.app.config import settings
from backend.app.db.session import get_db, get_target_db
from backend.app.models.document import Document
from backend.app.models.invoice import (
    AuditLog,
    ExtractionLog,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
)
from backend.app.models.target_company import CompanyInvoice
from backend.app.schemas.invoice_api import (
    AuditLogDTO,
    CompanyInvoiceDTO,
    ExtractionLogDTO,
    InvoiceApprovalRequest,
    InvoiceDetailDTO,
    InvoiceRejectionRequest,
    InvoiceSummaryDTO,
    InvoiceUpdateRequest,
    LineItemDTO,
    ProcessInvoiceResponse,
)
from backend.app.schemas.invoice import (
    BuyerDetails,
    CanonicalInvoice,
    InvoiceMetadata,
    LineItem,
    SupplierDetails,
    TaxBreakdown,
)
from backend.app.services.invoice_validator import InvoiceValidator
from backend.app.services.deduplication_service import (
    DeduplicationService,
    DuplicateType,
)
from backend.app.services.delivery_worker import DeliveryWorker
from backend.app.services.document_processor import DocumentProcessor
from backend.app.services.extraction_service import ExtractionService
from backend.app.services.invoice_state_machine import (
    ConcurrencyConflictError,
    InvalidStateTransitionError,
    InvoiceStateMachine,
)

logger = logging.getLogger("invoice_processor.router.invoices")

router = APIRouter(prefix="/invoices", tags=["Invoice Workflow & Lifecycle"])
extraction_service = ExtractionService()


@router.post(
    "/process",
    response_model=ProcessInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="End-to-End Invoice Processing & Ingestion Pipeline"
)
async def process_invoice(
    file: UploadFile = File(..., description="Invoice file (PDF, JPEG, PNG, WEBP, DOCX)"),
    source: str = Form(default="upload", description="Intake source (upload, whatsapp, email)"),
    db: Session = Depends(get_db),
):
    """
    Full lifecycle processing:
    1. Reads bytes & computes SHA-256 hash.
    2. Layer 1 Deduplication (Exact file check).
    3. Document intake and storage registration.
    4. AI / OCR Extraction & Centralized Validation.
    5. Layer 2 Deduplication (Business identity: Supplier GSTIN + Invoice Number).
    6. ACID transaction saving Document, Invoice, Line Items, Extraction Log, and Audit Trail.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must have a valid filename.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty (0 bytes).")

    if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_BYTES / (1024 * 1024):.1f} MB."
        )

    file_hash = DocumentProcessor.compute_sha256(file_bytes)

    # 1. Layer 1 Deduplication Check
    is_dup_file, existing_doc = DeduplicationService.check_file_duplicate(file_hash, db)
    if is_dup_file and existing_doc:
        existing_inv = db.scalars(select(Invoice).where(Invoice.document_id == existing_doc.id).limit(1)).first()
        val_errors = []
        if existing_inv and existing_inv.validation_errors:
            try:
                val_errors = json.loads(existing_inv.validation_errors)
            except Exception:
                val_errors = [existing_inv.validation_errors]

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
            message=f"Duplicate file detected: Document already exists as ID {existing_doc.id}."
        )

    # 2. Persist File to Storage
    clean_filename = Path(file.filename).name
    safe_path = settings.UPLOAD_DIR / f"{file_hash[:16]}_{clean_filename}"
    safe_path.write_bytes(file_bytes)

    # 3. Create Document Record
    doc = Document(
        source=source,
        file_name=clean_filename,
        file_path=str(safe_path),
        file_hash=file_hash,
        file_size_bytes=len(file_bytes),
        mime_type=DocumentProcessor.detect_mime_type(clean_filename, file_bytes)
    )
    db.add(doc)
    db.flush()  # Populates doc.id

    # 4. Execute Decoupled Extraction Pipeline
    ext_res = extraction_service.process_and_extract(clean_filename, file_bytes)

    inv_model = ext_res.invoice
    supplier_name = inv_model.supplier.name if (inv_model and inv_model.supplier) else "Unknown Supplier"
    supplier_gstin = inv_model.supplier.gstin if (inv_model and inv_model.supplier) else None
    inv_number = inv_model.metadata.invoice_number if (inv_model and inv_model.metadata) else None

    # 5. Layer 2 Business Identity Deduplication Check
    dup_type, existing_business_dup = DeduplicationService.check_business_duplicate(
        supplier_gstin=supplier_gstin,
        invoice_number=inv_number,
        current_invoice_id=None,
        db=db,
        supplier_name=supplier_name,
    )

    # Determine initial state
    if dup_type != DuplicateType.NONE:
        initial_status = InvoiceStatus.DUPLICATE_INVESTIGATION
    elif ext_res.validation_passed:
        initial_status = InvoiceStatus.PENDING_APPROVAL
    else:
        initial_status = InvoiceStatus.PENDING_CORRECTION

    # 6. Save Invoice Record in ACID transaction
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
        version=1
    )
    db.add(db_invoice)
    db.flush()  # Populates db_invoice.id

    # Add Line Items
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
                total_amount=item.total_amount
            )
            db.add(db_item)

    # Add Extraction Log
    ext_log = ExtractionLog(
        invoice_id=db_invoice.id,
        provider=ext_res.provider,
        model_name=ext_res.model_name,
        latency_ms=ext_res.latency_ms,
        raw_payload=json.dumps(ext_res.raw_response or {}),
        normalized_payload=json.dumps(inv_model.model_dump() if inv_model else {})
    )
    db.add(ext_log)

    # Add Initial Audit Log
    audit = AuditLog(
        entity_type="invoice",
        entity_id=db_invoice.id,
        actor="system",
        action="INVOICE_INGESTED",
        changes_json=json.dumps({
            "status": initial_status.value,
            "provider": ext_res.provider,
            "validation_passed": ext_res.validation_passed,
            "duplicate_type": dup_type.value
        })
    )
    db.add(audit)

    db.commit()

    return ProcessInvoiceResponse(
        success=True,
        document_id=doc.id,
        invoice_id=db_invoice.id,
        file_name=doc.file_name,
        file_hash=file_hash,
        status=initial_status,
        duplicate_type=dup_type.value,
        duplicate_of_id=existing_business_dup.id if existing_business_dup else None,
        validation_passed=ext_res.validation_passed,
        validation_errors=ext_res.validation_errors,
        grand_total=db_invoice.grand_total,
        currency=db_invoice.currency,
        message=f"Invoice successfully ingested and processed into state '{initial_status.value}'."
    )


@router.get("", response_model=List[InvoiceSummaryDTO], summary="List Invoices with Filtering")
def list_invoices(
    status_filter: Optional[InvoiceStatus] = Query(None, alias="status", description="Filter by status"),
    search: Optional[str] = Query(None, description="Search by supplier name or invoice number"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Lists invoices with optional status and search filtering."""
    stmt = select(Invoice).options(joinedload(Invoice.document)).order_by(desc(Invoice.created_at))

    if status_filter:
        stmt = stmt.where(Invoice.status == status_filter)

    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            (Invoice.supplier_name.ilike(term)) | (Invoice.invoice_number.ilike(term))
        )

    stmt = stmt.offset(offset).limit(limit)
    invoices = db.scalars(stmt).all()

    results = []
    for inv in invoices:
        results.append(
            InvoiceSummaryDTO(
                id=inv.id,
                document_id=inv.document_id,
                file_name=inv.document.file_name if inv.document else None,
                status=inv.status,
                supplier_name=inv.supplier_name,
                supplier_gstin=inv.supplier_gstin,
                invoice_number=inv.invoice_number,
                invoice_date=inv.invoice_date,
                currency=inv.currency,
                grand_total=inv.grand_total,
                confidence_score=inv.confidence_score,
                is_valid=inv.is_valid,
                version=inv.version,
                created_at=inv.created_at,
            )
        )
    return results


@router.get("/{invoice_id}", response_model=InvoiceDetailDTO, summary="Get Detailed Invoice Record")
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    """Retrieves full invoice details including line items, extraction logs, and audit trail."""
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice {invoice_id} not found.")

    line_items = [
        LineItemDTO(
            id=item.id,
            description=item.description,
            hsn_code=item.hsn_code,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount=item.discount,
            tax_rate=item.tax_rate,
            cgst_amount=item.cgst_amount,
            sgst_amount=item.sgst_amount,
            igst_amount=item.igst_amount,
            total_amount=item.total_amount
        )
        for item in inv.line_items
    ]

    extractions = [
        ExtractionLogDTO(
            id=log.id,
            provider=log.provider,
            model_name=log.model_name,
            latency_ms=log.latency_ms,
            created_at=log.created_at
        )
        for log in inv.extractions
    ]

    audit_stmt = select(AuditLog).where(AuditLog.entity_id == inv.id).order_by(AuditLog.timestamp)
    audit_entries = db.scalars(audit_stmt).all()

    audit_logs = []
    for a in audit_entries:
        changes = None
        if a.changes_json:
            try:
                changes = json.loads(a.changes_json)
            except Exception:
                pass
        audit_logs.append(
            AuditLogDTO(
                id=a.id,
                actor=a.actor,
                action=a.action,
                changes=changes,
                timestamp=a.timestamp
            )
        )

    val_errors = []
    if inv.validation_errors:
        try:
            val_errors = json.loads(inv.validation_errors)
        except Exception:
            val_errors = [inv.validation_errors]

    return InvoiceDetailDTO(
        id=inv.id,
        document_id=inv.document_id,
        file_name=inv.document.file_name if inv.document else None,
        file_path=inv.document.file_path if inv.document else None,
        file_hash=inv.document.file_hash if inv.document else None,
        status=inv.status,
        supplier_name=inv.supplier_name,
        supplier_gstin=inv.supplier_gstin,
        supplier_address=inv.supplier_address,
        buyer_name=inv.buyer_name,
        buyer_gstin=inv.buyer_gstin,
        buyer_address=inv.buyer_address,
        invoice_number=inv.invoice_number,
        invoice_date=inv.invoice_date,
        due_date=inv.due_date,
        currency=inv.currency,
        place_of_supply=inv.place_of_supply,
        subtotal=inv.subtotal,
        cgst=inv.cgst,
        sgst=inv.sgst,
        igst=inv.igst,
        cess=inv.cess,
        round_off=inv.round_off,
        grand_total=inv.grand_total,
        confidence_score=inv.confidence_score,
        is_valid=inv.is_valid,
        validation_errors=val_errors,
        extraction_notes=inv.extraction_notes,
        version=inv.version,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
        line_items=line_items,
        extractions=extractions,
        audit_logs=audit_logs
    )


@router.post("/{invoice_id}/approve", response_model=InvoiceDetailDTO, summary="Approve Invoice & Deliver to Target DB")
def approve_invoice(
    invoice_id: str,
    body: InvoiceApprovalRequest,
    primary_db: Session = Depends(get_db),
    target_db: Session = Depends(get_target_db)
):
    """
    Maker-Checker Approval Endpoint:
    - Enforces Optimistic Concurrency Control (OCC) via expected_version.
    - Transitions status from PENDING_APPROVAL -> APPROVED.
    - Idempotently delivers approved invoice into Target Company DB.
    - Transitions status to DELIVERED.
    """
    inv = primary_db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice {invoice_id} not found.")

    # Maker-Checker Governance: Prevent self-approval (AGENTS.md Rule 7)
    # Check the last human actor who actually created or edited invoice data (the maker)
    last_maker_stmt = (
        select(AuditLog)
        .where(
            AuditLog.entity_id == inv.id,
            AuditLog.actor != "system",
            ~AuditLog.action.startswith("TRANSITION_")
        )
        .order_by(desc(AuditLog.timestamp), desc(AuditLog.id))
        .limit(1)
    )
    last_action = primary_db.scalars(last_maker_stmt).first()
    if last_action and last_action.actor:
        if body.actor.strip().lower() == last_action.actor.strip().lower() and body.actor.strip().lower() != "system":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Maker-checker violation: User '{body.actor}' created or modified this invoice and cannot self-approve it. A different checker must review and approve."
            )

    if inv.status != InvoiceStatus.APPROVED and inv.status != InvoiceStatus.DELIVERED:
        try:
            InvoiceStateMachine.transition(
                invoice=inv,
                target_status=InvoiceStatus.APPROVED,
                actor=body.actor,
                reason=body.notes or "Approved by accountant/checker",
                expected_version=body.expected_version,
                db=primary_db
            )
            primary_db.commit()
        except ConcurrencyConflictError as err:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(err)
            )
        except InvalidStateTransitionError as err:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(err)
            )
    else:
        # If already approved or delivered, verify OCC expected_version
        if body.expected_version != inv.version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"OCC conflict: expected version {body.expected_version}, but current version is {inv.version}."
            )

    # Execute transactional delivery to Target DB
    ok, msg, comp_inv = DeliveryWorker.deliver_invoice(
        invoice_id=inv.id,
        primary_db=primary_db,
        target_db=target_db,
        actor=body.actor
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Target DB delivery error: {msg}"
        )

    return get_invoice(inv.id, primary_db)


@router.put("/{invoice_id}", response_model=InvoiceDetailDTO, summary="Update/Correct Invoice & Re-validate")
def update_invoice(
    invoice_id: str,
    body: InvoiceUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Human-in-the-Loop review and correction endpoint:
    - Verifies OCC version lock.
    - Updates invoice header fields and/or line items.
    - Re-runs deterministic validation (InvoiceValidator).
    - If valid, transitions from PENDING_CORRECTION / DUPLICATE_INVESTIGATION to PENDING_APPROVAL.
    - Increments OCC version counter and logs audit record.
    """
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice {invoice_id} not found.")

    if inv.status in (InvoiceStatus.DELIVERED, InvoiceStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot edit invoice in terminal state '{inv.status.value}'."
        )

    # OCC check
    if body.expected_version != inv.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"OCC conflict: expected version {body.expected_version}, but current version is {inv.version}."
        )

    changes = {}

    # Update header fields if provided
    field_mappings = [
        ("supplier_name", body.supplier_name),
        ("supplier_gstin", body.supplier_gstin),
        ("supplier_address", body.supplier_address),
        ("buyer_name", body.buyer_name),
        ("buyer_gstin", body.buyer_gstin),
        ("buyer_address", body.buyer_address),
        ("invoice_number", body.invoice_number),
        ("invoice_date", body.invoice_date),
        ("due_date", body.due_date),
        ("currency", body.currency),
        ("place_of_supply", body.place_of_supply),
        ("subtotal", body.subtotal),
        ("cgst", body.cgst),
        ("sgst", body.sgst),
        ("igst", body.igst),
        ("cess", body.cess),
        ("round_off", body.round_off),
        ("grand_total", body.grand_total),
    ]

    for field_name, new_val in field_mappings:
        if new_val is not None:
            old_val = getattr(inv, field_name)
            if old_val != new_val:
                changes[field_name] = {"old": old_val, "new": new_val}
                setattr(inv, field_name, new_val)

    # Update line items if provided
    if body.line_items is not None:
        inv.line_items.clear()
        db.flush()

        for new_item in body.line_items:
            db_item = InvoiceLineItem(
                invoice_id=inv.id,
                description=new_item.description,
                hsn_code=new_item.hsn_code,
                quantity=new_item.quantity,
                unit_price=new_item.unit_price,
                discount=new_item.discount,
                tax_rate=new_item.tax_rate,
                cgst_amount=new_item.cgst_amount,
                sgst_amount=new_item.sgst_amount,
                igst_amount=new_item.igst_amount,
                total_amount=new_item.total_amount
            )
            inv.line_items.append(db_item)
        db.flush()
        changes["line_items_count"] = {"new": len(body.line_items)}

    # Build CanonicalInvoice for re-validation
    canonical_items = [
        LineItem(
            description=it.description,
            hsn_code=it.hsn_code,
            quantity=it.quantity,
            unit_price=it.unit_price,
            discount=it.discount,
            tax_rate=it.tax_rate,
            cgst_amount=it.cgst_amount,
            sgst_amount=it.sgst_amount,
            igst_amount=it.igst_amount,
            total_amount=it.total_amount
        )
        for it in inv.line_items
    ]

    canonical = CanonicalInvoice(
        supplier=SupplierDetails(
            name=inv.supplier_name or "Unknown",
            gstin=inv.supplier_gstin,
            address=inv.supplier_address
        ),
        buyer=BuyerDetails(
            name=inv.buyer_name,
            gstin=inv.buyer_gstin,
            address=inv.buyer_address
        ),
        metadata=InvoiceMetadata(
            invoice_number=inv.invoice_number or "UNKNOWN",
            invoice_date=inv.invoice_date,
            due_date=inv.due_date,
            place_of_supply=inv.place_of_supply,
            currency=inv.currency or "INR"
        ),
        line_items=canonical_items,
        subtotal=inv.subtotal,
        tax=TaxBreakdown(
            cgst=inv.cgst,
            sgst=inv.sgst,
            igst=inv.igst,
            cess=inv.cess
        ),
        round_off=inv.round_off,
        grand_total=inv.grand_total,
        confidence_score=inv.confidence_score
    )

    is_valid, validation_errors = InvoiceValidator.validate(canonical)
    inv.is_valid = is_valid
    inv.validation_errors = json.dumps(validation_errors)

    # State transition if validation status changed
    old_status = inv.status
    state_transitioned = False

    if is_valid and inv.status in (InvoiceStatus.PENDING_CORRECTION, InvoiceStatus.DUPLICATE_INVESTIGATION):
        InvoiceStateMachine.transition(
            invoice=inv,
            target_status=InvoiceStatus.PENDING_APPROVAL,
            actor=body.actor,
            reason=f"Accountant corrections passed validation ({body.notes or 'Fields updated'})",
            db=db
        )
        state_transitioned = True
    elif not is_valid and inv.status == InvoiceStatus.PENDING_APPROVAL:
        InvoiceStateMachine.transition(
            invoice=inv,
            target_status=InvoiceStatus.PENDING_CORRECTION,
            actor=body.actor,
            reason="Edits introduced validation mismatches",
            db=db
        )
        state_transitioned = True
    elif not is_valid and inv.status == InvoiceStatus.DUPLICATE_INVESTIGATION:
        InvoiceStateMachine.transition(
            invoice=inv,
            target_status=InvoiceStatus.PENDING_CORRECTION,
            actor=body.actor,
            reason="Duplicate investigation concluded: validation errors require correction",
            db=db
        )
        state_transitioned = True

    # Only increment version if a state transition didn't already increment it
    if not state_transitioned:
        inv.version += 1

    # Log audit entry
    audit = AuditLog(
        entity_type="invoice",
        entity_id=inv.id,
        actor=body.actor,
        action="INVOICE_UPDATED",
        changes_json=json.dumps({
            "changes": changes,
            "validation_passed": is_valid,
            "old_status": old_status.value,
            "new_status": inv.status.value,
            "notes": body.notes
        })
    )
    db.add(audit)
    db.commit()

    return get_invoice(inv.id, db)


@router.post("/{invoice_id}/reject", response_model=InvoiceDetailDTO, summary="Reject Invoice with Reason")
async def reject_invoice(
    invoice_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Transitions invoice to terminal REJECTED status with audit log (accepts JSON or Form data)."""
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice {invoice_id} not found.")

    actor = None
    reason = None
    expected_version = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            payload = await request.json()
            actor = payload.get("actor")
            reason = payload.get("reason")
            raw_ev = payload.get("expected_version")
            if raw_ev is not None:
                try:
                    expected_version = int(raw_ev)
                except (ValueError, TypeError):
                    expected_version = raw_ev
        except Exception:
            pass
    else:
        try:
            form = await request.form()
            actor = form.get("actor")
            reason = form.get("reason")
            raw_v = form.get("expected_version")
            if raw_v is not None and str(raw_v).strip():
                try:
                    expected_version = int(raw_v)
                except (ValueError, TypeError):
                    expected_version = raw_v
        except Exception:
            pass

    if not actor or not reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Both 'actor' and 'reason' must be provided in request body."
        )

    try:
        InvoiceStateMachine.transition(
            invoice=inv,
            target_status=InvoiceStatus.REJECTED,
            actor=str(actor),
            reason=str(reason),
            expected_version=expected_version,
            db=db
        )
        db.commit()
    except ConcurrencyConflictError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err)
        )
    except InvalidStateTransitionError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err)
        )

    return get_invoice(inv.id, db)


# Target Company / ERP Inspection Endpoints
target_router = APIRouter(prefix="/target-company", tags=["Target Company ERP Database"])


@target_router.get("/invoices", response_model=List[CompanyInvoiceDTO], summary="View Delivered Company Invoices")
def list_target_company_invoices(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    target_db: Session = Depends(get_target_db)
):
    """Inspects posted invoices in the destination Target Company DB."""
    stmt = (
        select(CompanyInvoice)
        .options(selectinload(CompanyInvoice.lines))
        .order_by(desc(CompanyInvoice.posted_at))
        .offset(offset)
        .limit(limit)
    )
    records = target_db.scalars(stmt).all()

    results = []
    for r in records:
        lines_data = [
            {
                "item_description": line.item_description,
                "hsn_code": line.hsn_code,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "line_total": line.line_total,
            }
            for line in r.lines
        ]
        results.append(
            CompanyInvoiceDTO(
                id=r.id,
                ext_reference_id=r.ext_reference_id,
                supplier_gstin=r.supplier_gstin,
                supplier_name=r.supplier_name,
                invoice_number=r.invoice_number,
                invoice_date=r.invoice_date,
                currency=r.currency,
                subtotal=r.subtotal,
                tax_amount=r.tax_amount,
                grand_total=r.grand_total,
                posted_at=r.posted_at,
                lines=lines_data
            )
        )
    return results
