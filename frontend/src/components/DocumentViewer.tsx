import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ExternalLink, 
  Download, 
  FileText,
  RotateCcw,
  Image as ImageIcon,
  Eye,
  Layers
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
  const lowerName = fileName?.toLowerCase() || '';
  const isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.doc');
  const isPdf = lowerName.endsWith('.pdf') || isDocx;
  const isImage = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp');

  // Mode: 'native' uses browser's built-in PDF viewer; 'canvas' uses custom raster view
  const [viewMode, setViewMode] = useState<'native' | 'canvas'>(isPdf ? 'native' : 'canvas');

  // Image / Canvas Controls State
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const fileUrl = api.getInvoiceFileUrl(invoiceId, false);
  const downloadUrl = api.getInvoiceFileUrl(invoiceId, true);
  const previewUrl = api.getInvoicePreviewUrl(invoiceId, 1);

  // Zoom / Pan handlers for images & fallback canvas
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 20, 300));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 20, 40));
  const handleResetZoom = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="flex flex-col h-full rounded-squircle liquid-card-frosted overflow-hidden border border-white/90 shadow-2xl min-h-0 select-none">
      {/* Top Glass Toolbar */}
      <div className="px-4 py-2.5 bg-white/80 border-b border-indigo-100/70 flex flex-wrap items-center justify-between text-xs backdrop-blur-md gap-2">
        <div className="flex items-center space-x-2 min-w-0 max-w-[200px] sm:max-w-[240px] md:max-w-[300px]">
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
          {isPdf && !isDocx && (
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

        {/* Action Controls & Mode Switcher */}
        <div className="flex items-center space-x-1.5">
          {/* If PDF, show Native Browser Viewer vs Raster Canvas Toggle */}
          {isPdf && (
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                onClick={() => setViewMode('native')}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${
                  viewMode === 'native'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Use Browser's Native Built-in PDF Engine"
              >
                <Eye className="w-3 h-3" />
                <span>Browser PDF</span>
              </button>
              <button
                onClick={() => setViewMode('canvas')}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${
                  viewMode === 'canvas'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Use Custom Pan/Zoom Canvas"
              >
                <Layers className="w-3 h-3" />
                <span>Canvas</span>
              </button>
            </div>
          )}

          {/* Canvas Controls (Shown for images or when in canvas mode) */}
          {(isImage || viewMode === 'canvas') && (
            <div className="flex items-center space-x-1 liquid-pill px-2 py-1 rounded-full border border-white/80 bg-white/70 shadow-xs">
              <button
                onClick={handleZoomOut}
                title="Zoom Out"
                className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <span className="text-[11px] font-mono font-bold px-1 text-slate-700 select-none min-w-[38px] text-center">
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
            </div>
          )}

          {/* Download & External Open Buttons */}
          <div className="flex items-center space-x-1 liquid-pill px-1.5 py-1 rounded-full border border-white/80 bg-white/70 shadow-xs">
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
              title="Open in Full-Screen Browser Tab"
              className="p-1 rounded-lg text-slate-600 hover:text-indigo-900 hover:bg-white transition-colors inline-flex items-center cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Document Viewport Area */}
      <div className="flex-1 w-full h-full min-h-[450px] relative overflow-hidden bg-slate-900/5 p-2 sm:p-3 flex flex-col">
        {isPdf && viewMode === 'native' ? (
          /* Native Browser PDF Viewer (Uses Chrome/Firefox/Edge built-in PDFium) */
          <div className="w-full h-full flex-1 rounded-2xl overflow-hidden shadow-sm border border-slate-300/80 bg-white relative">
            <iframe
              key={`native-pdf-${invoiceId}`}
              src={`${fileUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
              title={fileName || 'Native Browser PDF Viewer'}
              className="w-full h-full border-0 block"
            />
          </div>
        ) : (
          /* Canvas & Image Viewer (Pan, Zoom, Drag) */
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full flex-1 overflow-auto p-4 flex flex-col rounded-2xl bg-slate-900/5 border border-slate-200/60 relative ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div
              className="m-auto transition-transform duration-75 ease-out select-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
            >
              <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-300/80 min-w-[280px] max-w-none inline-flex items-center justify-center relative ring-1 ring-slate-900/5">
                <img
                  src={isImage ? fileUrl : previewUrl}
                  alt={fileName || 'Invoice Document'}
                  draggable={false}
                  className="max-h-[calc(100vh-260px)] max-w-[850px] w-auto h-auto object-contain rounded-xl shadow-xs pointer-events-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
