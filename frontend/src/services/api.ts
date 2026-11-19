/**
 * API Service Client for Invoice Ingestion & Lifecycle API
 */

import type {
  AdminRegisterStaffRequest,
  CompanyInvoice,
  EscalationStats,
  InvoiceDetail,
  InvoiceStatus,
  InvoiceSummary,
  LineItem,
  ProcessInvoiceResult,
  RegisterStaffRequest,
  SampleInvoiceFile,
  StaffListResponse,
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
  const token = localStorage.getItem('lf_token');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
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

  // Authenticate Corporate User (dispatches 2FA if enabled)
  async login(username: string, password: string): Promise<{
    requires_2fa?: boolean;
    pre_auth_token?: string;
    masked_email?: string;
    expires_in_seconds?: number;
    dev_otp_hint?: string;
    message?: string;
    token?: string;
    user?: UserSession;
  }> {
    const res = await request<{
      requires_2fa?: boolean;
      pre_auth_token?: string;
      masked_email?: string;
      expires_in_seconds?: number;
      dev_otp_hint?: string;
      message?: string;
      token?: string;
      user?: UserSession;
    }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.token && res.user) {
      localStorage.setItem('lf_token', res.token);
      localStorage.setItem('lf_user', JSON.stringify(res.user));
    }
    return res;
  },

  // Verify 6-Digit 2FA OTP Code
  async verifyOtp(preAuthToken: string, otpCode: string): Promise<{ token: string; user: UserSession; message: string }> {
    const res = await request<{ token: string; user: UserSession; message: string }>('/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_auth_token: preAuthToken, otp_code: otpCode }),
    });
    if (res.token && res.user) {
      localStorage.setItem('lf_token', res.token);
      localStorage.setItem('lf_user', JSON.stringify(res.user));
    }
    return res;
  },

  // Resend Fresh 2FA OTP Code
  async resendOtp(preAuthToken: string): Promise<{ success: boolean; message: string; expires_in_seconds?: number; dev_otp_hint?: string }> {
    return request<{ success: boolean; message: string; expires_in_seconds?: number; dev_otp_hint?: string }>('/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_auth_token: preAuthToken }),
    });
  },

  // Staff Self-Registration
  async register(payload: RegisterStaffRequest): Promise<{ success: boolean; user_id: string; message: string }> {
    return request<{ success: boolean; user_id: string; message: string }>('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // Log Out Corporate User
  logout(): void {
    localStorage.removeItem('lf_token');
    localStorage.removeItem('lf_user');
  },

  // Admin Staff Management Endpoints
  async listStaff(statusFilter?: string): Promise<StaffListResponse> {
    const q = statusFilter && statusFilter !== 'ALL' ? `?status_filter=${statusFilter}` : '';
    return request<StaffListResponse>(`/admin/staff${q}`);
  },

  async approveStaff(
    userId: string,
    approvedRole: string,
    department?: string,
    notes?: string
  ): Promise<UserSession> {
    return request<UserSession>(`/admin/staff/${userId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_role: approvedRole, department, notes }),
    });
  },

  async rejectStaff(userId: string, reason?: string): Promise<UserSession> {
    const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return request<UserSession>(`/admin/staff/${userId}/reject${q}`, {
      method: 'POST',
    });
  },

  async updateStaffRole(userId: string, role: string): Promise<UserSession> {
    return request<UserSession>(`/admin/staff/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  },

  async updateStaffStatus(userId: string, status: string, reason?: string): Promise<UserSession> {
    return request<UserSession>(`/admin/staff/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    });
  },

  async deleteStaff(userId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/admin/staff/${userId}`, {
      method: 'DELETE',
    });
  },

  async adminRegisterStaff(payload: AdminRegisterStaffRequest): Promise<UserSession> {
    return request<UserSession>('/admin/staff/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
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
