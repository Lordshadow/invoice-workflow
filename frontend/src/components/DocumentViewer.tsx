import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  ExternalLink, 
  Download, 
  FileText 
} from 'lucide-react';
import { api } from '../services/api';

interface DocumentViewerProps {
  invoiceId: string;
  fileName?: string | null;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  invoiceId,
  fileName,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [loadError, setLoadError] = useState<boolean>(false);

  const fileUrl = api.getInvoiceFileUrl(invoiceId);
  const isPdf = fileName?.toLowerCase().endsWith('.pdf') ?? false;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div className="flex flex-col h-full rounded-squircle crystal-card overflow-hidden border border-white/90 shadow-crystal-card">
      {/* Top Glass Toolbar */}
      <div className="px-4 py-3 bg-white/60 border-b border-indigo-100/60 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 truncate max-w-[200px] sm:max-w-xs">
          <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <span className="font-bold text-slate-800 truncate" title={fileName || 'Original Invoice'}>
            {fileName || 'Original Document'}
          </span>
        </div>

        {/* Canvas Controls */}
        <div className="flex items-center space-x-1 crystal-pill px-2 py-1 rounded-full border border-white/80">
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white/60 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono font-bold px-1.5 text-slate-700 select-none">
            {zoom}%
          </span>

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white/60 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3 bg-slate-300 mx-1" />

          <button
            onClick={handleRotate}
            title="Rotate 90° Clockwise"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white/60 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleResetZoom}
            title="Reset View"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white/60 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3 bg-slate-300 mx-1" />

          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Document in New Tab"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white/60 transition-colors inline-flex items-center"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Document Viewport Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-100/60 relative min-h-[500px]">
        {loadError ? (
          <div className="text-center p-8 max-w-sm">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-800 mb-1">
              Document Preview Unavailable
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              The original file stream could not be loaded in browser canvas.
            </p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-2xl pod-blue text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-crystal-glow-blue"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File Directly</span>
            </a>
          </div>
        ) : isPdf ? (
          <iframe
            src={`${fileUrl}#toolbar=0&navpanes=0`}
            title="Invoice Document PDF"
            className="w-full h-full min-h-[600px] rounded-xl border border-indigo-100 shadow-md bg-white"
            onError={() => setLoadError(true)}
          />
        ) : (
          <div
            className="transition-transform duration-150 ease-out flex items-center justify-center"
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={fileUrl}
              alt="Invoice Document Preview"
              className="max-w-full max-h-[700px] object-contain rounded-xl shadow-xl border border-white"
              onError={() => setLoadError(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
