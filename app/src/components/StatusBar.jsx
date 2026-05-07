import React from 'react';

const STATUS_REASONS = {
  needs_attention: [
    { value: 'supplier_not_found', label: 'Supplier not found' },
    { value: 'illegible', label: 'Illegible' },
    { value: 'not_a_receipt', label: 'Not a receipt' },
    { value: 'wrong_client', label: 'Wrong client' },
    { value: 'bon_nefiscal', label: 'BON NEFISCAL' },
    { value: 'duplicate', label: 'Duplicate' }
  ],
  deleted: [
    { value: 'user_deleted', label: 'User deleted' },
    { value: 'not_a_receipt', label: 'Not a receipt' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'wrong_client', label: 'Wrong client' }
  ]
};

const BTN = {
  ok:              'bg-emerald-600 hover:bg-emerald-700 text-white',
  needs_attention: 'bg-amber-500  hover:bg-amber-600  text-white',
  deleted:         'bg-rose-600   hover:bg-rose-700   text-white',
  inactive:        'bg-slate-200  hover:bg-slate-300  text-slate-700'
};

export default function StatusBar({ receipt, onChangeStatus }) {
  const reasons = STATUS_REASONS[receipt.status] ?? [];

  return (
    <section className="border rounded p-2 bg-slate-50 space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
      <div className="grid grid-cols-3 gap-1">
        {['ok', 'needs_attention', 'deleted'].map(s => (
          <button
            key={s}
            onClick={() => onChangeStatus(s, s === 'ok' ? null : (receipt.status_reason ?? STATUS_REASONS[s][0].value))}
            className={`px-2 py-1.5 text-xs rounded font-medium transition-colors ${
              receipt.status === s ? BTN[s] : BTN.inactive
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>
      {reasons.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-14 shrink-0">Reason</span>
          <select
            value={receipt.status_reason ?? reasons[0].value}
            onChange={e => onChangeStatus(receipt.status, e.target.value)}
            className="flex-1 px-2 py-1 text-sm border rounded bg-white"
          >
            {reasons.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
