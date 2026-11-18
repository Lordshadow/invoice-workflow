import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { EscalationStats } from '../types/invoice';

interface LiquidMiddleCardsProps {
  stats: EscalationStats | null;
  onFilterClick?: (filter: string) => void;
}

export const LiquidMiddleCards: React.FC<LiquidMiddleCardsProps> = ({ stats, onFilterClick }) => {
  const total = stats?.total_invoices ?? 0;
  const delivered = stats?.delivered_count ?? 0;
  const clean = stats?.clean_count ?? 0;
  const escalated = stats?.escalated_count ?? 0;
  const totalGross = stats?.total_gross_value ?? 0;
  const deliveredGross = stats?.delivered_gross_value ?? 0;
  const avgVal = stats?.average_invoice_value ?? 0;
  const avgConfidence = total > 0 ? (stats?.avg_confidence_score ?? 0.0) : 0.0;
  const stpRate = stats?.stp_rate_percentage ?? 0.0;
  const escalatedRate = total > 0 ? ((escalated / total) * 100).toFixed(1) : '0.0';

  const mathErrors = stats?.category_breakdown?.['MATH_MISMATCH'] ?? 0;
  const balancedRate = total > 0 
    ? (((total - mathErrors) / total) * 100).toFixed(1) 
    : '0.0';

  // Format Currency Amount with Indian Numbering System (Commas at hundreds, then every two digits: Lakhs & Crores)
  const formatIndianCurrency = (val: number) => {
    return (val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getIndianDenomination = (val: number) => {
    if (val >= 10000000) {
      return `(${(val / 10000000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr)`;
    }
    if (val >= 100000) {
      return `(${(val / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lakh)`;
    }
    return '';
  };

  // Channels count & breakdown
  const channelBreakdown = stats?.channel_breakdown ?? {};
  const mimeBreakdown = stats?.mime_breakdown ?? {};

  const pdfCount = mimeBreakdown['application/pdf'] ?? (channelBreakdown['upload'] ?? 0);
  const photoCount = (mimeBreakdown['image/jpeg'] ?? 0) + (mimeBreakdown['image/png'] ?? 0) + (mimeBreakdown['image/webp'] ?? 0);
  const whatsappCount = channelBreakdown['whatsapp'] ?? 0;
  const emailCount = (channelBreakdown['email'] ?? 0) + (mimeBreakdown['b2b_qr'] ?? 0);

  const maxChannel = Math.max(pdfCount, photoCount, whatsappCount, emailCount, 1);

  const getBarHeight = (count: number) => {
    if (total === 0 || count === 0) return 0;
    return Math.max(12, Math.round((count / maxChannel) * 100));
  };

  const confidencePct = Math.round(avgConfidence * 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
      {/* CARD 1: Cumulative Gross Value */}
      <div 
        onClick={() => onFilterClick && onFilterClick('TARGET_ERP')}
        title="View Posted Invoices in Destination ERP Ledger"
        className="md:col-span-4 liquid-card-dark p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[150px] hover:border-emerald-400/50 transition-all"
      >
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="font-bold text-[11px] uppercase tracking-wider">Processed Value</span>
          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/20 px-2 py-0.5 rounded-full">
            ERP Egress
          </span>
        </div>

        <div>
          <div className="text-3xl font-extrabold text-white tracking-tight flex items-baseline space-x-2">
            <span>₹{formatIndianCurrency(totalGross)}</span>
            {getIndianDenomination(totalGross) && (
              <span className="text-xs font-semibold text-slate-300">
                {getIndianDenomination(totalGross)}
              </span>
            )}
          </div>
          <div className="flex items-center text-[11px] text-emerald-400 font-bold mt-1">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            <span>{delivered} Settled (₹{formatIndianCurrency(deliveredGross)})</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 leading-relaxed">
          Cumulative gross value posted to destination ERP
        </div>
      </div>

      {/* CARD 2: Extraction Precision & Donut Gauge */}
      <div 
        onClick={() => onFilterClick && onFilterClick('DELIVERED')}
        title="Filter Clean Vouchers"
        className="md:col-span-4 liquid-card-dark p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[150px] hover:border-cyan-400/50 transition-all"
      >
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="font-bold text-[11px] uppercase tracking-wider">Extraction & Precision</span>
          <span className="text-[10px] text-cyan-300 font-semibold bg-cyan-500/20 px-2 py-0.5 rounded-full">
            AI Engine
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 items-center">
          <div>
            <div className="text-2xl font-extrabold text-white tracking-tight">
              {clean.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-300">Clean</span>
            </div>
            <div className="text-[10px] text-cyan-300 font-bold mt-0.5">
              {stpRate}% STP Rate
            </div>
            <div className="text-2xl font-extrabold text-white tracking-tight mt-2">
              {confidencePct}% <span className="text-xs font-normal text-slate-300">Confidence</span>
            </div>
          </div>

          {/* Radial Donut Gauge Driven by Real AI Extraction Confidence */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-700/60"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-cyan-400 transition-all duration-700"
                  strokeDasharray={`${confidencePct}, 100`}
                  strokeLinecap="round"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xs font-extrabold text-white font-mono">
                {confidencePct}%
              </span>
            </div>
            <span className="text-[10px] text-slate-300 mt-1">Variance Guard</span>
          </div>
        </div>
      </div>

      {/* CARD 3: Vertical Multi-Channel Intake Bars */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        title="View Ingestion Sources"
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[150px] hover:border-indigo-300/60 transition-all"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Intake Channels
          </span>
          <span className="text-[10px] font-semibold text-slate-500 bg-white/70 px-2 py-0.5 rounded-full">
            {total} Total
          </span>
        </div>

        <div className="flex items-end justify-between pt-2">
          {/* Channel 1: PDF */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div 
                className="w-full bg-indigo-600 rounded-full transition-all duration-500" 
                style={{ height: `${getBarHeight(pdfCount)}%` }} 
              />
            </div>
            <span className="text-[9px] font-bold text-slate-600">PDF ({pdfCount})</span>
          </div>

          {/* Channel 2: Photo */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div 
                className="w-full bg-cyan-400 rounded-full transition-all duration-500" 
                style={{ height: `${getBarHeight(photoCount)}%` }} 
              />
            </div>
            <span className="text-[9px] font-bold text-slate-600">Photos ({photoCount})</span>
          </div>

          {/* Channel 3: WhatsApp */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div 
                className="w-full bg-blue-500 rounded-full transition-all duration-500" 
                style={{ height: `${getBarHeight(whatsappCount)}%` }} 
              />
            </div>
            <span className="text-[9px] font-bold text-slate-600">WhatsApp ({whatsappCount})</span>
          </div>

          {/* Channel 4: Email / QR */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div 
                className="w-full bg-emerald-500 rounded-full transition-all duration-500" 
                style={{ height: `${getBarHeight(emailCount)}%` }} 
              />
            </div>
            <span className="text-[9px] font-bold text-slate-600">Email/QR ({emailCount})</span>
          </div>
        </div>
      </div>

      {/* ROW 5: Concentric Arc Ring Gauge & Average Voucher & Audit Exceptions */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        title="Arithmetic Reconciliation Integrity"
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex items-center justify-between min-h-[140px] hover:border-indigo-300/60 transition-all"
      >
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Reconciliation Health
          </div>
          <div className="text-xl font-extrabold text-slate-800 mt-1">
            {balancedRate}% Balanced
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Tolerance: ± ₹1.00
          </div>
        </div>

        {/* Multi-ring concentric arc bound to balance rate */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="3" />
            <circle 
              cx="20" 
              cy="20" 
              r="16" 
              fill="none" 
              stroke="#6366f1" 
              strokeWidth="3" 
              strokeDasharray={`${total > 0 ? Math.round(parseFloat(balancedRate) * 0.6) : 0} 40`} 
              strokeLinecap="round"
            />
            <circle 
              cx="20" 
              cy="20" 
              r="11" 
              fill="none" 
              stroke="#38bdf8" 
              strokeWidth="2.5" 
              strokeDasharray={`${total > 0 ? Math.round(parseFloat(balancedRate) * 0.45) : 0} 25`} 
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        title="Average Voucher Value Across Invoices"
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px] hover:border-indigo-300/60 transition-all"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Average Voucher Value
          </span>
          <span className="text-[10px] text-indigo-700 bg-white/70 px-2 py-0.5 rounded-full font-bold">
            GST Eligible
          </span>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-extrabold text-slate-800">
            ₹{formatIndianCurrency(avgVal)}
          </span>
          {getIndianDenomination(avgVal) && (
            <span className="text-xs font-semibold text-slate-500">
              {getIndianDenomination(avgVal)}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-bold">
          <span>Indian B2B Input Tax Credit</span>
        </div>
      </div>

      <div 
        onClick={() => onFilterClick && onFilterClick('ESCALATED')}
        title="Open Exception Invoices Requiring Human Review"
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex items-center justify-between min-h-[140px] hover:border-amber-400/50 transition-all"
      >
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Audit Exception Rate
          </div>
          <div className="text-3xl font-extrabold text-indigo-900 mt-1">
            {escalatedRate}%
          </div>
          <div className="text-[10px] text-amber-700 font-bold mt-0.5">
            {escalated} in Exception Queue
          </div>
        </div>

        {/* Dual Donut Gauge Driven by Real Escalation Rate */}
        <div className="relative w-18 h-18 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="3" />
            <circle 
              cx="18" 
              cy="18" 
              r="14" 
              fill="none" 
              stroke="#6366f1" 
              strokeWidth="3" 
              strokeDasharray={`${total > 0 ? Math.max(5, Math.round(parseFloat(escalatedRate))) : 0} ${total > 0 ? (100 - Math.max(5, Math.round(parseFloat(escalatedRate)))) : 100}`} 
              strokeLinecap="round"
            />
            <circle 
              cx="18" 
              cy="18" 
              r="9" 
              fill="none" 
              stroke="#38bdf8" 
              strokeWidth="2.5" 
              strokeDasharray={`${total > 0 ? Math.max(3, Math.round(parseFloat(escalatedRate) * 0.7)) : 0} ${total > 0 ? (100 - Math.max(3, Math.round(parseFloat(escalatedRate) * 0.7))) : 100}`} 
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
