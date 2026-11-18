import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileCheck, 
  AlertCircle, 
  Zap, 
  CheckCircle2, 
  RotateCw 
} from 'lucide-react';
import { api } from '../services/api';
import type { ProcessInvoiceResult } from '../types/invoice';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ProcessInvoiceResult) => void;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-xl crystal-card rounded-squircle-lg p-6 shadow-2xl border border-white/90">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-indigo-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <UploadCloud className="w-5 h-5 text-indigo-600" />
              <span>Ingest Invoice Document</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Multi-channel intake with SHA-256 deduplication and AI extraction
            </p>
          </div>
          <button
            onClick={resetState}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-4">
          {/* Result view if finished */}
          {result ? (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl border ${
                  result.delivered_to_target
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : result.is_escalated
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-indigo-50 border-indigo-300 text-indigo-900'
                }`}
              >
                <div className="flex items-start space-x-3">
                  {result.delivered_to_target ? (
                    <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600" />
                  )}
                  <div className="text-xs">
                    <div className="font-extrabold text-sm mb-1 text-slate-900">
                      {result.delivered_to_target
                        ? 'Straight-Through Processing Complete!'
                        : result.is_escalated
                        ? 'Escalated for Human Review'
                        : 'Document Ingested'}
                    </div>
                    <p className="text-slate-700 font-medium">{result.message}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-mono">
                      <div>File: {result.file_name}</div>
                      <div>Grand Total: ₹{result.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                      <div>Status: {result.status}</div>
                      <div>Duplicate Check: {result.duplicate_type}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={resetState}
                  className="px-5 py-2 rounded-2xl pod-blue text-white text-xs font-bold shadow-crystal-glow-blue"
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  file
                    ? 'border-indigo-400 bg-indigo-50/50'
                    : 'border-indigo-200 hover:border-indigo-400 hover:bg-white/60'
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
                    <FileCheck className="w-10 h-10 text-indigo-600 mb-2" />
                    <span className="text-sm font-bold text-slate-900">{file.name}</span>
                    <span className="text-xs text-slate-500 mt-0.5 font-mono">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <span className="text-[11px] text-indigo-600 font-semibold mt-2">Click or drop to replace file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <UploadCloud className="w-10 h-10 text-indigo-400 mb-2" />
                    <span className="text-sm font-bold text-slate-800">
                      Drag and drop invoice document here
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      Supports PDF invoices, mobile photos (JPEG/PNG), and B2B QR e-invoices
                    </span>
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Channel Origin</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl crystal-input font-medium"
                  >
                    <option value="manual_upload">Manual Portal Upload</option>
                    <option value="whatsapp">WhatsApp Ingestion (OpenWA)</option>
                    <option value="email">Email IMAP Attachment</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center space-x-2 p-2 rounded-xl crystal-card cursor-pointer hover:bg-white/90 border border-white/80">
                    <input
                      type="checkbox"
                      checked={enableStp}
                      onChange={(e) => setEnableStp(e.target.checked)}
                      className="rounded accent-indigo-600 w-4 h-4"
                    />
                    <div>
                      <span className="font-bold text-slate-900 flex items-center space-x-1">
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Enable Straight-Through (STP)</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Auto-commits 100% clean math to Target DB
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={resetState}
                  disabled={uploading}
                  className="px-4 py-2 rounded-xl crystal-pill text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="px-5 py-2 rounded-2xl pod-purple text-white text-xs font-bold shadow-crystal-glow-purple disabled:opacity-50 flex items-center space-x-2"
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
