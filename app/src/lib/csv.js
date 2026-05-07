// Minimal CSV parser that handles quoted fields and embedded commas/newlines.
export function parseCsv(text) {
  if (!text) return [];
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.some(v => v !== '')).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i] ?? '');
    return o;
  });
}
