/**
 * Strictly Typed Interfaces for Enterprise Invoice Processing & ERP Delivery
 */

export type InvoiceStatus =
  | 'RECEIVED'
  | 'PREPROCESSING'
  | 'EXTRACTING'
  | 'NORMALIZING'
  | 'VALIDATING'
  | 'PENDING_APPROVAL'
  | 'PENDING_CORRECTION'
  | 'DUPLICATE_INVESTIGATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUSH_QUEUED'
  | 'POSTING'
  | 'DELIVERED'
  | 'PUSH_FAILED';

export type UserRole = 'ACCOUNTANT' | 'APPROVER' | 'SUPERVISOR';

export interface UserSession {
  username: string;
  role: UserRole;
  fullName: string;
  title?: string;
  email?: string;
  department?: string;
}

export interface LineItem {
  id?: string;
  description: string;
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  changes?: Record<string, unknown> | null;
  timestamp: string;
}

export interface ExtractionLogEntry {
  id: string;
  provider: string;
  model_name: string;
  latency_ms: number;
  created_at: string;
}

export interface InvoiceSummary {
  id: string;
  document_id: string;
  file_name?: string | null;
  status: InvoiceStatus;
  supplier_name?: string | null;
  supplier_gstin?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency: string;
  grand_total: number;
  confidence_score: number;
  is_valid: boolean;
  is_escalated: boolean;
  escalation_reason?: string | null;
  escalation_category?: string | null;
  version: number;
  created_at: string;
}

export interface InvoiceDetail {
  id: string;
  document_id: string;
  file_name?: string | null;
  file_path?: string | null;
  file_hash?: string | null;
  status: InvoiceStatus;
  supplier_name?: string | null;
  supplier_gstin?: string | null;
  supplier_address?: string | null;
  buyer_name?: string | null;
  buyer_gstin?: string | null;
  buyer_address?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  currency: string;
  place_of_supply?: string | null;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  round_off: number;
  grand_total: number;
  confidence_score: number;
  is_valid: boolean;
  is_escalated: boolean;
  escalation_reason?: string | null;
  escalation_category?: string | null;
  validation_errors: string[];
  extraction_notes?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  line_items: LineItem[];
  extractions: ExtractionLogEntry[];
  audit_logs: AuditLogEntry[];
}

export interface EscalationStats {
  total_invoices: number;
  escalated_count: number;
  clean_count: number;
  delivered_count: number;
  stp_rate_percentage: number;
  category_breakdown: Record<string, number>;
  total_gross_value: number;
  delivered_gross_value: number;
  average_invoice_value: number;
  channel_breakdown: Record<string, number>;
  mime_breakdown: Record<string, number>;
  avg_confidence_score: number;
  zero_conflict_rate: number;
  hourly_throughput: number[];
}

export interface CompanyInvoiceLine {
  item_description: string;
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CompanyInvoice {
  id: string;
  ext_reference_id: string;
  supplier_gstin?: string | null;
  supplier_name: string;
  invoice_number: string;
  invoice_date?: string | null;
  currency: string;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  posted_at: string;
  lines: CompanyInvoiceLine[];
}

export interface ProcessInvoiceResult {
  success: boolean;
  document_id: string;
  invoice_id?: string | null;
  file_name: string;
  file_hash: string;
  status: InvoiceStatus;
  duplicate_type: string;
  duplicate_of_id?: string | null;
  validation_passed: boolean;
  validation_errors: string[];
  grand_total: number;
  currency: string;
  is_escalated: boolean;
  escalation_reason?: string | null;
  escalation_category?: string | null;
  delivered_to_target: boolean;
  message: string;
}

export interface SampleInvoiceFile {
  filename: string;
  title: string;
  description: string;
  type: string;
  stp_eligible: boolean;
  size_kb: number;
}

