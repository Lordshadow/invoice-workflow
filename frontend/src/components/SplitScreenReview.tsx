import React, { useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle, AlertTriangle, RotateCw, X } from 'lucide-react';
import type { InvoiceDetail, LineItem, UserSession } from '../types/invoice';
import { DocumentViewer } from './DocumentViewer';
import { InvoiceEditor } from './InvoiceEditor';
import { api, ApiError } from '../services/api';

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
  const [versionConflict, setVersionConflict] = useState<string | null>(null);
  const [refreshingVersion, setRefreshingVersion] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const handleReloadLatest = async () => {
    try {
      setRefreshingVersion(true);
      const latest = await api.getInvoiceDetail(invoice.id);
      onInvoiceUpdated(latest);
      setVersionConflict(null);
      showToast('success', `Reloaded latest invoice version v${latest.version} successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reload latest version.';
      showToast('error', msg);
    } finally {
      setRefreshingVersion(false);
    }
  };

  const checkAndSetOccError = (err: unknown, defaultMsg: string) => {
    const isOcc =
      (err instanceof ApiError && err.status === 409) ||
      (err instanceof Error &&
        (err.message.includes('version mismatch') ||
          err.message.includes('409') ||
          err.message.toLowerCase().includes('concurrency')));

    const msg = err instanceof Error ? err.message : defaultMsg;
    if (isOcc) {
      setVersionConflict(msg);
    } else {
      showToast('error', msg);
    }
  };

  const handleSaveCorrections = async (
    updates: Partial<InvoiceDetail> & { line_items: LineItem[] }
  ) => {
    try {
      setSaving(true);
      setVersionConflict(null);
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
        cess: updates.cess,
        round_off: updates.round_off,
        grand_total: updates.grand_total,
        line_items: updates.line_items,
      });
      onInvoiceUpdated(res);
      showToast('success', 'Invoice corrections saved & validation re-calculated successfully.');
    } catch (err: unknown) {
      checkAndSetOccError(err, 'Failed to save corrections.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (notes?: string) => {
    try {
      setApproving(true);
      setVersionConflict(null);
      const res = await api.approveInvoice(invoice.id, {
        actor: activeUser.username,
        expected_version: invoice.version,
        notes: notes || `Approved & released by ${activeUser.fullName} (${activeUser.role})`,
      });
      onInvoiceUpdated(res);
      showToast('success', 'Invoice approved and idempotently posted to Target Company ERP Database!');
    } catch (err: unknown) {
      checkAndSetOccError(err, 'Approval failed.');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (reason: string) => {
    try {
      setRejecting(true);
      setVersionConflict(null);
      const res = await api.rejectInvoice(invoice.id, {
        actor: activeUser.username,
        reason,
        expected_version: invoice.version,
      });
      onInvoiceUpdated(res);
      showToast('success', 'Invoice marked as rejected.');
    } catch (err: unknown) {
      checkAndSetOccError(err, 'Rejection failed.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <section className="w-full mx-auto pt-2 pb-8 animate-in fade-in duration-200">
      {/* Toast Alert Notification (Anchored firmly to top-right viewport at z-[100]) */}
      {toast && (
        <div
          className={`fixed top-20 right-6 sm:right-10 z-[100] max-w-md px-4 py-3 rounded-2xl liquid-modal-glass shadow-2xl border flex items-center justify-between space-x-3 text-xs font-bold animate-in fade-in slide-in-from-top-3 backdrop-blur-xl ${
            toast.type === 'success'
              ? 'border-emerald-300/80 bg-emerald-500/15 text-emerald-900 shadow-emerald-500/10'
              : 'border-rose-300/80 bg-rose-500/15 text-rose-900 shadow-rose-500/10'
          }`}
        >
          <div className="flex items-center space-x-2 min-w-0">
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            )}
            <span className="truncate">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Optimistic Concurrency Control (OCC 409) Resolution Banner */}
      {versionConflict && (
        <div className="mb-4 p-4 rounded-2xl liquid-modal-glass border border-amber-400/80 bg-amber-500/15 text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 shadow-lg">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-xs text-amber-950 flex items-center space-x-1.5">
                <span>Optimistic Concurrency Conflict (Stale Version)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-mono font-bold">
                  Active in Editor: v{invoice.version}
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-0.5 font-medium">
                {versionConflict}. Another user or automated STP step has updated this record. Reload to reconcile changes without data loss.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setVersionConflict(null)}
              className="px-3 py-1.5 rounded-xl liquid-pill text-xs font-bold text-slate-600 hover:text-slate-900 border border-white/80 cursor-pointer"
            >
              Dismiss
            </button>
            <button
              onClick={handleReloadLatest}
              disabled={refreshingVersion}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-black shadow-md flex items-center space-x-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${refreshingVersion ? 'animate-spin' : ''}`} />
              <span>{refreshingVersion ? 'Reloading...' : 'Reload Latest Version'}</span>
            </button>
          </div>
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
