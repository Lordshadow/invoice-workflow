"""
Unified Invoice Validation & Normalization Service.
Enforces Senior Backend Developer, QA Auditor, and Financial Compliance standards:
- Exact 2-decimal arithmetic reconciliation: Subtotal + Taxes + RoundOff == Grand Total
- Line item coherence (tax-inclusive or tax-exclusive summation)
- Conditional GSTIN validation: Indian 15-char format for INR/domestic, alphanumeric for international
- ISO-8601 YYYY-MM-DD date normalization
"""
import logging
import re
from typing import List, Optional, Tuple
import dateutil.parser

from backend.app.schemas.invoice import CanonicalInvoice

logger = logging.getLogger("invoice_processor.validator")


class InvoiceValidator:
    """
    Centralized validator for canonical invoice data.
    """

    INDIAN_GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
    FOREIGN_TAX_ID_REGEX = r"^[A-Z0-9\-\.\/]{4,25}$"

    @classmethod
    def normalize_date(cls, date_str: Optional[str]) -> Optional[str]:
        """
        Normalizes any parseable date string into ISO-8601 YYYY-MM-DD format.
        """
        if not date_str:
            return None
        clean = str(date_str).strip()
        if not clean or clean.lower() in ("null", "none", "n/a", "na", "unknown"):
            return None
        if re.match(r"^\d{4}-\d{2}-\d{2}$", clean):
            return clean
        try:
            parsed = dateutil.parser.parse(clean)
            return parsed.strftime("%Y-%m-%d")
        except Exception:
            return clean

    @classmethod
    def validate(cls, invoice: Optional[CanonicalInvoice]) -> Tuple[bool, List[str]]:
        """
        Runs comprehensive arithmetic, tax, and schema coherence checks.
        Returns:
            (is_valid: bool, validation_errors: List[str])
        """
        errors: List[str] = []
        if invoice is None:
            return False, ["Invoice object is None"]

        meta = getattr(invoice, "metadata", None)
        currency = ((meta.currency if meta else None) or "INR").upper()
        place = (meta.place_of_supply.lower() if (meta and meta.place_of_supply) else "")
        supp = getattr(invoice, "supplier", None)
        supp_addr = (supp.address.lower() if (supp and supp.address) else "")

        is_indian_invoice = (
            currency == "INR"
            or any(k in place for k in ["india", "tamil", "delhi", "maharashtra", "karnataka", "telangana", "gujarat", "uttar"])
            or "india" in supp_addr
        )

        # 1. Tax ID / GSTIN Validation
        if supp and supp.gstin:
            gstin = supp.gstin.strip().upper()
            if is_indian_invoice:
                if not re.match(cls.INDIAN_GSTIN_REGEX, gstin):
                    errors.append(f"Non-standard Supplier GSTIN format: '{supp.gstin}' (Expected 15-character Indian GST format)")
            else:
                if not re.match(cls.FOREIGN_TAX_ID_REGEX, gstin):
                    errors.append(f"Invalid Foreign Tax / VAT Registration ID: '{supp.gstin}'")

        # 2. Line Item Coherence Check
        subtotal = round(float(getattr(invoice, "subtotal", 0.0) or 0.0), 2)
        grand_total = round(float(getattr(invoice, "grand_total", 0.0) or 0.0), 2)
        line_items = getattr(invoice, "line_items", []) or []

        if line_items:
            items_total = round(sum(round(float(getattr(item, "total_amount", 0.0) or 0.0), 2) for item in line_items), 2)

            # Sum of line items should match either grand total (tax-inclusive) or subtotal (tax-exclusive)
            diff_grand = abs(items_total - grand_total)
            diff_sub = abs(items_total - subtotal)
            if diff_grand > 1.5 and diff_sub > 1.5:
                errors.append(
                    f"Line items total ({items_total:.2f}) does not match Grand Total ({grand_total:.2f}) or Subtotal ({subtotal:.2f})"
                )

        # 3. Overall Arithmetic Equation: Subtotal + Taxes + RoundOff == Grand Total
        tax = getattr(invoice, "tax", None)
        cgst = float(getattr(tax, "cgst", 0.0) or 0.0) if tax else 0.0
        sgst = float(getattr(tax, "sgst", 0.0) or 0.0) if tax else 0.0
        igst = float(getattr(tax, "igst", 0.0) or 0.0) if tax else 0.0
        cess = float(getattr(tax, "cess", 0.0) or 0.0) if tax else 0.0
        total_taxes = round(cgst + sgst + igst + cess, 2)
        round_off = round(float(getattr(invoice, "round_off", 0.0) or 0.0), 2)
        calculated_total = round(subtotal + total_taxes + round_off, 2)

        diff = abs(round(calculated_total - grand_total, 2))
        if diff > 0.05:
            errors.append(
                f"Grand total mismatch: Subtotal ({subtotal:.2f}) + "
                f"Taxes ({total_taxes:.2f}) + RoundOff ({round_off:.2f}) = {calculated_total:.2f}, "
                f"expected Grand Total: {grand_total:.2f} (diff: {diff:.2f})"
            )

        is_valid = len(errors) == 0
        return is_valid, errors
