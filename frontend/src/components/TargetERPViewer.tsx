import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RotateCw, 
  CheckCircle2, 
  ChevronRight, 
  ChevronDown, 
  Building2 
} from 'lucide-react';
import { api } from '../services/api';
import type { CompanyInvoice } from '../types/invoice';

export const TargetERPViewer: React.FC = () => {
  const [invoices, setInvoices] = useState<CompanyInvoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDelivered = async () => {
    try {
      setLoading(true);
      const data = await api.getTargetCompanyInvoices(50, 0);
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load target company invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDelivered();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section className="max-w-[1600px] mx-auto px-6 mb-12">
      <div className="crystal-card rounded-squircle-lg p-6 shadow-crystal-card border border-white/90">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-indigo-100">
          <div>
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Target Company ERP Database (Ledger Egress)
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Simulated Destination ERP / Financial Accounting Ledger with ACID Idempotency Constraints
            </p>
          </div>

          <button
            onClick={fetchDelivered}
            disabled={loading}
            className="px-4 py-2 rounded-2xl crystal-pill text-xs font-bold text-slate-700 hover:text-indigo-900 flex items-center space-x-1.5 border border-white/80 shadow-sm"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh Ledger</span>
          </button>
        </div>

        {/* Invoices List */}
        {loading && invoices.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <RotateCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
            <span className="text-xs font-medium">Querying destination company_invoices table...</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Database className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-bold text-slate-800">No Postings in Target ERP Ledger</div>
            <p className="text-xs text-slate-500 mt-1">
              Invoices will appear here automatically once Straight-Through Processed (STP) or approved by a human checker.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => {
              const isExpanded = expandedId === inv.id;
              return (
                <div
                  key={inv.id}
                  className="rounded-2xl crystal-card border border-white/80 overflow-hidden shadow-sm"
                >
                  <div
                    onClick={() => toggleExpand(inv.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/80 transition-colors"
                  >
                    {/* Left: Supplier & Invoice Number */}
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-2xl pod-emerald flex items-center justify-center text-white shadow-sm flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-xs">{inv.invoice_number}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Ref: {inv.ext_reference_id.substring(0, 8)}...
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 flex items-center space-x-2 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span className="font-semibold">{inv.supplier_name}</span>
                          {inv.supplier_gstin && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({inv.supplier_gstin})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Amounts & Timestamp */}
                    <div className="flex items-center space-x-6 text-right">
                      <div>
                        <div className="text-xs font-black text-slate-900 font-mono">
                          ₹{inv.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          Tax: ₹{inv.tax_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="text-right hidden sm:block">
                        <div className="text-[11px] text-slate-700 font-semibold">
                          {new Date(inv.posted_at).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(inv.posted_at).toLocaleTimeString()}
                        </div>
                      </div>

                      <div className="text-slate-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Line Items Detail */}
                  {isExpanded && (
                    <div className="px-5 py-3 bg-indigo-50/40 border-t border-indigo-100 text-xs">
                      <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider mb-2">
                        Company Ledger Lines ({inv.lines.length})
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-[10px] text-slate-500 uppercase border-b border-indigo-100 font-bold">
                              <th className="py-1.5 px-2">Description</th>
                              <th className="py-1.5 px-2 w-24">HSN</th>
                              <th className="py-1.5 px-2 w-16 text-right">Qty</th>
                              <th className="py-1.5 px-2 w-24 text-right">Rate</th>
                              <th className="py-1.5 px-2 w-28 text-right">Line Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-indigo-100/60 text-[11px]">
                            {inv.lines.map((line, lidx) => (
                              <tr key={lidx}>
                                <td className="py-1.5 px-2 text-slate-800 font-medium">{line.item_description}</td>
                                <td className="py-1.5 px-2 font-mono text-slate-500">{line.hsn_code || '—'}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-slate-700">{line.quantity}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                                  ₹{line.unit_price.toFixed(2)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                                  ₹{line.line_total.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
