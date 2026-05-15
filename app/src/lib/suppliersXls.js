import * as XLSX from 'xlsx';

// Column order mirrors furnizori.CSV so SAGA's importer accepts the file.
const COLUMNS = [
  'cod', 'denumire', 'cod_fiscal', 'analitic', 'tara', 'judet', 'localitate',
  'adresa', 'cont_banca', 'banca', 'tel', 'email', 'grupa', 'reg_com', 'den_agent'
];

export function buildSuppliersXls(customSuppliers) {
  const rows = (customSuppliers ?? []).map(s => {
    const row = {};
    for (const c of COLUMNS) row[c] = '';
    row.cod = s.cod ?? '';
    row.denumire = s.denumire ?? '';
    row.cod_fiscal = s.cif ?? '';
    return row;
  });
  const sheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'furnizori');
  return XLSX.write(wb, { type: 'array', bookType: 'biff8' });
}

export function suppliersXlsName() {
  const r = () => Math.floor(10000 + Math.random() * 90000);
  return `xls-${r()}-${r()}.xls`;
}
