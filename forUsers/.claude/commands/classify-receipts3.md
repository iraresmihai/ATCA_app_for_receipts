---
description: Batch-classify scanned fiscal-receipt PDFs listed in .claude/allPdf.txt into reviewable JSON, one per client folder
---

# Classify receipts (batch mode)

Process every receipt PDF listed in `.claude/allPdf.txt` into a JSON file ready for the receipts-review app. One PDF per client folder. Each line in `allPdf.txt` is the path of one PDF to process.

## How this differs from `/classify-receipts2`

- This command operates on **multiple PDFs in one run**, not a single PDF passed as an argument.
- You do **not** receive paths via `$1`. Instead, read them from `.claude/allPdf.txt`.
- The PDFs live under `forUsers/<client-folder>/receipts.pdf`. Each `<client-folder>` is fully self-contained: it has its own `client.json`, `furnizori.CSV`, `articole.CSV`, and so on.

## TO-DOS BEFORE STARTING THE CLASSIFICATION, BUT AFTER READING THIS WHOLE INSTRUCTION SET

Thoroughly read the schema.md, as well as the code in the app folder. This should give you a clear idea about how the output should look like, as well as how it's going to be used.

## Step 0 — Load the list of PDFs

Read `.claude/allPdf.txt` from the project's `.claude` folder. Each non-empty line is a path to one `receipts.pdf` you must classify. Trim whitespace and skip blank lines. If the file does not exist or is empty, STOP and tell the user.

For each path, the **client folder** is the directory containing that PDF (typically `forUsers/<client-folder>/`). Treat every PDF independently — process them one at a time, top to bottom.

## ⚠️ Strict isolation between clients — read this carefully

**You MUST treat each client folder as a hermetic sandbox.** When classifying `forUsers/clientA/receipts.pdf`, every piece of context you use — `client.json`, `furnizori.CSV`, `articole.CSV`, `tipuriArticole.CSV`, prior receipts — comes **only** from `forUsers/clientA/`.

It is a serious error to:

- Match a supplier on client A's receipt against an entry from client B's `furnizori.CSV`.
- Reuse a `matched_cod_art` value from client B's `articole.CSV` for an article on client A's receipt.
- Copy any client-identifying field (CIF, name) between clients.
- Carry over receipt ids, batch ids, or supplier codes from a previously processed PDF in this run.

Each PDF gets a fresh extraction. Before starting client N+1, mentally (and procedurally) clear all CSV / client.json data from client N. The only thing that persists across PDFs in this run is the high-level instruction set in this file.

If two folders happen to share a supplier (same `cod_fiscal`), each folder is still matched against **its own** `furnizori.CSV` — the codes may legitimately differ between clients, and using client B's code for client A would corrupt client A's accounting export.

## Per-PDF inputs you must locate

For the PDF currently being processed:

1. **The PDF**: read it as a vision input — Claude Code's Read tool handles PDFs page-by-page.
2. **`client.json`**: walk up from the PDF's folder until you find it, but **stop at the first `client.json` you encounter and never reach outside that client's subtree**. It contains:
   ```json
   { "name": "...", "cif": "RO..." }
   ```
   If you cannot find it inside that client's folder, STOP processing this PDF and report it in the run summary as `client_json_missing`. Do **not** substitute another client's `client.json`.
3. **`furnizori.CSV`**: same folder as that `client.json`. Columns include `cod`, `denumire`, `cod_fiscal`. Used to match suppliers — but only for receipts in this same client folder.
4. **`articole.CSV`** (optional, articles existing in `articole.csv` should have their code in the final JSON, but it's fine if some articles don't have a code): same folder. Columns include `cod`, `denumire`, `um`, `tip`. Used to match articles for this client only.
5. **`tipuriArticole.CSV`**: same folder. Contains the types an article can have (`cod`, `denumire`). **You MUST NOT choose a type.** Picking the article's `tip` is a human-only decision made later in the review app — leave `lines[i].tip` as `""` on every line. The app and DBF emitter treat empty as `"Nedefinit"`. This rule applies even when the type seems obvious (e.g. fuel, piese auto): still leave it blank.

## Output

For each PDF, write `<pdf-basename>.json` next to that PDF (e.g. `forUsers/clientA/receipts.pdf` → `forUsers/clientA/receipts.json`). Never write a client's JSON into another client's folder. The shape is defined in `schema.md` of this project — **READ IT BEFORE PRODUCING ANY OUTPUT.**

## Per-receipt extraction

For each fiscal receipt visible in the PDF (multiple per page is normal):

### Header
- `doc_type`: `B` for "Bon de casa" (most fiscal receipts), `C` if the buyer's CIF is printed on the receipt ("Bon de casa cu cod fiscal"), `" "` (space) for full Facturi.
- `doc_number`: the receipt/invoice number printed on the document.
- `date`: in `YYYY-MM-DD`.

### Supplier
- `name_on_receipt` and `cif_on_receipt`: extract verbatim what's printed.
- Leave `matched_cod` and `match_method` for the matching step (below).

### Totals
- `valoare_net`, `tva`, `total` — in lei. Romanian receipts print **gross** unit prices and a separate TVA line; net = total - tva.

### Lines (one per product line on the receipt)
- `den_art`: as printed on the receipt.
- `cod_art_on_receipt`: the SKU/cod if printed (often empty on bonuri fiscale).
- `um`: **must be one of the SAGA-accepted UM codes below — never invent a new one.** If the receipt prints something different (`COL`, `BAX`, `ML` for "metri liniari", lowercase variants, etc.), map it to the closest valid code and add a short justification in `notes`.

  | Code | Meaning | Code | Meaning |
  |---|---|---|---|
  | `BUC` | Bucata | `KG` | Kilogram |
  | `LITRI` | Litru | `M` | Metru |
  | `GRAME` | Gram | `CUTII` | Cutie |
  | `PAC` | Pachet | `PUNGI` | Punga |
  | `SET` | Set | `MP` | Metru patrat |
  | `MC` | Metru cub | `MM` | Milimetru |
  | `CM` | Centimetru | `KM` | Kilometru |
  | `TONE` | Tona | `PER` | Pereche |
  | `SACI` | Sac | `ML` | **Mililitru** (NOT metru liniar — use `M`) |
  | `KWH` | Kilowatt ora | `ORE` | Ora |
  | `MIN` | Minut | `ZILE` | Zi de lucru |
  | `LUNI` | Luni de lucru | `DOZE` | Doza |
  | `SERV` | Unitate de service | `1000B` | O mie de bucati |
  | `TRIM` | Trimestru | `PROC` | Procent |
  | `LADA` | Lada | `DT` | Dry tone |
  | `CMP` | Centimetru patrat | `MWH` | Megawatt ora |
  | `ROLA` | Rola | `TAMB` | Tambur |
  | `SAC` | Sac plastic | `PALET` | Palet lemn |
  | `UNIT` | Unitate | `TN` | Tona neta |
  | `HA` | Hectometru patrat | `FOAIE` | Foaie / coala |
  | `L` | Litru (varianta scurta — folosit pe bonurile de combustibil) | | |

  Common mappings: fuel `L`/`LITRI` → `L`; printed `COL`/coli → `FOAIE`; printed `ML` for metri liniari → `M`; `PER` (pereche) for incaltaminte/manusi.

- `cantitate`: as printed.
- `pret_unitar_net`, `valoare_net`: NET (without TVA). If the receipt only shows gross, divide by `(1 + tva_cota/100)`.
- `tva`, `tva_cota`: TVA value and cota (Romania 2026: usually `21`, sometimes `9` or `5`).
- `cont`: pick from the table below.
- `tip`: always `""`. **Do not infer or copy from `articole.CSV`.** The human reviewer assigns the type in the app — see input #5.
- `notes`: anything ambiguous; `""` otherwise.

### Bounding boxes
Use page-relative fractions `{x, y, w, h}` in `[0, 1]`. Origin = top-left. Provide:
- `bbox` for the whole receipt (always)
- `supplier.bbox` (when supplier name region is identifiable)
- `totals.bbox` (when total/TVA region is identifiable)

Skip per-line bboxes — leave `lines[i].bbox` as `null`.

## Cont contabil reference

**This table lists only the most common cases — it is NOT exhaustive.** Use the full Romanian Plan de Conturi General (PCG) when something doesn't fit. If a line clearly belongs to a different cont (e.g. `605` electricitate, `626` posta/telecomunicatii, `622` comisioane, `612` chirii, etc.), use that — do NOT force-fit into one of the rows below.

| Cont | When to use | Examples |
|---|---|---|
| **6022** | Carburanti | motorina, benzina, GPL, OMV/OCTANO/Lukoil fuel |
| **6024** | Piese de schimb auto | bujii, baterii, curele, ulei motor, filtre |
| **6028** | Alte materiale consumabile (echipament protectie) | manusi, jachete, bocanci, casti |
| **604** | Materiale nestocate generice | consumabile, scule mici, materiale constructii |
| **303** | Obiecte de inventar (uz repetat, sub 5000 lei) | scule durabile, stampila, registre, aspirator |
| **2131** | Imobilizari corporale (echipamente ≥ 5000 lei) | utilaje, echipamente mari |
| **6231** | Protocol | cadouri, flori, mese de afaceri |
| **624** | Transport / curierat | DPD, Fan Courier, transport marfa |
| **628** | Alte servicii terti | manopera, imprimare, reparatii ca serviciu |
| **611** | Intretinere si reparatii | reparatii utilaje, intretinere echipamente |

When a single line could fit two conturi (e.g. ulei motor → 604 vs 6024), pick the more specific one and add a note in `notes`. When you choose a cont that is **not** in the table above, always add a short justification in `notes` so the reviewer can confirm.

## Supplier matching (after extracting all receipts of the current PDF)

For each receipt's `supplier`, match **only against the current client's `furnizori.CSV`**:
1. Normalize the receipt CIF (uppercase, strip `RO` prefix and whitespace) and look it up in `furnizori.CSV` (column `cod_fiscal`, normalized the same way). If found → set `matched_cod` to that row's `cod`, `match_method` = `"cif"`.
2. Else, fuzzy-match `name_on_receipt` against `furnizori.CSV` `denumire` (case-insensitive, ignore "SRL"/"SA"/"S.R.L." suffixes, ignore extra whitespace). If a clear match → `matched_cod` = that row's `cod`, `match_method` = `"name_fuzzy"`.
3. Else → `matched_cod = null`, `match_method = "none"`, and set `status = "needs_attention"`, `status_reason = "supplier_not_found"`.

**Never** match against another client's `furnizori.CSV`, even if the CIF would have matched there. A supplier that exists in client B but not client A is, for client A's purposes, an unknown supplier.

## Article matching (per line)

If `articole.CSV` exists for the **current** client, similar:
1. If `cod_art_on_receipt` exists and matches an `articole.CSV` `cod` → `matched_cod_art` = that cod, `match_method = "code"`.
2. Else fuzzy-match `den_art` → `match_method = "name_fuzzy"`.
3. Else → leave `matched_cod_art = ""`, `match_method = "none"` (the review app and SAGA both accept empty article codes).

Same isolation rule: never reach into another client's `articole.CSV`.

## Status flagging

Default `status = "ok"`. Override to `needs_attention` with the reason if any of these apply:

| Reason | Trigger |
|---|---|
| `supplier_not_found` | No match in this client's `furnizori.CSV` (see above). |
| `bon_nefiscal` | The document explicitly says "BON NEFISCAL" (loyalty extras, not a fiscal receipt). |
| `not_a_receipt` | Chitanta, AWB courier slip, blank instruction page, etc. |
| `wrong_client` | A "CLIENT:" CIF is printed on the receipt and does NOT match the **current** `client.json` CIF. |
| `illegible` | Scan too poor to read totals or supplier reliably. |
| `duplicate` | Same `doc_number` + `date` + supplier already present in **this** batch (this PDF only — duplicates across clients are not duplicates). |

Never set `status = "deleted"` — that's a human action in the review app.

## Top-level fields

```json
{
  "batch_id": "<derive from PDF basename, e.g. 'receipts-2026-04'>",
  "pdf_path": "<basename of the PDF>",
  "client": { "name": "...", "cif": "..." },   // from THIS client's client.json
  "created_at": "<ISO8601 now>",
  "model": "claude-opus-4-7",
  "receipts": [ ... ]
}
```

## Final checks before writing each JSON

- Every `ok` receipt has `matched_cod` set, at least one line, and a `date`.
- Every line's `valoare_net + tva ≈ cantitate * gross_price` (within rounding).
- Sum of line `valoare_net` ≈ `totals.valoare_net`.
- Each receipt has a unique `id` (`r001`, `r002`, ...) **within this PDF only** — do not continue numbering across PDFs.
- Each line has a unique `id` (`<receipt_id>-l<n>`).
- Bboxes are in `[0, 1]`.
- The `client.cif` you wrote matches the `client.json` from **this** client's folder.

If a receipt fails a check, add a note in `receipt.notes` rather than silently fixing — the human reviews next.

## Run summary

After processing every PDF in `allPdf.txt`, print a single summary covering the whole run:

- One line per PDF: path, total receipts, count per status, list of unmatched suppliers/articles.
- A separate section listing any PDFs that were skipped (e.g. `client_json_missing`, file unreadable) and why.
- A final sanity line confirming that each JSON's `client.cif` matches the `client.json` from its own folder (i.e. no cross-contamination).