import React, { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
  Maximize2,
  Minimize2,
  Hand
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
  
  // Interactive Pan / Drag State
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state and fetch total pages whenever active invoice changes
  useEffect(() => {
    setLoadError(false);
    setImageLoading(true);
    setZoom(100);
    setPan({ x: 0, y: 0 });
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

  // When changing page, show loading spinner & reset pan
  const handlePageChange = (newPage: number) => {
    setImageLoading(true);
    setPan({ x: 0, y: 0 });
    setCurrentPage(newPage);
  };

  const fileUrl = api.getInvoiceFileUrl(invoiceId, false);
  const downloadUrl = api.getInvoiceFileUrl(invoiceId, true);
  const previewUrl = api.getInvoicePreviewUrl(invoiceId, currentPage);

  const lowerName = fileName?.toLowerCase() || '';
  const isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.doc');
  const isPdf = lowerName.endsWith('.pdf');
  const isImage = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp');

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 20, 300));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 20, 40));
  
  const handleResetZoom = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleFitToWidth = () => {
    if (containerRef.current && imgRef.current) {
      const containerW = containerRef.current.clientWidth - 48; // account for padding
      const imgNaturalW = imgRef.current.naturalWidth || 800;
      const calculatedZoom = Math.round((containerW / imgNaturalW) * 100);
      setZoom(Math.max(50, Math.min(calculatedZoom, 250)));
      setPan({ x: 0, y: 0 });
      setRotation(0);
    } else {
      setZoom(120);
      setPan({ x: 0, y: 0 });
    }
  };

  const handleFitToPage = () => {
    if (containerRef.current && imgRef.current) {
      const containerH = containerRef.current.clientHeight - 48;
      const imgNaturalH = imgRef.current.naturalHeight || 1100;
      const calculatedZoom = Math.round((containerH / imgNaturalH) * 100);
      setZoom(Math.max(40, Math.min(calculatedZoom, 150)));
      setPan({ x: 0, y: 0 });
      setRotation(0);
    } else {
      setZoom(90);
      setPan({ x: 0, y: 0 });
    }
  };

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  // Mouse Drag / Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary click
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="flex flex-col h-full rounded-squircle liquid-card-frosted overflow-hidden border border-white/90 shadow-2xl min-h-0 select-none">
      {/* Top Glass Toolbar */}
      <div className="px-4 py-2.5 bg-white/75 border-b border-indigo-100/70 flex flex-wrap items-center justify-between text-xs backdrop-blur-md gap-2">
        <div className="flex items-center space-x-2 min-w-0 max-w-[150px] sm:max-w-[200px] md:max-w-[260px]">
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

        {/* Multi-Page Navigation */}
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

        {/* Canvas Controls */}
        <div className="flex items-center space-x-1 liquid-pill px-2 py-1 rounded-full border border-white/80 bg-white/70 shadow-xs">
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono font-bold px-1.5 text-slate-700 select-none min-w-[42px] text-center">
            {zoom}%
          </span>

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3 bg-slate-300 mx-0.5" />

          {/* Fit to Width & Fit to Page Quick Action Buttons */}
          <button
            onClick={handleFitToWidth}
            title="Fit to Width"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleFitToPage}
            title="Fit to Page"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3 bg-slate-300 mx-0.5" />

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

          <div className="w-[1px] h-3 bg-slate-300 mx-0.5" />

          {/* Download & External Open */}
          <a
            href={downloadUrl}
            download={fileName || 'invoice_document'}
            title="Download Original Document File"
            className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors inline-flex items-center cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </a>

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

      {/* Document Viewport Area with Full Pan & Anti-Clipping Canvas */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 overflow-auto p-6 flex flex-col bg-slate-900/5 backdrop-blur-xs relative min-h-[400px] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {loadError ? (
          <div className="m-auto text-center p-8 max-w-sm liquid-modal-glass rounded-2xl shadow-xl border border-white">
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
            className="m-auto transition-transform duration-75 ease-out select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-2xl border border-slate-300/80 min-w-[280px] max-w-none inline-flex items-center justify-center relative ring-1 ring-slate-900/5">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl z-10 backdrop-blur-xs">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              )}
              <img
                ref={imgRef}
                key={`${invoiceId}-p${currentPage}`}
                src={previewUrl}
                alt={fileName || 'Invoice Document Preview'}
                onLoad={() => setImageLoading(false)}
                draggable={false}
                className="max-h-[calc(100vh-250px)] max-w-[850px] w-auto h-auto object-contain rounded-xl shadow-xs pointer-events-none"
                onError={() => {
                  setImageLoading(false);
                  setLoadError(true);
                }}
              />
            </div>
          </div>
        )}

        {/* Small subtle dragging hint pill at the bottom */}
        {!loadError && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none opacity-50 hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-semibold text-slate-500 bg-white/70 px-2.5 py-0.5 rounded-full border border-slate-200 shadow-xs flex items-center space-x-1">
              <Hand className="w-3 h-3 text-slate-400" />
              <span>Click & drag to pan • Use buttons above to fit width</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
