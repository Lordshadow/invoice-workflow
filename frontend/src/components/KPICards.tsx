import React from 'react';
import { 
  FileText, 
  Zap, 
  AlertTriangle, 
  Database, 
  TrendingUp, 
  ArrowUpRight,
  PlusCircle,
  ShieldCheck,
  Calculator,
  Layers
} from 'lucide-react';
import type { EscalationStats } from '../types/invoice';

interface KPICardsProps {
  stats: EscalationStats | null;
  onFilterClick?: (filter: string) => void;
  onOpenUpload?: () => void;
  onNavigateTab?: (tab: 'queue' | 'escalated' | 'target_erp') => void;
}

export const KPICards: React.FC<KPICardsProps> = ({ 
  stats, 
  onFilterClick,
  onOpenUpload,
  onNavigateTab
}) => {
  const total = stats?.total_invoices ?? 0;
  const stpRate = stats?.stp_rate_percentage ?? 0.0;
  const escalated = stats?.escalated_count ?? 0;
  const delivered = stats?.delivered_count ?? 0;

  return (
    <section className="max-w-[1600px] mx-auto px-6 mb-8">
      {/* Welcome Banner matching reference image */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome Back!
          </h1>
          <p className="text-xs md:text-sm text-slate-500 font-medium mt-0.5">
            Autonomous Invoice Ingestion, Deterministic Validation & Target ERP Delivery
          </p>
        </div>

        <div className="mt-3 md:mt-0 flex items-center space-x-2">
          <div className="crystal-pill px-3 py-1.5 rounded-full text-xs font-semibold text-slate-600 border border-white/80 shadow-sm flex items-center space-x-1.5">
            <span>Fiscal Period: 2026-2027</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Visual Analytics + Vertical Metric Cards Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left Column (7 cols): Luminous Wave Chart & Ring Progress Card */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          {/* Luminous Wave Chart Card */}
          <div className="crystal-card rounded-squircle p-6 relative overflow-hidden shadow-crystal-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Automated Pipeline Throughput
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5 flex items-center space-x-2">
                  <span>{delivered} Invoices Delivered Straight-Through</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                    <ArrowUpRight className="w-3 h-3 mr-0.5" />
                    +100% Math Verified
                  </span>
                </div>
              </div>

              {/* Glowing Pill Indicator */}
              <div className="pod-blue px-3 py-1 rounded-full text-white text-xs font-bold shadow-sm">
                STP Active
              </div>
            </div>

            {/* SVG Glowing Wave Graph (Styled to match the luminous curve in reference image) */}
            <div className="w-full h-44 relative mt-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="50%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="waveFill" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(139, 92, 246, 0.35)" />
                    <stop offset="50%" stopColor="rgba(236, 72, 153, 0.20)" />
                    <stop offset="100%" stopColor="rgba(255, 255, 255, 0.0)" />
                  </linearGradient>
                  <filter id="waveGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Fill under wave */}
                <path
                  d="M 0 130 Q 80 40, 160 110 T 320 30 T 420 70 T 500 40 L 500 160 L 0 160 Z"
                  fill="url(#waveFill)"
                />

                {/* Main Glowing Wave Path */}
                <path
                  d="M 0 130 Q 80 40, 160 110 T 320 30 T 420 70 T 500 40"
                  fill="none"
                  stroke="url(#waveGradient)"
                  strokeWidth="4"
                  filter="url(#waveGlow)"
                />

                {/* Floating Highlight Point */}
                <circle cx="320" cy="30" r="5" fill="#ffffff" stroke="#8b5cf6" strokeWidth="3" />
              </svg>

              {/* Month labels */}
              <div className="flex justify-between text-[11px] text-slate-400 font-semibold px-2 mt-3">
                <span>Received</span>
                <span>Preprocessed</span>
                <span>OCR Extracted</span>
                <span>Math Validated</span>
                <span>Deduplicated</span>
                <span>ERP Posted</span>
              </div>
            </div>
          </div>

          {/* Bottom Dual Card: Multi-Color Ring Progress (68% Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Ring Card */}
            <div className="crystal-card rounded-squircle p-5 shadow-crystal-card flex items-center space-x-4">
              <div className="relative w-24 h-24 flex-shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="rgba(220, 210, 240, 0.4)"
                    strokeWidth="12"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="url(#waveGradient)"
                    strokeWidth="12"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * Math.min(Math.max(stpRate, 15), 100)) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-lg font-black text-slate-900 leading-none">
                    {stpRate}%
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                    STP Rate
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5 text-xs">
                <div className="font-bold text-slate-800">Pipeline Integrity</div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5" />
                    Clean Auto-Delivered
                  </span>
                  <span className="font-bold text-slate-800">{delivered}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5" />
                    Human Review Pending
                  </span>
                  <span className="font-bold text-slate-800">{escalated}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-cyan-500 mr-1.5" />
                    Total Logged
                  </span>
                  <span className="font-bold text-slate-800">{total}</span>
                </div>
              </div>
            </div>

            {/* Quick Summary Pill Card */}
            <div className="crystal-card rounded-squircle p-5 shadow-crystal-card flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Governance Policy
                </span>
                <div className="text-sm font-extrabold text-slate-900 mt-1">
                  Maker-Checker Enabled
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Prevents self-approval. Independent accountant edits require checker sign-off before ERP egress.
                </p>
              </div>

              <div className="flex items-center space-x-2 mt-3 pt-3 border-t border-indigo-100/60 text-xs text-indigo-700 font-semibold">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>Zero Double-Posting Guarantee</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Vertical Stack of Glowing 3D Glass Cards */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* Card 1: Purple Pod - Total Invoices */}
          <div 
            onClick={() => onFilterClick && onFilterClick('ALL')}
            className="crystal-card crystal-card-hover rounded-squircle p-5 cursor-pointer relative overflow-hidden group shadow-crystal-card flex items-center justify-between"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl pod-purple flex items-center justify-center text-white shadow-crystal-glow-purple group-hover:scale-105 transition-transform flex-shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Total Processed
                </span>
                <div className="text-2xl font-black text-slate-900 mt-0.5">
                  {total} Invoices
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Multi-channel intake (PDF, JPG, QR)
                </div>
              </div>
            </div>
            <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-colors" />
          </div>

          {/* Card 2: Blue Pod - Straight-Through Processing Rate */}
          <div 
            onClick={() => onFilterClick && onFilterClick('DELIVERED')}
            className="crystal-card crystal-card-hover rounded-squircle p-5 cursor-pointer relative overflow-hidden group shadow-crystal-card flex items-center justify-between"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl pod-blue flex items-center justify-center text-white shadow-crystal-glow-blue group-hover:scale-105 transition-transform flex-shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center space-x-1">
                  <span>Straight-Through Rate</span>
                </span>
                <div className="text-2xl font-black text-slate-900 mt-0.5">
                  {stpRate}%
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Zero-touch auto-delivery to ledger
                </div>
              </div>
            </div>
            <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </div>

          {/* Card 3: Coral Pod - Actionable Escalations */}
          <div 
            onClick={() => onFilterClick && onFilterClick('ESCALATED')}
            className={`crystal-card crystal-card-hover rounded-squircle p-5 cursor-pointer relative overflow-hidden group shadow-crystal-card flex items-center justify-between ${
              escalated > 0 ? 'border-rose-300 bg-rose-50/50' : ''
            }`}
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl pod-coral flex items-center justify-center text-white shadow-crystal-glow-coral group-hover:scale-105 transition-transform flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">
                  Human Review Queue
                </span>
                <div className="text-2xl font-black text-slate-900 mt-0.5">
                  {escalated} Cases
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {escalated === 1 ? '1 invoice requires sign-off' : `${escalated} invoices require sign-off`}
                </div>
              </div>
            </div>
            <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-rose-600 transition-colors" />
          </div>

          {/* Card 4: Emerald Pod - Target ERP Postings */}
          <div 
            onClick={() => onNavigateTab && onNavigateTab('target_erp')}
            className="crystal-card crystal-card-hover rounded-squircle p-5 cursor-pointer relative overflow-hidden group shadow-crystal-card flex items-center justify-between"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl pod-emerald flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform flex-shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Target ERP Postings
                </span>
                <div className="text-2xl font-black text-slate-900 mt-0.5">
                  {delivered} Committed
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  ACID unique ledger constraints
                </div>
              </div>
            </div>
            <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </div>
        </div>
      </div>

      {/* Bottom Row of 4 Glass Squircles (Matching the bottom buttons in reference image) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Action 1: Ingest Document */}
        <button
          onClick={onOpenUpload}
          className="crystal-card crystal-card-hover rounded-squircle p-4 flex flex-col items-center justify-center text-center shadow-crystal-card group"
        >
          <div className="w-11 h-11 rounded-2xl pod-purple flex items-center justify-center text-white shadow-crystal-glow-purple mb-2 group-hover:scale-110 transition-transform">
            <PlusCircle className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-900">Ingest Voucher</span>
          <span className="text-[10px] text-slate-500 mt-0.5">PDF, Photo, QR</span>
        </button>

        {/* Action 2: Human Review Queue */}
        <button
          onClick={() => onNavigateTab && onNavigateTab('escalated')}
          className="crystal-card crystal-card-hover rounded-squircle p-4 flex flex-col items-center justify-center text-center shadow-crystal-card group"
        >
          <div className="w-11 h-11 rounded-2xl pod-blue flex items-center justify-center text-white shadow-crystal-glow-blue mb-2 group-hover:scale-110 transition-transform">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-900">Review Queue</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Maker-Checker</span>
        </button>

        {/* Action 3: Arithmetic Reconciliation */}
        <button
          onClick={() => onFilterClick && onFilterClick('ESCALATED')}
          className="crystal-card crystal-card-hover rounded-squircle p-4 flex flex-col items-center justify-center text-center shadow-crystal-card group"
        >
          <div className="w-11 h-11 rounded-2xl pod-coral flex items-center justify-center text-white shadow-crystal-glow-coral mb-2 group-hover:scale-110 transition-transform">
            <Calculator className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-900">Reconciliation</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Tax & Line Math</span>
        </button>

        {/* Action 4: ERP Ledger Egress */}
        <button
          onClick={() => onNavigateTab && onNavigateTab('target_erp')}
          className="crystal-card crystal-card-hover rounded-squircle p-4 flex flex-col items-center justify-center text-center shadow-crystal-card group"
        >
          <div className="w-11 h-11 rounded-2xl pod-emerald flex items-center justify-center text-white shadow-sm mb-2 group-hover:scale-110 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-900">Target ERP Ledger</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Posted Vouchers</span>
        </button>
      </div>
    </section>
  );
};
