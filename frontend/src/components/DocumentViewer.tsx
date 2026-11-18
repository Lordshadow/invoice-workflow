import React, { useState, useEffect } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ExternalLink, 
  Download, 
  FileText,
  RotateCcw,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(true);

  // Reset state and fetch total pages whenever active invoice changes
  useEffect(() => {
    setLoadError(false);
    setImageLoading(true);
    setZoom(100);
    setRotation(0);
    setCurrentPage(1);
    setTotalPages(1);

    let isMounted = true;
    const fetchDocInfo = async () => {
      try {
        const previewUrl = api.getInvoicePreviewUrl(invoiceId, 1);
        const res = await fetch(previewUrl, { method: 'HEAD' });
        const total = res.headers.get('x-total-pages');
        if (isMounted && total) {
          const parsed = parseInt(total, 10);
          if (!isNaN(parsed) && parsed > 0) {
            setTotalPages(parsed);
          }
        }
      } catch {
        // Fallback silently if HEAD not supported
      }
    };

    fetchDocInfo();
    return () => {
      isMounted = false;
    };
  }, [invoiceId]);

  // When changing page, show loading spinner
  const handlePageChange = (newPage: number) => {
    setImageLoading(true);
    setCurrentPage(newPage);
  };

  const fileUrl = api.getInvoiceFileUrl(invoiceId, false);
  const downloadUrl = api.getInvoiceFileUrl(invoiceId, true);
  const previewUrl = api.getInvoicePreviewUrl(invoiceId, currentPage);

  const lowerName = fileName?.toLowerCase() || '';
  const isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.doc');
  const isPdf = lowerName.endsWith('.pdf');
  const isImage = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp');

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div className="flex flex-col h-full rounded-squircle liquid-card-frosted overflow-hidden border border-white/90 shadow-2xl min-h-0">
      {/* Top Glass Toolbar */}
      <div className="px-4 py-3 bg-white/70 border-b border-indigo-100/70 flex items-center justify-between text-xs backdrop-blur-md">
        <div className="flex items-center space-x-2 truncate max-w-[200px] sm:max-w-xs">
          <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-xs">
            {isImage ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
          </div>
          <span className="font-bold text-slate-800 truncate" title={fileName || 'Original Document'}>
            {fileName || 'Original Document'}
          </span>
          {isDocx && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
              DOCX
            </span>
          )}
          {isPdf && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
              PDF
            </span>
          )}
          {isImage && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
              Photo
            </span>
          )}
        </div>

        {/* Multi-Page Navigation (if document has multiple pages) */}
        {totalPages > 1 && (
          <div className="flex items-center space-x-1.5 bg-white/80 rounded-xl px-2.5 py-1 border border-indigo-200 shadow-xs text-xs">
            <button
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
              className="p-0.5 rounded text-slate-600 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] font-bold text-slate-700 px-1 select-none">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
              className="p-0.5 rounded text-slate-600 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Canvas Controls (Universal for PDF, DOCX, and Images) */}
        <div className="flex items-center space-x-1 liquid-pill px-2 py-1 rounded-full border border-white/80 bg-white/60">
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono font-bold px-1.5 text-slate-700 select-none">
            {zoom}%
          </span>

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3 bg-slate-300 mx-1" />

          <button
            onClick={handleRotate}
            title="Rotate 90° Clockwise"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleResetZoom}
            title="Reset View"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3 bg-slate-300 mx-1" />

          {/* Explicit Manual Download */}
          <a
            href={downloadUrl}
            download={fileName || 'invoice_document'}
            title="Download Original Document File"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors inline-flex items-center cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </a>

          {/* Open Original File in New Tab */}
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Original Document in New Tab"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors inline-flex items-center cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Document Viewport Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/5 backdrop-blur-xs relative min-h-[400px]">
        {loadError ? (
          <div className="text-center p-8 max-w-sm liquid-modal-glass rounded-2xl shadow-xl border border-white">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-800 mb-1">
              Document Preview Unavailable
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              The original document file could not be loaded in browser canvas.
            </p>
            <a
              href={downloadUrl}
              download={fileName || 'invoice_document'}
              className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-md active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File Directly</span>
            </a>
          </div>
        ) : (
          <div
            className="transition-transform duration-150 ease-out flex items-center justify-center max-w-full"
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <div className="bg-white p-3 rounded-2xl shadow-2xl border border-slate-300/80 min-w-[280px] max-w-full flex items-center justify-center relative ring-1 ring-slate-900/5">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl z-10 backdrop-blur-xs">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              )}
              <img
                key={`${invoiceId}-p${currentPage}`}
                src={previewUrl}
                alt={fileName || 'Invoice Document Preview'}
                onLoad={() => setImageLoading(false)}
                className="max-w-full max-h-[calc(100vh-250px)] object-contain rounded-xl shadow-sm select-none"
                onError={() => {
                  setImageLoading(false);
                  setLoadError(true);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
