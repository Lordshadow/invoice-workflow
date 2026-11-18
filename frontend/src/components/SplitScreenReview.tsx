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
    <section className="w-full mx-auto pt-2 pb-8 animate-in fade-in duration-200">
      {/* Toast Alert Notification */}
      {toast && (
        <div
          className={`fixed top-24 right-8 z-50 px-4 py-3 rounded-2xl liquid-modal-glass shadow-2xl border flex items-center space-x-2 text-xs font-bold animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'border-emerald-300 text-emerald-800'
              : 'border-rose-300 text-rose-800'
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

      {/* Top Breadcrumb & Controls (Generous clearance beneath sticky navbar) */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-2xl liquid-pill text-xs font-bold text-slate-800 hover:text-indigo-900 flex items-center space-x-1.5 border border-white/80 transition-all shadow-xs cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 text-indigo-600" />
          <span>Back to Registry</span>
        </button>

        <div className="text-xs text-slate-600 font-semibold flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span>Split-Screen Document Review & Maker-Checker Dual Control</span>
        </div>
      </div>

      {/* Responsive Split-Screen Grid: Left Document Viewer, Right Line-Item Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-160px)] min-h-[700px] max-h-[960px]">
        {/* Left Pane: Document Canvas (5 cols on lg, 6 cols on xl) */}
        <div className="lg:col-span-5 xl:col-span-6 h-full flex flex-col min-h-0">
          <DocumentViewer
            invoiceId={invoice.id}
            fileName={invoice.file_name}
          />
        </div>

        {/* Right Pane: Editable Form & Arithmetic Reconciliation (7 cols on lg, 6 cols on xl) */}
        <div className="lg:col-span-7 xl:col-span-6 h-full flex flex-col min-h-0">
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
