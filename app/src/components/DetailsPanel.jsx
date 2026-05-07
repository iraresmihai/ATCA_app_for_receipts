import React from 'react';
import EditableField from './EditableField.jsx';
import SupplierPicker from './SupplierPicker.jsx';
import StatusBar from './StatusBar.jsx';

const DOC_TYPES = [
  { value: 'B', label: 'B - Bon de casa' },
  { value: 'F', label: 'F - Bon cu cod fiscal' },
  { value: ' ', label: '(space) - Factura' },
  { value: 'A', label: 'A - Aviz' },
  { value: 'T', label: 'T - Taxare inversa' }
];

const TVA_COTE = [0, 5, 9, 11, 21].map(n => ({ value: n, label: `${n}%` }));

export default function DetailsPanel({
  receipt,
  hoveredLineId,
  onHoverLine,
  onEdit,
  onPickSupplier,
  onChangeStatus,
  onAddLine,
  onRemoveLine,
  onUndo,
  allSuppliers = []
}) {
  if (!receipt) return <div className="p-4 text-slate-500">Select a receipt</div>;

  return (
    <div className="p-4 space-y-5">
      <StatusBar receipt={receipt} onChangeStatus={onChangeStatus} />

      <section>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Document</h2>
        <EditableField
          label="Type" value={receipt.doc_type} options={DOC_TYPES}
          onCommit={v => onEdit('doc_type', v)}
        />
        <EditableField
          label="Number" value={receipt.doc_number}
          onCommit={v => onEdit('doc_number', v)}
        />
        <EditableField
          label="Date" value={receipt.date} type="date"
          onCommit={v => onEdit('date', v)}
        />
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Supplier</h2>
        <EditableField
          label="Name" value={receipt.supplier.name_on_receipt}
          onCommit={v => onEdit('supplier.name_on_receipt', v)}
        />
        <EditableField
          label="CIF" value={receipt.supplier.cif_on_receipt}
          onCommit={v => onEdit('supplier.cif_on_receipt', v)}
        />
        <SupplierPicker
          value={receipt.supplier.matched_cod}
          suppliers={allSuppliers}
          onPick={onPickSupplier}
        />
        <div className="text-xs text-slate-500 pl-22 -mt-1">
          Match: <span className="font-mono">{receipt.supplier.match_method}</span>
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Totals</h2>
        <EditableField
          label="Net" type="number" value={receipt.totals.valoare_net}
          onCommit={v => onEdit('totals.valoare_net', v)}
        />
        <EditableField
          label="TVA" type="number" value={receipt.totals.tva}
          onCommit={v => onEdit('totals.tva', v)}
        />
        <EditableField
          label="Total" type="number" value={receipt.totals.total}
          onCommit={v => onEdit('totals.total', v)}
        />
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">
            Lines ({receipt.lines.length})
          </h2>
          <button
            onClick={onAddLine}
            className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Add
          </button>
        </div>

        <div className="space-y-3">
          {receipt.lines.map((l, i) => {
            const isHov = l.id === hoveredLineId;
            return (
              <div
                key={l.id}
                onMouseEnter={() => onHoverLine?.(l.id)}
                onMouseLeave={() => onHoverLine?.(null)}
                className={`border rounded p-2 ${
                  isHov ? 'border-amber-500 bg-amber-50' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-slate-400">{l.id}</span>
                  <button
                    onClick={() => onRemoveLine(i)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <EditableField
                  label="Article" value={l.den_art}
                  onCommit={v => onEdit(`lines[${i}].den_art`, v)}
                />
                <div className="grid grid-cols-2 gap-x-2">
                  <EditableField
                    label="UM" value={l.um}
                    onCommit={v => onEdit(`lines[${i}].um`, v)}
                  />
                  <EditableField
                    label="Cant" type="number" value={l.cantitate}
                    onCommit={v => onEdit(`lines[${i}].cantitate`, v)}
                  />
                  <EditableField
                    label="Pret net" type="number" value={l.pret_unitar_net}
                    onCommit={v => onEdit(`lines[${i}].pret_unitar_net`, v)}
                  />
                  <EditableField
                    label="Net" type="number" value={l.valoare_net}
                    onCommit={v => onEdit(`lines[${i}].valoare_net`, v)}
                  />
                  <EditableField
                    label="TVA" type="number" value={l.tva}
                    onCommit={v => onEdit(`lines[${i}].tva`, v)}
                  />
                  <EditableField
                    label="Cota" value={l.tva_cota} options={TVA_COTE}
                    onCommit={v => onEdit(`lines[${i}].tva_cota`, Number(v))}
                  />
                </div>
                <EditableField
                  label="Cont" value={l.cont}
                  onCommit={v => onEdit(`lines[${i}].cont`, v)}
                />
              </div>
            );
          })}
        </div>
      </section>

      {receipt.edits?.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs uppercase tracking-wide text-slate-500">
              Edits ({receipt.edits.length})
            </h2>
            <button
              onClick={onUndo}
              className="text-xs px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded"
              title="Undo last edit"
            >
              ↶ Undo last
            </button>
          </div>
          <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
            {receipt.edits.slice().reverse().map((e, i) => (
              <li key={i} className="font-mono text-slate-600">
                <span className="text-slate-400">{e.at.slice(11, 19)}</span>{' '}
                <span className="text-blue-700">{e.field}</span>:{' '}
                <span className="text-rose-600">{JSON.stringify(e.old)}</span> →{' '}
                <span className="text-emerald-700">{JSON.stringify(e.new)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {receipt.notes && (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Notes</h2>
          <p className="text-sm text-slate-700">{receipt.notes}</p>
        </section>
      )}
    </div>
  );
}
