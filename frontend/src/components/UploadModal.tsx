import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  UploadCloud, 
  FileCheck, 
  AlertCircle, 
  Zap, 
  CheckCircle2, 
  RotateCw,
  ChevronDown,
  Check,
  MessageSquare,
  Mail,
  FileText,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { api } from '../services/api';
import type { ProcessInvoiceResult } from '../types/invoice';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ProcessInvoiceResult) => void;
}

const CHANNEL_OPTIONS = [
  {
    id: 'manual_upload',
    name: 'Manual Portal Upload',
    description: 'B2B PDF invoices, mobile photos (JPEG/PNG) & QR codes',
    icon: FileText,
    badge: 'Direct Intake',
    color: 'from-indigo-600 to-cyan-500',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Ingestion',
    description: 'OpenWA automated webhook listener & photo deskewing',
    icon: MessageSquare,
    badge: 'Automated',
    color: 'from-emerald-600 to-teal-400',
  },
  {
    id: 'email',
    name: 'Email IMAP Attachment',
    description: 'Accounts payable inbox poller & PDF vector parsing',
    icon: Mail,
    badge: 'Inbox Sync',
    color: 'from-blue-600 to-indigo-500',
  },
];

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<string>('manual_upload');
  const [enableStp, setEnableStp] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [result, setResult] = useState<ProcessInvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelDropdownRef = useRef<HTMLDivElement>(null);

  // Close custom channel dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(e.target as Node)) {
        setIsChannelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      const res = await api.uploadInvoice(file, source, enableStp);
      setResult(res);
      onSuccess(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invoice processing failed.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setIsChannelDropdownOpen(false);
    onClose();
  };

  const selectedChannel = CHANNEL_OPTIONS.find((c) => c.id === source) || CHANNEL_OPTIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      {/* Liquid Glass Modal Card */}
      <div className="w-full max-w-xl liquid-modal-glass p-6 sm:p-8 shadow-2xl relative border border-white/90">
        {/* Subtle Ambient Refraction Spheres inside the Glass */}
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between pb-5 border-b border-white/60">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-md border border-white/70 shrink-0">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Ingest Invoice Document
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-indigo-700 border border-white/80 shadow-xs">
                  Autonomous Intake
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Multi-channel intake with SHA-256 deduplication and AI extraction
              </p>
            </div>
          </div>

          <button
            onClick={resetState}
            className="w-8 h-8 rounded-full bg-white/40 hover:bg-white/80 border border-white/80 text-slate-500 hover:text-slate-800 transition-all shadow-xs flex items-center justify-center cursor-pointer active:scale-90"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="relative z-10 py-5 space-y-4">
          {result ? (
            /* Result State */
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div
                className={`p-5 rounded-2xl border backdrop-blur-md ${
                  result.delivered_to_target
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-sm'
                    : result.is_escalated
                    ? 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-sm'
                    : 'bg-indigo-50/80 border-indigo-300 text-indigo-950 shadow-sm'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    result.delivered_to_target
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {result.delivered_to_target ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    )}
                  </div>
                  <div className="text-xs flex-1">
                    <div className="font-extrabold text-sm text-slate-900">
                      {result.delivered_to_target
                        ? 'Straight-Through Processing Complete (STP)!'
                        : result.is_escalated
                        ? 'Flagged for Dual-Control Human Review'
                        : 'Document Ingestion Complete'}
                    </div>
                    <p className="text-slate-700 font-medium mt-0.5">{result.message}</p>
                    
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-800 font-mono bg-white/70 p-3.5 rounded-xl border border-white/90 shadow-xs">
                      <div className="truncate" title={result.file_name}>
                        <span className="font-bold text-slate-500">File:</span> {result.file_name}
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Grand Total:</span> ₹{result.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Lifecycle Status:</span> <span className="font-extrabold text-indigo-700">{result.status}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Deduplication:</span> {result.duplicate_type}
                      </div>
                      {result.invoice_id && (
                        <div className="sm:col-span-2 text-[10px] text-slate-500 truncate">
                          <span className="font-bold">Doc ID:</span> {result.invoice_id}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  onClick={resetState}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-black shadow-lg shadow-indigo-500/30 border border-white/60 transition-all active:scale-95 cursor-pointer flex items-center space-x-1.5"
                >
                  <span>Done & View in Registry</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Upload / Configuration State */
            <>
              {/* Liquid Glass Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`liquid-well-glass p-7 text-center cursor-pointer relative group ${
                  file ? 'border-indigo-500 bg-indigo-50/50' : ''
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                />

                {file ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-lg border border-white/80 mb-2.5">
                      <FileCheck className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-extrabold text-slate-900 truncate max-w-sm">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5 font-mono font-medium">
                      {(file.size / 1024).toFixed(1)} KB · Ready to Process
                    </span>
                    <div className="mt-2.5 inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200">
                      <Sparkles className="w-3 h-3" />
                      <span>Click or drop new file to replace</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 text-white flex items-center justify-center shadow-lg border border-white/80 mb-2.5 group-hover:scale-105 transition-transform duration-200">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-extrabold text-slate-900 tracking-tight">
                      Drag and drop invoice document here
                    </span>
                    <p className="text-xs text-slate-600 mt-1 max-w-sm font-medium">
                      Automatic format recognition, optical deskewing, and Indian GST B2B schema validation
                    </p>
                    
                    {/* Format Pill Tags */}
                    <div className="flex items-center space-x-1.5 mt-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/70 text-indigo-700 border border-white/80 shadow-xs">
                        PDF Vector
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/70 text-cyan-700 border border-white/80 shadow-xs">
                        JPEG / PNG
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/70 text-emerald-700 border border-white/80 shadow-xs">
                        B2B QR Code
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Liquid Glass Configuration Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                {/* 1. Custom Liquid Glass Channel Selector */}
                <div ref={channelDropdownRef} className="relative">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Channel Origin
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                    className="w-full p-2.5 rounded-2xl liquid-card-frosted border border-white/80 flex items-center justify-between text-left cursor-pointer hover:bg-white/60 transition-all shadow-xs h-[48px]"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${selectedChannel.color} text-white flex items-center justify-center shadow-xs shrink-0`}>
                        <selectedChannel.icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {selectedChannel.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate">
                          {selectedChannel.badge}
                        </div>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0 ml-1 ${isChannelDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Liquid Glass Floating Dropdown Menu */}
                  {isChannelDropdownOpen && (
                    <div className="absolute left-0 bottom-full mb-2 w-full sm:w-72 liquid-dropdown-glass p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                        Select Ingestion Channel
                      </div>
                      <div className="space-y-1">
                        {CHANNEL_OPTIONS.map((channel) => {
                          const isSelected = source === channel.id;
                          const Icon = channel.icon;
                          return (
                            <button
                              key={channel.id}
                              type="button"
                              onClick={() => {
                                setSource(channel.id);
                                setIsChannelDropdownOpen(false);
                              }}
                              className={`w-full p-2 rounded-xl text-left transition-all duration-150 flex items-center justify-between cursor-pointer border ${
                                isSelected
                                  ? 'bg-white/90 border-indigo-400/80 shadow-xs'
                                  : 'bg-white/40 border-transparent hover:bg-white/70'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5 min-w-0">
                                <div className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${channel.color} text-white flex items-center justify-center shadow-xs shrink-0`}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                                <div className="truncate">
                                  <div className="text-xs font-bold text-slate-900 truncate">
                                    {channel.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-medium truncate">
                                    {channel.description}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-indigo-700 shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Custom Liquid Glass STP Toggle Card */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Governance Automation
                  </label>

                  <div
                    onClick={() => setEnableStp(!enableStp)}
                    className="p-2.5 rounded-2xl liquid-card-frosted border border-white/80 flex items-center justify-between cursor-pointer hover:bg-white/60 transition-all shadow-xs h-[48px]"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        enableStp ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-xs' : 'bg-slate-200 text-slate-400'
                      }`}>
                        <Zap className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-extrabold text-slate-900 truncate flex items-center space-x-1">
                          <span>Straight-Through (STP)</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate">
                          {enableStp ? 'Auto-commit clean math' : 'Force manual review'}
                        </div>
                      </div>
                    </div>

                    {/* Smooth iOS-style Liquid Switch */}
                    <div className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 ml-2 ${
                      enableStp ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                        enableStp ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-800 text-xs flex items-center space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/50">
                <button
                  type="button"
                  onClick={resetState}
                  disabled={uploading}
                  className="px-5 py-2.5 rounded-full liquid-pill text-xs font-bold text-slate-700 hover:text-slate-900 border border-white/80 hover:bg-white/60 transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-black shadow-lg shadow-indigo-500/30 border border-white/60 disabled:opacity-50 flex items-center space-x-2 cursor-pointer transition-all active:scale-95"
                >
                  {uploading ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Extracting & Validating...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      <span>Upload & Process</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
