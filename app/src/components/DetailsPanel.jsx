import React from 'react';
import EditableField from './EditableField.jsx';
import SupplierPicker from './SupplierPicker.jsx';
import StatusBar from './StatusBar.jsx';
import { TIPURI_ARTICOLE } from '../lib/tipuriArticole.js';

const TIP_OPTIONS = [
  { value: '', label: 'Nedefinit' },
  ...TIPURI_ARTICOLE.map(t => ({ value: t.cod, label: `${t.cod} — ${t.denumire}` }))
];

const DOC_TYPES = [
  { value: 'B', label: 'B - Bon de casa' },
  { value: 'C', label: 'C - Bon cu cod fiscal' },
  { value: ' ', label: '(space) - Factura' },
  { value: 'A', label: 'A - Aviz' },
  { value: 'T', label: 'T - Taxare inversa' }
];

const TVA_COTE = [0, 5, 9, 11, 21].map(n => ({ value: n, label: `${n}%` }));

// SAGA-accepted units of measure (UM). Keep in sync with classify-receipts.md.
const UM_OPTIONS = [
  ['BUC',   'Bucata'],
  ['KG',    'Kilogram'],
  ['LITRI', 'Litru'],
  ['L',     'Litru (scurt)'],
  ['M',     'Metru'],
  ['GRAME', 'Gram'],
  ['CUTII', 'Cutie'],
  ['PAC',   'Pachet'],
  ['PUNGI', 'Punga'],
  ['SET',   'Set'],
  ['MP',    'Metru patrat'],
  ['MC',    'Metru cub'],
  ['MM',    'Milimetru'],
  ['CM',    'Centimetru'],
  ['KM',    'Kilometru'],
  ['TONE',  'Tona'],
  ['PER',   'Pereche'],
  ['SACI',  'Sac'],
  ['ML',    'Mililitru'],
  ['KWH',   'Kilowatt ora'],
  ['ORE',   'Ora'],
  ['MIN',   'Minut'],
  ['ZILE',  'Zi de lucru'],
  ['LUNI',  'Luni de lucru'],
  ['DOZE',  'Doza'],
  ['SERV',  'Unitate de service'],
  ['1000B', 'O mie de bucati'],
  ['TRIM',  'Trimestru'],
  ['PROC',  'Procent'],
  ['LADA',  'Lada'],
  ['DT',    'Dry tone'],
  ['CMP',   'Centimetru patrat'],
  ['MWH',   'Megawatt ora'],
  ['ROLA',  'Rola'],
  ['TAMB',  'Tambur'],
  ['SAC',   'Sac plastic'],
  ['PALET', 'Palet lemn'],
  ['UNIT',  'Unitate'],
  ['TN',    'Tona neta'],
  ['HA',    'Hectometru patrat'],
  ['FOAIE', 'Foaie / coala']
].map(([value, label]) => ({ value, label: `${value} — ${label}` }));

function ReadOnlyField({ label, value }) {
  const display = value == null ? '—' : (typeof value === 'number' ? value.toFixed(2) : String(value));
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 px-2 py-1 text-sm font-mono bg-slate-50 border border-slate-200 rounded text-slate-700">
        {display}
      </div>
    </div>
  );
}

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
  allSuppliers = [],
  onCreateSupplier
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
          onCreate={onCreateSupplier}
        />
        <div className="text-xs text-slate-500 pl-22 -mt-1">
          Match: <span className="font-mono">{receipt.supplier.match_method}</span>
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          Totals <span className="text-slate-400 normal-case">(derived from lines)</span>
        </h2>
        <ReadOnlyField label="Net"   value={receipt.totals.valoare_net} />
        <ReadOnlyField label="TVA"   value={receipt.totals.tva} />
        <ReadOnlyField label="Total" value={receipt.totals.total} />
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
                    label="UM" value={l.um} options={UM_OPTIONS}
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
                  label="Total" type="number"
                  value={Math.round(((Number(l.valoare_net) || 0) + (Number(l.tva) || 0)) * 100) / 100}
                  onCommit={v => onEdit(`lines[${i}].gross`, v)}
                />
                <EditableField
                  label="Tip" value={l.tip ?? ''} options={TIP_OPTIONS}
                  onCommit={v => onEdit(`lines[${i}].tip`, v)}
                />
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
