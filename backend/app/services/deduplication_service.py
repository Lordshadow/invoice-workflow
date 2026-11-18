"""
Two-Tier Deduplication Engine.
Layer 1: Exact File SHA-256 Hash Duplicate Detection.
Layer 2: Business Identity (Supplier GSTIN + Normalized Invoice Number) Compound Key Matching.
"""
import enum
import logging
import re
from datetime import datetime
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


def levenshtein_distance_le1(s1: str, s2: str) -> bool:
    """
    Fast O(N) evaluation of whether two strings have Levenshtein edit distance <= 1
    (at most 1 insertion, deletion, or substitution).
    """
    if abs(len(s1) - len(s2)) > 1:
        return False
    if s1 == s2:
        return True

    mismatches = 0
    i = 0
    j = 0
    while i < len(s1) and j < len(s2):
        if s1[i] != s2[j]:
            mismatches += 1
            if mismatches > 1:
                return False
            if len(s1) > len(s2):
                i += 1
                continue
            elif len(s2) > len(s1):
                j += 1
                continue
        i += 1
        j += 1
    return True


class DeduplicationService:
    """
    Evaluates incoming documents and parsed invoices for duplication.
    """

    @staticmethod
    def normalize_invoice_number(inv_num: Optional[str]) -> str:
        """
        Normalizes invoice number by stripping special characters, spaces, and leading zeros.
        If invoice number consists purely of numeric segments (e.g., '2024/01/2' vs '2024/12'),
        preserves segment boundaries with '-' to prevent numeric concatenation collisions.
        """
        if not inv_num:
            return ""
        tokens = re.findall(r"[A-Za-z]+|[0-9]+", inv_num)
        if not tokens:
            return ""

        all_numeric = all(tok.isdigit() for tok in tokens)
        normalized = []
        for tok in tokens:
            if tok.isdigit():
                normalized.append(tok.lstrip("0") or "0")
            else:
                normalized.append(tok.upper())

        # For multi-segment pure numeric invoice numbers, join with '-' to prevent collisions
        if all_numeric and len(normalized) > 1:
            return "-".join(normalized)

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
        invoice_date: Optional[str] = None,
        grand_total: Optional[float] = None,
    ) -> Tuple[DuplicateType, Optional[Invoice]]:
        """
        Layer 2 Check: Evaluates business identity against non-rejected invoices.
        - Exact Match: compound key (supplier_gstin, normalized_invoice_number)
        - Fuzzy Match: Levenshtein distance <= 1 or date within +/- 3 days with identical grand total
        - Fallback: Non-GST vendor (supplier_name, normalized_invoice_number)
        """
        if not invoice_number:
            return DuplicateType.NONE, None

        norm_current = cls.normalize_invoice_number(invoice_number)
        if not norm_current:
            return DuplicateType.NONE, None

        # 1. Primary GSTIN Match
        if supplier_gstin and supplier_gstin.strip():
            gstin_clean = supplier_gstin.strip().upper()

            # Fast path: Direct SQL query for exact raw invoice_number match
            stmt_exact = select(Invoice).where(
                Invoice.supplier_gstin == gstin_clean,
                Invoice.invoice_number == invoice_number.strip(),
                Invoice.status != InvoiceStatus.REJECTED,
            )
            if current_invoice_id:
                stmt_exact = stmt_exact.where(Invoice.id != current_invoice_id)
            exact_cand = db.scalars(stmt_exact.limit(1)).first()
            if exact_cand:
                logger.warning(
                    f"Layer 2 Exact Business Duplicate (Direct SQL): Supplier '{gstin_clean}' + Invoice '{invoice_number}' "
                    f"matches existing Invoice {exact_cand.id} (Status: {exact_cand.status.value})"
                )
                return DuplicateType.EXACT_BUSINESS_DUPLICATE, exact_cand

            # Normalized and Fuzzy candidate evaluation
            stmt = select(Invoice).where(
                Invoice.supplier_gstin == gstin_clean,
                Invoice.status != InvoiceStatus.REJECTED,
            )
            if current_invoice_id:
                stmt = stmt.where(Invoice.id != current_invoice_id)

            candidates = db.scalars(stmt).all()
            fuzzy_candidate = None

            for cand in candidates:
                cand_norm = cls.normalize_invoice_number(cand.invoice_number)
                if cand_norm and cand_norm == norm_current:
                    logger.warning(
                        f"Layer 2 Exact Business Duplicate (Normalized): Supplier '{gstin_clean}' + Invoice '{norm_current}' "
                        f"matches existing Invoice {cand.id} (Status: {cand.status.value})"
                    )
                    return DuplicateType.EXACT_BUSINESS_DUPLICATE, cand

                # Check Fuzzy Match (Levenshtein distance <= 1 on invoice number)
                if not fuzzy_candidate and len(norm_current) >= 4 and len(cand_norm) >= 4:
                    if levenshtein_distance_le1(norm_current, cand_norm):
                        fuzzy_candidate = cand

                # Check Date proximity (+/- 3 days) with identical grand total
                if not fuzzy_candidate and grand_total is not None and cand.grand_total is not None:
                    if abs(float(grand_total) - float(cand.grand_total)) <= 0.50:
                        if invoice_date and cand.invoice_date:
                            try:
                                d1 = datetime.strptime(str(invoice_date)[:10], "%Y-%m-%d")
                                d2 = datetime.strptime(str(cand.invoice_date)[:10], "%Y-%m-%d")
                                if abs((d1 - d2).days) <= 3:
                                    fuzzy_candidate = cand
                            except Exception:
                                pass

            if fuzzy_candidate:
                logger.info(
                    f"Layer 2 Fuzzy Business Duplicate: Supplier '{gstin_clean}' + Current '{norm_current}' "
                    f"suspected duplicate of Invoice {fuzzy_candidate.id} ('{fuzzy_candidate.invoice_number}')"
                )
                return DuplicateType.FUZZY_SUSPECTED_DUPLICATE, fuzzy_candidate

        # 2. Fallback Match for Foreign / Non-GST Suppliers without GSTIN
        elif supplier_name and supplier_name.strip():
            norm_name = re.sub(r"[^A-Za-z0-9]", "", supplier_name).upper()
            generic_names = ("UNKNOWN", "UNKNOWNSUPPLIER", "NA", "NOTAVAILABLE", "NONE", "UNKNOWNVENDOR", "CUSTOMER", "BUYER")
            if len(norm_name) >= 3 and norm_name not in generic_names:
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
                    if cand_name_norm in generic_names:
                        continue
                    cand_inv_norm = cls.normalize_invoice_number(cand.invoice_number)
                    if cand_name_norm == norm_name and cand_inv_norm == norm_current:
                        logger.warning(
                            f"Layer 2 Non-GST Business Duplicate: Supplier '{supplier_name}' + Invoice '{norm_current}' "
                            f"matches existing Invoice {cand.id} (Status: {cand.status.value})"
                        )
                        return DuplicateType.EXACT_BUSINESS_DUPLICATE, cand

        return DuplicateType.NONE, None
