import React, { useState } from 'react';
import { 
  Zap, 
  CheckCircle2, 
  Activity, 
  FileText, 
  Scan, 
  Cpu, 
  ShieldCheck, 
  Database, 
  ArrowRight, 
  RotateCw, 
  AlertTriangle, 
  X,
  Play
} from 'lucide-react';
import type { EscalationStats, PipelineProcessState } from '../types/invoice';

interface LiquidHeroWaveProps {
  stats: EscalationStats | null;
  onFilterClick?: (filter: string) => void;
  pipelineProcess?: PipelineProcessState;
  onRunSamplePipeline?: () => void;
  onSelectInvoice?: (invoiceId: string) => void;
  onDismissPipeline?: () => void;
}

interface PipelineStageDef {
  id: number;
  name: string;
  shortName: string;
  subtext: string;
  x: number;
  y: number;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const PIPELINE_STAGES: PipelineStageDef[] = [
  {
    id: 0,
    name: '1. Ingestion & Intake',
    shortName: 'Intake',
    subtext: 'SHA-256 Deduplication',
    x: 75,
    y: 162,
    icon: FileText,
    description: 'Multi-channel intake (Web, WhatsApp, IMAP) with cryptographic SHA-256 hash deduplication.',
  },
  {
    id: 1,
    name: '2. Vision Preprocessing',
    shortName: 'Vision',
    subtext: 'OpenCV & QR Scanner',
    x: 240,
    y: 60,
    icon: Scan,
    description: '300 DPI rasterization, OpenCV adaptive contrast deskewing, and Indian B2B QR code extraction.',
  },
  {
    id: 2,
    name: '3. AI Extraction Engine',
    shortName: 'AI Extract',
    subtext: 'Multimodal Vision LLM',
    x: 400,
    y: 152,
    icon: Cpu,
    description: 'Multimodal AI vision extraction and field normalization with confidence scoring.',
  },
  {
    id: 3,
    name: '4. Deterministic Validation',
    shortName: 'Validation',
    subtext: 'Indian GST Math Guard',
    x: 650,
    y: 50,
    icon: ShieldCheck,
    description: 'Deterministic cross-checking of GSTIN checksums, HSN codes, and line-item arithmetic balance.',
  },
  {
    id: 4,
    name: '5. Target ERP Delivery',
    shortName: 'ERP Egress',
    subtext: 'ACID Ledger Posting',
    x: 755,
    y: 115,
    icon: Database,
    description: 'Autonomous straight-through ACID insertion into Target Company ERP database or human escalation.',
  },
];

export const LiquidHeroWave: React.FC<LiquidHeroWaveProps> = ({ 
  stats, 
  onFilterClick,
  pipelineProcess,
  onRunSamplePipeline,
  onSelectInvoice,
  onDismissPipeline
}) => {
  const [hoveredStage, setHoveredStage] = useState<PipelineStageDef | null>(null);

  const total = stats?.total_invoices ?? 0;
  const stpRate = stats?.stp_rate_percentage ?? 0.0;
  const delivered = stats?.delivered_count ?? 0;
  const deliveredGross = stats?.delivered_gross_value ?? 0.0;
  const avgConfidence = total > 0 ? (stats?.avg_confidence_score ?? 0.0) : 0.0;
  const mathErrors = stats?.category_breakdown?.['MATH_MISMATCH'] ?? 0;
  const balancedRate = total > 0 
    ? (((total - mathErrors) / total) * 100).toFixed(1) 
    : '0.0';

  const isRunning = pipelineProcess?.isActive && pipelineProcess?.status === 'running';
  const isCompleted = pipelineProcess?.isActive && pipelineProcess?.status === 'completed';
  const isError = pipelineProcess?.isActive && pipelineProcess?.status === 'error';
  const activeStageIdx = pipelineProcess?.currentStage ?? -1;

  // Active glowing particle coordinate along the Bezier curve
  const activeStageCoord = activeStageIdx >= 0 && activeStageIdx < PIPELINE_STAGES.length 
    ? PIPELINE_STAGES[activeStageIdx] 
    : PIPELINE_STAGES[0];

  return (
    <div className="liquid-card-hero p-5 sm:p-7 md:p-8 mb-4 relative overflow-hidden transition-all duration-300">
      {/* Top Header Row of Hero Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-white/30 gap-3">
        <div className="flex items-center space-x-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm border border-white/80 transition-colors ${
            isRunning 
              ? 'bg-gradient-to-tr from-indigo-600 to-cyan-400 text-white animate-pulse'
              : 'bg-white/70 backdrop-blur-md text-indigo-700'
          }`}>
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-extrabold text-slate-800 tracking-tight">
                Autonomous Straight-Through Processing Flow
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                isRunning
                  ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm animate-pulse'
                  : 'bg-cyan-500/20 text-cyan-800 border-cyan-400/40'
              }`}>
                {isRunning ? 'Processing Live Document' : 'Live Interactive Pipeline'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 font-medium">
              5-Stage Autonomous Engine: Intake & Deduplication → Vision Preprocessing → AI Multimodal Extraction → GST Validation → Target ERP Egress
            </p>
          </div>
        </div>

        {/* Right Controls: Metric Buttons & Live Pipeline Trigger */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {onRunSamplePipeline && !isRunning && (
            <button
              onClick={onRunSamplePipeline}
              title="Execute a live sample invoice through the 5-stage pipeline on the wave"
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold flex items-center space-x-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Test Live STP Flow</span>
            </button>
          )}

          <button 
            onClick={() => onFilterClick && onFilterClick('DELIVERED')}
            title="Filter to Straight-Through Processed Vouchers"
            className="px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white/80 backdrop-blur-md border border-white/80 text-slate-700 font-semibold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-cyan-600" />
            <span>STP: <b className="text-indigo-900">{stpRate}%</b></span>
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

      {/* ACTIVE PIPELINE RUN HUD OVERLAY (When a document is being processed) */}
      {isRunning && (
        <div className="mt-4 p-3.5 rounded-2xl liquid-modal-glass border border-indigo-400/80 bg-indigo-500/10 backdrop-blur-xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <RotateCw className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-900 flex items-center space-x-2">
                <span className="truncate max-w-[200px] sm:max-w-xs">{pipelineProcess?.fileName}</span>
                {pipelineProcess?.fileSizeKb && (
                  <span className="text-[10px] text-slate-500 font-mono font-normal">
                    ({pipelineProcess.fileSizeKb} KB)
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold border border-indigo-200">
                  Stage {activeStageIdx + 1} of 5
                </span>
              </div>
              <div className="text-xs text-indigo-900 font-semibold mt-0.5">
                {pipelineProcess?.statusMessage}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 self-end sm:self-auto w-full sm:w-48">
            <div className="h-2 flex-1 bg-white/80 rounded-full overflow-hidden border border-indigo-200">
              <div 
                className="h-full bg-gradient-to-r from-indigo-600 to-cyan-400 transition-all duration-300 rounded-full"
                style={{ width: `${pipelineProcess?.stageProgress ?? 0}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-indigo-900 shrink-0">
              {pipelineProcess?.stageProgress ?? 0}%
            </span>
          </div>
        </div>
      )}

      {/* PIPELINE COMPLETED BANNER */}
      {isCompleted && pipelineProcess?.result && (
        <div className={`mt-4 p-4 rounded-2xl border backdrop-blur-xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 ${
          pipelineProcess.result.delivered_to_target
            ? 'bg-emerald-500/15 border-emerald-400/80 text-emerald-950'
            : 'bg-amber-500/15 border-amber-400/80 text-amber-950'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              pipelineProcess.result.delivered_to_target
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 text-white'
            }`}>
              {pipelineProcess.result.delivered_to_target ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="text-xs font-black">
                {pipelineProcess.result.delivered_to_target
                  ? 'Straight-Through Processing Complete (100% Autonomous STP)'
                  : 'Document Flagged for Dual-Control Review'}
              </div>
              <div className="text-xs text-slate-700 mt-0.5 font-medium">
                {pipelineProcess.result.message} · Grand Total: <span className="font-mono font-bold">₹{pipelineProcess.result.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
            {pipelineProcess.result.invoice_id && onSelectInvoice && (
              <button
                onClick={() => {
                  if (pipelineProcess.result?.invoice_id) {
                    onSelectInvoice(pipelineProcess.result.invoice_id);
                  }
                }}
                className={`px-4 py-1.5 rounded-xl text-white text-xs font-bold shadow-md flex items-center space-x-1.5 active:scale-95 cursor-pointer ${
                  pipelineProcess.result.delivered_to_target
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                <span>Review Voucher</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {onDismissPipeline && (
              <button
                onClick={onDismissPipeline}
                className="w-8 h-8 rounded-full bg-white/60 hover:bg-white text-slate-600 flex items-center justify-center transition-all cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* PIPELINE ERROR BANNER */}
      {isError && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-500/15 border border-rose-400/80 text-rose-950 backdrop-blur-xl shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-black text-rose-900">Pipeline Execution Halted</div>
              <div className="text-xs text-slate-700 mt-0.5 font-medium">{pipelineProcess?.statusMessage}</div>
            </div>
          </div>
          {onDismissPipeline && (
            <button
              onClick={onDismissPipeline}
              className="px-3 py-1.5 rounded-xl liquid-pill text-xs font-bold text-slate-700 hover:text-slate-900 border border-white/80 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Main Sinusoidal Dual Spline Wave Chart with Interactive Stage Nodes */}
      <div className="relative mt-4 h-56 sm:h-64 w-full">
        <svg className="w-full h-full" viewBox="0 0 800 240" preserveAspectRatio="none">
          <defs>
            {/* Luminous cyan-blue gradient fill for the primary wave */}
            <linearGradient id="heroWaveCyan" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={isRunning ? "0.85" : "0.65"} />
              <stop offset="40%" stopColor="#2563eb" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#4338ca" stopOpacity="0.05" />
            </linearGradient>

            {/* Violet-teal gradient fill for the secondary foreground wave */}
            <linearGradient id="heroWaveViolet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.02" />
            </linearGradient>

            {/* Flowing animated gradient for active processing line */}
            <linearGradient id="flowBeam" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>

            {/* Glowing filter for wave stroke */}
            <filter id="waveGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Intense node halo glow */}
            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background horizontal grid lines */}
          <line x1="0" y1="40" x2="800" y2="40" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />
          <line x1="0" y1="90" x2="800" y2="90" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />
          <line x1="0" y1="140" x2="800" y2="140" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />
          <line x1="0" y1="190" x2="800" y2="190" stroke="rgba(255, 255, 255, 0.35)" strokeDasharray="3 3" />

          {/* Secondary Wave (Violet / Indigo) */}
          <path
            d={total > 0 || isRunning
              ? "M 0 160 C 120 90, 220 200, 360 110 C 500 40, 620 170, 800 100 L 800 240 L 0 240 Z"
              : "M 0 210 C 200 206, 400 210, 600 206 C 700 208, 750 208, 800 210 L 800 240 L 0 240 Z"
            }
            fill="url(#heroWaveViolet)"
          />
          <path
            d={total > 0 || isRunning
              ? "M 0 160 C 120 90, 220 200, 360 110 C 500 40, 620 170, 800 100"
              : "M 0 210 C 200 206, 400 210, 600 206 C 700 208, 750 208, 800 210"
            }
            fill="none"
            stroke="#a5b4fc"
            strokeWidth={total > 0 || isRunning ? 2.5 : 1.5}
            strokeLinecap="round"
          />

          {/* Primary Wave (Luminous Cyan & Deep Blue) */}
          <path
            d={total > 0 || isRunning
              ? "M 0 130 C 140 190, 240 60, 380 140 C 520 210, 650 50, 800 120 L 800 240 L 0 240 Z"
              : "M 0 215 C 200 212, 400 215, 600 212 C 700 214, 750 214, 800 215 L 800 240 L 0 240 Z"
            }
            fill="url(#heroWaveCyan)"
          />

          {/* Primary Crest Glow Stroke */}
          <path
            d={total > 0 || isRunning
              ? "M 0 130 C 140 190, 240 60, 380 140 C 520 210, 650 50, 800 120"
              : "M 0 215 C 200 212, 400 215, 600 212 C 700 214, 750 214, 800 215"
            }
            fill="none"
            stroke={isRunning ? "url(#flowBeam)" : "#ffffff"}
            strokeWidth={isRunning ? 4.5 : total > 0 ? 3.5 : 2}
            strokeLinecap="round"
            filter="url(#waveGlow)"
          />

          {/* 5 REAL PIPELINE STAGE NODES (Replaces arbitrary dots with functional stages) */}
          {PIPELINE_STAGES.map((stage) => {
            const isStageActive = isRunning && activeStageIdx === stage.id;
            const isStageCompleted = isCompleted || (isRunning && activeStageIdx > stage.id);
            const isStagePending = isRunning && activeStageIdx < stage.id;

            return (
              <g 
                key={stage.id} 
                className="cursor-pointer transition-transform duration-200"
                onMouseEnter={() => setHoveredStage(stage)}
                onMouseLeave={() => setHoveredStage(null)}
              >
                {/* Active Stage Pulsing Ripple Effect */}
                {isStageActive && (
                  <>
                    <circle
                      cx={stage.x}
                      cy={stage.y}
                      r="22"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                      opacity="0.8"
                    >
                      <animate
                        attributeName="r"
                        values="14;28;14"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.8;0;0.8"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}

                {/* Stage Outer Disc */}
                <circle
                  cx={stage.x}
                  cy={stage.y}
                  r="13"
                  fill={
                    isStageCompleted
                      ? "#10b981"
                      : isStageActive
                      ? "#6366f1"
                      : isStagePending
                      ? "rgba(255,255,255,0.4)"
                      : "#ffffff"
                  }
                  stroke={
                    isStageCompleted
                      ? "#ffffff"
                      : isStageActive
                      ? "#38bdf8"
                      : "#c7d2fe"
                  }
                  strokeWidth="3"
                  filter={isStageActive ? "url(#nodeGlow)" : undefined}
                />

                {/* Stage Number / Center Glyphs */}
                {isStageCompleted ? (
                  // Small Checkmark in SVG
                  <path
                    d={`M ${stage.x - 4} ${stage.y} L ${stage.x - 1} ${stage.y + 3} L ${stage.x + 4} ${stage.y - 3}`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <text
                    x={stage.x}
                    y={stage.y + 3.5}
                    textAnchor="middle"
                    fill={isStageActive ? "#ffffff" : "#4338ca"}
                    fontSize="10"
                    fontWeight="800"
                    fontFamily="monospace"
                  >
                    {stage.id + 1}
                  </text>
                )}

                {/* Stage Label Text placed along the curve */}
                <text
                  x={stage.x}
                  y={stage.y > 100 ? stage.y + 24 : stage.y - 16}
                  textAnchor="middle"
                  fill="#1e1b4b"
                  fontSize="10"
                  fontWeight="800"
                >
                  {stage.shortName}
                </text>
                <text
                  x={stage.x}
                  y={stage.y > 100 ? stage.y + 35 : stage.y - 6}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="8"
                  fontWeight="600"
                >
                  {stage.subtext}
                </text>
              </g>
            );
          })}

          {/* ACTIVE TRAVELING DATA BEAM PARTICLE */}
          {isRunning && (
            <circle
              cx={activeStageCoord.x}
              cy={activeStageCoord.y}
              r="6.5"
              fill="#ffffff"
              stroke="#38bdf8"
              strokeWidth="2.5"
              filter="url(#waveGlow)"
            />
          )}
        </svg>

        {/* Hovered Stage Inspector Tooltip */}
        {hoveredStage && (
          <div 
            className="absolute z-30 p-3 rounded-2xl liquid-modal-glass border border-white/90 shadow-2xl text-xs max-w-xs animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
            style={{
              left: `${Math.min(75, Math.max(10, (hoveredStage.x / 800) * 100))}%`,
              top: hoveredStage.y > 120 ? '15%' : '55%',
              transform: 'translateX(-50%)'
            }}
          >
            <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
              <span>{hoveredStage.name}</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-1 font-medium leading-snug">
              {hoveredStage.description}
            </div>
            <div className="mt-2 text-[10px] text-indigo-700 font-bold bg-indigo-50/80 p-1.5 rounded-lg border border-indigo-100 flex items-center justify-between">
              <span>Subsystem Status:</span>
              <span className="font-mono font-black text-emerald-700">ONLINE</span>
            </div>
          </div>
        )}
      </div>

      {/* Wave Bottom Metrics Ribbon (Unobstructed, zero collision with stage nodes) */}
      <div className="mt-3 pt-3 border-t border-indigo-100/50 flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>AI Extraction Confidence: <b className="text-slate-900 font-mono">{(avgConfidence * 100).toFixed(1)}%</b></span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Arithmetic Integrity: <b className="text-emerald-700 font-mono">{balancedRate}% Clean</b></span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Target Gross Settled: <b className="text-blue-800 font-mono">₹{deliveredGross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
          </span>
        </div>
        <div className="text-[10px] text-slate-500 font-medium">
          Hover stage nodes 1–5 to inspect autonomous subsystem telemetry
        </div>
      </div>
    </div>
  );
};
