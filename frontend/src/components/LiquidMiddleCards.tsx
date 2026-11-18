import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { EscalationStats } from '../types/invoice';

interface LiquidMiddleCardsProps {
  stats: EscalationStats | null;
  onFilterClick?: (filter: string) => void;
}

export const LiquidMiddleCards: React.FC<LiquidMiddleCardsProps> = ({ onFilterClick }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
      {/* CARD 1: "20,94" (Dark Navy Card - Middle Left from Image) */}
      <div 
        onClick={() => onFilterClick && onFilterClick('DELIVERED')}
        className="md:col-span-3 liquid-card-dark p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[150px]"
      >
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="font-bold text-[11px] uppercase tracking-wider">Processed Value</span>
          <span className="text-slate-400 font-mono">•••</span>
        </div>

        <div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            ₹20,94 <span className="text-xs font-normal text-slate-300">Lakhs</span>
          </div>
          <div className="flex items-center text-[11px] text-emerald-400 font-bold mt-1">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            <span>0,7% Growth</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-400">
          Cumulative gross value posted to destination ERP
        </div>
      </div>

      {/* CARD 2: "19,06" & "93,34" with Circular Ring Gauge (Dark Navy Card - Center from Image) */}
      <div 
        onClick={() => onFilterClick && onFilterClick('DELIVERED')}
        className="md:col-span-5 liquid-card-dark p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[150px]"
      >
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="font-bold text-[11px] uppercase tracking-wider">Extraction & Precision</span>
          <span className="text-slate-400 font-mono">•••</span>
        </div>

        <div className="grid grid-cols-2 gap-4 items-center">
          <div>
            <div className="text-2xl font-extrabold text-white tracking-tight">
              19,06 <span className="text-xs font-normal text-slate-300">Vouchers</span>
            </div>
            <div className="text-[10px] text-cyan-300 font-bold mt-0.5">
              10.0% Speedup
            </div>
            <div className="text-2xl font-extrabold text-white tracking-tight mt-2">
              93,34% <span className="text-xs font-normal text-slate-300">Score</span>
            </div>
          </div>

          {/* Radial Donut Gauge Matching the Image */}
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
                  className="text-cyan-400"
                  strokeDasharray="93, 100"
                  strokeLinecap="round"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xs font-extrabold text-white font-mono">
                17%
              </span>
            </div>
            <span className="text-[10px] text-slate-300 mt-1">Variance Guard</span>
          </div>
        </div>
      </div>

      {/* CARD 3: Vertical Multi-Channel Intake Bars (Frosted Glass - Right from Image) */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[150px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Intake Channels
          </span>
          <span className="text-slate-400 text-xs font-mono">•••</span>
        </div>

        <div className="flex items-end justify-between pt-2">
          {/* Channel 1: PDF */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div className="w-full bg-indigo-600 rounded-full h-[75%]" />
            </div>
            <span className="text-[9px] font-bold text-slate-600">Digital PDF</span>
          </div>

          {/* Channel 2: Photo */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div className="w-full bg-cyan-400 rounded-full h-[45%]" />
            </div>
            <span className="text-[9px] font-bold text-slate-600">Photos</span>
          </div>

          {/* Channel 3: WhatsApp */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div className="w-full bg-blue-500 rounded-full h-[60%]" />
            </div>
            <span className="text-[9px] font-bold text-slate-600">WhatsApp</span>
          </div>

          {/* Channel 4: B2B QR */}
          <div className="flex flex-col items-center space-y-1">
            <div className="h-16 w-3.5 bg-slate-300/40 rounded-full overflow-hidden flex flex-col justify-end">
              <div className="w-full bg-emerald-500 rounded-full h-[90%]" />
            </div>
            <span className="text-[9px] font-bold text-slate-600">B2B QR</span>
          </div>
        </div>
      </div>

      {/* ROW 5: Concentric Arc Ring Gauge (Left) & "45,62" (Center) & "41,5%" (Right) */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex items-center justify-between min-h-[140px]"
      >
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Reconciliation Health
          </div>
          <div className="text-xl font-extrabold text-slate-800 mt-1">
            100% Balanced
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Tolerance: $\pm ₹1.00$
          </div>
        </div>

        {/* Multi-ring concentric arc (Matches Image) */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="3" />
            <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="60 40" />
            <circle cx="20" cy="20" r="11" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="45 25" />
          </svg>
        </div>
      </div>

      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Average Voucher Value
          </span>
          <span className="text-slate-400 text-xs font-mono">•••</span>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-extrabold text-slate-800">
            ₹45,62
          </span>
          <span className="text-xs text-slate-500">Thousand</span>
        </div>

        <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-bold">
          <span className="px-2 py-0.5 rounded-full bg-white/70 text-indigo-700">GST Eligible</span>
          <span>Indian B2B Input Credit</span>
        </div>
      </div>

      <div 
        onClick={() => onFilterClick && onFilterClick('ESCALATED')}
        className="md:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex items-center justify-between min-h-[140px]"
      >
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Audit Exception Rate
          </div>
          <div className="text-3xl font-extrabold text-indigo-900 mt-1">
            41,5%
          </div>
          <div className="text-[10px] text-amber-700 font-bold mt-0.5">
            Auto-Escalated for Review
          </div>
        </div>

        {/* Dual Donut Gauge Matching Image */}
        <div className="relative w-18 h-18 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="3" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="41.5 58.5" />
            <circle cx="18" cy="18" r="9" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="30 70" />
          </svg>
        </div>
      </div>
    </div>
  );
};
