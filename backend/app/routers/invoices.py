"""
FastAPI Router for Invoice Lifecycle Management, Approval, and Target Delivery.
Enforces ACID database transactions, maker-checker governance, OCC, and two-tier deduplication.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from backend.app.config import settings
from backend.app.db.session import get_db, get_target_db
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
from backend.app.models.target_company import CompanyInvoice
from backend.app.schemas.invoice_api import (
    AuditLogDTO,
    CompanyInvoiceDTO,
    DeEscalationRequest,
    EscalationStatsDTO,
    ExtractionLogDTO,
    InvoiceApprovalRequest,
    InvoiceDetailDTO,
    InvoiceRejectionRequest,
    InvoiceSummaryDTO,
    InvoiceUpdateRequest,
    LineItemDTO,
    ManualEscalationRequest,
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
from backend.app.services.escalation_service import EscalationCategory, EscalationService
from backend.app.services.invoice_validator import InvoiceValidator
from backend.app.services.storage import get_storage_provider
from backend.app.services.deduplication_service import (
    DeduplicationService,
    DuplicateType,
)
from backend.app.services.delivery_worker import DeliveryWorker
from backend.app.services.document_processor import DocumentProcessor
from backend.app.services.extraction_service import ExtractionService
from backend.app.services.ingestion_service import IngestionService
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
    enable_stp: Optional[bool] = Form(default=None, description="Enable automated straight-through processing for 100% clean invoices"),
    db: Session = Depends(get_db),
    target_db: Session = Depends(get_target_db),
):
    """
    Full lifecycle processing:
    1. Reads bytes & computes SHA-256 hash.
    2. Layer 1 Deduplication (Exact file check).
    3. Document intake and storage registration.
    4. AI / OCR Extraction & Centralized Validation.
    5. Layer 2 Deduplication (Business identity: Supplier GSTIN + Invoice Number).
    6. Intelligent Escalation & Straight-Through Processing (STP) Evaluation.
    7. ACID transaction saving Document, Invoice, Line Items, Extraction Log, and Audit Trail.
    8. If STP qualified: automatically commits to Target DB and marks DELIVERED.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must have a valid filename.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty (0 bytes).")

    try:
        return IngestionService.ingest_invoice(
            file_bytes=file_bytes,
            filename=file.filename,
            source=source,
            db=db,
            target_db=target_db,
            enable_stp=enable_stp,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Invoice processing pipeline failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Processing failed: {str(e)}"
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
                is_escalated=inv.is_escalated,
                escalation_reason=inv.escalation_reason,
                escalation_category=inv.escalation_category,
                duplicate_of_id=inv.duplicate_of_id,
                version=inv.version,
                created_at=inv.created_at,
            )
        )
    return results


@router.get("/escalated", response_model=List[InvoiceSummaryDTO], summary="List Escalated Invoices for Human-in-the-Loop Review")
def list_escalated_invoices(
    category: Optional[str] = Query(None, description="Filter by Escalation Category"),
    status_filter: Optional[InvoiceStatus] = Query(None, alias="status", description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Retrieves invoices that require human attention:
    Invoices where is_escalated is True, or in pending correction / duplicate investigation states.
    """
    stmt = (
        select(Invoice)
        .options(joinedload(Invoice.document))
        .where(
            or_(
                Invoice.is_escalated == True,
                Invoice.status.in_([
                    InvoiceStatus.PENDING_CORRECTION,
                    InvoiceStatus.DUPLICATE_INVESTIGATION,
                ])
            )
        )
    )
    if category:
        stmt = stmt.where(Invoice.escalation_category == category)
    if status_filter:
        stmt = stmt.where(Invoice.status == status_filter)
    else:
        # Default to active pending queue, excluding committed/terminal states
        stmt = stmt.where(Invoice.status.notin_([InvoiceStatus.APPROVED, InvoiceStatus.DELIVERED, InvoiceStatus.REJECTED]))

    stmt = stmt.order_by(desc(Invoice.created_at)).offset(offset).limit(limit)
    invoices = db.scalars(stmt).all()

    return [
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
            is_escalated=inv.is_escalated,
            escalation_reason=inv.escalation_reason,
            escalation_category=inv.escalation_category,
            duplicate_of_id=inv.duplicate_of_id,
            version=inv.version,
            created_at=inv.created_at,
        )
        for inv in invoices
    ]


@router.get("/escalation-stats", response_model=EscalationStatsDTO, summary="Get Escalation & STP Processing Metrics")
def get_escalation_stats(db: Session = Depends(get_db)):
    """Computes real-time Straight-Through Processing (STP) rate and escalation breakdown."""
    total_count = db.scalar(select(func.count(Invoice.id))) or 0
    escalated_count = db.scalar(
        select(func.count(Invoice.id)).where(
            Invoice.status.notin_([InvoiceStatus.APPROVED, InvoiceStatus.DELIVERED, InvoiceStatus.REJECTED]),
            or_(
                Invoice.is_escalated == True,
                Invoice.status.in_([
                    InvoiceStatus.PENDING_CORRECTION,
                    InvoiceStatus.DUPLICATE_INVESTIGATION,
                ])
            )
        )
    ) or 0
    delivered_count = db.scalar(
        select(func.count(Invoice.id)).where(Invoice.status == InvoiceStatus.DELIVERED)
    ) or 0
    clean_count = max(0, total_count - escalated_count)

    stp_rate = round((delivered_count / total_count * 100.0), 2) if total_count > 0 else 0.0

    cat_counts = db.execute(
        select(Invoice.escalation_category, func.count(Invoice.id))
        .where(
            Invoice.status.notin_([InvoiceStatus.APPROVED, InvoiceStatus.DELIVERED, InvoiceStatus.REJECTED]),
            Invoice.escalation_category.isnot(None)
        )
        .group_by(Invoice.escalation_category)
    ).all()
    category_breakdown = {str(row[0]): int(row[1]) for row in cat_counts if row[0]}

    total_gross = float(db.scalar(select(func.sum(Invoice.grand_total))) or 0.0)
    delivered_gross = float(db.scalar(select(func.sum(Invoice.grand_total)).where(Invoice.status == InvoiceStatus.DELIVERED)) or 0.0)
    avg_gross = round(float(db.scalar(select(func.avg(Invoice.grand_total))) or 0.0), 2)
    avg_conf = round(float(db.scalar(select(func.avg(Invoice.confidence_score))) or 0.0), 4) if total_count > 0 else 0.0

    channel_counts = db.execute(
        select(Document.source, func.count(Document.id)).group_by(Document.source)
    ).all()
    channel_breakdown = {str(row[0]).lower(): int(row[1]) for row in channel_counts if row[0]}

    mime_counts = db.execute(
        select(Document.mime_type, func.count(Document.id)).group_by(Document.mime_type)
    ).all()
    mime_breakdown = {str(row[0]): int(row[1]) for row in mime_counts if row[0]}

    conflict_count = db.scalar(
        select(func.count(Invoice.id)).where(Invoice.status == InvoiceStatus.DUPLICATE_INVESTIGATION)
    ) or 0
    zero_conflict_rate = round(max(0.0, 100.0 - (conflict_count / total_count * 100.0)), 1) if total_count > 0 else 0.0

    now = datetime.now(timezone.utc)
    hourly_throughput: List[int] = []
    for i in range(6, -1, -1):
        window_start = now - timedelta(hours=(i + 1) * 4)
        window_end = now - timedelta(hours=i * 4)
        cnt = db.scalar(
            select(func.count(Invoice.id)).where(
                Invoice.created_at >= window_start,
                Invoice.created_at < window_end
            )
        ) or 0
        hourly_throughput.append(cnt)

    return EscalationStatsDTO(
        total_invoices=total_count,
        escalated_count=escalated_count,
        clean_count=clean_count,
        delivered_count=delivered_count,
        stp_rate_percentage=stp_rate,
        category_breakdown=category_breakdown,
        total_gross_value=total_gross,
        delivered_gross_value=delivered_gross,
        average_invoice_value=avg_gross,
        channel_breakdown=channel_breakdown,
        mime_breakdown=mime_breakdown,
        avg_confidence_score=avg_conf,
        zero_conflict_rate=zero_conflict_rate,
        hourly_throughput=hourly_throughput,
    )


@router.get("/samples/list", summary="List Available Sample Invoice Files")
def list_sample_files():
    """Returns curated metadata for sample test invoices located in samples/ directory."""
    samples_dir = Path("samples")
    if not samples_dir.is_dir():
        return []

    meta = {
        "02_synthetic_invoice_interstate.pdf": {
            "title": "Interstate B2B GST Invoice (Clean PDF)",
            "description": "100% clean digital PDF. Qualifies for autonomous Straight-Through Processing (STP).",
            "type": "PDF",
            "stp_eligible": True,
        },
        "03_synthetic_invoice_printed_photo.jpg": {
            "title": "Printed Store Receipt (Camera Photo)",
            "description": "Mobile camera capture with slight tilt. Exercises deskewing & OCR.",
            "type": "JPEG",
            "stp_eligible": False,
        },
        "04_synthetic_invoice_handwritten_photo.jpg": {
            "title": "Handwritten Cash Memo (Photo)",
            "description": "Mobile camera image of handwritten bill. Exercises AI vision extraction.",
            "type": "JPEG",
            "stp_eligible": False,
        },
        "multipage-3p-na-3.pdf": {
            "title": "Multi-Page Corporate Invoice (3 Pages)",
            "description": "Complex multi-page PDF invoice with table across multiple pages.",
            "type": "PDF",
            "stp_eligible": False,
        },
    }

    available = []
    for filename, info in meta.items():
        file_path = samples_dir / filename
        if file_path.is_file():
            available.append({
                "filename": filename,
                "title": info["title"],
                "description": info["description"],
                "type": info["type"],
                "stp_eligible": info["stp_eligible"],
                "size_kb": round(file_path.stat().st_size / 1024, 1),
            })
    return available


@router.get("/samples/{filename}/download", summary="Download Sample Invoice File")
def download_sample_file(filename: str):
    """Downloads a curated sample file from the samples directory for frontend processing."""
    safe_name = Path(filename).name
    file_path = Path("samples") / safe_name
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample invoice file not found.")

    media_type = "application/pdf" if safe_name.lower().endswith(".pdf") else "image/jpeg"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=safe_name
    )


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
                parsed = json.loads(a.changes_json)
                changes = parsed if isinstance(parsed, dict) else {"raw": parsed}
            except Exception:
                changes = {"raw": a.changes_json}
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
        is_escalated=inv.is_escalated,
        escalation_reason=inv.escalation_reason,
        escalation_category=inv.escalation_category,
        duplicate_of_id=inv.duplicate_of_id,
        validation_errors=val_errors,
        extraction_notes=inv.extraction_notes,
        version=inv.version,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
        line_items=line_items,
        extractions=extractions,
        audit_logs=audit_logs
    )


@router.api_route("/{invoice_id}/file", methods=["GET", "HEAD"], summary="Stream Original Invoice Document File")
def get_invoice_file(
    invoice_id: str,
    request: Request,
    download: bool = Query(False, description="Whether to force download attachment"),
    db: Session = Depends(get_db)
):
    """
    Streams the original physical PDF, Image, or DOCX file for frontend viewer display.
    - Sets Content-Disposition: inline by default so browsers render the document instead of downloading.
    - Automatically converts DOCX documents to standard PDF on the fly for native browser preview.
    - Sets Content-Disposition: attachment only when download=True is explicitly passed.
    - Supports HEAD requests and Cloud Storage abstraction downloads.
    """
    inv = db.get(Invoice, invoice_id)
    if not inv or not inv.document or not inv.document.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice file not found.")

    storage = get_storage_provider()
    file_path = Path(inv.document.file_path)
    file_bytes = None
    if file_path.is_file():
        file_bytes = file_path.read_bytes()
    else:
        # Fallback check in uploads or samples
        candidate_uploads = settings.UPLOAD_DIR / file_path.name
        candidate_samples = Path("samples") / file_path.name
        if candidate_uploads.is_file():
            file_path = candidate_uploads
            file_bytes = candidate_uploads.read_bytes()
        elif candidate_samples.is_file():
            file_path = candidate_samples
            file_bytes = candidate_samples.read_bytes()
        else:
            try:
                file_bytes = storage.download(inv.document.file_path)
            except Exception:
                file_bytes = None

    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File on disk or storage '{file_path.name}' not found.")

    ext = file_path.suffix.lower()
    file_name = inv.document.file_name or file_path.name

    # Determine accurate MIME type
    media_type = inv.document.mime_type
    if ext == ".pdf":
        media_type = "application/pdf"
    elif ext in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"
    elif ext in (".docx", ".doc"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    if request.method == "HEAD":
        return Response(
            status_code=200,
            media_type=media_type or "application/octet-stream",
            headers={
                "Content-Length": str(len(file_bytes)),
                "Cache-Control": "public, max-age=3600"
            }
        )

    # If DOCX and not an explicit download, convert to PDF on-the-fly for native iframe preview
    if ext in (".docx", ".doc") and not download:
        try:
            import fitz
            doc = fitz.open(stream=file_bytes, filetype="docx")
            pdf_bytes = doc.convert_to_pdf()
            doc.close()
            pdf_filename = f"{Path(file_name).stem}.pdf"
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'inline; filename="{pdf_filename}"',
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600",
                }
            )
        except Exception as e:
            logger.warning(f"Failed to convert DOCX to PDF for preview: {e}")

    disposition = "attachment" if download else "inline"

    return Response(
        content=file_bytes,
        media_type=media_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{file_name}"',
            "Cache-Control": "public, max-age=3600"
        }
    )


@router.api_route("/{invoice_id}/preview", methods=["GET", "HEAD"], summary="Render High-Resolution Invoice Document Preview Page")
def get_invoice_preview(
    invoice_id: str,
    request: Request,
    page: int = Query(1, ge=1, description="Page number to preview (1-indexed)"),
    db: Session = Depends(get_db)
):
    """
    Renders a crisp, high-resolution (180 DPI) raster image of the specified invoice document page.
    - PDFs and DOCXs are rendered server-side via PyMuPDF for 100% reliable, plugin-free canvas rendering.
    - Image formats (JPG, PNG, WEBP) are returned directly.
    - Emits X-Total-Pages header to enable multi-page document pagination in the frontend viewer.
    - Handles HEAD requests cleanly for instant metadata queries without rasterization overhead.
    """
    inv = db.get(Invoice, invoice_id)
    if not inv or not inv.document or not inv.document.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice file not found.")

    storage = get_storage_provider()
    file_path = Path(inv.document.file_path)
    file_bytes = None
    if file_path.is_file():
        file_bytes = file_path.read_bytes()
    else:
        candidate_uploads = settings.UPLOAD_DIR / file_path.name
        candidate_samples = Path("samples") / file_path.name
        if candidate_uploads.is_file():
            file_path = candidate_uploads
            file_bytes = candidate_uploads.read_bytes()
        elif candidate_samples.is_file():
            file_path = candidate_samples
            file_bytes = candidate_samples.read_bytes()
        else:
            try:
                file_bytes = storage.download(inv.document.file_path)
            except Exception:
                file_bytes = None

    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File on disk or storage '{file_path.name}' not found.")

    ext = file_path.suffix.lower()

    # Image files (JPEG, PNG, WEBP) -> stream directly
    if ext in (".jpg", ".jpeg", ".png", ".webp"):
        media_type = "image/jpeg" if ext in (".jpg", ".jpeg") else f"image/{ext.replace('.', '')}"
        return Response(
            content=b"" if request.method == "HEAD" else file_bytes,
            media_type=media_type,
            headers={
                "Content-Length": str(len(file_bytes)),
                "X-Total-Pages": "1",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Expose-Headers": "X-Total-Pages"
            }
        )

    # PDF or DOCX -> render requested page as high-res PNG image via PyMuPDF
    try:
        import pymupdf
        if ext in (".docx", ".doc"):
            raw_doc = pymupdf.open(stream=file_bytes, filetype="docx")
            pdf_bytes = raw_doc.convert_to_pdf()
            raw_doc.close()
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        else:
            doc = pymupdf.open(stream=file_bytes, filetype="pdf")

        total_pages = len(doc)
        if total_pages == 0:
            doc.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document has no pages.")

        if request.method == "HEAD":
            doc.close()
            return Response(
                status_code=200,
                headers={
                    "X-Total-Pages": str(total_pages),
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Expose-Headers": "X-Total-Pages"
                }
            )

        page_index = min(max(page - 1, 0), total_pages - 1)
        pdf_page = doc[page_index]
        pix = pdf_page.get_pixmap(dpi=180)
        img_bytes = pix.tobytes("png")
        doc.close()

        return Response(
            content=img_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": f'inline; filename="preview_page_{page_index+1}.png"',
                "X-Total-Pages": str(total_pages),
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Expose-Headers": "X-Total-Pages"
            }
        )
    except Exception as e:
        logger.error(f"Failed to generate preview for invoice {invoice_id}: {e}", exc_info=True)
        return Response(
            content=b"" if request.method == "HEAD" else file_bytes,
            media_type="application/octet-stream",
            headers={"X-Total-Pages": "1", "Cache-Control": "no-cache", "Access-Control-Expose-Headers": "X-Total-Pages"}
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
            # If the invoice was escalated, approval by authorized checker resolves the escalation
            if inv.is_escalated:
                inv.is_escalated = False
                inv.escalation_reason = None
                inv.escalation_category = None
                primary_db.add(
                    AuditLog(
                        entity_type="invoice",
                        entity_id=inv.id,
                        actor=body.actor,
                        action="ESCALATION_RESOLVED_ON_APPROVAL",
                        changes_json=json.dumps({"notes": body.notes or "Escalation adjudicated and approved by checker"})
                    )
                )
            # Record relational InvoiceApproval snapshot
            primary_db.add(
                InvoiceApproval(
                    invoice_id=inv.id,
                    user_id=body.actor,
                    action="APPROVE",
                    notes=body.notes or "Approved by accountant/checker",
                    snapshot_version=inv.version
                )
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

    if inv.status in (InvoiceStatus.APPROVED, InvoiceStatus.DELIVERED, InvoiceStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot edit invoice in state '{inv.status.value}'. Only invoices in pending review states (PENDING_APPROVAL, PENDING_CORRECTION, DUPLICATE_INVESTIGATION) can be edited."
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
            if field_name == "supplier_gstin" and isinstance(new_val, str) and new_val.strip():
                new_val = new_val.strip().upper()
            elif field_name == "invoice_number" and isinstance(new_val, str) and new_val.strip():
                new_val = new_val.strip()
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

    # Synchronize relational ValidationResults with latest validation outcome
    from sqlalchemy import delete
    db.execute(delete(ValidationResult).where(ValidationResult.invoice_id == inv.id))
    if is_valid:
        db.add(ValidationResult(
            invoice_id=inv.id,
            rule_name="DETERMINISTIC_RULES_PASS",
            status="PASS",
            error_details=None
        ))
    else:
        for err in validation_errors:
            rule_name = err.split(":")[0].strip() if ":" in err else "GENERAL_VALIDATION_ERROR"
            db.add(ValidationResult(
                invoice_id=inv.id,
                rule_name=rule_name,
                status="FAIL",
                error_details=err
            ))

    # Re-evaluate business deduplication on updated fields
    dup_type, existing_dup = DeduplicationService.check_business_duplicate(
        supplier_gstin=inv.supplier_gstin,
        invoice_number=inv.invoice_number,
        current_invoice_id=inv.id,
        db=db,
        supplier_name=inv.supplier_name,
        invoice_date=inv.invoice_date,
        grand_total=inv.grand_total,
    )
    inv.duplicate_of_id = existing_dup.id if existing_dup else None

    state_transitioned = False
    old_status = inv.status

    if dup_type != DuplicateType.NONE:
        # Prevent clearing duplicate status if still a duplicate!
        inv.is_escalated = True
        inv.escalation_reason = f"Duplicate suspected: {dup_type.value}"
        inv.escalation_category = EscalationCategory.DUPLICATE_SUSPECTED.value
        if inv.status != InvoiceStatus.DUPLICATE_INVESTIGATION:
            InvoiceStateMachine.transition(
                invoice=inv,
                target_status=InvoiceStatus.DUPLICATE_INVESTIGATION,
                actor=body.actor,
                reason=f"Edited invoice matches existing invoice {existing_dup.id} ({dup_type.value})",
                db=db
            )
            state_transitioned = True
    else:
        # If deduplication passed cleanly, clear duplicate escalation if present
        if inv.is_escalated and inv.escalation_category == EscalationCategory.DUPLICATE_SUSPECTED.value:
            inv.is_escalated = False
            inv.escalation_reason = None
            inv.escalation_category = None

        # If re-validation succeeds, clear math/missing fields escalation
        if is_valid and inv.is_escalated and inv.escalation_category in (
            EscalationCategory.MATH_MISMATCH.value,
            EscalationCategory.MISSING_FIELDS.value,
            EscalationCategory.LOW_CONFIDENCE.value,
        ):
            inv.is_escalated = False
            inv.escalation_reason = None
            inv.escalation_category = None

        # State transition if validation status changed
        if is_valid and inv.status in (InvoiceStatus.PENDING_CORRECTION, InvoiceStatus.DUPLICATE_INVESTIGATION):
            InvoiceStateMachine.transition(
                invoice=inv,
                target_status=InvoiceStatus.PENDING_APPROVAL,
                actor=body.actor,
                reason=f"Accountant corrections passed validation and deduplication ({body.notes or 'Fields updated'})",
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
        # Record relational InvoiceApproval rejection row
        db.add(
            InvoiceApproval(
                invoice_id=inv.id,
                user_id=str(actor),
                action="REJECT",
                notes=str(reason),
                snapshot_version=inv.version
            )
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


@router.post("/{invoice_id}/escalate", response_model=InvoiceDetailDTO, summary="Manually Escalate Invoice for Supervisor Review")
def manual_escalate_invoice(
    invoice_id: str,
    payload: ManualEscalationRequest,
    db: Session = Depends(get_db)
):
    """Manually escalates an invoice to the Human-in-the-Loop review queue with rationale."""
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice {invoice_id} not found.")

    if inv.status in (InvoiceStatus.APPROVED, InvoiceStatus.DELIVERED, InvoiceStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot escalate invoice in committed/terminal state '{inv.status.value}'."
        )

    # OCC version verification
    if payload.expected_version is not None and payload.expected_version != inv.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"OCC conflict: expected version {payload.expected_version}, but current version is {inv.version}."
        )

    EscalationService.manual_escalate(
        invoice=inv,
        actor=payload.actor,
        reason=payload.reason,
        category=payload.category,
        db=db
    )
    inv.version += 1
    db.commit()
    return get_invoice(inv.id, db)


@router.post("/{invoice_id}/de-escalate", response_model=InvoiceDetailDTO, summary="Resolve Escalation on Invoice")
def de_escalate_invoice(
    invoice_id: str,
    payload: DeEscalationRequest,
    db: Session = Depends(get_db)
):
    """Clears the escalation flag on an invoice after supervisor investigation."""
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice {invoice_id} not found.")

    if inv.status in (InvoiceStatus.APPROVED, InvoiceStatus.DELIVERED, InvoiceStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot de-escalate invoice in committed/terminal state '{inv.status.value}'."
        )

    # OCC version verification
    if payload.expected_version is not None and payload.expected_version != inv.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"OCC conflict: expected version {payload.expected_version}, but current version is {inv.version}."
        )

    EscalationService.resolve_escalation(
        invoice=inv,
        actor=payload.actor,
        notes=payload.notes,
        db=db
    )
    inv.version += 1
    db.commit()
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
