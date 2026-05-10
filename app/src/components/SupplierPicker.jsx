import React, { useState, useMemo, useRef, useEffect } from 'react';

export default function SupplierPicker({ value, suppliers, onPick, onCreate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newCif, setNewCif] = useState('');
  const [newName, setNewName] = useState('');
  const ref = useRef(null);

  const current = suppliers.find(s => s.cod === value);

  async function submitCreate() {
    if (!onCreate) return;
    const cod = await onCreate(newCif, newName);
    if (cod) {
      onPick(cod);
      setOpen(false);
      setCreating(false);
      setNewCif('');
      setNewName('');
      setQuery('');
    }
  }

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
          <div className="absolute z-10 mt-1 left-0 right-0 bg-white border rounded shadow-lg max-h-80 overflow-hidden flex flex-col">
            {!creating && (
              <input
                autoFocus
                type="text"
                placeholder="Search by name, cod or CIF..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="px-2 py-1 text-sm border-b focus:outline-none"
              />
            )}

            {onCreate && !creating && (
              <button
                onClick={() => setCreating(true)}
                className="w-full text-left px-2 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 border-b"
              >
                + Create new supplier
              </button>
            )}

            {creating && (
              <div className="p-2 border-b bg-emerald-50/40 space-y-1">
                <div className="text-xs font-medium text-emerald-800">New supplier</div>
                <input
                  autoFocus
                  type="text"
                  placeholder="CIF (e.g. RO12345678)"
                  value={newCif}
                  onChange={e => setNewCif(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(false); }}
                  className="w-full px-2 py-1 text-sm font-mono border rounded focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <input
                  type="text"
                  placeholder="Name (optional, for your convenience)"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(false); }}
                  className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <div className="flex gap-1 pt-1">
                  <button
                    onClick={submitCreate}
                    className="flex-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                  >
                    Save & pick
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewCif(''); setNewName(''); }}
                    className="px-2 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!creating && (
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
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="truncate font-medium">
                        {s.denumire || <span className="text-slate-400 italic">(no name)</span>}
                      </span>
                      <span className="font-mono text-xs text-slate-500 shrink-0">{s.cod}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      {s.cif && <span className="text-xs text-slate-500 font-mono">{s.cif}</span>}
                      {s.__custom && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded px-1 ml-auto">
                          new
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </label>
  );
}
