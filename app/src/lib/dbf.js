// Build a Visual FoxPro DBF in the SAGA "Intrari" schema.
// Schema reverse-engineered from a real export (see SAGA_observations.txt + schema.md).

const FIELDS = [
  ['NR_NIR',     'C', 16, 0],
  ['NR_INTRARE', 'C', 16, 0],
  ['GESTIUNE',   'C',  4, 0],
  ['DEN_GEST',   'C', 24, 0],
  ['COD',        'C',  8, 0],
  ['DATA',       'D',  8, 0],
  ['SCADENT',    'D',  8, 0],
  ['TIP',        'C',  1, 0],
  ['TVAI',       'I',  4, 0],
  ['COD_ART',    'C', 16, 0],
  ['DEN_TIP',    'C', 36, 0],
  ['TIP_O',      'C',  3, 0],
  ['DEN_ART',    'C', 60, 0],
  ['TVA_ART',    'I',  4, 0],
  ['UM',         'C',  5, 0],
  ['CANTITATE',  'N', 20, 3],
  ['VALOARE',    'N', 20, 2],
  ['TVA',        'N', 20, 2],
  ['CONT',       'C', 20, 0],
  ['PRET_VANZ',  'N', 20, 4],
  ['GRUPA',      'C', 16, 0],
  ['TIP_DED',    'C',  3, 0],
  ['TEXT_SUPL',  'C',150, 0],
  ['_NullFlags', '0',  3, 0]
];

const HEADER_LEN = 32 + FIELDS.length * 32 + 1 + 263; // 1064 for 24 fields
const RECORD_LEN = 1 + FIELDS.reduce((s, f) => s + f[2], 0); // 486

function asciiBytes(str, n) {
  const out = new Uint8Array(n);
  out.fill(0x20);
  const s = (str ?? '').toString();
  for (let i = 0; i < n && i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 128 ? c : 0x3F; // '?' for non-ASCII
  }
  return out;
}

function padNum(value, n, dec) {
  const v = Number.isFinite(value) ? value : 0;
  const s = v.toFixed(dec);
  return asciiBytes(s.padStart(n, ' '), n);
}

function dateBytes(yyyymmdd) {
  return asciiBytes(yyyymmdd, 8);
}

function int32LE(value) {
  const out = new Uint8Array(4);
  const dv = new DataView(out.buffer);
  dv.setInt32(0, value | 0, true);
  return out;
}

function buildHeader(numRecords) {
  const buf = new Uint8Array(HEADER_LEN);
  buf[0] = 0x30; // Visual FoxPro
  const today = new Date();
  buf[1] = today.getFullYear() - 2000;
  buf[2] = today.getMonth() + 1;
  buf[3] = today.getDate();
  // bytes 4-7: number of records (LE int32)
  buf.set(int32LE(numRecords), 4);
  // bytes 8-9: header length (LE int16)
  new DataView(buf.buffer).setInt16(8, HEADER_LEN, true);
  // bytes 10-11: record length (LE int16)
  new DataView(buf.buffer).setInt16(10, RECORD_LEN, true);
  // bytes 12-31: reserved/zeros (already zero)

  // Field descriptors at byte 32, each 32 bytes
  let pos = 32;
  for (const [name, type, len, dec] of FIELDS) {
    // name: 11 bytes, null-terminated
    for (let i = 0; i < name.length && i < 11; i++) buf[pos + i] = name.charCodeAt(i);
    buf[pos + 11] = type.charCodeAt(0);
    // bytes 12-15 reserved
    buf[pos + 16] = len;
    buf[pos + 17] = dec;
    // remaining bytes zero
    pos += 32;
  }
  buf[pos] = 0x0D; // header terminator
  // remaining 263 bytes = VFP "backlist" (DBC path, zeros for free tables)
  return buf;
}

function buildRecord(doc, line) {
  const out = new Uint8Array(RECORD_LEN);
  let p = 0;
  out[p++] = 0x20; // not deleted

  function put(bytes) { out.set(bytes, p); p += bytes.length; }

  put(asciiBytes(String(doc.nr_nir ?? 0), 16));
  put(asciiBytes(doc.nr_intrare ?? '', 16));
  put(asciiBytes(line.gestiune ?? '', 4));
  put(asciiBytes(line.den_gest ?? '', 24));
  put(asciiBytes(doc.cod ?? '', 8));
  put(dateBytes(doc.data ?? ''));
  put(dateBytes(doc.data ?? ''));
  put(asciiBytes(doc.tip ?? ' ', 1));
  put(int32LE(0));                       // TVAI
  put(asciiBytes(line.cod_art ?? '', 16));
  put(asciiBytes(line.den_tip ?? 'Nedefinit', 36));
  put(asciiBytes('', 3));                // TIP_O
  put(asciiBytes(line.den_art ?? '', 60));
  put(int32LE(0));                       // TVA_ART
  put(asciiBytes(line.um ?? '', 5));
  put(padNum(line.cantitate ?? 0, 20, 3));
  put(padNum(line.valoare ?? 0, 20, 2));
  put(padNum(line.tva ?? 0, 20, 2));
  put(asciiBytes(line.cont ?? '', 20));
  put(padNum(0, 20, 4));                 // PRET_VANZ
  put(asciiBytes('', 16));               // GRUPA
  put(asciiBytes('', 3));                // TIP_DED
  put(asciiBytes('', 150));              // TEXT_SUPL
  // _NullFlags 3 bytes already zero
  return out;
}

// Convert a JSON receipt to {doc, lines[]} ready for buildRecord.
function receiptToRows(receipt, nrNir) {
  const yyyymmdd = (receipt.date ?? '').replace(/-/g, ''); // 2026-03-01 -> 20260301
  const doc = {
    nr_nir: nrNir,
    nr_intrare: receipt.doc_number ?? '',
    cod: receipt.supplier?.matched_cod ?? '',
    data: yyyymmdd,
    tip: receipt.doc_type ?? ' '
  };
  const lines = (receipt.lines ?? []).map(l => ({
    gestiune: '',
    den_gest: '',
    cod_art: l.matched_cod_art ?? '',
    den_tip: 'Nedefinit',
    den_art: l.den_art ?? '',
    um: l.um ?? '',
    cantitate: Number(l.cantitate) || 0,
    valoare: Number(l.valoare_net) || 0,
    tva: Number(l.tva) || 0,
    cont: l.cont ?? ''
  }));
  return { doc, lines };
}

export function buildDbfBytes(receipts) {
  const allRecords = [];
  receipts.forEach((receipt, idx) => {
    const { doc, lines } = receiptToRows(receipt, idx + 1);
    for (const line of lines) {
      allRecords.push(buildRecord(doc, line));
    }
  });

  const total = HEADER_LEN + allRecords.length * RECORD_LEN + 1; // +1 for EOF marker
  const out = new Uint8Array(total);
  out.set(buildHeader(allRecords.length), 0);
  let pos = HEADER_LEN;
  for (const rec of allRecords) {
    out.set(rec, pos);
    pos += RECORD_LEN;
  }
  out[pos] = 0x1A; // EOF
  return out;
}

// Validate before export: returns { ready: Receipt[], blocked: { id, reason }[] }.
// Only "ok" receipts qualify; they must also have matched_cod and at least one line.
export function partitionForExport(receipts) {
  const ready = [];
  const blocked = [];
  for (const r of receipts) {
    if (r.status !== 'ok') continue;
    if (!r.supplier?.matched_cod) {
      blocked.push({ id: r.id, reason: 'ok status but no matched_cod' });
      continue;
    }
    if (!r.lines || r.lines.length === 0) {
      blocked.push({ id: r.id, reason: 'ok status but no lines' });
      continue;
    }
    if (!r.date) {
      blocked.push({ id: r.id, reason: 'ok status but no date' });
      continue;
    }
    ready.push(r);
  }
  return { ready, blocked };
}
