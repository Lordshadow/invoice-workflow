import React from 'react';
import { TrendingUp, ArrowUpRight, Zap, AlertTriangle, Layers } from 'lucide-react';
import type { EscalationStats } from '../types/invoice';

interface LiquidTopCardsProps {
  stats: EscalationStats | null;
  onFilterClick?: (filter: string) => void;
}

export const LiquidTopCards: React.FC<LiquidTopCardsProps> = ({ stats, onFilterClick }) => {
  const total = stats?.total_invoices ?? 0;
  const delivered = stats?.delivered_count ?? 0;
  const clean = stats?.clean_count ?? 0;
  const escalated = stats?.escalated_count ?? 0;
  const stpRate = stats?.stp_rate_percentage ?? 0.0;
  const escalatedRate = total > 0 ? ((escalated / total) * 100).toFixed(1) : '0.0';
  const zeroConflictRate = total > 0 ? (stats?.zero_conflict_rate ?? 0.0) : 0.0;

  const rawHourly = stats?.hourly_throughput ?? [];
  const hourlyThroughput = Array.isArray(rawHourly) && rawHourly.length === 7 
    ? rawHourly.map((v) => Number(v) || 0) 
    : [0, 0, 0, 0, 0, 0, 0];
  const maxThroughput = Math.max(...hourlyThroughput, 1);

  // Proportions for multi-tier progress bars
  const deliveredPct = total > 0 ? Math.min(100, Math.round((delivered / total) * 100)) : 0;
  const cleanPct = total > 0 ? Math.min(100, Math.round((clean / total) * 100)) : 0;
  const escalatedPct = total > 0 ? Math.min(100, Math.round((escalated / total) * 100)) : 0;

  // Generate smooth SVG curve safely
  const curvePoints = hourlyThroughput.map((v, i) => {
    const val = Number(v) || 0;
    const safeMax = maxThroughput > 0 ? maxThroughput : 1;
    const yVal = total > 0 ? Math.round(50 - (val / safeMax) * 35) : 55;
    return {
      x: Math.round((i / 6) * 200),
      y: isNaN(yVal) ? 55 : yVal,
    };
  });

  const hasValidPoints = curvePoints.length === 7 && curvePoints.every(p => !isNaN(p.x) && !isNaN(p.y));

  const strokePath = total > 0 && hasValidPoints
    ? `M ${curvePoints[0].x} ${curvePoints[0].y} ` +
      curvePoints.slice(1).map((p, i) => {
        const prev = curvePoints[i];
        const cpX = Math.round((prev.x + p.x) / 2);
        return `C ${cpX} ${prev.y}, ${cpX} ${p.y}, ${p.x} ${p.y}`;
      }).join(' ')
    : 'M 0 55 L 200 55';

  const areaPath = `${strokePath} L 200 60 L 0 60 Z`;

  const barColors = [
    'bg-white/70',
    'bg-cyan-400',
    'bg-blue-500',
    'bg-indigo-400',
    'bg-cyan-300',
    'bg-white',
    'bg-indigo-500',
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 mb-4">
      {/* CARD 1: Total Invoices Logged */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        title="View All Invoices in Registry"
        className="md:col-span-1 lg:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px] hover:border-indigo-300/60 transition-all"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Invoices Logged
          </span>
          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            {total} Records
          </span>
        </div>

        <div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-extrabold tracking-tight text-slate-800">
              {total.toLocaleString('en-IN')}
            </span>
            <div className="flex items-center text-[11px] font-bold text-emerald-600">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              <span>{total > 0 ? `${deliveredPct}% Auto-Posted` : '0% Ingested'}</span>
            </div>
          </div>
        </div>

        {/* Real Dynamic Horizontal Progress Bars */}
        <div className="space-y-1.5 pt-2">
          <div className="h-1.5 w-full bg-slate-300/40 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
              style={{ width: `${deliveredPct}%` }} 
            />
          </div>
          <div className="h-1.5 w-full bg-slate-300/40 rounded-full overflow-hidden flex space-x-1">
            <div 
              className="h-full bg-cyan-400 rounded-full transition-all duration-500" 
              style={{ width: `${cleanPct}%` }} 
            />
            <div 
              className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
              style={{ width: `${escalatedPct}%` }} 
            />
          </div>
        </div>
      </div>

      {/* CARD 2: Sinusoidal Spline Wave Trend */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        title="Ingestion Throughput Monitor"
        className="md:col-span-1 lg:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px] hover:border-cyan-300/60 transition-all"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-600" />
            <span>Ingestion Throughput</span>
          </span>
          <span className="text-xs font-bold text-indigo-700 bg-white/60 px-2 py-0.5 rounded-full">
            {total > 0 ? `${stpRate}% STP Rate` : '0% Throughput'}
          </span>
        </div>

        {/* Live Smooth Curved Spline Area Wave Bound to Real Database Records */}
        <div className="h-16 w-full relative -mb-2">
          <svg className="w-full h-full" viewBox="0 0 200 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="topWaveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path
              d={areaPath}
              fill="url(#topWaveGrad)"
            />
            <path
              d={strokePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
          <span>24h</span>
          <span>18h</span>
          <span>12h</span>
          <span>6h</span>
          <span>Live</span>
        </div>
      </div>

      {/* CARD 3: Human Review Rate & Bar Chart */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ESCALATED')}
        title="Open Escalated Invoices Requiring Human Review"
        className="md:col-span-2 lg:col-span-4 liquid-card-frosted p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px] hover:border-amber-400/50 transition-all"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Human Review Rate</span>
          </span>
          <span className="text-[10px] font-bold text-amber-800 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
            {escalated} Actionable
          </span>
        </div>

        <div className="flex items-end justify-between mt-2">
          <div>
            <div className="text-3xl font-extrabold tracking-tight text-slate-800">
              {escalatedRate}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {escalated} in Exception Queue
            </div>
          </div>

          {/* Vertical Glass Bars Driven by Dynamic Intake History */}
          <div className="flex items-end space-x-1.5 h-14">
            {hourlyThroughput.map((cnt, i) => {
              const barHeightPct = total > 0 && maxThroughput > 0 
                ? Math.max(10, Math.round((cnt / maxThroughput) * 100))
                : 0;
              return (
                <div
                  key={i}
                  title={`Interval ${i + 1}: ${cnt} vouchers`}
                  className={`w-2 rounded-full ${barColors[i]} transition-all duration-500`}
                  style={{ height: `${barHeightPct}%` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ROW 2 MINI CARDS: Velocity & Ledger Egress */}
      <div 
        onClick={() => onFilterClick && onFilterClick('ALL')}
        title="Filter All Invoices"
        className="md:col-span-6 liquid-card-frosted p-4 flex items-center justify-between cursor-pointer hover:border-indigo-300/60 transition-all"
      >
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
          <div className="text-base font-extrabold text-indigo-900">{zeroConflictRate}%</div>
          <div className="text-[10px] text-emerald-600 font-bold">{total} Vouchers Audited</div>
        </div>
      </div>

      <div 
        onClick={() => onFilterClick && onFilterClick('TARGET_ERP')}
        title="Switch to Target Company ERP Ledger View"
        className="md:col-span-6 liquid-card-dark p-4 flex items-center justify-between cursor-pointer hover:border-cyan-400/50 transition-all"
      >
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
          <div className="text-base font-extrabold text-cyan-400">{stpRate}%</div>
          <div className="text-[10px] text-slate-300">{delivered} Posted to Ledger</div>
        </div>
      </div>
    </div>
  );
};
