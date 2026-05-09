import React, { useState, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';

// A4 in mm, with a small margin so photos don't bleed off the edge.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 5;

let nextId = 1;

function makePhoto({ name, bytes, mime }) {
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  return {
    id: nextId++,
    name,
    bytes,
    mime,
    url: URL.createObjectURL(blob),
    rotation: 0
  };
}

function guessMime(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif'
  })[ext] ?? '';
}

// Decode → rotate → re-encode as JPEG. Keeps PDF generation simple and
// guarantees jsPDF gets a format it can embed regardless of source type.
function loadAsRotatedJpeg(photo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = ((photo.rotation % 360) + 360) % 360;
      const swap = r === 90 || r === 270;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? img.naturalHeight : img.naturalWidth;
      canvas.height = swap ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((r * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        w: canvas.width,
        h: canvas.height
      });
    };
    img.onerror = () => reject(new Error(`Couldn't decode ${photo.name}`));
    img.src = photo.url;
  });
}

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Free object URLs when their photo is dropped from state.
  useEffect(() => {
    return () => { for (const p of photos) URL.revokeObjectURL(p.url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPhotos = useCallback((items) => {
    setPhotos(prev => [...prev, ...items.map(makePhoto)]);
  }, []);

  async function handlePick() {
    const items = await window.api.pickImages();
    if (!items?.length) return;
    addPhotos(items.map(it => ({ name: it.name, bytes: it.bytes, mime: guessMime(it.name) })));
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/') || guessMime(f.name));
    if (!files.length) return;
    const items = await Promise.all(files.map(async f => ({
      name: f.name,
      bytes: await f.arrayBuffer(),
      mime: f.type || guessMime(f.name)
    })));
    addPhotos(items);
  }

  function move(id, delta) {
    setPhotos(prev => {
      const i = prev.findIndex(p => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function remove(id) {
    setPhotos(prev => {
      const p = prev.find(x => x.id === id);
      if (p) URL.revokeObjectURL(p.url);
      return prev.filter(x => x.id !== id);
    });
  }

  function rotate(id, delta) {
    setPhotos(prev => prev.map(p =>
      p.id === id
        ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 }
        : p
    ));
  }

  function clearAll() {
    if (!photos.length) return;
    if (!confirm('Remove all photos?')) return;
    for (const p of photos) URL.revokeObjectURL(p.url);
    setPhotos([]);
  }

  async function handleSave() {
    if (!photos.length) return;
    setBusy(true);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const maxW = PAGE_W - 2 * MARGIN;
      const maxH = PAGE_H - 2 * MARGIN;

      for (let i = 0; i < photos.length; i++) {
        const { dataUrl, w, h } = await loadAsRotatedJpeg(photos[i]);
        // Fit-to-page preserving aspect ratio.
        const scale = Math.min(maxW / w, maxH / h);
        const drawW = w * scale;
        const drawH = h * scale;
        const x = (PAGE_W - drawW) / 2;
        const y = (PAGE_H - drawH) / 2;
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
      }

      const ab = pdf.output('arraybuffer');
      const out = await window.api.savePdf('receipts.pdf');
      if (!out) return;
      await window.api.writeBinary(out, ab);
      alert(`Saved ${photos.length} page(s) to:\n${out}`);
    } catch (err) {
      console.error(err);
      alert(`Failed to build PDF: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="h-full flex flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className="px-4 py-3 bg-slate-800 text-white flex items-center gap-4">
        <span className="font-semibold">Photo to PDF</span>
        <span className="text-slate-300 text-sm">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handlePick}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
          >
            + Add photos
          </button>
          <button
            onClick={clearAll}
            disabled={!photos.length}
            className="px-3 py-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-400 rounded text-sm"
          >
            Clear
          </button>
          <button
            onClick={handleSave}
            disabled={!photos.length || busy}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm"
          >
            {busy ? 'Building…' : 'Save PDF'}
          </button>
        </div>
      </header>

      <main className={`flex-1 overflow-auto p-4 ${dragOver ? 'bg-blue-50 ring-4 ring-inset ring-blue-300' : ''}`}>
        {photos.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-center">
            <div>
              <p className="text-lg mb-2">No photos yet.</p>
              <p className="text-sm">Drag and drop images here, or click <b>+ Add photos</b>.</p>
              <p className="text-xs mt-2 text-slate-400">JPG, PNG, WEBP, BMP, GIF, TIFF</p>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p, i) => (
              <li key={p.id} className="bg-white border rounded shadow-sm overflow-hidden flex flex-col">
                <div className="relative bg-slate-100 aspect-[3/4] flex items-center justify-center overflow-hidden">
                  <img
                    src={p.url}
                    alt={p.name}
                    className="max-w-full max-h-full object-contain transition-transform"
                    style={{ transform: `rotate(${p.rotation}deg)` }}
                  />
                  <span className="absolute top-1 left-1 bg-slate-800/80 text-white text-xs font-mono px-1.5 py-0.5 rounded">
                    {i + 1}
                  </span>
                </div>
                <div className="p-2 text-xs">
                  <div className="truncate font-medium" title={p.name}>{p.name}</div>
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    <button
                      onClick={() => move(p.id, -1)}
                      disabled={i === 0}
                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-40 rounded"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(p.id, +1)}
                      disabled={i === photos.length - 1}
                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-40 rounded"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => rotate(p.id, -90)}
                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded"
                      title="Rotate left"
                    >
                      ↺
                    </button>
                    <button
                      onClick={() => rotate(p.id, +90)}
                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded"
                      title="Rotate right"
                    >
                      ↻
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="ml-auto px-2 py-0.5 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
