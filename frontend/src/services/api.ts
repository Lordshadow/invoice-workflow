/**
 * API Service Client for Invoice Ingestion & Lifecycle API
 */

import type {
  CompanyInvoice,
  EscalationStats,
  InvoiceDetail,
  InvoiceStatus,
  InvoiceSummary,
  LineItem,
  ProcessInvoiceResult,
  SampleInvoiceFile,
  UserSession,
} from '../types/invoice';

const BASE_URL = '/api/v1';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    let errorData = null;
    try {
      errorData = await response.json();
      if (errorData && typeof errorData === 'object') {
        if ('detail' in errorData) {
          errorDetail = String((errorData as { detail: unknown }).detail);
        } else if ('error' in errorData && typeof (errorData as { error: { message?: string } }).error === 'object') {
          errorDetail = (errorData as { error: { message?: string } }).error.message || errorDetail;
        }
      }
    } catch {
      // response wasn't JSON
    }
    throw new ApiError(response.status, errorDetail, errorData);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Query invoices list
  async getInvoices(params: {
    status?: InvoiceStatus | string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<InvoiceSummary[]> {
    const q = new URLSearchParams();
    if (params.status && params.status !== 'ALL') q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));

    const qs = q.toString();
    return request<InvoiceSummary[]>(`/invoices${qs ? `?${qs}` : ''}`);
  },

  // Query escalated invoices for human review
  async getEscalatedInvoices(params: {
    category?: string;
    status?: InvoiceStatus | string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<InvoiceSummary[]> {
    const q = new URLSearchParams();
    if (params.category && params.category !== 'ALL') q.set('category', params.category);
    if (params.status && params.status !== 'ALL') q.set('status', params.status);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));

    const qs = q.toString();
    return request<InvoiceSummary[]>(`/invoices/escalated${qs ? `?${qs}` : ''}`);
  },

  // Query pipeline metrics
  async getEscalationStats(): Promise<EscalationStats> {
    return request<EscalationStats>('/invoices/escalation-stats');
  },

  // Query full invoice details
  async getInvoiceDetail(id: string): Promise<InvoiceDetail> {
    return request<InvoiceDetail>(`/invoices/${id}`);
  },

  // Get stream file URL (raw document file)
  getInvoiceFileUrl(id: string, download: boolean = false): string {
    return `${BASE_URL}/invoices/${id}/file${download ? '?download=true' : ''}`;
  },

  // Get high-res rendered raster preview URL (PDF/DOCX/Image rendered server-side)
  getInvoicePreviewUrl(id: string, page: number = 1): string {
    return `${BASE_URL}/invoices/${id}/preview?page=${page}`;
  },

  // Update & re-validate invoice
  async updateInvoice(
    id: string,
    data: {
      actor: string;
      expected_version: number;
      notes?: string;
      supplier_name?: string | null;
      supplier_gstin?: string | null;
      supplier_address?: string | null;
      buyer_name?: string | null;
      buyer_gstin?: string | null;
      buyer_address?: string | null;
      invoice_number?: string | null;
      invoice_date?: string | null;
      due_date?: string | null;
      currency?: string | null;
      place_of_supply?: string | null;
      subtotal?: number | null;
      cgst?: number | null;
      sgst?: number | null;
      igst?: number | null;
      cess?: number | null;
      round_off?: number | null;
      grand_total?: number | null;
      line_items?: LineItem[];
    }
  ): Promise<InvoiceDetail> {
    return request<InvoiceDetail>(`/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Maker-Checker Approval
  async approveInvoice(
    id: string,
    payload: {
      actor: string;
      expected_version: number;
      notes?: string;
    }
  ): Promise<InvoiceDetail> {
    return request<InvoiceDetail>(`/invoices/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // Reject invoice
  async rejectInvoice(
    id: string,
    payload: {
      actor: string;
      reason: string;
      expected_version?: number;
    }
  ): Promise<InvoiceDetail> {
    return request<InvoiceDetail>(`/invoices/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // Manual Escalate
  async escalateInvoice(
    id: string,
    payload: {
      actor: string;
      reason: string;
      category?: string;
      expected_version?: number;
    }
  ): Promise<InvoiceDetail> {
    return request<InvoiceDetail>(`/invoices/${id}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // De-escalate
  async deEscalateInvoice(
    id: string,
    payload: {
      actor: string;
      notes?: string;
      expected_version?: number;
    }
  ): Promise<InvoiceDetail> {
    return request<InvoiceDetail>(`/invoices/${id}/de-escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // Upload and process invoice document
  async uploadInvoice(
    file: File,
    source: string = 'manual_upload',
    enableStp: boolean = true
  ): Promise<ProcessInvoiceResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', source);
    formData.append('enable_stp', String(enableStp));

    const response = await fetch(`${BASE_URL}/invoices/process`, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      let detail = `Upload failed with status ${response.status}`;
      let errData = null;
      try {
        errData = await response.json();
        if (errData && errData.detail) {
          if (typeof errData.detail === 'string') {
            detail = errData.detail;
          } else if (typeof errData.detail === 'object' && errData.detail !== null) {
            const d = errData.detail as { message?: string };
            detail = d.message || JSON.stringify(errData.detail);
          }
        }
      } catch {
        // ignore
      }
      throw new ApiError(response.status, detail, errData);
    }

    return response.json() as Promise<ProcessInvoiceResult>;
  },

  // Destination Target ERP Inspection
  async getTargetCompanyInvoices(limit: number = 50, offset: number = 0): Promise<CompanyInvoice[]> {
    return request<CompanyInvoice[]>(`/target-company/invoices?limit=${limit}&offset=${offset}`);
  },

  // Authenticate Corporate User
  async login(username: string, password: string): Promise<{ token: string; user: UserSession }> {
    return request<{ token: string; user: UserSession }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },

  // List Available Corporate Personas
  async listPersonas(): Promise<UserSession[]> {
    return request<UserSession[]>('/auth/users');
  },

  // Curated Sample Invoices
  async getSampleInvoices(): Promise<SampleInvoiceFile[]> {
    return request<SampleInvoiceFile[]>('/invoices/samples/list');
  },

  // Download Sample Invoice as File/Blob
  async downloadSampleFile(filename: string): Promise<File> {
    const res = await fetch(`${BASE_URL}/invoices/samples/${encodeURIComponent(filename)}/download`);
    if (!res.ok) {
      throw new ApiError(res.status, `Failed to download sample file ${filename}`);
    }
    const blob = await res.blob();
    const mimeType = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    return new File([blob], filename, { type: mimeType });
  },
};
