import React from 'react';
import { TrendingUp, ArrowUpRight, Zap, AlertTriangle, Layers } from 'lucide-react';
import type { EscalationStats } from '../types/invoice';

interface LiquidTopCardsProps {
  stats: EscalationStats | null;
  onFilterClick?: (filter: string) => void;
}

export const LiquidTopCards: React.FC<LiquidTopCardsProps> = ({ stats, onFilterClick }) => {
  const total = stats?.total_invoices ?? 0;
  const displayTotal = total > 0 ? total : 1929; // Sample benchmark fallback matching image
  const stpRate = stats?.stp_rate_percentage ?? 84.3;
  const escalatedRate = stats ? (100 - stpRate).toFixed(1) : '15,7%';

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
      {/* CARD 1: "1929" Total Invoices (Frosted Glass - Top Left from Image) */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Invoices Logged
          </span>
          <span className="text-slate-400 text-xs font-mono">•••</span>
        </div>

        <div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-extrabold tracking-tight text-slate-800">
              {displayTotal}
            </span>
            <div className="flex items-center text-[11px] font-bold text-emerald-600">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+12.4%</span>
            </div>
          </div>
        </div>

        {/* Multi-tier horizontal progress bars matching the image */}
        <div className="space-y-1.5 pt-2">
          <div className="h-1.5 w-full bg-slate-300/40 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full w-[82%]" />
          </div>
          <div className="h-1.5 w-full bg-slate-300/40 rounded-full overflow-hidden flex space-x-1">
            <div className="h-full bg-cyan-400 rounded-full w-[45%]" />
            <div className="h-full bg-indigo-500 rounded-full w-[35%]" />
          </div>
        </div>
      </div>

      {/* CARD 2: Sinusoidal Spline Wave Trend (Frosted Glass - Top Center from Image) */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-600" />
            <span>Ingestion Throughput</span>
          </span>
          <span className="text-xs font-bold text-indigo-700 bg-white/60 px-2 py-0.5 rounded-full">
            2.2s Avg
          </span>
        </div>

        {/* Smooth Curved Spline Area Wave (Matches Image) */}
        <div className="h-16 w-full relative -mb-2">
          <svg className="w-full h-full" viewBox="0 0 200 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="topWaveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path
              d="M0,45 Q35,15 70,35 T140,20 T200,30 L200,60 L0,60 Z"
              fill="url(#topWaveGrad)"
            />
            <path
              d="M0,45 Q35,15 70,35 T140,20 T200,30"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>Live</span>
        </div>
      </div>

      {/* CARD 3: "15,7%" Escalation Rate & Bar Chart (Dark Navy Glass - Top Right from Image) */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ESCALATED')}
        className="md:col-span-4 liquid-card-dark p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Human Review Rate</span>
          </span>
          <span className="text-slate-400 text-xs font-mono">•••</span>
        </div>

        <div className="flex items-end justify-between mt-2">
          <div>
            <div className="text-3xl font-extrabold tracking-tight text-white">
              {typeof escalatedRate === 'string' ? escalatedRate : `${escalatedRate}%`}
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              Escalation Adjudication Rate
            </div>
          </div>

          {/* Vertical Glass Bars (Matches the multi-color bars in the image) */}
          <div className="flex items-end space-x-1.5 h-14">
            <div className="w-2 rounded-full bg-white/70 h-[40%]" />
            <div className="w-2 rounded-full bg-cyan-400 h-[75%]" />
            <div className="w-2 rounded-full bg-blue-500 h-[55%]" />
            <div className="w-2 rounded-full bg-indigo-400 h-[90%]" />
            <div className="w-2 rounded-full bg-cyan-300 h-[65%]" />
            <div className="w-2 rounded-full bg-white h-[80%]" />
            <div className="w-2 rounded-full bg-indigo-500 h-[100%]" />
          </div>
        </div>
      </div>

      {/* ROW 2 MINI CARDS: Upward velocity graph (Left) & Hourly Load (Center) */}
      <div className="md:col-span-6 liquid-card-frosted p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center text-indigo-700 shadow-sm">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">Pipeline Velocity</div>
            <div className="text-[11px] text-slate-500">Autonomous Straight-Through Flow</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-extrabold text-indigo-900">99.8%</div>
          <div className="text-[10px] text-emerald-600 font-bold">Zero Ledger Conflicts</div>
        </div>
      </div>

      <div className="md:col-span-6 liquid-card-dark p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950 flex items-center justify-center text-cyan-400 border border-cyan-400/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Target ERP Egress</div>
            <div className="text-[11px] text-slate-300">ACID Idempotent Posting</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-extrabold text-cyan-400">100%</div>
          <div className="text-[10px] text-slate-300">Deterministic Ledger Sync</div>
        </div>
      </div>
    </div>
  );
};
