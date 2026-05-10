import React, { useState, useMemo, useCallback } from 'react';
import ReceiptList from './components/ReceiptList.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import DetailsPanel from './components/DetailsPanel.jsx';
import Splitter from './components/Splitter.jsx';
import StatusTabs from './components/StatusTabs.jsx';
import { applyEdit, addLine, removeLine, undoLastEdit, recalcTotals, recalcLine, recalcLineFromGross } from './lib/edits.js';
import { parseCsv } from './lib/csv.js';
import { buildDbfBytes, partitionForExport } from './lib/dbf.js';
import { buildMarkedPdf } from './lib/markedPdf.js';
import { buildSuppliersXls, suppliersXlsName } from './lib/suppliersXls.js';

export default function App() {
  const [batch, setBatch] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [pdfDir, setPdfDir] = useState(null);
  const [jsonPath, setJsonPath] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredLineId, setHoveredLineId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [customSuppliers, setCustomSuppliers] = useState([]); // [{ cif, denumire }]
  const [missingCsvPath, setMissingCsvPath] = useState(null);
  const [leftW, setLeftW] = useState(288);
  const [rightW, setRightW] = useState(440);
  const [statusFilter, setStatusFilter] = useState('all');
  const [drawMode, setDrawMode] = useState(false);
  const [annotationTool, setAnnotationTool] = useState(null); // null | 'check' | 'cross'

  async function handleOpen() {
    const r = await window.api.openJson();
    if (!r) return;
    if (!Array.isArray(r.data.annotations)) r.data.annotations = [];
    setBatch(r.data);
    setPdfDir(r.dir);
    setJsonPath(r.path);
    setSelectedId(r.data.receipts?.[0]?.id ?? null);
    setHoveredLineId(null);
    setDirty(false);
    const pdfAbs = `${r.dir}\\${r.data.pdf_path}`;
    const buf = await window.api.readPdf(pdfAbs);
    setPdfData(buf);

    // Walk up from the JSON's folder until we find furnizori.CSV. The typical
    // layout puts the CSV in the client folder, one level above the batch folder.
    let dir = r.dir;
    let furnText = null;
    for (let i = 0; i < 5 && !furnText; i++) {
      furnText = await window.api.readTextIfExists(`${dir}\\furnizori.CSV`)
              ?? await window.api.readTextIfExists(`${dir}\\furnizori.csv`);
      if (furnText) break;
      const parent = dir.replace(/[\\/][^\\/]+$/, '');
      if (parent === dir) break;
      dir = parent;
    }
    if (furnText) {
      const rows = parseCsv(furnText).map(row => ({
        cod: row.cod,
        denumire: row.denumire,
        cif: row.cod_fiscal
      }));
      setAllSuppliers(rows);
    } else {
      setAllSuppliers([]);
      alert('furnizori.CSV not found near this JSON — supplier picker will be empty.');
    }

    // Per-batch "missing suppliers" CSV — created next to the JSON if it doesn't
    // exist yet. The user grows this list by adding new suppliers from the picker.
    const jsonBase = (r.path.split(/[\\/]/).pop() ?? 'receipts.json').replace(/\.json$/i, '');
    const missingPath = `${r.dir}\\missingSuppliers_${jsonBase}.csv`;
    setMissingCsvPath(missingPath);
    const existing = await window.api.readTextIfExists(missingPath);
    if (existing == null) {
      await window.api.writeText(missingPath, 'cif,denumire\n');
      setCustomSuppliers([]);
    } else {
      const customs = parseCsv(existing)
        .map(row => ({ cif: (row.cif ?? '').trim(), denumire: (row.denumire ?? '').trim() }))
        .filter(s => s.cif);
      setCustomSuppliers(customs);
    }
  }

  function csvEscape(s) {
    const v = (s ?? '').toString();
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  async function handleCreateSupplier(cif, denumire) {
    const cleanCif = (cif ?? '').toString().trim();
    const cleanName = (denumire ?? '').toString().trim();
    if (!cleanCif) { alert('CIF is required.'); return null; }

    const norm = (s) => s.toUpperCase().replace(/^RO/, '').replace(/\s/g, '');
    const target = norm(cleanCif);

    const inFurnizori = allSuppliers.find(s => s.cif && norm(s.cif) === target);
    if (inFurnizori) {
      alert(`This CIF is already in furnizori.CSV as "${inFurnizori.denumire}" (cod ${inFurnizori.cod}). Pick it from the list instead.`);
      return inFurnizori.cod;
    }
    const inCustoms = customSuppliers.find(s => norm(s.cif) === target);
    if (inCustoms) {
      alert(`Already added: ${inCustoms.denumire || inCustoms.cif}. Selecting it.`);
      return inCustoms.cif;
    }

    const next = [...customSuppliers, { cif: cleanCif, denumire: cleanName }];
    setCustomSuppliers(next);
    if (missingCsvPath) {
      const text = ['cif,denumire', ...next.map(r => `${csvEscape(r.cif)},${csvEscape(r.denumire)}`)].join('\n') + '\n';
      try { await window.api.writeText(missingCsvPath, text); }
      catch (e) { console.error(e); alert('Failed to write missingSuppliers CSV — change kept in memory only.'); }
    }
    return cleanCif;
  }

  function handleChangeStatus(receiptId, status, reason) {
    updateReceipt(receiptId, r => {
      let next = applyEdit(r, 'status', status);
      next = applyEdit(next, 'status_reason', status === 'ok' ? null : reason);
      return next;
    });
  }

  function handlePickSupplier(receiptId, cod) {
    const sup = cod ? suppliersByCod[cod] : null;
    updateReceipt(receiptId, r => {
      let next = applyEdit(r, 'supplier.matched_cod', cod);
      next = applyEdit(next, 'supplier.match_method', cod ? 'manual' : 'none');
      if (sup) {
        next = applyEdit(next, 'supplier.name_on_receipt', sup.denumire);
        next = applyEdit(next, 'supplier.cif_on_receipt', sup.cif || null);
      }
      return next;
    });
  }

  async function handleExport() {
    if (!batch) return;
    const { ready, blocked } = partitionForExport(batch.receipts);

    if (blocked.length) {
      const msg = blocked.map(b => `  ${b.id}: ${b.reason}`).join('\n');
      if (!window.confirm(
        `${blocked.length} receipt(s) marked OK but blocked from export:\n\n${msg}\n\nContinue with the remaining ${ready.length}?`
      )) return;
    }

    if (ready.length === 0) {
      alert('No receipts to export.');
      return;
    }

    const folder = await window.api.pickFolder();
    if (!folder) return;

    const fmt = (d) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}-${mm}-${d.getFullYear()}`;
    };
    const yearsFromNow = (min, max) => {
      const yr = 365.25 * 24 * 3600 * 1000;
      const offset = (min + Math.random() * (max - min)) * yr;
      return new Date(Date.now() + offset);
    };
    const oldDate = yearsFromNow(-4, -3);
    const futDate = yearsFromNow(2, 3);
    const randomCode = Math.floor(10000 + Math.random() * 90000); // 5 digits
    const dbfName = `IN_${fmt(oldDate)}_${fmt(futDate)}_${randomCode}.DBF`;
    const skipName = `${batch.batch_id}_skipped.json`;

    // Subfolder named after the source PDF — everything for this batch lives here.
    const pdfBase = (batch.pdf_path ?? 'receipts.pdf').replace(/\.pdf$/i, '');
    const outDir = `${folder}\\${pdfBase}`;

    const dbfBytes = buildDbfBytes(ready);
    await window.api.writeBinary(`${outDir}\\${dbfName}`, dbfBytes.buffer);

    const skipped = batch.receipts.filter(r => r.status !== 'ok' || blocked.find(b => b.id === r.id));
    const skipPayload = {
      batch_id: batch.batch_id,
      generated_at: new Date().toISOString(),
      blocked_at_export: blocked,
      receipts: skipped
    };
    await window.api.writeText(`${outDir}\\${skipName}`, JSON.stringify(skipPayload, null, 2));

    let xlsName = null;
    if (customSuppliers.length > 0) {
      xlsName = suppliersXlsName();
      const xlsBytes = buildSuppliersXls(customSuppliers);
      await window.api.writeBinary(`${outDir}\\${xlsName}`, xlsBytes.buffer ?? xlsBytes);
    }

    alert(
      `Exported to ${outDir}\n\n` +
      `Receipts: ${ready.length} → ${dbfName} (${dbfBytes.length} bytes)\n` +
      `Skipped: ${skipped.length} → ${skipName}\n` +
      (xlsName ? `New suppliers: ${customSuppliers.length} → ${xlsName}` : 'New suppliers: 0 (no XLS written)')
    );
  }

  function nextReceiptId(receipts) {
    let max = 0;
    for (const r of receipts ?? []) {
      const m = r.id?.match(/^r(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `r${String(max + 1).padStart(3, '0')}`;
  }

  function handleAddReceipt(page, bbox) {
    const id = nextReceiptId(batch.receipts);
    const newReceipt = {
      id,
      page,
      bbox,
      status: 'needs_attention',
      status_reason: 'supplier_not_found',
      doc_type: 'B',
      doc_number: null,
      date: null,
      supplier: {
        name_on_receipt: '',
        cif_on_receipt: null,
        matched_cod: null,
        match_method: 'none',
        bbox: null
      },
      totals: { valoare_net: 0, tva: 0, total: 0, bbox: null },
      lines: [],
      edits: [{ op: 'manual_create', field: '', old: null, new: { page, bbox }, at: new Date().toISOString() }],
      notes: 'Adaugat manual'
    };
    setBatch(prev => ({
      ...prev,
      receipts: [...prev.receipts, newReceipt].sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
    }));
    setSelectedId(id);
    setDirty(true);
    setDrawMode(false);
  }

  function nextAnnotationId(annotations) {
    let max = 0;
    for (const a of annotations ?? []) {
      const m = a.id?.match(/^a(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `a${String(max + 1).padStart(3, '0')}`;
  }

  function mutateBatchAndSave(mutator) {
    setBatch(prev => {
      if (!prev) return prev;
      const next = mutator(prev);
      if (jsonPath) {
        window.api.saveJson(jsonPath, next).catch(e => console.error(e));
      }
      return next;
    });
  }

  function handleAddAnnotation(page, x, y) {
    if (!annotationTool) return;
    mutateBatchAndSave(prev => {
      const ann = { id: nextAnnotationId(prev.annotations), page, kind: annotationTool, x, y };
      return { ...prev, annotations: [...(prev.annotations ?? []), ann] };
    });
  }

  function handleRemoveAnnotation(id) {
    mutateBatchAndSave(prev => ({
      ...prev,
      annotations: (prev.annotations ?? []).filter(a => a.id !== id)
    }));
  }

  function toggleAnnotationTool(tool) {
    setAnnotationTool(prev => (prev === tool ? null : tool));
    setDrawMode(false);
  }

  async function handleExportMarkedPdf() {
    if (!batch || !pdfData) return;
    const folder = await window.api.pickFolder();
    if (!folder) return;
    const base = (batch.pdf_path ?? 'receipts.pdf').replace(/\.pdf$/i, '');
    const outPath = `${folder}\\${base}_marked.pdf`;
    const bytes = await buildMarkedPdf(pdfData, batch.annotations ?? []);
    await window.api.writeBinary(outPath, bytes.buffer ?? bytes);
    alert(`Wrote marked PDF (${(batch.annotations ?? []).length} mark(s)) to:\n${outPath}`);
  }

  async function handleSave() {
    if (!jsonPath || !batch) return;
    setSaving(true);
    try {
      await window.api.saveJson(jsonPath, batch);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  const updateReceipt = useCallback((id, mutator) => {
    setBatch(prev => ({
      ...prev,
      receipts: prev.receipts.map(r => r.id === id ? mutator(r) : r)
    }));
    setDirty(true);
  }, []);

  const selected = useMemo(
    () => batch?.receipts.find(r => r.id === selectedId) ?? null,
    [batch, selectedId]
  );

  // Custom suppliers (from missingSuppliers_<base>.csv) appear in the picker
  // with their CIF acting as the cod — that's the only stable id we have until
  // SAGA assigns a real one.
  const combinedSuppliers = useMemo(() => {
    const customs = customSuppliers.map(s => ({
      cod: s.cif,
      denumire: s.denumire,
      cif: s.cif,
      __custom: true
    }));
    return [...allSuppliers, ...customs];
  }, [allSuppliers, customSuppliers]);

  const suppliersByCod = useMemo(
    () => Object.fromEntries(combinedSuppliers.map(s => [s.cod, s])),
    [combinedSuppliers]
  );

  const counts = useMemo(() => {
    if (!batch) return {};
    const c = { all: batch.receipts.length, ok: 0, needs_attention: 0, deleted: 0 };
    for (const r of batch.receipts) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [batch]);

  const visibleReceipts = useMemo(() => {
    if (!batch) return [];
    const filtered = statusFilter === 'all'
      ? batch.receipts
      : batch.receipts.filter(r => r.status === statusFilter);
    return [...filtered].sort((a, b) => {
      const pa = a.page ?? 0, pb = b.page ?? 0;
      if (pa !== pb) return pa - pb;
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
  }, [batch, statusFilter]);

  const hoveredLine = useMemo(
    () => selected?.lines.find(l => l.id === hoveredLineId) ?? null,
    [selected, hoveredLineId]
  );

  const overlays = useMemo(() => {
    if (!selected) return [];
    const ov = [];
    if (selected.bbox) ov.push({ bbox: selected.bbox, kind: 'receipt', label: selected.id });
    if (selected.supplier?.bbox)
      ov.push({ bbox: selected.supplier.bbox, kind: 'field', label: 'supplier' });
    if (selected.totals?.bbox)
      ov.push({ bbox: selected.totals.bbox, kind: 'field', label: 'totals' });
    if (hoveredLine?.bbox)
      ov.push({ bbox: hoveredLine.bbox, kind: 'line', label: 'line' });
    return ov;
  }, [selected, hoveredLine]);

  if (!batch) {
    return (
      <div className="h-full flex items-center justify-center">
        <button
          onClick={handleOpen}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow"
        >
          Open receipts JSON
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-2 bg-slate-800 text-white flex items-center gap-4">
        <span className="font-semibold">{batch.batch_id}</span>
        <span className="text-slate-300 text-sm">
          {batch.client.name} ({batch.client.cif}) — {batch.receipts.length} receipts
        </span>
        {dirty && <span className="text-amber-300 text-xs">● unsaved</span>}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => toggleAnnotationTool('check')}
            className={`px-3 py-1 rounded text-sm ${
              annotationTool === 'check'
                ? 'bg-emerald-700 text-white ring-2 ring-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Click pages to place green check marks. Click an existing mark to remove it."
          >
            {annotationTool === 'check' ? '✓ Placing… (Esc)' : '✓ Mark OK'}
          </button>
          <button
            onClick={() => toggleAnnotationTool('cross')}
            className={`px-3 py-1 rounded text-sm ${
              annotationTool === 'cross'
                ? 'bg-rose-700 text-white ring-2 ring-rose-300'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
            title="Click pages to place red cross marks. Click an existing mark to remove it."
          >
            {annotationTool === 'cross' ? '✗ Placing… (Esc)' : '✗ Mark wrong'}
          </button>
          <button
            onClick={handleExportMarkedPdf}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-sm text-white"
            title="Save a copy of the PDF with the marks baked in"
          >
            Export marked PDF
          </button>
          <button
            onClick={() => { setDrawMode(d => !d); setAnnotationTool(null); }}
            className={`px-3 py-1 rounded text-sm ${
              drawMode
                ? 'bg-purple-700 hover:bg-purple-600 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
            title="Draw a bounding box on a page to add a new receipt"
          >
            {drawMode ? '✎ Drawing… (Esc)' : '+ Add receipt'}
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleExport}
            disabled={(counts.ok ?? 0) === 0}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm"
          >
            Export data ({counts.ok ?? 0})
          </button>
          <button
            onClick={handleOpen}
            className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm"
          >
            Open another...
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside style={{ width: leftW }} className="border-r bg-white overflow-y-auto shrink-0 flex flex-col">
          <StatusTabs active={statusFilter} onChange={setStatusFilter} counts={counts} />
          <div className="flex-1 overflow-y-auto">
            <ReceiptList
              receipts={visibleReceipts}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setHoveredLineId(null); }}
              suppliersByCod={suppliersByCod}
            />
          </div>
        </aside>

        <Splitter side="left" onResize={setLeftW} />

        <main className="flex-1 bg-slate-200 overflow-auto min-w-0">
          <PdfViewer
            pdfData={pdfData}
            page={selected?.page ?? 1}
            overlays={overlays}
            drawMode={drawMode}
            onDrawComplete={handleAddReceipt}
            onCancelDraw={() => setDrawMode(false)}
            annotations={batch.annotations ?? []}
            annotationTool={annotationTool}
            onPlaceAnnotation={handleAddAnnotation}
            onRemoveAnnotation={handleRemoveAnnotation}
            onCancelAnnotation={() => setAnnotationTool(null)}
          />
        </main>

        <Splitter side="right" onResize={setRightW} />

        <aside style={{ width: rightW }} className="border-l bg-white overflow-y-auto shrink-0">
          <DetailsPanel
            receipt={selected}
            hoveredLineId={hoveredLineId}
            onHoverLine={setHoveredLineId}
            onEdit={(path, value) => updateReceipt(selected.id, r => {
              const m = path.match(/^lines\[(\d+)\]\.(.+)$/);
              // Synthetic "gross" field — not persisted; we split it into net/tva on the fly.
              if (m && m[2] === 'gross') {
                const idx = Number(m[1]);
                const oldLine = r.lines[idx];
                const round = (x) => Math.round(x * 100) / 100;
                const oldGross = round((Number(oldLine.valoare_net) || 0) + (Number(oldLine.tva) || 0));
                const updated = recalcLineFromGross(oldLine, value);
                const next = {
                  ...r,
                  lines: r.lines.map((l, i) => i === idx ? updated : l),
                  edits: [
                    ...(r.edits ?? []),
                    { field: path, old: oldGross, new: Number(value) || 0, at: new Date().toISOString() }
                  ]
                };
                return recalcTotals(next);
              }
              let next = applyEdit(r, path, value);
              if (m) {
                const idx = Number(m[1]);
                const updated = recalcLine(next.lines[idx], m[2]);
                next = { ...next, lines: next.lines.map((l, i) => i === idx ? updated : l) };
                next = recalcTotals(next);
              }
              return next;
            })}
            onPickSupplier={(cod) => handlePickSupplier(selected.id, cod)}
            onChangeStatus={(status, reason) => handleChangeStatus(selected.id, status, reason)}
            onAddLine={() => updateReceipt(selected.id, r => recalcTotals(addLine(r)))}
            onRemoveLine={(i) => updateReceipt(selected.id, r => recalcTotals(removeLine(r, i)))}
            onUndo={() => updateReceipt(selected.id, undoLastEdit)}
            allSuppliers={combinedSuppliers}
            onCreateSupplier={handleCreateSupplier}
          />
        </aside>
      </div>
    </div>
  );
}
