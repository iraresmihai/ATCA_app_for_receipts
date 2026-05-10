import React, { useEffect, useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const COLORS = {
  receipt: { border: 'border-blue-500',  bg: 'bg-blue-500/10'  },
  line:    { border: 'border-amber-500', bg: 'bg-amber-500/20' },
  field:   { border: 'border-emerald-500', bg: 'bg-emerald-500/15' }
};

// Rotate a page-relative bbox by `rot` degrees clockwise (0/90/180/270).
function rotateBbox(bbox, rot) {
  if (!bbox) return null;
  const r = ((rot % 360) + 360) % 360;
  const { x, y, w, h } = bbox;
  if (r === 90)  return { x: 1 - y - h, y: x,         w: h, h: w };
  if (r === 180) return { x: 1 - x - w, y: 1 - y - h, w,    h    };
  if (r === 270) return { x: y,         y: 1 - x - w, w: h, h: w };
  return { x, y, w, h };
}

// Rotate a page-relative point. Same convention as rotateBbox.
function rotatePoint(x, y, rot) {
  const r = ((rot % 360) + 360) % 360;
  if (r === 90)  return { x: 1 - y, y: x };
  if (r === 180) return { x: 1 - x, y: 1 - y };
  if (r === 270) return { x: y,     y: 1 - x };
  return { x, y };
}

function BBoxOverlay({ bbox, kind = 'receipt', label }) {
  if (!bbox) return null;
  const c = COLORS[kind] || COLORS.receipt;
  return (
    <div
      className={`absolute border-2 ${c.border} ${c.bg} pointer-events-none rounded-sm`}
      style={{
        left: `${bbox.x * 100}%`,
        top:  `${bbox.y * 100}%`,
        width:  `${bbox.w * 100}%`,
        height: `${bbox.h * 100}%`
      }}
    >
      {label && (
        <span className={`absolute -top-5 left-0 text-xs px-1 rounded ${c.bg} ${c.border} border`}>
          {label}
        </span>
      )}
    </div>
  );
}

export default function PdfViewer({
  pdfData, page, overlays = [],
  drawMode = false, onDrawComplete, onCancelDraw,
  annotations = [], annotationTool = null,
  onPlaceAnnotation, onRemoveAnnotation, onCancelAnnotation
}) {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [rotations, setRotations] = useState({}); // { [pageNumber]: 0|90|180|270 }
  const [draw, setDraw] = useState(null); // { page, x0, y0, x1, y1 } — in *rendered* (rotated) page-fractions
  const pageRefs = useRef({});
  const drawAreaRefs = useRef({});

  useEffect(() => { if (pdfData) setFile({ data: pdfData }); }, [pdfData]);
  useEffect(() => { setRotations({}); }, [pdfData]);

  // Cancel any in-progress draw if drawMode flips off.
  useEffect(() => { if (!drawMode) setDraw(null); }, [drawMode]);

  // Esc cancels draw mode or annotation placement.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (drawMode) { setDraw(null); onCancelDraw?.(); }
      if (annotationTool) onCancelAnnotation?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawMode, onCancelDraw, annotationTool, onCancelAnnotation]);

  // Scroll to the selected receipt's page when the selection changes.
  useEffect(() => {
    if (!numPages) return;
    const el = pageRefs.current[page];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [page, numPages]);

  function rotate(p, delta) {
    setRotations(prev => ({ ...prev, [p]: (((prev[p] ?? 0) + delta) % 360 + 360) % 360 }));
  }

  function pointFromEvent(e, p) {
    const el = drawAreaRefs.current[p];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height))
    };
  }

  function onPointerDown(e, p) {
    if (!drawMode) return;
    e.preventDefault();
    const pt = pointFromEvent(e, p);
    if (!pt) return;
    setDraw({ page: p, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e, p) {
    if (!drawMode || !draw || draw.page !== p) return;
    const pt = pointFromEvent(e, p);
    if (!pt) return;
    setDraw(d => ({ ...d, x1: pt.x, y1: pt.y }));
  }

  function onAnnotationClick(e, p) {
    if (!annotationTool) return;
    const pt = pointFromEvent(e, p);
    if (!pt) return;
    const rot = rotations[p] ?? 0;
    const original = rotatePoint(pt.x, pt.y, (360 - rot) % 360);
    onPlaceAnnotation?.(p, original.x, original.y);
  }

  function onPointerUp(e, p) {
    if (!drawMode || !draw || draw.page !== p) return;
    const x = Math.min(draw.x0, draw.x1);
    const y = Math.min(draw.y0, draw.y1);
    const w = Math.abs(draw.x1 - draw.x0);
    const h = Math.abs(draw.y1 - draw.y0);
    setDraw(null);
    if (w < 0.01 || h < 0.01) return; // ignore accidental clicks
    // The user drew on the *rendered* (rotated) page. Convert back to original coords
    // so the stored bbox stays correct regardless of current rotation.
    const rot = rotations[p] ?? 0;
    const original = rotateBbox({ x, y, w, h }, (360 - rot) % 360);
    onDrawComplete?.(p, original);
  }

  if (!file) return <div className="p-8 text-slate-500">Loading PDF…</div>;

  return (
    <div className="flex flex-col items-center p-4 gap-10 relative">
      {drawMode && (
        <div className="sticky top-0 z-20 bg-purple-600 text-white text-sm px-4 py-2 rounded-b shadow self-stretch text-center">
          ✎ Drawing mode — click and drag on any page to add a receipt. Press Esc to cancel.
        </div>
      )}
      {annotationTool && (
        <div className={`sticky top-0 z-20 text-white text-sm px-4 py-2 rounded-b shadow self-stretch text-center ${
          annotationTool === 'check' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {annotationTool === 'check' ? '✓' : '✗'} Click anywhere on a page to place a mark.
          Click an existing mark to remove it. Press Esc when done.
        </div>
      )}
      <Document
        file={file}
        loading="Loading PDF…"
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map(p => {
          const isActive = p === page;
          const rot = rotations[p] ?? 0;
          const isDrawingHere = draw?.page === p;
          return (
            <div
              key={p}
              ref={el => { if (el) pageRefs.current[p] = el; }}
              className="relative inline-block"
            >
              <div className="flex items-center gap-2 mb-1 text-xs">
                <span className="font-mono text-slate-600 bg-white/80 px-1 rounded">
                  page {p}{isActive ? ' • selected' : ''}
                </span>
                <button
                  onClick={() => rotate(p, -90)}
                  className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 rounded font-mono"
                  title="Rotate left 90°"
                >
                  ↺
                </button>
                <button
                  onClick={() => rotate(p, 90)}
                  className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 rounded font-mono"
                  title="Rotate right 90°"
                >
                  ↻
                </button>
                {rot !== 0 && (
                  <button
                    onClick={() => setRotations(prev => ({ ...prev, [p]: 0 }))}
                    className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 rounded text-slate-600"
                    title="Reset rotation"
                  >
                    {rot}° • reset
                  </button>
                )}
              </div>
              <div className={`relative inline-block shadow-lg ${
                isActive ? 'ring-4 ring-blue-400' : ''
              }`}>
                <Page
                  pageNumber={p}
                  width={780}
                  rotate={rot}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
                <div
                  ref={el => { if (el) drawAreaRefs.current[p] = el; }}
                  className={`absolute inset-0 ${
                    drawMode ? 'cursor-crosshair' :
                    annotationTool ? 'cursor-copy' :
                    'pointer-events-none'
                  }`}
                  onPointerDown={(e) => onPointerDown(e, p)}
                  onPointerMove={(e) => onPointerMove(e, p)}
                  onPointerUp={(e) => onPointerUp(e, p)}
                  onPointerCancel={() => setDraw(null)}
                  onClick={(e) => onAnnotationClick(e, p)}
                >
                  {isActive && overlays.map((o, i) => (
                    <BBoxOverlay
                      key={i}
                      bbox={rotateBbox(o.bbox, rot)}
                      kind={o.kind}
                      label={o.label}
                    />
                  ))}
                  {annotations.filter(a => a.page === p).map(a => {
                    const rp = rotatePoint(a.x, a.y, rot);
                    const isCheck = a.kind === 'check';
                    return (
                      <button
                        key={a.id}
                        onClick={(e) => { e.stopPropagation(); onRemoveAnnotation?.(a.id); }}
                        className={`absolute pointer-events-auto rounded-full font-bold flex items-center justify-center shadow-lg border-2 border-white text-white text-lg leading-none ${
                          isCheck ? 'bg-emerald-500 hover:bg-emerald-400'
                                  : 'bg-rose-600 hover:bg-rose-500'
                        }`}
                        style={{
                          left: `${rp.x * 100}%`,
                          top:  `${rp.y * 100}%`,
                          width: '36px', height: '36px',
                          transform: 'translate(-50%, -50%)'
                        }}
                        title="Click to remove this mark"
                      >
                        {isCheck ? '✓' : '✗'}
                      </button>
                    );
                  })}
                  {isDrawingHere && (
                    <div
                      className="absolute border-2 border-purple-600 bg-purple-500/25 rounded-sm pointer-events-none"
                      style={{
                        left:   `${Math.min(draw.x0, draw.x1) * 100}%`,
                        top:    `${Math.min(draw.y0, draw.y1) * 100}%`,
                        width:  `${Math.abs(draw.x1 - draw.x0) * 100}%`,
                        height: `${Math.abs(draw.y1 - draw.y0) * 100}%`
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </Document>
    </div>
  );
}
