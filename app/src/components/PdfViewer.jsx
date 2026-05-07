import React, { useEffect, useState } from 'react';
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

export default function PdfViewer({ pdfData, page, overlays = [] }) {
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (pdfData) setFile({ data: pdfData });
  }, [pdfData]);

  if (!file) return <div className="p-8 text-slate-500">Loading PDF…</div>;

  return (
    <div className="flex justify-center p-4">
      <div className="relative inline-block shadow-lg">
        <Document file={file} loading="Loading PDF…">
          <Page
            pageNumber={page}
            width={780}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </Document>
        <div className="absolute inset-0 pointer-events-none">
          {overlays.map((o, i) => (
            <BBoxOverlay key={i} bbox={o.bbox} kind={o.kind} label={o.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
