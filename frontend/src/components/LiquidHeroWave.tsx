import React from 'react';
import { Zap, CheckCircle2, Activity } from 'lucide-react';
import type { EscalationStats } from '../types/invoice';

interface LiquidHeroWaveProps {
  stats: EscalationStats | null;
  onFilterClick?: (filter: string) => void;
}

export const LiquidHeroWave: React.FC<LiquidHeroWaveProps> = ({ stats, onFilterClick }) => {
  const total = stats?.total_invoices ?? 0;
  const stpRate = stats?.stp_rate_percentage ?? 0.0;
  const delivered = stats?.delivered_count ?? 0;
  const deliveredGross = stats?.delivered_gross_value ?? 0.0;
  const avgConfidence = total > 0 ? (stats?.avg_confidence_score ?? 0.0) : 0.0;
  const mathErrors = stats?.category_breakdown?.['MATH_MISMATCH'] ?? 0;
  const balancedRate = total > 0 
    ? (((total - mathErrors) / total) * 100).toFixed(1) 
    : '0.0';

  return (
    <div className="liquid-card-hero p-6 md:p-8 mb-4 relative">
      {/* Top Header Row of Hero Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/30 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-white/70 backdrop-blur-md flex items-center justify-center text-indigo-700 shadow-sm border border-white/80">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-extrabold text-slate-800 tracking-tight">
                Autonomous Straight-Through Processing Flow
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-800 border border-cyan-400/40">
                Live Waveform
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Real-time multi-stage pipeline: Intake → Vision Preprocessing → AI Extraction → Deterministic Validation → ERP Delivery
            </p>
          </div>
        </div>

        {/* Right Metric Buttons (Fully Functional) */}
        <div className="flex items-center space-x-2 text-xs">
          <button 
            onClick={() => onFilterClick && onFilterClick('DELIVERED')}
            title="Filter to Straight-Through Processed Vouchers"
            className="px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white/80 backdrop-blur-md border border-white/80 text-slate-700 font-semibold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-cyan-600" />
            <span>STP Efficiency: <b className="text-indigo-900">{stpRate}%</b></span>
          </button>

          <button 
            onClick={() => onFilterClick && onFilterClick('TARGET_ERP')}
            title="Open Target ERP Ledger View"
            className="px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white/80 backdrop-blur-md border border-white/80 text-slate-700 font-semibold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Target DB: <b className="text-emerald-700">{delivered} Posted</b></span>
          </button>
        </div>
      </div>

      {/* Main Sinusoidal Dual Spline Wave Chart */}
      <div className="relative mt-4 h-48 sm:h-56 w-full">
        <svg className="w-full h-full" viewBox="0 0 800 240" preserveAspectRatio="none">
          <defs>
            {/* Luminous cyan-blue gradient fill for the primary wave */}
            <linearGradient id="heroWaveCyan" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.65" />
              <stop offset="40%" stopColor="#2563eb" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#4338ca" stopOpacity="0.05" />
            </linearGradient>

            {/* Violet-teal gradient fill for the secondary foreground wave */}
            <linearGradient id="heroWaveViolet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.02" />
            </linearGradient>

            {/* Glowing filter for wave stroke */}
            <filter id="waveGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background horizontal grid lines matching image */}
          <line x1="0" y1="40" x2="800" y2="40" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />
          <line x1="0" y1="90" x2="800" y2="90" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />
          <line x1="0" y1="140" x2="800" y2="140" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />
          <line x1="0" y1="190" x2="800" y2="190" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />

          {/* Secondary Wave (Violet / Indigo) */}
          <path
            d={total > 0 
              ? "M0,160 C120,90 220,200 360,110 C500,40 620,170 800,100 L800,240 L0,240 Z"
              : "M0,210 C200,206 400,210 600,206 800,210 L800,240 L0,240 Z"
            }
            fill="url(#heroWaveViolet)"
          />
          <path
            d={total > 0 
              ? "M0,160 C120,90 220,200 360,110 C500,40 620,170 800,100"
              : "M0,210 C200,206 400,210 600,206 800,210"
            }
            fill="none"
            stroke="#a5b4fc"
            strokeWidth={total > 0 ? 3 : 1.5}
            strokeLinecap="round"
          />

          {/* Primary Wave (Luminous Cyan & Deep Blue) */}
          <path
            d={total > 0 
              ? "M0,130 C140,190 240,60 380,140 C520,210 650,50 800,120 L800,240 L0,240 Z"
              : "M0,215 C200,212 400,215 600,212 800,215 L800,240 L0,240 Z"
            }
            fill="url(#heroWaveCyan)"
          />
          <path
            d={total > 0 
              ? "M0,130 C140,190 240,60 380,140 C520,210 650,50 800,120"
              : "M0,215 C200,212 400,215 600,212 800,215"
            }
            fill="none"
            stroke="#ffffff"
            strokeWidth={total > 0 ? 3.5 : 2}
            strokeLinecap="round"
            filter="url(#waveGlow)"
          />

          {/* Glowing Peak Data Points shown only when active throughput is running */}
          {total > 0 && (
            <>
              <circle cx="240" cy="60" r="5" fill="#ffffff" stroke="#0284c7" strokeWidth="2.5" />
              <circle cx="650" cy="50" r="5" fill="#ffffff" stroke="#0284c7" strokeWidth="2.5" />
              <circle cx="500" cy="40" r="4.5" fill="#ffffff" stroke="#6366f1" strokeWidth="2.5" />
            </>
          )}
        </svg>

        {/* Floating Side Metrics Badge Card Inside Wave */}
        <div className="absolute right-4 top-4 hidden md:flex flex-col space-y-1.5 p-3 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/90 shadow-lg text-[11px] max-w-xs">
          <div className="flex justify-between items-center text-slate-600 space-x-3">
            <span>Extraction Confidence:</span>
            <span className="font-bold text-indigo-900 font-mono">{(avgConfidence * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center text-slate-600 space-x-3">
            <span>Arithmetic Integrity:</span>
            <span className="font-bold text-emerald-700 font-mono">{balancedRate}%</span>
          </div>
          <div className="flex justify-between items-center text-slate-600 space-x-3">
            <span>Posted Gross Value:</span>
            <span className="font-bold text-blue-800 font-mono">₹{deliveredGross.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
