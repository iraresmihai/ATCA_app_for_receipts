# Rezumat conversatie - Clasificare bonuri fiscale

## Context
Parintii utilizatorului au o firma de contabilitate. Lunar, inregistreaza manual in **SAGA** bonurile fiscale primite de la clienti. Scopul: automatizarea extragerii datelor din PDF-uri si propunerea contului contabil corect.

## Obiectiv proof-of-concept
Testare daca un LLM poate clasifica corect bonurile fiscale ale unei firme **generice** (fara reguli speciale pe domeniu) plecand de la PDF-uri scanate.

## Date de extras (per linie de produs)
1. Numele furnizorului
2. Data bonului
3. Nr. document
4. Nume produs
5. Cod produs (daca exista)
6. Cantitate
7. Pret unitar (**net**, fara TVA)
8. Valoare (**net**)
9. TVA
10. Total document (valoare + TVA)
11. Cont contabil

Reguli convenite:
- Pretul unitar si valoarea = **fara TVA** (bonurile romanesti afiseaza preturile cu TVA inclus, deci se sparg)
- **Un cont contabil per linie**, nu per bon
- Output liber pentru testare (am ales CSV + Excel)

## Fisierul sursa
`receipts_sample.pdf` (initial "Adobe Scan 14 апр. 2026 г..pdf" - redenumit pt. ASCII).
20 pagini, mix de bonuri fiscale + facturi fiscale, multiple per pagina.

## Rezultate
- `receipts_classified.csv` - date brute, separator `;`
- `receipts_classified.xlsx` - varianta formatata (header colorat, filtre, freeze pane, numere ca numere)

~60 linii de produse, in principal pentru clientul **METRICAROM 23 INVEST CONSTRUCT SRL** (CIF RO47990281).

## Conturi propuse (firma generica)
- **6022** - carburanti (OMV, OCTANO)
- **604** - materiale nestocate (consumabile, scule, materiale constructii, EPP, piese)
- **6231** - protocol (flori - presupus cadouri)
- **628** - alte servicii terti (manopera imprimat sigla)
- **303** - obiecte de inventar (curatitor HD, peste pragul de uzura)

## Probleme/observatii pentru reluare
1. **Pag. 2 mijloc** - bon Lukoil este "BON NEFISCAL" (extras puncte loialitate), exclus
2. **Pag. 3** - chitante DPD curier nelizibile / nu sunt bonuri fiscale propriu-zise
3. **Pag. 6** - CURATITOR HD net 2657 lei, aproape de pragul 5000 lei pentru imobilizari corporale - de confirmat 303 vs 2131
4. **Pag. 7** - factura FLOWERS BY NOE 7567 lei: descrierile produselor sunt taiate de pe scan
5. **Pag. 12** - factura UNIX AUTO este pentru **METRI CARE CONSTRUCT** (CIF 38651871), nu METRICAROM - client diferit!
6. **Pag. 14** - pagina goala/ilizibila, de rescanat
7. Multe facturi INDEXTECH/CARBOTECH/STEFANA au descrierile produselor taiate la marginea stanga a scanului
8. **EPP** (echipamente protectie - manusi, jachete, bocanci) - propus 604, dar **6028** este mai specific
9. **Piese auto** (bujii, baterii, curele, ulei motor) - propus 604, dar **6024** (piese de schimb) este mai specific

## Pasi posibili in continuare
- Trecere de la "Claude Code citeste PDF" la script automat care apeleaza Claude API (Haiku 4.5 ~ $0.0005/bon)
- Imbogatire cu lookup ANAF (CAEN furnizor din CIF) pentru clasificare mai informata
- Few-shot training cu istoric clasificat de parinti pentru consistenta
- Export direct in formatul SAGA (cand stim ce import suporta versiunea lor)
- UI minimal de review (preview bon stanga, campuri editabile dreapta, accept/override 1 click)

## Note tehnice
- Subscriptia claude.ai (Pro/Max) **nu** acopera credite API console.anthropic.com - sunt produse separate
- Pentru testare directa in Claude Code (ca acum) nu sunt necesare credite API
