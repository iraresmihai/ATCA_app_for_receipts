// Article types — mirrors tipuriArticole.CSV.
// `cod` is what we store on the line; `denumire` is what SAGA expects in the DBF DEN_TIP column.
export const TIPURI_ARTICOLE = [
  { cod: '01', denumire: 'Marfuri' },
  { cod: '02', denumire: 'Materii prime' },
  { cod: '03', denumire: 'Materiale auxiliare' },
  { cod: '04', denumire: 'Produse finite' },
  { cod: '05', denumire: 'Ambalaje' },
  { cod: '06', denumire: 'Obiecte de inventar' },
  { cod: '07', denumire: 'Produse reziduale' },
  { cod: '08', denumire: 'Semifabricate' },
  { cod: '09', denumire: 'Amenajari provizorii' },
  { cod: '10', denumire: 'Mat. spre prelucrare' },
  { cod: '11', denumire: 'Mat. in pastrare/consig.' },
  { cod: '12', denumire: 'Discount financiar intrari' },
  { cod: '13', denumire: 'Discount financiar iesiri' },
  { cod: '14', denumire: 'Combustibili' },
  { cod: '15', denumire: 'Piese de schimb' },
  { cod: '16', denumire: 'Alte mat. consumabile' },
  { cod: '17', denumire: 'Servicii vandute' },
  { cod: '18', denumire: 'Discount comercial intrari' },
  { cod: '19', denumire: 'Discount comercial iesiri' },
  { cod: '20', denumire: 'Servicii' },
  { cod: 'GR', denumire: 'Ambalaje SGR' },
  { cod: 'TV', denumire: 'Taxa verde' }
];

export const TIPURI_BY_COD = Object.fromEntries(
  TIPURI_ARTICOLE.map(t => [t.cod, t.denumire])
);

export function denTipFromCod(cod) {
  return TIPURI_BY_COD[cod] ?? 'Nedefinit';
}
