"""
Canonical Pydantic Schemas for AI Invoice Extraction.
Standardizes invoice headers, line items, Indian GST taxes, and totals across all extraction providers.
"""
from datetime import datetime
from typing import List, Optional
from dateutil import parser
from pydantic import BaseModel, Field, field_validator


class SupplierDetails(BaseModel):
    name: str = Field(description="Legal or trade name of the supplier/vendor")
    gstin: Optional[str] = Field(default=None, description="15-character Indian GSTIN of the supplier")
    address: Optional[str] = Field(default=None, description="Full registered address of the supplier")
    phone: Optional[str] = Field(default=None, description="Contact phone number")
    email: Optional[str] = Field(default=None, description="Contact email address")


class BuyerDetails(BaseModel):
    name: Optional[str] = Field(default=None, description="Recipient or buyer company name")
    gstin: Optional[str] = Field(default=None, description="15-character Indian GSTIN of the buyer")
    address: Optional[str] = Field(default=None, description="Billing or delivery address of the buyer")


class InvoiceMetadata(BaseModel):
    invoice_number: str = Field(description="Unique invoice/bill/tax invoice number")
    invoice_date: Optional[str] = Field(default=None, description="Invoice issue date in YYYY-MM-DD format")
    due_date: Optional[str] = Field(default=None, description="Payment due date if specified")
    place_of_supply: Optional[str] = Field(default=None, description="Indian state code or name (e.g., '33-Tamil Nadu')")
    currency: str = Field(default="INR", description="ISO currency code (e.g., INR, USD)")

    @field_validator("invoice_date", "due_date", mode="before")
    @classmethod
    def normalize_date(cls, v):
        if not v or not isinstance(v, str):
            return None
        cleaned = v.strip()
        if not cleaned or cleaned.lower() in ("null", "none", "n/a", "unknown"):
            return None
        # Try deterministic parsing
        for fmt in (
            "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y",
            "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%b %d, %Y",
            "%Y/%m/%d", "%d.%m.%Y", "%Y.%m.%d"
        ):
            try:
                dt = datetime.strptime(cleaned, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
        # Fallback to dateutil fuzzy parser
        try:
            dt = parser.parse(cleaned, fuzzy=False)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return cleaned


class LineItem(BaseModel):
    description: str = Field(description="Product, SKU name, or service description")
    hsn_code: Optional[str] = Field(default=None, description="Harmonized System of Nomenclature (HSN/SAC) code")
    quantity: float = Field(default=1.0, description="Quantity of units purchased")
    unit_price: float = Field(default=0.0, description="Rate or unit price per item before tax")
    discount: float = Field(default=0.0, description="Line-level discount amount")
    tax_rate: float = Field(default=0.0, description="Applicable GST rate percentage (e.g., 5.0, 12.0, 18.0, 28.0)")
    cgst_amount: float = Field(default=0.0, description="Central GST amount for this line item")
    sgst_amount: float = Field(default=0.0, description="State GST amount for this line item")
    igst_amount: float = Field(default=0.0, description="Integrated GST amount for this line item")
    total_amount: float = Field(description="Line-item total amount including taxes or after discount")


class TaxBreakdown(BaseModel):
    cgst: float = Field(default=0.0, description="Total Central GST amount")
    sgst: float = Field(default=0.0, description="Total State GST amount")
    igst: float = Field(default=0.0, description="Total Integrated GST amount")
    cess: float = Field(default=0.0, description="Total Compensation Cess amount if applicable")


class CanonicalInvoice(BaseModel):
    supplier: SupplierDetails
    buyer: Optional[BuyerDetails] = None
    metadata: InvoiceMetadata
    line_items: List[LineItem] = Field(default_factory=list, description="Extracted line items")
    subtotal: float = Field(default=0.0, description="Taxable subtotal before taxes and round-off")
    tax: TaxBreakdown = Field(default_factory=TaxBreakdown, description="Tax amount breakdown")
    round_off: float = Field(default=0.0, description="Rounding adjustment (+/- value)")
    grand_total: float = Field(description="Final payable invoice amount")
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0, description="Extraction confidence score")
    extraction_notes: Optional[str] = Field(default=None, description="Diagnostic notes or warning flags from extraction")


class ExtractionResponse(BaseModel):
    success: bool
    provider: str = Field(description="'gemini_api', 'vertex_ai', 'b2b_qr', or 'mock'")
    model_name: str
    latency_ms: float
    invoice: Optional[CanonicalInvoice] = None
    validation_passed: bool = False
    validation_errors: List[str] = Field(default_factory=list)
    raw_response: Optional[dict] = None
    error_message: Optional[str] = None
