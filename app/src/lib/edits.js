// Helpers for editing nested receipt fields and tracking an audit trail.

export function getAt(obj, path) {
  return path.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    const m = k.match(/^(\w+)\[(\d+)\]$/);
    if (m) return o[m[1]]?.[Number(m[2])];
    return o[k];
  }, obj);
}

export function setAt(obj, path, value) {
  const keys = path.split('.');
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const m = k.match(/^(\w+)\[(\d+)\]$/);
    if (m) {
      const arr = [...(cur[m[1]] ?? [])];
      arr[Number(m[2])] = arr[Number(m[2])] != null
        ? (Array.isArray(arr[Number(m[2])]) ? [...arr[Number(m[2])]] : { ...arr[Number(m[2])] })
        : {};
      cur[m[1]] = arr;
      cur = arr[Number(m[2])];
    } else {
      cur[k] = cur[k] != null
        ? (Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] })
        : {};
      cur = cur[k];
    }
  }
  const last = keys[keys.length - 1];
  const lm = last.match(/^(\w+)\[(\d+)\]$/);
  if (lm) {
    const arr = [...(cur[lm[1]] ?? [])];
    arr[Number(lm[2])] = value;
    cur[lm[1]] = arr;
  } else {
    cur[last] = value;
  }
  return out;
}

export function applyEdit(receipt, path, newValue) {
  const oldValue = getAt(receipt, path);
  if (oldValue === newValue) return receipt;
  let next = setAt(receipt, path, newValue);
  next = setAt(next, `edits[${(receipt.edits ?? []).length}]`, {
    field: path,
    old: oldValue ?? null,
    new: newValue ?? null,
    at: new Date().toISOString()
  });
  return next;
}

export function addLine(receipt) {
  const idx = receipt.lines.length;
  const newId = `${receipt.id}-l${idx + 1}`;
  const newLine = {
    id: newId,
    den_art: '',
    cod_art_on_receipt: '',
    matched_cod_art: '',
    match_method: 'none',
    um: 'BUC',
    cantitate: 1,
    pret_unitar_net: 0,
    valoare_net: 0,
    tva: 0,
    tva_cota: 21,
    cont: '604',
    bbox: null,
    notes: ''
  };
  const next = { ...receipt, lines: [...receipt.lines, newLine] };
  next.edits = [
    ...(receipt.edits ?? []),
    { op: 'add_line', field: `lines[${idx}]`, old: null, new: newLine, at: new Date().toISOString() }
  ];
  return next;
}

export function removeLine(receipt, lineIndex) {
  const removed = receipt.lines[lineIndex];
  const next = { ...receipt, lines: receipt.lines.filter((_, i) => i !== lineIndex) };
  next.edits = [
    ...(receipt.edits ?? []),
    { op: 'remove_line', field: `lines[${lineIndex}]`, old: removed, new: null, at: new Date().toISOString() }
  ];
  return next;
}

// Re-derive a line's dependent fields after one of its money inputs changes.
// Source of truth: cantitate + pret_unitar_net → valoare_net → tva (via tva_cota).
// `changedField` tells us how to flow the update.
export function recalcLine(line, changedField) {
  const round = (x) => Math.round(x * 100) / 100;
  const cant = Number(line.cantitate) || 0;
  const cota = Number(line.tva_cota) || 0;
  let pret = Number(line.pret_unitar_net) || 0;
  let val  = Number(line.valoare_net) || 0;
  let tva  = Number(line.tva) || 0;

  if (changedField === 'cantitate' || changedField === 'pret_unitar_net') {
    val = round(cant * pret);
    tva = round(val * cota / 100);
  } else if (changedField === 'valoare_net') {
    if (cant !== 0) pret = round(val / cant);
    tva = round(val * cota / 100);
  } else if (changedField === 'tva_cota') {
    tva = round(val * cota / 100);
  } else {
    return line;
  }
  return { ...line, pret_unitar_net: pret, valoare_net: val, tva };
}

// Re-derive receipt totals from the current lines. Intentionally silent (no edit log entry)
// because totals are a computed view of the lines.
export function recalcTotals(receipt) {
  const lines = receipt.lines ?? [];
  const sum = (key) => lines.reduce((s, l) => s + (Number(l[key]) || 0), 0);
  const round = (x) => Math.round(x * 100) / 100;
  const net = round(sum('valoare_net'));
  const tva = round(sum('tva'));
  return {
    ...receipt,
    totals: { ...(receipt.totals ?? {}), valoare_net: net, tva, total: round(net + tva) }
  };
}

// Reverse the most recent edit. Returns the receipt unchanged if there's nothing to undo.
export function undoLastEdit(receipt) {
  const edits = receipt.edits ?? [];
  if (edits.length === 0) return receipt;
  const last = edits[edits.length - 1];
  const trimmed = { ...receipt, edits: edits.slice(0, -1) };

  if (last.op === 'add_line') {
    const m = last.field.match(/^lines\[(\d+)\]$/);
    if (!m) return trimmed;
    const idx = Number(m[1]);
    return { ...trimmed, lines: trimmed.lines.filter((_, i) => i !== idx) };
  }

  if (last.op === 'remove_line') {
    const m = last.field.match(/^lines\[(\d+)\]$/);
    if (!m || !last.old) return trimmed;
    const idx = Number(m[1]);
    const restored = [...trimmed.lines];
    restored.splice(idx, 0, last.old);
    return { ...trimmed, lines: restored };
  }

  // Field edit: revert via setAt to the old value.
  return setAt(trimmed, last.field, last.old);
}
