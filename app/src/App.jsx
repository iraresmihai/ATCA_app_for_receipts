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

// One client = one tab. Each tab owns its batch + pdf + suppliers + UI state.
async function loadFolder(folder) {
  const jsonPath = `${folder}\\receipts.json`;
  const jsonText = await window.api.readTextIfExists(jsonPath);
  if (jsonText == null) throw new Error('receipts.json not found');
  let batch;
  try { batch = JSON.parse(jsonText); }
  catch { throw new Error('receipts.json is not valid JSON'); }
  if (!Array.isArray(batch.annotations)) batch.annotations = [];

  const pdfFilename = batch.pdf_path || 'receipts.pdf';
  const pdfPath = `${folder}\\${pdfFilename}`;
  let pdfData;
  try { pdfData = await window.api.readPdf(pdfPath); }
  catch { throw new Error(`${pdfFilename} not found`); }

  const furnRows = await readFurnizoriFromFolder(folder);
  const allSuppliers = furnRows ?? [];

  // Per-batch missingSuppliers CSV; create if missing.
  // Schema: cod,cif,denumire. Legacy files (cif,denumire only) get a cod auto-
  // assigned on load — continuing the furnizori.CSV sequence — and the file is
  // rewritten so the codes are stable across sessions.
  const jsonBase = 'receipts';
  const missingCsvPath = `${folder}\\missingSuppliers_${jsonBase}.csv`;
  const existing = await window.api.readTextIfExists(missingCsvPath);
  let customSuppliers = [];
  if (existing == null) {
    await window.api.writeText(missingCsvPath, 'cod,cif,denumire\n');
  } else {
    let needsRewrite = false;
    for (const row of parseCsv(existing)) {
      const cif = (row.cif ?? '').trim();
      if (!cif) continue;
      const denumire = (row.denumire ?? '').trim();
      let cod = (row.cod ?? '').trim();
      if (!cod) {
        cod = nextSupplierCod([...allSuppliers, ...customSuppliers]);
        needsRewrite = true;
      }
      customSuppliers.push({ cod, cif, denumire });
    }
    if (needsRewrite) {
      const text = ['cod,cif,denumire',
        ...customSuppliers.map(r => `${csvEscape(r.cod)},${csvEscape(r.cif)},${csvEscape(r.denumire)}`)
      ].join('\n') + '\n';
      await window.api.writeText(missingCsvPath, text);
    }
  }

  return {
    id: folder,
    folderPath: folder,
    jsonPath,
    pdfPath,
    batch,
    pdfData,
    allSuppliers,
    customSuppliers,
    missingCsvPath,
    selectedId: batch.receipts?.[0]?.id ?? null,
    hoveredLineId: null,
    statusFilter: 'all',
    drawMode: false,
    annotationTool: null,
    dirty: false,
    furnLoaded: furnRows != null
  };
}

function csvEscape(s) {
  const v = (s ?? '').toString();
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const normCif = (s) => (s ?? '').toString().toUpperCase().replace(/^RO/, '').replace(/\s/g, '');

// Walk up from a folder looking for furnizori.CSV — used both on initial load
// and when the user clicks Re-match (after they've re-exported it from SAGA).
async function readFurnizoriFromFolder(folder) {
  let dir = folder;
  let furnText = null;
  for (let i = 0; i < 5 && !furnText; i++) {
    furnText = await window.api.readTextIfExists(`${dir}\\furnizori.CSV`)
            ?? await window.api.readTextIfExists(`${dir}\\furnizori.csv`);
    if (furnText) break;
    const parent = dir.replace(/[\\/][^\\/]+$/, '');
    if (parent === dir) break;
    dir = parent;
  }
  return furnText
    ? parseCsv(furnText).map(row => ({ cod: row.cod, denumire: row.denumire, cif: row.cod_fiscal }))
    : null;
}

// Pick the next sequential cod for a new custom supplier — one above the
// highest integer cod across furnizori.CSV and already-created customs.
function nextSupplierCod(suppliers) {
  let max = 0;
  for (const s of suppliers) {
    const n = parseInt(String(s.cod ?? '').trim(), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export default function App() {
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [leftW, setLeftW] = useState(288);
  const [rightW, setRightW] = useState(440);
  const [pendingSwitch, setPendingSwitch] = useState(null); // { targetId } | null
  const [openWarnings, setOpenWarnings] = useState([]); // skipped folders banner

  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeId) ?? null,
    [tabs, activeId]
  );

  const updateActiveTab = useCallback((mutator) => {
    setTabs(prev => prev.map(t => t.id === activeId ? mutator(t) : t));
  }, [activeId]);

  function updateActiveBatch(batchMutator) {
    updateActiveTab(t => ({ ...t, batch: batchMutator(t.batch), dirty: true }));
  }

  async function handleOpenFolders() {
    const dirtyCount = tabs.filter(t => t.dirty).length;
    if (dirtyCount > 0) {
      if (!window.confirm(
        `${dirtyCount} open tab(s) have unsaved changes. Opening a new set of folders will discard them. Continue?`
      )) return;
    }
    const folders = await window.api.openFolders();
    if (!folders || folders.length === 0) return;
    const loaded = [];
    const skipped = [];
    for (const folder of folders) {
      try {
        const tab = await loadFolder(folder);
        loaded.push(tab);
      } catch (e) {
        skipped.push({ folder, reason: e.message });
      }
    }
    // Flag clients with no furnizori.CSV as warnings too — supplier picker will be empty.
    for (const t of loaded) {
      if (!t.furnLoaded) skipped.push({ folder: t.folderPath, reason: 'furnizori.CSV not found — supplier picker will be empty' });
    }
    if (loaded.length === 0) {
      alert(
        'No folder could be opened.\n\n' +
        skipped.map(s => `  ${s.folder} — ${s.reason}`).join('\n')
      );
      return;
    }
    setTabs(loaded);
    setActiveId(loaded[0].id);
    setOpenWarnings(skipped);
  }

  function requestSwitchTab(targetId) {
    if (targetId === activeId) return;
    if (activeTab?.dirty) {
      setPendingSwitch({ targetId });
    } else {
      setActiveId(targetId);
    }
  }

  async function resolvePendingSwitch(action) {
    if (!pendingSwitch || !activeTab) { setPendingSwitch(null); return; }
    const targetId = pendingSwitch.targetId;
    if (action === 'cancel') { setPendingSwitch(null); return; }
    if (action === 'save') {
      try {
        await window.api.saveJson(activeTab.jsonPath, activeTab.batch);
        updateActiveTab(t => ({ ...t, dirty: false }));
      } catch (e) {
        console.error(e);
        alert('Save failed — staying on this tab.');
        setPendingSwitch(null);
        return;
      }
    } else if (action === 'discard') {
      // Reload that tab's batch from disk so changes truly disappear.
      try {
        const text = await window.api.readTextIfExists(activeTab.jsonPath);
        if (text != null) {
          const data = JSON.parse(text);
          if (!Array.isArray(data.annotations)) data.annotations = [];
          updateActiveTab(t => ({
            ...t,
            batch: data,
            selectedId: data.receipts?.[0]?.id ?? null,
            hoveredLineId: null,
            dirty: false
          }));
        }
      } catch (e) { console.error(e); }
    }
    setPendingSwitch(null);
    setActiveId(targetId);
  }

  async function handleCreateSupplier(cif, denumire) {
    if (!activeTab) return null;
    const cleanCif = (cif ?? '').toString().trim();
    const cleanName = (denumire ?? '').toString().trim();
    if (!cleanCif) { alert('CIF is required.'); return null; }

    const norm = (s) => s.toUpperCase().replace(/^RO/, '').replace(/\s/g, '');
    const target = norm(cleanCif);

    const inFurnizori = activeTab.allSuppliers.find(s => s.cif && norm(s.cif) === target);
    if (inFurnizori) {
      alert(`This CIF is already in furnizori.CSV as "${inFurnizori.denumire}" (cod ${inFurnizori.cod}). Pick it from the list instead.`);
      return inFurnizori.cod;
    }
    const inCustoms = activeTab.customSuppliers.find(s => norm(s.cif) === target);
    if (inCustoms) {
      alert(`Already added: ${inCustoms.denumire || inCustoms.cif} (cod ${inCustoms.cod}). Selecting it.`);
      return inCustoms.cod;
    }

    const cod = nextSupplierCod([...activeTab.allSuppliers, ...activeTab.customSuppliers]);
    const next = [...activeTab.customSuppliers, { cod, cif: cleanCif, denumire: cleanName }];
    updateActiveTab(t => ({ ...t, customSuppliers: next }));
    if (activeTab.missingCsvPath) {
      const text = ['cod,cif,denumire',
        ...next.map(r => `${csvEscape(r.cod)},${csvEscape(r.cif)},${csvEscape(r.denumire)}`)
      ].join('\n') + '\n';
      try { await window.api.writeText(activeTab.missingCsvPath, text); }
      catch (e) { console.error(e); alert('Failed to write missingSuppliers CSV — change kept in memory only.'); }
    }
    return cod;
  }

  const updateReceipt = useCallback((id, mutator) => {
    updateActiveTab(t => ({
      ...t,
      batch: { ...t.batch, receipts: t.batch.receipts.map(r => r.id === id ? mutator(r) : r) },
      dirty: true
    }));
  }, [updateActiveTab]);

  function handleChangeStatus(receiptId, status, reason) {
    updateReceipt(receiptId, r => {
      let next = applyEdit(r, 'status', status);
      next = applyEdit(next, 'status_reason', status === 'ok' ? null : reason);
      return next;
    });
  }

  const combinedSuppliers = useMemo(() => {
    if (!activeTab) return [];
    const customs = activeTab.customSuppliers.map(s => ({
      cod: s.cod, denumire: s.denumire, cif: s.cif, __custom: true
    }));
    return [...activeTab.allSuppliers, ...customs];
  }, [activeTab]);

  const suppliersByCod = useMemo(
    () => Object.fromEntries(combinedSuppliers.map(s => [s.cod, s])),
    [combinedSuppliers]
  );

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
    if (!activeTab) return;
    const batch = activeTab.batch;
    const { ready, blocked } = partitionForExport(batch.receipts);

    if (blocked.length) {
      const msg = blocked.map(b => `  ${b.id}: ${b.reason}`).join('\n');
      if (!window.confirm(
        `${blocked.length} receipt(s) marked OK but blocked from export:\n\n${msg}\n\nContinue with the remaining ${ready.length}?`
      )) return;
    }
    if (ready.length === 0) { alert('No receipts to export.'); return; }

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
    const randomCode = Math.floor(10000 + Math.random() * 90000);
    const dbfName = `IN_${fmt(oldDate)}_${fmt(futDate)}_${randomCode}.DBF`;
    const skipName = `${batch.batch_id}_skipped.json`;

    const pdfBase = (batch.pdf_path ?? 'receipts.pdf').replace(/\.pdf$/i, '');
    const outDir = `${activeTab.folderPath}\\${pdfBase}`;

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
    if (activeTab.customSuppliers.length > 0) {
      xlsName = suppliersXlsName();
      const xlsBytes = buildSuppliersXls(activeTab.customSuppliers);
      await window.api.writeBinary(`${outDir}\\${xlsName}`, xlsBytes.buffer ?? xlsBytes);
    }

    alert(
      `Exported to ${outDir}\n\n` +
      `Receipts: ${ready.length} → ${dbfName} (${dbfBytes.length} bytes)\n` +
      `Skipped: ${skipped.length} → ${skipName}\n` +
      (xlsName ? `New suppliers: ${activeTab.customSuppliers.length} → ${xlsName}` : 'New suppliers: 0 (no XLS written)')
    );
  }

  async function handleExportSuppliersXls() {
    if (!activeTab) return;
    if (activeTab.customSuppliers.length === 0) {
      alert('No custom suppliers to export — nothing was created since this batch opened.');
      return;
    }
    const name = suppliersXlsName();
    const outPath = `${activeTab.folderPath}\\${name}`;
    const bytes = buildSuppliersXls(activeTab.customSuppliers);
    await window.api.writeBinary(outPath, bytes.buffer ?? bytes);
    alert(
      `Exported ${activeTab.customSuppliers.length} custom supplier(s) to:\n${outPath}\n\n` +
      `Import this XLS into SAGA. If SAGA assigns different cod values, ` +
      `overwrite furnizori.CSV from SAGA and click "Re-match CIF" to update the receipts.`
    );
  }

  // After the user has updated furnizori.CSV from SAGA, re-read it from disk
  // and re-match every receipt by CIF. Any custom supplier whose CIF is now
  // in furnizori is dropped from the missing list — its receipts are
  // re-pointed to the real cod automatically.
  async function handleRematchSuppliers() {
    if (!activeTab) return;
    const fresh = await readFurnizoriFromFolder(activeTab.folderPath);
    if (!fresh) {
      alert('furnizori.CSV not found near this client folder — nothing to re-match against.');
      return;
    }
    const byCif = new Map();
    for (const s of fresh) {
      const k = normCif(s.cif);
      if (k) byCif.set(k, s);
    }

    let rematched = 0, alreadyOk = 0, noCif = 0, unmatched = 0;
    const newReceipts = activeTab.batch.receipts.map(r => {
      const cif = r.supplier?.cif_on_receipt;
      if (!cif) { noCif++; return r; }
      const sup = byCif.get(normCif(cif));
      if (!sup) { unmatched++; return r; }
      if (r.supplier?.matched_cod === sup.cod && r.supplier?.match_method === 'cif') {
        alreadyOk++; return r;
      }
      let next = applyEdit(r, 'supplier.matched_cod', sup.cod);
      next = applyEdit(next, 'supplier.match_method', 'cif');
      rematched++;
      return next;
    });

    // Promote customs whose CIF is now in furnizori — drop them from the
    // missing list and rewrite the CSV so the next session is clean.
    const survivingCustoms = activeTab.customSuppliers.filter(c => !byCif.has(normCif(c.cif)));
    const promoted = activeTab.customSuppliers.length - survivingCustoms.length;
    if (promoted > 0 && activeTab.missingCsvPath) {
      const text = ['cod,cif,denumire',
        ...survivingCustoms.map(r => `${csvEscape(r.cod)},${csvEscape(r.cif)},${csvEscape(r.denumire)}`)
      ].join('\n') + '\n';
      try { await window.api.writeText(activeTab.missingCsvPath, text); }
      catch (e) { console.error(e); }
    }

    updateActiveTab(t => ({
      ...t,
      allSuppliers: fresh,
      customSuppliers: survivingCustoms,
      batch: { ...t.batch, receipts: newReceipts },
      dirty: t.dirty || rematched > 0
    }));

    alert(
      `Re-match complete — furnizori.CSV now has ${fresh.length} suppliers.\n\n` +
      `Re-matched: ${rematched}\n` +
      `Already correct: ${alreadyOk}\n` +
      `No CIF on receipt: ${noCif}\n` +
      `CIF not in furnizori: ${unmatched}\n` +
      (promoted > 0 ? `\nCustom suppliers promoted to furnizori: ${promoted}` : '')
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
    if (!activeTab) return;
    const id = nextReceiptId(activeTab.batch.receipts);
    const newReceipt = {
      id, page, bbox,
      status: 'needs_attention',
      status_reason: 'supplier_not_found',
      doc_type: 'B',
      doc_number: null,
      date: null,
      supplier: {
        name_on_receipt: '', cif_on_receipt: null,
        matched_cod: null, match_method: 'none', bbox: null
      },
      totals: { valoare_net: 0, tva: 0, total: 0, bbox: null },
      lines: [],
      edits: [{ op: 'manual_create', field: '', old: null, new: { page, bbox }, at: new Date().toISOString() }],
      notes: 'Adaugat manual'
    };
    updateActiveTab(t => ({
      ...t,
      batch: {
        ...t.batch,
        receipts: [...t.batch.receipts, newReceipt].sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
      },
      selectedId: id,
      drawMode: false,
      dirty: true
    }));
  }

  function nextAnnotationId(annotations) {
    let max = 0;
    for (const a of annotations ?? []) {
      const m = a.id?.match(/^a(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `a${String(max + 1).padStart(3, '0')}`;
  }

  function mutateActiveBatchAndSave(batchMutator) {
    if (!activeTab) return;
    const jsonPath = activeTab.jsonPath;
    updateActiveTab(t => {
      const newBatch = batchMutator(t.batch);
      if (jsonPath) window.api.saveJson(jsonPath, newBatch).catch(e => console.error(e));
      return { ...t, batch: newBatch };
    });
  }

  function handleAddAnnotation(page, x, y) {
    if (!activeTab?.annotationTool) return;
    mutateActiveBatchAndSave(batch => {
      const ann = { id: nextAnnotationId(batch.annotations), page, kind: activeTab.annotationTool, x, y };
      return { ...batch, annotations: [...(batch.annotations ?? []), ann] };
    });
  }

  function handleRemoveAnnotation(id) {
    mutateActiveBatchAndSave(batch => ({
      ...batch,
      annotations: (batch.annotations ?? []).filter(a => a.id !== id)
    }));
  }

  function toggleAnnotationTool(tool) {
    updateActiveTab(t => ({
      ...t,
      annotationTool: t.annotationTool === tool ? null : tool,
      drawMode: false
    }));
  }

  function toggleDrawMode() {
    updateActiveTab(t => ({ ...t, drawMode: !t.drawMode, annotationTool: null }));
  }

  async function handleExportMarkedPdf() {
    if (!activeTab || !activeTab.pdfData) return;
    const base = (activeTab.batch.pdf_path ?? 'receipts.pdf').replace(/\.pdf$/i, '');
    const outPath = `${activeTab.folderPath}\\${base}_marked.pdf`;
    const bytes = await buildMarkedPdf(activeTab.pdfData, activeTab.batch.annotations ?? []);
    await window.api.writeBinary(outPath, bytes.buffer ?? bytes);
    alert(`Wrote marked PDF (${(activeTab.batch.annotations ?? []).length} mark(s)) to:\n${outPath}`);
  }

  async function handleSave() {
    if (!activeTab) return;
    setSaving(true);
    try {
      await window.api.saveJson(activeTab.jsonPath, activeTab.batch);
      updateActiveTab(t => ({ ...t, dirty: false }));
    } finally {
      setSaving(false);
    }
  }

  const selected = useMemo(
    () => activeTab?.batch.receipts.find(r => r.id === activeTab.selectedId) ?? null,
    [activeTab]
  );

  const counts = useMemo(() => {
    if (!activeTab) return {};
    const c = { all: activeTab.batch.receipts.length, ok: 0, needs_attention: 0, deleted: 0 };
    for (const r of activeTab.batch.receipts) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [activeTab]);

  const visibleReceipts = useMemo(() => {
    if (!activeTab) return [];
    const filtered = activeTab.statusFilter === 'all'
      ? activeTab.batch.receipts
      : activeTab.batch.receipts.filter(r => r.status === activeTab.statusFilter);
    return [...filtered].sort((a, b) => {
      const pa = a.page ?? 0, pb = b.page ?? 0;
      if (pa !== pb) return pa - pb;
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
  }, [activeTab]);

  const hoveredLine = useMemo(
    () => selected?.lines.find(l => l.id === activeTab?.hoveredLineId) ?? null,
    [selected, activeTab]
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

  if (tabs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <button
          onClick={handleOpenFolders}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow"
        >
          Open client folders
        </button>
        <div className="text-xs text-slate-500 max-w-md text-center">
          Pick one or more client folders. Each must contain <span className="font-mono">receipts.pdf</span> and{' '}
          <span className="font-mono">receipts.json</span>. Other files in the folder (older sessions, CSVs, exports) are ignored.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-2 bg-slate-800 text-white flex items-center gap-4">
        {activeTab && (
          <>
            <span className="font-semibold">{activeTab.batch.batch_id}</span>
            <span className="text-slate-300 text-sm">
              {activeTab.batch.client.name} ({activeTab.batch.client.cif}) — {activeTab.batch.receipts.length} receipts
            </span>
            {activeTab.dirty && <span className="text-amber-300 text-xs">● unsaved</span>}
          </>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => toggleAnnotationTool('check')}
            className={`px-3 py-1 rounded text-sm ${
              activeTab?.annotationTool === 'check'
                ? 'bg-emerald-700 text-white ring-2 ring-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Click pages to place green check marks. Click an existing mark to remove it."
          >
            {activeTab?.annotationTool === 'check' ? '✓ Placing… (Esc)' : '✓ Mark OK'}
          </button>
          <button
            onClick={() => toggleAnnotationTool('cross')}
            className={`px-3 py-1 rounded text-sm ${
              activeTab?.annotationTool === 'cross'
                ? 'bg-rose-700 text-white ring-2 ring-rose-300'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
            title="Click pages to place red cross marks. Click an existing mark to remove it."
          >
            {activeTab?.annotationTool === 'cross' ? '✗ Placing… (Esc)' : '✗ Mark wrong'}
          </button>
          <button
            onClick={handleExportMarkedPdf}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-sm text-white"
            title="Save a copy of the PDF with the marks baked in (active client's folder)"
          >
            Export marked PDF
          </button>
          <button
            onClick={toggleDrawMode}
            className={`px-3 py-1 rounded text-sm ${
              activeTab?.drawMode
                ? 'bg-purple-700 hover:bg-purple-600 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
            title="Draw a bounding box on a page to add a new receipt"
          >
            {activeTab?.drawMode ? '✎ Drawing… (Esc)' : '+ Add receipt'}
          </button>
          <button
            onClick={handleRematchSuppliers}
            className="px-3 py-1 bg-teal-600 hover:bg-teal-500 rounded text-sm text-white"
            title="Re-read furnizori.CSV from disk and re-match every receipt by CIF. Use after re-exporting furnizori from SAGA."
          >
            Re-match CIF
          </button>
          <button
            onClick={handleExportSuppliersXls}
            disabled={!activeTab || activeTab.customSuppliers.length === 0}
            className="px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm text-white"
            title="Write only the custom-suppliers XLS into this client's folder"
          >
            Export suppliers ({activeTab?.customSuppliers.length ?? 0})
          </button>
          <button
            onClick={handleSave}
            disabled={!activeTab?.dirty || saving}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleExport}
            disabled={(counts.ok ?? 0) === 0}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm"
            title="Write IN_*.DBF / skipped JSON / suppliers XLS into this client's folder"
          >
            Export data ({counts.ok ?? 0})
          </button>
          <button
            onClick={handleOpenFolders}
            className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm"
            title="Replace the current tabs with a new set of folders"
          >
            Open folders…
          </button>
        </div>
      </header>

      <div className="flex border-b bg-slate-100 overflow-x-auto">
        {tabs.map(t => {
          const isActive = t.id === activeId;
          return (
            <button
              key={t.id}
              onClick={() => requestSwitchTab(t.id)}
              className={`px-4 py-2 text-sm border-r flex items-center gap-2 whitespace-nowrap ${
                isActive ? 'bg-white border-b-2 border-b-blue-500 font-medium' : 'hover:bg-slate-200 text-slate-600'
              }`}
              title={t.folderPath}
            >
              <span className="max-w-[220px] truncate">{t.batch.client?.name ?? t.folderPath}</span>
              {t.dirty && <span className="text-amber-500" title="Unsaved changes">●</span>}
              <span className="text-xs text-slate-400">{t.batch.receipts?.length ?? 0}</span>
            </button>
          );
        })}
      </div>

      {openWarnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-sm text-amber-800 flex items-start gap-3">
          <div className="flex-1">
            <span className="font-medium">Skipped {openWarnings.length} folder(s):</span>{' '}
            {openWarnings.map((w, i) => (
              <span key={i} className="font-mono text-xs">
                {i > 0 && '; '}{w.folder.split(/[\\/]/).pop()} ({w.reason})
              </span>
            ))}
          </div>
          <button onClick={() => setOpenWarnings([])} className="text-amber-700 hover:text-amber-900">✕</button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <aside style={{ width: leftW }} className="border-r bg-white overflow-y-auto shrink-0 flex flex-col">
          <StatusTabs
            active={activeTab?.statusFilter ?? 'all'}
            onChange={(f) => updateActiveTab(t => ({ ...t, statusFilter: f }))}
            counts={counts}
          />
          <div className="flex-1 overflow-y-auto">
            <ReceiptList
              receipts={visibleReceipts}
              selectedId={activeTab?.selectedId ?? null}
              onSelect={(id) => updateActiveTab(t => ({ ...t, selectedId: id, hoveredLineId: null }))}
              suppliersByCod={suppliersByCod}
            />
          </div>
        </aside>

        <Splitter side="left" onResize={setLeftW} />

        <main className="flex-1 bg-slate-200 overflow-auto min-w-0">
          {activeTab && (
            <PdfViewer
              key={activeTab.id}
              pdfData={activeTab.pdfData}
              page={selected?.page ?? 1}
              overlays={overlays}
              drawMode={activeTab.drawMode}
              onDrawComplete={handleAddReceipt}
              onCancelDraw={() => updateActiveTab(t => ({ ...t, drawMode: false }))}
              annotations={activeTab.batch.annotations ?? []}
              annotationTool={activeTab.annotationTool}
              onPlaceAnnotation={handleAddAnnotation}
              onRemoveAnnotation={handleRemoveAnnotation}
              onCancelAnnotation={() => updateActiveTab(t => ({ ...t, annotationTool: null }))}
            />
          )}
        </main>

        <Splitter side="right" onResize={setRightW} />

        <aside style={{ width: rightW }} className="border-l bg-white overflow-y-auto shrink-0">
          <DetailsPanel
            receipt={selected}
            hoveredLineId={activeTab?.hoveredLineId ?? null}
            onHoverLine={(id) => updateActiveTab(t => ({ ...t, hoveredLineId: id }))}
            onEdit={(path, value) => selected && updateReceipt(selected.id, r => {
              const m = path.match(/^lines\[(\d+)\]\.(.+)$/);
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
            onPickSupplier={(cod) => selected && handlePickSupplier(selected.id, cod)}
            onChangeStatus={(status, reason) => selected && handleChangeStatus(selected.id, status, reason)}
            onAddLine={() => selected && updateReceipt(selected.id, r => recalcTotals(addLine(r)))}
            onRemoveLine={(i) => selected && updateReceipt(selected.id, r => recalcTotals(removeLine(r, i)))}
            onUndo={() => selected && updateReceipt(selected.id, undoLastEdit)}
            allSuppliers={combinedSuppliers}
            onCreateSupplier={handleCreateSupplier}
          />
        </aside>
      </div>

      {pendingSwitch && activeTab && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded shadow-xl p-6 max-w-md">
            <h3 className="font-semibold text-slate-800 mb-2">Unsaved changes</h3>
            <p className="text-sm text-slate-700 mb-4">
              <span className="font-medium">{activeTab.batch.client?.name ?? activeTab.folderPath}</span> has unsaved edits.
              What would you like to do?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => resolvePendingSwitch('cancel')}
                className="px-3 py-1.5 text-sm bg-slate-200 hover:bg-slate-300 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => resolvePendingSwitch('discard')}
                className="px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-500 text-white rounded"
              >
                Discard
              </button>
              <button
                onClick={() => resolvePendingSwitch('save')}
                className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded"
              >
                Save & switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
