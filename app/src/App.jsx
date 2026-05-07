import React, { useState, useMemo, useCallback } from 'react';
import ReceiptList from './components/ReceiptList.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import DetailsPanel from './components/DetailsPanel.jsx';
import Splitter from './components/Splitter.jsx';
import StatusTabs from './components/StatusTabs.jsx';
import { applyEdit, addLine, removeLine, undoLastEdit } from './lib/edits.js';
import { parseCsv } from './lib/csv.js';
import { buildDbfBytes, partitionForExport } from './lib/dbf.js';
import { findMissingSuppliers, buildMissingSuppliersXlsx } from './lib/missingSuppliers.js';

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
  const [leftW, setLeftW] = useState(288);
  const [rightW, setRightW] = useState(440);
  const [statusFilter, setStatusFilter] = useState('all');

  async function handleOpen() {
    const r = await window.api.openJson();
    if (!r) return;
    setBatch(r.data);
    setPdfDir(r.dir);
    setJsonPath(r.path);
    setSelectedId(r.data.receipts?.[0]?.id ?? null);
    setHoveredLineId(null);
    setDirty(false);
    const pdfAbs = `${r.dir}\\${r.data.pdf_path}`;
    const buf = await window.api.readPdf(pdfAbs);
    setPdfData(buf);

    // Auto-load furnizori.CSV from same directory if present, else fall back to snapshots
    const furnText = await window.api.readTextIfExists(`${r.dir}\\furnizori.CSV`)
      ?? await window.api.readTextIfExists(`${r.dir}\\furnizori.csv`);
    if (furnText) {
      const rows = parseCsv(furnText).map(row => ({
        cod: row.cod,
        denumire: row.denumire,
        cif: row.cod_fiscal
      }));
      setAllSuppliers(rows);
    } else {
      setAllSuppliers(r.data.snapshots?.suppliers ?? []);
    }
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

  async function handleExportMissingSuppliers() {
    if (!batch) return;
    const missing = findMissingSuppliers(batch.receipts, allSuppliers);
    if (missing.length === 0) {
      alert('No missing suppliers — every supplier on a non-deleted receipt is matched.');
      return;
    }
    const folder = await window.api.pickFolder();
    if (!folder) return;
    const name = `${batch.batch_id}_missing_suppliers.xlsx`;
    const xlsx = buildMissingSuppliersXlsx(missing);
    await window.api.writeBinary(`${folder}\\${name}`, xlsx.buffer ?? xlsx);
    alert(`Wrote ${missing.length} missing supplier(s) to ${name}`);
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

    const today = new Date().toISOString().slice(0, 10);
    const dbfName = `IN_${today}_${batch.batch_id}.DBF`;
    const skipName = `${batch.batch_id}_skipped.json`;
    const dbfPath = `${folder}\\${dbfName}`;
    const skipPath = `${folder}\\${skipName}`;

    const dbfBytes = buildDbfBytes(ready);
    await window.api.writeBinary(dbfPath, dbfBytes.buffer);

    const skipped = batch.receipts.filter(r => r.status !== 'ok' || blocked.find(b => b.id === r.id));
    const skipPayload = {
      batch_id: batch.batch_id,
      generated_at: new Date().toISOString(),
      blocked_at_export: blocked,
      receipts: skipped
    };
    await window.api.writeText(skipPath, JSON.stringify(skipPayload, null, 2));

    alert(
      `Exported ${ready.length} receipt(s) (${dbfBytes.length} bytes)\n` +
      `→ ${dbfName}\n\n` +
      `Skipped ${skipped.length} receipt(s)\n→ ${skipName}`
    );
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

  const suppliersByCod = useMemo(
    () => Object.fromEntries(allSuppliers.map(s => [s.cod, s])),
    [allSuppliers]
  );

  const counts = useMemo(() => {
    if (!batch) return {};
    const c = { all: batch.receipts.length, ok: 0, needs_attention: 0, deleted: 0 };
    for (const r of batch.receipts) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [batch]);

  const visibleReceipts = useMemo(() => {
    if (!batch) return [];
    return statusFilter === 'all'
      ? batch.receipts
      : batch.receipts.filter(r => r.status === statusFilter);
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
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleExportMissingSuppliers}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-sm"
            title="Export suppliers referenced on receipts but not in furnizori.CSV"
          >
            Missing suppliers
          </button>
          <button
            onClick={handleExport}
            disabled={(counts.ok ?? 0) === 0}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm"
          >
            Export DBF ({counts.ok ?? 0})
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
          <PdfViewer pdfData={pdfData} page={selected?.page ?? 1} overlays={overlays} />
        </main>

        <Splitter side="right" onResize={setRightW} />

        <aside style={{ width: rightW }} className="border-l bg-white overflow-y-auto shrink-0">
          <DetailsPanel
            receipt={selected}
            hoveredLineId={hoveredLineId}
            onHoverLine={setHoveredLineId}
            onEdit={(path, value) => updateReceipt(selected.id, r => applyEdit(r, path, value))}
            onPickSupplier={(cod) => handlePickSupplier(selected.id, cod)}
            onChangeStatus={(status, reason) => handleChangeStatus(selected.id, status, reason)}
            onAddLine={() => updateReceipt(selected.id, addLine)}
            onRemoveLine={(i) => updateReceipt(selected.id, r => removeLine(r, i))}
            onUndo={() => updateReceipt(selected.id, undoLastEdit)}
            allSuppliers={allSuppliers}
          />
        </aside>
      </div>
    </div>
  );
}
