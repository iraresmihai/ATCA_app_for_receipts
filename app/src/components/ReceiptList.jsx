import React from 'react';

const STATUS_STYLES = {
  ok:                'bg-emerald-100 text-emerald-800',
  needs_attention:   'bg-amber-100 text-amber-800',
  deleted:           'bg-rose-100 text-rose-800'
};

export default function ReceiptList({ receipts, selectedId, onSelect, suppliersByCod = {} }) {
  return (
    <ul className="divide-y">
      {receipts.map(r => {
        const isSel = r.id === selectedId;
        const matched = r.supplier.matched_cod ? suppliersByCod[r.supplier.matched_cod] : null;
        const displayName = matched?.denumire || r.supplier.name_on_receipt || '(no supplier)';
        return (
          <li
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`p-3 cursor-pointer hover:bg-slate-50 ${isSel ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-slate-500">{r.id}</span>
              <span className="text-slate-400 text-xs">p.{r.page}</span>
            </div>
            <div className="text-sm font-medium truncate" title={displayName}>
              {displayName}
            </div>
            {matched && matched.denumire !== r.supplier.name_on_receipt && (
              <div className="text-xs text-slate-400 truncate" title={r.supplier.name_on_receipt}>
                on receipt: {r.supplier.name_on_receipt}
              </div>
            )}
            <div className="flex items-center justify-between mt-1">
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[r.status]}`}>
                {r.status}
              </span>
              <span className="text-sm font-mono">
                {r.totals.total != null ? r.totals.total.toFixed(2) : '—'} lei
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
