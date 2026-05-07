import React from 'react';

const TABS = [
  { id: 'all',             label: 'All',     color: 'border-slate-500 text-slate-700' },
  { id: 'ok',              label: 'OK',      color: 'border-emerald-500 text-emerald-700' },
  { id: 'needs_attention', label: 'Attn',    color: 'border-amber-500 text-amber-700' },
  { id: 'deleted',         label: 'Deleted', color: 'border-rose-500 text-rose-700' }
];

export default function StatusTabs({ active, onChange, counts }) {
  return (
    <div className="flex border-b bg-white sticky top-0 z-10">
      {TABS.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors ${
              isActive ? t.color : 'border-transparent text-slate-500 hover:bg-slate-50'
            }`}
          >
            {t.label}
            <span className="ml-1 text-slate-400">{counts[t.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
