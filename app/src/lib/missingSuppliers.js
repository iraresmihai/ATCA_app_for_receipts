import * as XLSX from 'xlsx';

// Columns mirror furnizori.CSV exactly so SAGA's importer accepts the file.
const COLUMNS = [
  'cod', 'denumire', 'cod_fiscal', 'analitic', 'tara', 'judet', 'localitate',
  'adresa', 'cont_banca', 'banca', 'tel', 'email', 'grupa', 'reg_com', 'den_agent'
];

// Walk receipts (excluding 'deleted'), find supplier references that have no matched_cod,
// dedupe by CIF (or by name when CIF is missing).
export function findMissingSuppliers(receipts, knownSuppliers) {
  const knownByCif  = new Map(knownSuppliers.filter(s => s.cif).map(s => [normCif(s.cif), s]));
  const knownByName = new Map(knownSuppliers.map(s => [normName(s.denumire), s]));
  const missing = new Map(); // key -> { denumire, cod_fiscal, receipt_ids[] }

  for (const r of receipts) {
    if (r.status === 'deleted') continue;
    const sup = r.supplier;
    if (!sup) continue;
    if (sup.matched_cod) continue; // already in catalog

    const cif = sup.cif_on_receipt ? normCif(sup.cif_on_receipt) : null;
    const name = sup.name_on_receipt ? normName(sup.name_on_receipt) : null;
    if (!cif && !name) continue;

    // Could exist under a slightly different match path — last sanity check.
    if (cif && knownByCif.has(cif)) continue;
    if (!cif && name && knownByName.has(name)) continue;

    const key = cif ?? `name:${name}`;
    if (!missing.has(key)) {
      missing.set(key, {
        denumire: sup.name_on_receipt ?? '',
        cod_fiscal: sup.cif_on_receipt ?? '',
        receipt_ids: []
      });
    }
    missing.get(key).receipt_ids.push(r.id);
  }

  return [...missing.values()];
}

function normCif(s) { return s.toUpperCase().replace(/^RO/, '').replace(/\s/g, ''); }
function normName(s) { return s.toUpperCase().trim().replace(/\s+/g, ' '); }

// Build the XLSX bytes. Each missing supplier becomes one row with denumire + cod_fiscal filled,
// other columns blank for the user to complete in SAGA. A second sheet lists which receipts referenced each.
export function buildMissingSuppliersXlsx(missing) {
  const rows = missing.map(m => {
    const row = {};
    for (const c of COLUMNS) row[c] = '';
    row.denumire = m.denumire;
    row.cod_fiscal = m.cod_fiscal;
    return row;
  });

  const main = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  const refRows = missing.map(m => ({
    denumire: m.denumire,
    cod_fiscal: m.cod_fiscal,
    referenced_in: m.receipt_ids.join(', ')
  }));
  const refs = XLSX.utils.json_to_sheet(refRows, { header: ['denumire', 'cod_fiscal', 'referenced_in'] });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, main, 'furnizori');
  XLSX.utils.book_append_sheet(wb, refs, 'references');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
