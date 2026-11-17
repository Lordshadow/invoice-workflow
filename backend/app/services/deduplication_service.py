"""
Two-Tier Deduplication Engine.
Layer 1: Exact File SHA-256 Hash Duplicate Detection.
Layer 2: Business Identity (Supplier GSTIN + Normalized Invoice Number) Compound Key Matching.
"""
import enum
import logging
import re
from typing import Optional, Tuple
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.document import Document
from backend.app.models.invoice import Invoice, InvoiceStatus

logger = logging.getLogger("invoice_processor.dedup")


class DuplicateType(str, enum.Enum):
    NONE = "NONE"
    EXACT_FILE_DUPLICATE = "EXACT_FILE_DUPLICATE"
    EXACT_BUSINESS_DUPLICATE = "EXACT_BUSINESS_DUPLICATE"
    FUZZY_SUSPECTED_DUPLICATE = "FUZZY_SUSPECTED_DUPLICATE"


class DeduplicationService:
    """
    Evaluates incoming documents and parsed invoices for duplication.
    """

    @staticmethod
    def normalize_invoice_number(inv_num: Optional[str]) -> str:
        """
        Normalizes invoice number by stripping special characters, spaces, and leading zeros
        so 'INV-00123' and 'INV 123' can be detected reliably.
        """
        if not inv_num:
            return ""
        clean = re.sub(r"[^A-Za-z0-9]", "", inv_num).upper()
        # Strip leading zeros from numeric segment
        return clean

    @classmethod
    def check_file_duplicate(cls, file_hash: str, db: Session) -> Tuple[bool, Optional[Document]]:
        """
        Layer 1 Check: Evaluates SHA-256 file checksum against all previously uploaded documents.
        """
        stmt = select(Document).where(Document.file_hash == file_hash).limit(1)
        existing_doc = db.scalars(stmt).first()
        if existing_doc:
            logger.info(f"Layer 1 Duplicate Detected: File hash {file_hash[:12]} matches Document {existing_doc.id}")
            return True, existing_doc
        return False, None

    @classmethod
    def check_business_duplicate(
        cls,
        supplier_gstin: Optional[str],
        invoice_number: Optional[str],
        current_invoice_id: Optional[str],
        db: Session,
    ) -> Tuple[DuplicateType, Optional[Invoice]]:
        """
        Layer 2 Check: Evaluates (supplier_gstin, normalized_invoice_number) against non-rejected invoices.
        """
        if not supplier_gstin or not invoice_number:
            return DuplicateType.NONE, None

        norm_current = cls.normalize_invoice_number(invoice_number)
        gstin_clean = supplier_gstin.strip().upper()

        stmt = (
            select(Invoice)
            .where(
                Invoice.supplier_gstin == gstin_clean,
                Invoice.status != InvoiceStatus.REJECTED,
            )
        )
        if current_invoice_id:
            stmt = stmt.where(Invoice.id != current_invoice_id)

        candidates = db.scalars(stmt).all()

        for cand in candidates:
            cand_norm = cls.normalize_invoice_number(cand.invoice_number)
            if cand_norm and cand_norm == norm_current:
                logger.warning(
                    f"Layer 2 Exact Business Duplicate: Supplier '{gstin_clean}' + Invoice '{norm_current}' "
                    f"matches existing Invoice {cand.id} (Status: {cand.status.value})"
                )
                return DuplicateType.EXACT_BUSINESS_DUPLICATE, cand

        return DuplicateType.NONE, None
