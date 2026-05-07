import React, { useState, useMemo, useRef, useEffect } from 'react';

export default function SupplierPicker({ value, suppliers, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  const current = suppliers.find(s => s.cod === value);

  useEffect(() => {
    function onDoc(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 50);
    return suppliers.filter(s =>
      s.denumire?.toLowerCase().includes(q) ||
      s.cod?.toLowerCase().includes(q) ||
      s.cif?.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [suppliers, query]);

  return (
    <label className="flex items-center gap-2 py-1">
      <span className="text-xs text-slate-500 w-20 shrink-0">Supplier</span>
      <div className="flex-1 relative" ref={ref}>
        <button
          type="button"
          onClick={() => { setOpen(o => !o); setQuery(''); }}
          className="w-full px-2 py-1 text-sm text-left border rounded bg-white hover:bg-slate-50 truncate"
        >
          {current
            ? <><span className="font-mono text-slate-400 mr-1">{current.cod}</span>{current.denumire}</>
            : <span className="text-slate-400">— pick supplier —</span>
          }
        </button>
        {open && (
          <div className="absolute z-10 mt-1 left-0 right-0 bg-white border rounded shadow-lg max-h-72 overflow-hidden flex flex-col">
            <input
              autoFocus
              type="text"
              placeholder="Search by name, cod or CIF..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="px-2 py-1 text-sm border-b focus:outline-none"
            />
            <div className="overflow-y-auto">
              {value && (
                <button
                  onClick={() => { onPick(null); setOpen(false); }}
                  className="w-full text-left px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 border-b"
                >
                  Clear (no supplier)
                </button>
              )}
              {filtered.length === 0 && (
                <div className="px-2 py-3 text-sm text-slate-500">No matches</div>
              )}
              {filtered.map(s => (
                <button
                  key={s.cod}
                  onClick={() => { onPick(s.cod); setOpen(false); }}
                  className={`block w-full text-left px-2 py-1 text-sm hover:bg-blue-50 ${
                    s.cod === value ? 'bg-blue-100' : ''
                  }`}
                >
                  <div className="flex justify-between items-baseline">
                    <span className="truncate font-medium">{s.denumire}</span>
                    <span className="font-mono text-xs text-slate-500 shrink-0 ml-2">{s.cod}</span>
                  </div>
                  {s.cif && <div className="text-xs text-slate-500 font-mono">{s.cif}</div>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}
