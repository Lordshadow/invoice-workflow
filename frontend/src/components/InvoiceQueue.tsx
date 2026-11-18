import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  XCircle, 
  ShieldAlert, 
  FileText,
  RotateCw
} from 'lucide-react';
import type { InvoiceStatus, InvoiceSummary } from '../types/invoice';

interface InvoiceQueueProps {
  invoices: InvoiceSummary[];
  loading: boolean;
  onSelectInvoice: (invoiceId: string) => void;
  onRefresh: () => void;
  selectedFilter: string;
  onFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const InvoiceQueue: React.FC<InvoiceQueueProps> = ({
  invoices,
  loading,
  onSelectInvoice,
  onRefresh,
  selectedFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const getStatusBadge = (status: InvoiceStatus, isEscalated: boolean) => {
    if (isEscalated && status !== 'DELIVERED' && status !== 'APPROVED' && status !== 'REJECTED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-800 border border-amber-500/40 shadow-xs">
          <AlertCircle className="w-3 h-3 mr-1" />
          Review Required
        </span>
      );
    }

    switch (status) {
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-800 border border-emerald-500/40 shadow-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            STP Delivered
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-800 border border-blue-500/40 shadow-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-800 border border-indigo-500/40 shadow-xs">
            <Clock className="w-3 h-3 mr-1" />
            Pending Approval
          </span>
        );
      case 'PENDING_CORRECTION':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-800 border border-amber-500/40 shadow-xs">
            <AlertCircle className="w-3 h-3 mr-1" />
            Math Correction
          </span>
        );
      case 'DUPLICATE_INVESTIGATION':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-yellow-500/20 text-yellow-800 border border-yellow-500/40 shadow-xs">
            <ShieldAlert className="w-3 h-3 mr-1" />
            Duplicate Suspect
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-800 border border-rose-500/40 shadow-xs">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700">
            {status}
          </span>
        );
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (categoryFilter !== 'ALL') {
      if (inv.escalation_category !== categoryFilter) return false;
    }
    return true;
  });

  return (
    <section className="liquid-card-frosted p-6 mb-8 border-white/80 shadow-xl">
      {/* Table Controls Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5">
        {/* Status Filter Tabs (Single clean horizontal row with smooth scroll) */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/60 border border-white/80 shadow-xs overflow-x-auto whitespace-nowrap max-w-full">
          {[
            { id: 'ALL', label: 'All Invoices' },
            { id: 'ESCALATED', label: 'Action Required' },
            { id: 'PENDING_APPROVAL', label: 'Pending Approval' },
            { id: 'DELIVERED', label: 'Delivered (STP)' },
            { id: 'REJECTED', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onFilterChange(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-700 hover:text-indigo-900 hover:bg-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar & Refresh Button */}
        <div className="flex items-center space-x-2.5">
          <div className="relative w-64 md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search vendor, invoice #, GSTIN..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl liquid-input placeholder-slate-500 font-medium"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh queue"
            className="p-2.5 rounded-xl liquid-pill text-slate-700 hover:text-indigo-900 border-white/80 disabled:opacity-50"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-category filter pills if Escalated / Action Required is active */}
      {selectedFilter === 'ESCALATED' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-bold text-slate-700 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1" />
            Reason:
          </span>
          {[
            { id: 'ALL', label: 'All Reasons' },
            { id: 'MATH_MISMATCH', label: 'Arithmetic Discrepancy' },
            { id: 'HIGH_VALUE_AUDIT', label: 'High Value (> ₹50,000)' },
            { id: 'DUPLICATE_SUSPECT', label: 'Duplicate Suspect' },
            { id: 'MISSING_FIELDS', label: 'Missing Fields' },
            { id: 'LOW_CONFIDENCE', label: 'Low AI Confidence' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                categoryFilter === cat.id
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white/60 text-slate-700 hover:bg-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Data Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/30 backdrop-blur-md">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-300/60 bg-white/50 text-slate-600 uppercase tracking-wider text-[10px] font-bold">
              <th className="py-3 px-4">Document / Invoice #</th>
              <th className="py-3 px-4">Supplier & GSTIN</th>
              <th className="py-3 px-4">Invoice Date</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-center">AI Confidence</th>
              <th className="py-3 px-4 text-center">Lifecycle Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {loading && filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-600">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <RotateCw className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="font-semibold">Loading invoice vouchers...</span>
                  </div>
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-600">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <FileText className="w-8 h-8 text-slate-400" />
                    <span className="text-sm font-bold text-slate-800">No invoices in this queue</span>
                    <span className="text-xs text-slate-500">
                      {searchQuery
                        ? `No records matching "${searchQuery}"`
                        : 'No invoice documents present in this queue.'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => onSelectInvoice(inv.id)}
                  className="hover:bg-white/50 transition-colors cursor-pointer group"
                >
                  {/* Invoice & Document Name */}
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors flex items-center space-x-1.5">
                      <span>{inv.invoice_number || 'UNKNOWN #'}</span>
                      {inv.is_escalated && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Human Review Required" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate max-w-xs" title={inv.file_name || ''}>
                      {inv.file_name || 'Uploaded Document'}
                    </div>
                  </td>

                  {/* Supplier & GSTIN */}
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">
                      {inv.supplier_name || 'Unknown Supplier'}
                    </div>
                    {inv.supplier_gstin ? (
                      <div className="text-[10px] text-slate-600 font-mono tracking-wide">
                        {inv.supplier_gstin}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic">No GSTIN</div>
                    )}
                  </td>

                  {/* Date */}
                  <td className="py-3 px-4 text-slate-700 font-medium">
                    {inv.invoice_date || '—'}
                  </td>

                  {/* Amount */}
                  <td className="py-3 px-4 text-right">
                    <div className="font-extrabold text-slate-900 font-mono">
                      ₹{inv.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {inv.currency}
                    </div>
                  </td>

                  {/* Confidence */}
                  <td className="py-3 px-4 text-center">
                    <div className="inline-flex items-center space-x-1.5">
                      <div className="w-16 h-1.5 rounded-full bg-slate-300/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            inv.confidence_score >= 0.9
                              ? 'bg-emerald-500'
                              : inv.confidence_score >= 0.75
                              ? 'bg-amber-400'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.round(inv.confidence_score * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono font-bold text-slate-700">
                        {Math.round(inv.confidence_score * 100)}%
                      </span>
                    </div>
                  </td>

                  {/* Lifecycle Status */}
                  <td className="py-3 px-4 text-center">
                    <div className="flex flex-col items-center space-y-1">
                      {getStatusBadge(inv.status, inv.is_escalated)}
                      {inv.is_escalated && inv.escalation_reason && (
                        <div 
                          className="text-[10px] text-amber-800 font-medium max-w-[170px] truncate" 
                          title={inv.escalation_reason}
                        >
                          {inv.escalation_reason}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Action */}
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectInvoice(inv.id);
                      }}
                      className="px-3.5 py-1.5 rounded-xl liquid-pill text-xs font-bold text-indigo-700 hover:text-white hover:bg-indigo-600 border-white/80 transition-all flex items-center space-x-1.5 ml-auto cursor-pointer shadow-xs active:scale-95"
                    >
                      <span>Review</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
