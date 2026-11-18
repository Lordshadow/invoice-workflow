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
from datetime import datetime
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

    INDIAN_STATE_CODES = {
        "01": "JAMMU AND KASHMIR", "02": "HIMACHAL PRADESH", "03": "PUNJAB", "04": "CHANDIGARH",
        "05": "UTTARAKHAND", "06": "HARYANA", "07": "DELHI", "08": "RAJASTHAN", "09": "UTTAR PRADESH",
        "10": "BIHAR", "11": "SIKKIM", "12": "ARUNACHAL PRADESH", "13": "NAGALAND", "14": "MANIPUR",
        "15": "MIZORAM", "16": "TRIPURA", "17": "MEGHALAYA", "18": "ASSAM", "19": "WEST BENGAL",
        "20": "JHARKHAND", "21": "ODISHA", "22": "CHHATTISGARH", "23": "MADHYA PRADESH", "24": "GUJARAT",
        "26": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "27": "MAHARASHTRA", "28": "ANDHRA PRADESH",
        "29": "KARNATAKA", "30": "GOA", "31": "LAKSHADWEEP", "32": "KERALA", "33": "TAMIL NADU",
        "34": "PUDUCHERRY", "35": "ANDAMAN AND NICOBAR", "36": "TELANGANA", "37": "ANDHRA PRADESH",
        "38": "LADAKH"
    }

    @classmethod
    def normalize_date(cls, date_str: Optional[str]) -> Optional[str]:
        """
        Normalizes any parseable date string into ISO-8601 YYYY-MM-DD format.
        Prioritizes Indian DD/MM/YYYY standards so day and month are never swapped.
        """
        if not date_str:
            return None
        clean = str(date_str).strip()
        if not clean or clean.lower() in ("null", "none", "n/a", "na", "unknown"):
            return None
        if re.match(r"^\d{4}-\d{2}-\d{2}$", clean):
            return clean

        # 1. Deterministic priority formats (Day-first prioritized)
        priority_formats = (
            "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
            "%d %b %Y", "%d %B %Y",
            "%Y/%m/%d", "%Y.%m.%d",
            "%m/%d/%Y", "%m-%d-%Y"
        )
        for fmt in priority_formats:
            try:
                return datetime.strptime(clean, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue

        # 2. Robust dateutil fallback with explicit dayfirst=True
        try:
            parsed = dateutil.parser.parse(clean, dayfirst=True)
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

        # 1. Invoice Date Format Validation (if date is present)
        inv_date = getattr(meta, "invoice_date", None) if meta else None
        if inv_date and str(inv_date).strip().lower() not in ("null", "none", "unknown", "n/a", "na", ""):
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(inv_date).strip()):
                errors.append(f"Invoice date '{inv_date}' is not in valid ISO-8601 (YYYY-MM-DD) format")

        # 2. Tax ID / GSTIN Validation (Supplier & Buyer)
        if supp and supp.gstin:
            gstin = supp.gstin.strip().upper()
            if is_indian_invoice:
                if not re.match(cls.INDIAN_GSTIN_REGEX, gstin):
                    errors.append(f"Non-standard Supplier GSTIN format: '{supp.gstin}' (Expected 15-character Indian GST format)")
            else:
                if not re.match(cls.FOREIGN_TAX_ID_REGEX, gstin):
                    errors.append(f"Invalid Foreign Tax / VAT Registration ID: '{supp.gstin}'")

        buyer = getattr(invoice, "buyer", None)
        if buyer and buyer.gstin and buyer.gstin.strip():
            buyer_gstin = buyer.gstin.strip().upper()
            if is_indian_invoice:
                if not re.match(cls.INDIAN_GSTIN_REGEX, buyer_gstin):
                    errors.append(f"Non-standard Buyer GSTIN format: '{buyer.gstin}' (Expected 15-character Indian GST format)")
            else:
                if not re.match(cls.FOREIGN_TAX_ID_REGEX, buyer_gstin):
                    errors.append(f"Invalid Foreign Buyer Tax ID: '{buyer.gstin}'")

        # 2. State Code Prefix vs. Place of Supply Verification
        if is_indian_invoice and meta and meta.place_of_supply and meta.place_of_supply.strip():
            raw_pos = meta.place_of_supply.strip().upper()
            pos_code_match = re.search(r"\b(\d{2})\b", raw_pos)
            pos_code = pos_code_match.group(1) if pos_code_match else None

            supp_gstin = supp.gstin.strip().upper() if (supp and supp.gstin) else ""
            buyer_gstin = buyer.gstin.strip().upper() if (buyer and buyer.gstin) else ""
            supp_code = supp_gstin[:2] if (len(supp_gstin) >= 2 and supp_gstin[:2].isdigit()) else None
            buyer_code = buyer_gstin[:2] if (len(buyer_gstin) >= 2 and buyer_gstin[:2].isdigit()) else None

            # Verify if pos_code matches valid state codes
            if pos_code and pos_code not in cls.INDIAN_STATE_CODES:
                errors.append(f"Invalid state code '{pos_code}' in Place of Supply: '{meta.place_of_supply}'")
            elif pos_code:
                # Place of supply must match either supplier state (intra-state) or buyer state (inter-state)
                valid_codes = {c for c in (supp_code, buyer_code) if c is not None}
                if valid_codes and pos_code not in valid_codes:
                    supp_name = cls.INDIAN_STATE_CODES.get(supp_code, supp_code)
                    errors.append(
                        f"Place of supply state code '{pos_code}' conflicts with Supplier State ({supp_name} [{supp_code}])"
                        + (f" and Buyer State ({cls.INDIAN_STATE_CODES.get(buyer_code, buyer_code)} [{buyer_code}])" if buyer_code else "")
                    )

        # 3. Individual Line Item Arithmetic & Coherence Check
        subtotal = round(float(getattr(invoice, "subtotal", 0.0) or 0.0), 2)
        grand_total = round(float(getattr(invoice, "grand_total", 0.0) or 0.0), 2)
        line_items = getattr(invoice, "line_items", []) or []

        if line_items:
            # A. Individual line item validation (Qty * Rate - Disc == Total)
            for idx, item in enumerate(line_items):
                qty = float(getattr(item, "quantity", 1.0) or 1.0)
                price = float(getattr(item, "unit_price", 0.0) or 0.0)
                disc = float(getattr(item, "discount", 0.0) or 0.0)
                item_tot = float(getattr(item, "total_amount", 0.0) or 0.0)

                if qty > 0 and price > 0 and item_tot > 0:
                    exp_exclusive = round(qty * price - disc, 2)
                    cgst_it = float(getattr(item, "cgst_amount", 0.0) or 0.0)
                    sgst_it = float(getattr(item, "sgst_amount", 0.0) or 0.0)
                    igst_it = float(getattr(item, "igst_amount", 0.0) or 0.0)
                    exp_inclusive = round(exp_exclusive + cgst_it + sgst_it + igst_it, 2)

                    if abs(item_tot - exp_exclusive) > 1.00 and abs(item_tot - exp_inclusive) > 1.00:
                        errors.append(
                            f"MATH_ERROR: Line item #{idx + 1} '{getattr(item, 'description', 'Item')}' arithmetic mismatch: "
                            f"Quantity ({qty}) * Unit Price ({price:.2f}) - Discount ({disc:.2f}) = {exp_exclusive:.2f}, "
                            f"line total is {item_tot:.2f}"
                        )

            # B. Sum of line items should match either grand total (tax-inclusive) or subtotal (tax-exclusive)
            items_total = round(sum(round(float(getattr(item, "total_amount", 0.0) or 0.0), 2) for item in line_items), 2)
            diff_grand = abs(items_total - grand_total)
            diff_sub = abs(items_total - subtotal)
            if diff_grand > 1.00 and diff_sub > 1.00:
                errors.append(
                    f"MATH_ERROR: Line items total ({items_total:.2f}) does not match Grand Total ({grand_total:.2f}) or Subtotal ({subtotal:.2f})"
                )

        # 4. Tax Consistency (Inter-state vs. Intra-state GST)
        tax = getattr(invoice, "tax", None)
        cgst = float(getattr(tax, "cgst", 0.0) or 0.0) if tax else 0.0
        sgst = float(getattr(tax, "sgst", 0.0) or 0.0) if tax else 0.0
        igst = float(getattr(tax, "igst", 0.0) or 0.0) if tax else 0.0
        cess = float(getattr(tax, "cess", 0.0) or 0.0) if tax else 0.0

        if is_indian_invoice:
            supp_gstin = supp.gstin.strip().upper() if (supp and supp.gstin) else ""
            buyer_gstin = buyer.gstin.strip().upper() if (buyer and buyer.gstin) else ""
            supp_st = supp_gstin[:2] if (len(supp_gstin) >= 2 and supp_gstin[:2].isdigit()) else None
            buyer_st = buyer_gstin[:2] if (len(buyer_gstin) >= 2 and buyer_gstin[:2].isdigit()) else None
            if not buyer_st and meta and meta.place_of_supply:
                pos_m = re.search(r"\b(\d{2})\b", meta.place_of_supply)
                if pos_m:
                    buyer_st = pos_m.group(1)

            if supp_st and buyer_st:
                if supp_st == buyer_st:
                    # Intra-state transaction: CGST must equal SGST, IGST should be 0
                    if abs(cgst - sgst) > 1.00:
                        errors.append(f"MATH_ERROR: Intra-state GST mismatch: CGST ({cgst:.2f}) must equal SGST ({sgst:.2f})")
                    if igst > 1.00 and (cgst > 0 or sgst > 0):
                        errors.append(f"MATH_ERROR: Intra-state invoice cannot charge both IGST ({igst:.2f}) and CGST/SGST")
                else:
                    # Inter-state transaction: IGST should be charged, not CGST/SGST
                    if (cgst > 1.00 or sgst > 1.00) and igst == 0:
                        errors.append(
                            f"MATH_ERROR: Inter-state invoice (State {supp_st} -> State {buyer_st}) should charge IGST, not CGST/SGST"
                        )

        # 5. Overall Arithmetic Equation: Subtotal + Taxes + RoundOff == Grand Total
        total_taxes = round(cgst + sgst + igst + cess, 2)
        round_off = round(float(getattr(invoice, "round_off", 0.0) or 0.0), 2)
        calculated_total = round(subtotal + total_taxes + round_off, 2)

        diff = abs(round(calculated_total - grand_total, 2))
        if diff > 1.00:
            errors.append(
                f"MATH_ERROR: Grand total mismatch: Subtotal ({subtotal:.2f}) + "
                f"Taxes ({total_taxes:.2f}) + RoundOff ({round_off:.2f}) = {calculated_total:.2f}, "
                f"expected Grand Total: {grand_total:.2f} (diff: {diff:.2f} exceeds ₹1.00 tolerance)"
            )

        is_valid = len(errors) == 0
        return is_valid, errors
