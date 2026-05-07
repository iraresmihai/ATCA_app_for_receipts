import React, { useState, useEffect } from 'react';

export default function EditableField({
  label,
  value,
  type = 'text',
  options,
  onCommit,
  className = ''
}) {
  const [local, setLocal] = useState(value ?? '');

  useEffect(() => { setLocal(value ?? ''); }, [value]);

  function commit() {
    let v = local;
    if (type === 'number') {
      v = local === '' ? null : Number(local);
      if (Number.isNaN(v)) v = null;
    } else if (type === 'text' && v === '') {
      v = null;
    }
    if (v !== (value ?? null)) onCommit(v);
  }

  const baseInput =
    'w-full px-2 py-1 text-sm font-mono border rounded focus:outline-none focus:ring-1 focus:ring-blue-400';

  let input;
  if (options) {
    input = (
      <select
        className={baseInput}
        value={local ?? ''}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  } else {
    input = (
      <input
        type={type}
        className={baseInput}
        value={local ?? ''}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        step={type === 'number' ? 'any' : undefined}
      />
    );
  }

  return (
    <label className={`flex items-center gap-2 py-1 ${className}`}>
      <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1">{input}</div>
    </label>
  );
}
