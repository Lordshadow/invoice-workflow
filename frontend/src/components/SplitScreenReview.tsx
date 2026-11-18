import React, { useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import type { InvoiceDetail, LineItem, UserSession } from '../types/invoice';
import { DocumentViewer } from './DocumentViewer';
import { InvoiceEditor } from './InvoiceEditor';
import { api } from '../services/api';

interface SplitScreenReviewProps {
  invoice: InvoiceDetail;
  activeUser: UserSession;
  onBack: () => void;
  onInvoiceUpdated: (updated: InvoiceDetail) => void;
}

export const SplitScreenReview: React.FC<SplitScreenReviewProps> = ({
  invoice,
  activeUser,
  onBack,
  onInvoiceUpdated,
}) => {
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSaveCorrections = async (
    updates: Partial<InvoiceDetail> & { line_items: LineItem[] }
  ) => {
    try {
      setSaving(true);
      const res = await api.updateInvoice(invoice.id, {
        actor: activeUser.username,
        expected_version: invoice.version,
        notes: `Edited by ${activeUser.fullName} (${activeUser.role})`,
        supplier_name: updates.supplier_name,
        supplier_gstin: updates.supplier_gstin,
        supplier_address: updates.supplier_address,
        buyer_name: updates.buyer_name,
        buyer_gstin: updates.buyer_gstin,
        buyer_address: updates.buyer_address,
        invoice_number: updates.invoice_number,
        invoice_date: updates.invoice_date,
        due_date: updates.due_date,
        currency: updates.currency,
        place_of_supply: updates.place_of_supply,
        subtotal: updates.subtotal,
        cgst: updates.cgst,
        sgst: updates.sgst,
        igst: updates.igst,
        round_off: updates.round_off,
        grand_total: updates.grand_total,
        line_items: updates.line_items,
      });
      onInvoiceUpdated(res);
      showToast('success', 'Invoice corrections saved & validation re-calculated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save corrections.';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (notes?: string) => {
    try {
      setApproving(true);
      const res = await api.approveInvoice(invoice.id, {
        actor: activeUser.username,
        expected_version: invoice.version,
        notes: notes || `Approved & released by ${activeUser.fullName} (${activeUser.role})`,
      });
      onInvoiceUpdated(res);
      showToast('success', 'Invoice approved and idempotently posted to Target Company ERP Database!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed.';
      showToast('error', msg);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (reason: string) => {
    try {
      setRejecting(true);
      const res = await api.rejectInvoice(invoice.id, {
        actor: activeUser.username,
        reason,
        expected_version: invoice.version,
      });
      onInvoiceUpdated(res);
      showToast('success', 'Invoice marked as rejected.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed.';
      showToast('error', msg);
    } finally {
      setRejecting(false);
    }
  };

  return (
    <section className="max-w-[1700px] mx-auto px-6 mb-12">
      {/* Toast Alert Notification */}
      {toast && (
        <div
          className={`fixed top-20 right-8 z-50 px-4 py-3 rounded-2xl crystal-card shadow-2xl border flex items-center space-x-2 text-xs font-bold animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'border-emerald-300 text-emerald-800 bg-white/95'
              : 'border-rose-300 text-rose-800 bg-white/95'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Breadcrumb & Controls */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-2xl crystal-pill text-xs font-bold text-slate-700 hover:text-indigo-900 flex items-center space-x-1.5 border border-white/80 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Registry</span>
        </button>

        <div className="text-xs text-slate-500 font-semibold">
          Split-Screen Document Review & Maker-Checker Governance
        </div>
      </div>

      {/* Responsive Split-Screen Grid: Left Document Viewer, Right Line-Item Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)] min-h-[750px]">
        {/* Left Pane: Document Canvas */}
        <div className="h-full">
          <DocumentViewer
            invoiceId={invoice.id}
            fileName={invoice.file_name}
          />
        </div>

        {/* Right Pane: Editable Form & Arithmetic Reconciliation */}
        <div className="h-full">
          <InvoiceEditor
            invoice={invoice}
            activeUser={activeUser}
            onSaveCorrections={handleSaveCorrections}
            onApprove={handleApprove}
            onReject={handleReject}
            saving={saving}
            approving={approving}
            rejecting={rejecting}
          />
        </div>
      </div>
    </section>
  );
};
