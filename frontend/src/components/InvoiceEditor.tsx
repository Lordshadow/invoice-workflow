import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Save, 
  XCircle, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  History, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import type { InvoiceDetail, LineItem, UserSession } from '../types/invoice';

interface InvoiceEditorProps {
  invoice: InvoiceDetail;
  activeUser: UserSession;
  onSaveCorrections: (updatedInvoice: Partial<InvoiceDetail> & { line_items: LineItem[] }) => Promise<void>;
  onApprove: (notes?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  saving: boolean;
  approving: boolean;
  rejecting: boolean;
}

export const InvoiceEditor: React.FC<InvoiceEditorProps> = ({
  invoice,
  activeUser,
  onSaveCorrections,
  onApprove,
  onReject,
  saving,
  approving,
  rejecting,
}) => {
  // Form State
  const [supplierName, setSupplierName] = useState(invoice.supplier_name || '');
  const [supplierGstin, setSupplierGstin] = useState(invoice.supplier_gstin || '');
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number || '');
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date || '');
  const [currency, setCurrency] = useState(invoice.currency || 'INR');
  const [placeOfSupply, setPlaceOfSupply] = useState(invoice.place_of_supply || '');

  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>(
    invoice.line_items.length > 0
      ? invoice.line_items.map((it) => ({ ...it }))
      : [
          {
            description: 'Item 1',
            quantity: 1,
            unit_price: invoice.subtotal || 0,
            discount: 0,
            tax_rate: 18,
            cgst_amount: 0,
            sgst_amount: 0,
            igst_amount: 0,
            total_amount: invoice.subtotal || 0,
          },
        ]
  );

  // Totals state
  const [subtotal, setSubtotal] = useState(invoice.subtotal || 0);
  const [cgst, setCgst] = useState(invoice.cgst || 0);
  const [sgst, setSgst] = useState(invoice.sgst || 0);
  const [igst, setIgst] = useState(invoice.igst || 0);
  const [roundOff, setRoundOff] = useState(invoice.round_off || 0);
  const [grandTotal, setGrandTotal] = useState(invoice.grand_total || 0);

  // UI Drawer State
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Update local state when invoice prop changes
  useEffect(() => {
    setSupplierName(invoice.supplier_name || '');
    setSupplierGstin(invoice.supplier_gstin || '');
    setInvoiceNumber(invoice.invoice_number || '');
    setInvoiceDate(invoice.invoice_date || '');
    setCurrency(invoice.currency || 'INR');
    setPlaceOfSupply(invoice.place_of_supply || '');
    setLineItems(invoice.line_items.map((it) => ({ ...it })));
    setSubtotal(invoice.subtotal || 0);
    setCgst(invoice.cgst || 0);
    setSgst(invoice.sgst || 0);
    setIgst(invoice.igst || 0);
    setRoundOff(invoice.round_off || 0);
    setGrandTotal(invoice.grand_total || 0);
  }, [invoice]);

  // Real-time client-side arithmetic reconciliation (Senior Frontend Developer standard)
  const arithmeticReconciliation = useMemo(() => {
    const computedItemsSubtotal = lineItems.reduce((acc, it) => acc + (Number(it.total_amount) || 0), 0);
    const computedLineCgst = lineItems.reduce((acc, it) => acc + (Number(it.cgst_amount) || 0), 0);
    const computedLineSgst = lineItems.reduce((acc, it) => acc + (Number(it.sgst_amount) || 0), 0);
    const computedLineIgst = lineItems.reduce((acc, it) => acc + (Number(it.igst_amount) || 0), 0);
    const computedLineTaxes = computedLineCgst + computedLineSgst + computedLineIgst;

    const headerTaxSum = (Number(cgst) || 0) + (Number(sgst) || 0) + (Number(igst) || 0);
    const taxSum = headerTaxSum > 0 ? headerTaxSum : computedLineTaxes;
    const computedGrandTotal = computedItemsSubtotal + taxSum + (Number(roundOff) || 0);

    const subtotalVariance = Math.abs(computedItemsSubtotal - (Number(subtotal) || 0));
    const grandTotalVariance = Math.abs(computedGrandTotal - (Number(grandTotal) || 0));

    const isSubtotalBalanced = subtotalVariance <= 1.0;
    const isGrandTotalBalanced = grandTotalVariance <= 1.0;
    const isFullyBalanced = isSubtotalBalanced && isGrandTotalBalanced;

    return {
      computedItemsSubtotal: Math.round(computedItemsSubtotal * 100) / 100,
      computedLineCgst: Math.round(computedLineCgst * 100) / 100,
      computedLineSgst: Math.round(computedLineSgst * 100) / 100,
      computedLineIgst: Math.round(computedLineIgst * 100) / 100,
      computedLineTaxes: Math.round(computedLineTaxes * 100) / 100,
      taxSum: Math.round(taxSum * 100) / 100,
      computedGrandTotal: Math.round(computedGrandTotal * 100) / 100,
      subtotalVariance: Math.round(subtotalVariance * 100) / 100,
      grandTotalVariance: Math.round(grandTotalVariance * 100) / 100,
      isFullyBalanced,
    };
  }, [lineItems, subtotal, cgst, sgst, igst, roundOff, grandTotal]);

  // Line item change handlers
  const handleLineItemChange = (index: number, field: keyof LineItem, value: string | number) => {
    const nextItems = [...lineItems];
    const current = { ...nextItems[index], [field]: value };

    // Auto-calculate line total and GST breakdown when qty, unit price, discount, or tax rate changes
    if (field === 'quantity' || field === 'unit_price' || field === 'discount' || field === 'tax_rate') {
      const q = Number(field === 'quantity' ? value : current.quantity) || 0;
      const p = Number(field === 'unit_price' ? value : current.unit_price) || 0;
      const d = Number(field === 'discount' ? value : current.discount) || 0;
      const rate = Number(field === 'tax_rate' ? value : current.tax_rate) || 0;

      const taxableBase = Math.max(0, Math.round((q * p - d) * 100) / 100);
      current.total_amount = taxableBase;

      // Indian GST interstate vs intrastate determination
      const totalTax = Math.round((taxableBase * (rate / 100)) * 100) / 100;
      const isInterstate = Number(igst) > 0 || (placeOfSupply && supplierGstin && !supplierGstin.startsWith(placeOfSupply.substring(0, 2)));

      if (isInterstate) {
        current.igst_amount = totalTax;
        current.cgst_amount = 0;
        current.sgst_amount = 0;
      } else {
        const half = Math.round((totalTax / 2) * 100) / 100;
        current.cgst_amount = half;
        current.sgst_amount = Math.round((totalTax - half) * 100) / 100;
        current.igst_amount = 0;
      }
    }

    nextItems[index] = current;
    setLineItems(nextItems);
  };

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        description: `Line Item ${lineItems.length + 1}`,
        quantity: 1,
        unit_price: 0,
        discount: 0,
        tax_rate: 18,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_amount: 0,
      },
    ]);
  };

  const handleDeleteLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Sync computed subtotal and computed taxes into header totals
  const handleAutoSyncTotals = () => {
    const newSubtotal = arithmeticReconciliation.computedItemsSubtotal;
    setSubtotal(newSubtotal);

    let nextCgst = Number(cgst) || 0;
    let nextSgst = Number(sgst) || 0;
    let nextIgst = Number(igst) || 0;

    // If line items have computed taxes, synchronize taxes into header
    if (arithmeticReconciliation.computedLineTaxes > 0) {
      nextCgst = arithmeticReconciliation.computedLineCgst;
      nextSgst = arithmeticReconciliation.computedLineSgst;
      nextIgst = arithmeticReconciliation.computedLineIgst;
      setCgst(nextCgst);
      setSgst(nextSgst);
      setIgst(nextIgst);
    }

    const totalTax = nextCgst + nextSgst + nextIgst;
    setGrandTotal(Math.round((newSubtotal + totalTax + (Number(roundOff) || 0)) * 100) / 100);
  };

  // Maker-Checker Governance: Check if current active user is the maker who edited the invoice
  const isMakerSelfApprovalAttempt = useMemo(() => {
    const lastEdit = [...invoice.audit_logs]
      .reverse()
      .find((a) => a.actor !== 'system' && a.actor !== 'system_stp' && !a.action.startsWith('TRANSITION_'));

    if (lastEdit && lastEdit.actor.toLowerCase() === activeUser.username.toLowerCase()) {
      return true;
    }
    return false;
  }, [invoice.audit_logs, activeUser.username]);

  const canApprove =
    !isMakerSelfApprovalAttempt &&
    activeUser.role !== 'ACCOUNTANT' &&
    invoice.status !== 'DELIVERED' &&
    invoice.status !== 'REJECTED';

  const isTerminal = invoice.status === 'DELIVERED' || invoice.status === 'REJECTED';

  return (
    <div className="flex flex-col h-full rounded-squircle liquid-card-frosted overflow-hidden border border-white/90 shadow-2xl min-h-0">
      {/* Top Header Bar */}
      <div className="px-5 py-3.5 bg-white/70 border-b border-indigo-100/70 flex items-center justify-between backdrop-blur-md">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-extrabold text-slate-900 tracking-tight" title={invoiceNumber || 'UNASSIGNED INVOICE'}>
              {invoiceNumber || 'UNASSIGNED INVOICE'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
              v{invoice.version}
            </span>
            {invoice.status === 'DELIVERED' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Target ERP Delivered
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Document ID: <span className="font-mono font-semibold text-slate-700">{invoice.id.substring(0, 8)}...</span>
          </div>
        </div>

        {/* Audit Trail Drawer Toggle */}
        <button
          onClick={() => setShowAuditTrail(!showAuditTrail)}
          className="px-3 py-1.5 rounded-xl liquid-pill text-xs text-slate-700 hover:text-indigo-900 flex items-center space-x-1.5 border border-white/80 font-bold shadow-xs cursor-pointer"
        >
          <History className="w-3.5 h-3.5 text-indigo-600" />
          <span>Audit Trail ({invoice.audit_logs.length})</span>
          {showAuditTrail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Read-Only State Governance Explanatory Banner */}
      {invoice.status === 'DELIVERED' && (
        <div className="px-5 py-3 bg-emerald-500/15 border-b border-emerald-400/40 flex items-center space-x-3 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <div className="font-extrabold text-emerald-900">
              Settled in Destination ERP (Locked for Immutability)
            </div>
            <div className="text-slate-600 text-[11px] font-medium">
              This document has completed straight-through processing into the Target Company ERP Database. Header fields and line items are locked to maintain ACID ledger integrity.
            </div>
          </div>
        </div>
      )}

      {invoice.status === 'REJECTED' && (
        <div className="px-5 py-3 bg-rose-500/15 border-b border-rose-400/40 flex items-center space-x-3 text-xs">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <div className="font-extrabold text-rose-900">
              Invoice Rejected by Governance Workflow
            </div>
            <div className="text-slate-600 text-[11px] font-medium">
              This document was flagged and permanently rejected. Fields are locked in read-only mode for audit inspection.
            </div>
          </div>
        </div>
      )}

      {/* Escalation Alert / Resolution Status Banner */}
      {invoice.is_escalated && (
        <div className="px-5 py-3 bg-rose-50/80 border-b border-rose-200 flex items-start space-x-3 text-xs">
          <ShieldAlert className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-bold text-rose-700 flex items-center space-x-2">
              <span>Human Review Required: {invoice.escalation_category || 'ESCALATION'}</span>
            </div>
            <div className="text-slate-700 mt-0.5 font-medium">{invoice.escalation_reason}</div>
            {arithmeticReconciliation.isFullyBalanced ? (
              <div className="mt-2 text-emerald-700 font-bold flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Arithmetic balanced. Click <b>"Save Corrections"</b> to resolve escalation and route for approval.
                </span>
              </div>
            ) : (
              <div className="mt-1 text-slate-500 text-[11px]">
                Please review line-item pricing and ensure total reconciliation matches.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Audit Trail Drawer (Constrained height with internal scroll) */}
      {showAuditTrail && (
        <div className="max-h-44 overflow-y-auto px-5 py-3 bg-indigo-50/70 border-b border-indigo-100 divide-y divide-indigo-100/80 text-xs shrink-0 animate-in fade-in duration-150 shadow-inner">
          <div className="font-bold text-slate-800 pb-2 flex items-center justify-between">
            <span>Event History & Immutability Ledger</span>
            <span className="text-[10px] text-slate-500 font-mono">ACID Log</span>
          </div>
          {invoice.audit_logs.map((log) => (
            <div key={log.id} className="py-2 flex items-start justify-between">
              <div>
                <span className="font-bold text-indigo-700">{log.action}</span>
                <span className="text-slate-500 ml-2">by</span>{' '}
                <span className="font-mono font-semibold text-slate-800">{log.actor}</span>
                {log.changes && (
                  <pre className="mt-1 text-[10px] font-mono text-slate-700 bg-white/80 p-2 rounded-xl overflow-x-auto max-w-lg border border-indigo-100">
                    {JSON.stringify(log.changes, null, 2)}
                  </pre>
                )}
              </div>
              <span className="text-[10px] text-slate-500 whitespace-nowrap ml-4">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Main Form Body with min-h-0 for proper flex scrolling */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6 overscroll-contain">
        {/* Header Fields Section */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Invoice Header & Parties
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1 font-bold">Supplier / Vendor Name</label>
              <input
                type="text"
                disabled={isTerminal}
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1 font-bold">Supplier GSTIN</label>
              <input
                type="text"
                disabled={isTerminal}
                value={supplierGstin}
                onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
                placeholder="27ABCDE1234F1Z5"
                className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input font-mono uppercase font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1 font-bold">Invoice Number</label>
              <input
                type="text"
                disabled={isTerminal}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1 font-bold">Invoice Date</label>
              <input
                type="date"
                disabled={isTerminal}
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1 font-bold">Place of Supply (State)</label>
              <input
                type="text"
                disabled={isTerminal}
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                placeholder="e.g. Maharashtra"
                className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1 font-bold">Currency</label>
              <input
                type="text"
                disabled={isTerminal}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input font-mono font-bold"
              />
            </div>
          </div>
        </div>

        {/* Tabular Line-Item Editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Voucher Line Items ({lineItems.length})
            </h4>
            {!isTerminal && (
              <button
                onClick={handleAddLineItem}
                className="px-2.5 py-1 rounded-xl crystal-pill text-xs text-indigo-700 hover:text-white hover:bg-indigo-600 flex items-center space-x-1 font-bold border border-indigo-200 transition-colors shadow-sm"
              >
                <Plus className="w-3 h-3" />
                <span>Add Item</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/50 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-indigo-100 bg-indigo-50/50 text-slate-600 uppercase text-[10px] font-bold">
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-2 w-20">HSN</th>
                  <th className="py-2.5 px-2 w-16 text-right">Qty</th>
                  <th className="py-2.5 px-2 w-24 text-right">Unit Price</th>
                  <th className="py-2.5 px-2 w-16 text-right">Tax %</th>
                  <th className="py-2.5 px-3 w-28 text-right">Line Total</th>
                  {!isTerminal && <th className="py-2.5 px-2 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-50">
                {lineItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-white/80">
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        disabled={isTerminal}
                        value={item.description}
                        onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-lg crystal-input font-medium"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        disabled={isTerminal}
                        value={item.hsn_code || ''}
                        onChange={(e) => handleLineItemChange(idx, 'hsn_code', e.target.value)}
                        placeholder="8471"
                        className="w-full px-2 py-1 text-xs rounded-lg crystal-input font-mono text-[11px]"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        disabled={isTerminal}
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-xs rounded-lg crystal-input text-right font-mono"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        disabled={isTerminal}
                        value={item.unit_price}
                        step="0.01"
                        onChange={(e) => handleLineItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-xs rounded-lg crystal-input text-right font-mono"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        disabled={isTerminal}
                        value={item.tax_rate}
                        onChange={(e) => handleLineItemChange(idx, 'tax_rate', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-xs rounded-lg crystal-input text-right font-mono"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      ₹{item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    {!isTerminal && (
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => handleDeleteLineItem(idx)}
                          disabled={lineItems.length === 1}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-Time Arithmetic Reconciliation Bar */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            arithmeticReconciliation.isFullyBalanced
              ? 'bg-emerald-50/80 border-emerald-300 text-slate-800'
              : 'bg-rose-50/80 border-rose-300 text-rose-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 font-bold text-xs">
              {arithmeticReconciliation.isFullyBalanced ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Reconciliation Verified (Balanced within tolerance)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span className="text-rose-700">
                    Arithmetic Variance Detected (Difference: ₹{arithmeticReconciliation.grandTotalVariance})
                  </span>
                </>
              )}
            </div>
            {!arithmeticReconciliation.isFullyBalanced && !isTerminal && (
              <button
                onClick={handleAutoSyncTotals}
                className="px-2.5 py-1 rounded-xl bg-rose-200 hover:bg-rose-300 text-rose-800 text-[11px] font-bold transition-colors"
              >
                Auto-Sync Header with Items
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-2 border-t border-slate-200">
            <div>
              <span className="text-slate-500 font-medium">Items Sum:</span>{' '}
              <span className="font-mono font-bold text-slate-900">
                ₹{arithmeticReconciliation.computedItemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Header Subtotal:</span>{' '}
              <span className="font-mono font-bold text-slate-900">
                ₹{Number(subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Taxes (CGST+SGST+IGST):</span>{' '}
              <span className="font-mono font-bold text-slate-900">
                ₹{arithmeticReconciliation.taxSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Computed Grand Total:</span>{' '}
              <span className="font-mono font-bold text-slate-900">
                ₹{arithmeticReconciliation.computedGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Totals Breakdown Section */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1 font-bold">Subtotal</label>
            <input
              type="number"
              disabled={isTerminal}
              value={subtotal}
              step="0.01"
              onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input text-right font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1 font-bold">CGST Amount</label>
            <input
              type="number"
              disabled={isTerminal}
              value={cgst}
              step="0.01"
              onChange={(e) => setCgst(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1 font-bold">SGST Amount</label>
            <input
              type="number"
              disabled={isTerminal}
              value={sgst}
              step="0.01"
              onChange={(e) => setSgst(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1 font-bold">IGST (Interstate)</label>
            <input
              type="number"
              disabled={isTerminal}
              value={igst}
              step="0.01"
              onChange={(e) => setIgst(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1 font-bold">Round-Off</label>
            <input
              type="number"
              disabled={isTerminal}
              value={roundOff}
              step="0.01"
              onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-800 mb-1 font-extrabold">Grand Total</label>
            <input
              type="number"
              disabled={isTerminal}
              value={grandTotal}
              step="0.01"
              onChange={(e) => setGrandTotal(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 text-xs rounded-xl crystal-input text-right font-mono font-black text-slate-900 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Bottom Sticky Action Footer */}
      <div className="p-4 bg-white/70 border-t border-indigo-100 flex flex-wrap items-center justify-between gap-3">
        {/* Left Side: Maker-Checker Persona Indicator */}
        <div className="text-xs text-slate-600 flex items-center space-x-2">
          <span className="font-medium">Active Sign-Off Role:</span>
          <span className="font-bold text-slate-900">{activeUser.fullName}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-mono font-bold">
            {activeUser.role}
          </span>
        </div>

        {/* Right Side: Primary Workflow Buttons */}
        <div className="flex items-center space-x-2">
          {/* Save Corrections */}
          {!isTerminal && (
            <button
              onClick={() =>
                onSaveCorrections({
                  supplier_name: supplierName,
                  supplier_gstin: supplierGstin,
                  invoice_number: invoiceNumber,
                  invoice_date: invoiceDate,
                  currency,
                  place_of_supply: placeOfSupply,
                  subtotal,
                  cgst,
                  sgst,
                  igst,
                  round_off: roundOff,
                  grand_total: grandTotal,
                  line_items: lineItems,
                })
              }
              disabled={saving}
              className="px-4 py-2 rounded-xl crystal-pill text-xs font-bold text-slate-800 hover:text-indigo-900 hover:bg-white border border-white/80 transition-all flex items-center space-x-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5 text-indigo-600" />
              <span>{saving ? 'Saving...' : 'Save Corrections'}</span>
            </button>
          )}

          {/* Reject Button */}
          {!isTerminal && (
            <button
              onClick={() => setRejectModalOpen(true)}
              disabled={rejecting}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-100 border border-rose-300 transition-all flex items-center space-x-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
          )}

          {/* Maker-Checker Approval Button */}
          {!isTerminal && (
            <div className="relative group">
              <button
                onClick={() => onApprove()}
                disabled={!canApprove || approving}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-lg ${
                  canApprove
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white active:scale-95 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{approving ? 'Posting to ERP...' : 'Approve & Post to ERP'}</span>
              </button>

              {/* Tooltip explaining Maker-Checker rule if disabled */}
              {!canApprove && (
                <div className="absolute right-0 bottom-full mb-2 w-72 liquid-modal-glass rounded-2xl p-3 text-[11px] text-slate-700 hidden group-hover:block z-40 border border-white/90 shadow-2xl">
                  {isMakerSelfApprovalAttempt ? (
                    <div className="space-y-1">
                      <div className="font-bold text-rose-600 flex items-center space-x-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Maker-Checker Governance Rule</span>
                      </div>
                      <p>
                        You modified this invoice ({activeUser.username}). <b>The Maker cannot self-approve.</b> An
                        independent Approver (Checker) must sign off.
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">
                        Tip: Switch persona in the top-right navbar to "Sarah Jenkins (Approver)".
                      </p>
                    </div>
                  ) : activeUser.role === 'ACCOUNTANT' ? (
                    <div>
                      <span className="font-bold text-slate-900">Role Restriction:</span> Accountants can submit
                      corrections. Only users with the <b>Approver</b> role can release invoices to the ERP ledger.
                    </div>
                  ) : (
                    <div>Invoice cannot be approved in its current state.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reject Confirmation Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md liquid-modal-glass p-6 sm:p-7 shadow-2xl relative border border-white/90">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <XCircle className="w-4 h-4" />
              </div>
              <span>Reject Invoice Document</span>
            </h3>
            <p className="text-xs text-slate-600 mb-4 font-medium">
              Rejection is permanent and marks the invoice as REJECTED in the audit trail. Please state the compliance or
              commercial rationale:
            </p>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Duplicate voucher submitted; vendor tax rate invalid; goods not received."
              className="w-full p-3 text-xs rounded-xl crystal-input mb-4 font-medium"
            />

            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl liquid-pill text-xs font-bold text-slate-700 hover:text-slate-900 border border-white/80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!rejectionReason.trim()) return;
                  await onReject(rejectionReason);
                  setRejectModalOpen(false);
                }}
                disabled={!rejectionReason.trim() || rejecting}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-bold shadow-md shadow-rose-500/25 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
