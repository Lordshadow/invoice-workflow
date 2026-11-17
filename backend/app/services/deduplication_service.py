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
        tokens = re.findall(r"[A-Za-z]+|[0-9]+", inv_num)
        if not tokens:
            return ""
        normalized = []
        for tok in tokens:
            if tok.isdigit():
                normalized.append(str(int(tok)))
            else:
                normalized.append(tok.upper())
        return "".join(normalized)

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
        supplier_name: Optional[str] = None,
    ) -> Tuple[DuplicateType, Optional[Invoice]]:
        """
        Layer 2 Check: Evaluates business identity against non-rejected invoices.
        Primary match: (supplier_gstin, normalized_invoice_number)
        Fallback match (for foreign/non-GST vendors without GSTIN): (normalized_supplier_name, normalized_invoice_number)
        """
        if not invoice_number:
            return DuplicateType.NONE, None

        norm_current = cls.normalize_invoice_number(invoice_number)
        if not norm_current:
            return DuplicateType.NONE, None

        # 1. Primary GSTIN + Invoice Number Match
        if supplier_gstin and supplier_gstin.strip():
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

        # 2. Fallback Match for Foreign / Non-GST Suppliers without GSTIN
        elif supplier_name and supplier_name.strip():
            norm_name = re.sub(r"[^A-Za-z0-9]", "", supplier_name).upper()
            if len(norm_name) >= 3:
                stmt = (
                    select(Invoice)
                    .where(
                        (Invoice.supplier_gstin.is_(None)) | (Invoice.supplier_gstin == ""),
                        Invoice.status != InvoiceStatus.REJECTED,
                    )
                )
                if current_invoice_id:
                    stmt = stmt.where(Invoice.id != current_invoice_id)

                candidates = db.scalars(stmt).all()
                for cand in candidates:
                    cand_name_norm = re.sub(r"[^A-Za-z0-9]", "", cand.supplier_name or "").upper()
                    cand_inv_norm = cls.normalize_invoice_number(cand.invoice_number)
                    if cand_name_norm == norm_name and cand_inv_norm == norm_current:
                        logger.warning(
                            f"Layer 2 Non-GST Business Duplicate: Supplier '{supplier_name}' + Invoice '{norm_current}' "
                            f"matches existing Invoice {cand.id} (Status: {cand.status.value})"
                        )
                        return DuplicateType.EXACT_BUSINESS_DUPLICATE, cand

        return DuplicateType.NONE, None
