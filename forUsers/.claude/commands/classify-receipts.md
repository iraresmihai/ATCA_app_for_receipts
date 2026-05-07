---
description: Classify a scanned PDF of fiscal receipts using the Romanian Tax Code into reviewable JSON
argument-hint: <pdf-path>
---

# Classify receipts

Process the scanned PDF at `$1` into a JSON file ready for the receipts-review app.

## Inputs you must locate

1. **The PDF**: `$1`. Read it as a vision input — Claude Code's Read tool handles PDFs page-by-page.
2. **`client.json`**: walk up from the PDF's folder until you find it. It contains:
   ```json
   { "name": "...", "cif": "RO..." }
   ```
   If you cannot find it, STOP and ask the user for the client name + CIF.
3. **`furnizori.CSV`**: same folder as `client.json`. Has columns including `cod`, `denumire`, `cod_fiscal`. Used to match suppliers.
4. **`articole.CSV`** (optional, articles which are existing in the articole.csv should have the code in the final json, but it's not a problem if some articles don't have a code at all): same folder. Has columns including `cod`, `denumire`, `um`, `tip`. Used to match articles.

## Output

Write `<pdf-basename>.json` next to the PDF (e.g. PDF `receipts.pdf` → `receipts.json`). The shape is defined in `schema.md` of this project — READ IT BEFORE PRODUCING OUTPUT!!!.

## Per-receipt extraction

For each fiscal receipt visible in the PDF (multiple per page is normal):

### Header
- `doc_type`: `B` for "Bon de casa" (most fiscal receipts), `F` if the buyer's CIF is printed on the receipt ("Bon de casa cu cod fiscal"), `" "` (space) for full Facturi.
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
- `um`, `cantitate`: as printed.
- `pret_unitar_net`, `valoare_net`: NET (without TVA). If the receipt only shows gross, divide by `(1 + tva_cota/100)`.
- `tva`, `tva_cota`: TVA value and cota (Romania 2026: usually `21`, sometimes `9` or `5`).
- `cont`: pick from the table below.
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

## Supplier matching (after extracting all receipts)

For each receipt's `supplier`:
1. Normalize the receipt CIF (uppercase, strip `RO` prefix and whitespace) and look it up in `furnizori.CSV` (column `cod_fiscal`, normalized the same way). If found → set `matched_cod` to that row's `cod`, `match_method` = `"cif"`.
2. Else, fuzzy-match `name_on_receipt` against `furnizori.CSV` `denumire` (case-insensitive, ignore "SRL"/"SA"/"S.R.L." suffixes, ignore extra whitespace). If a clear match → `matched_cod` = that row's `cod`, `match_method` = `"name_fuzzy"`.
3. Else → `matched_cod = null`, `match_method = "none"`, and set `status = "needs_attention"`, `status_reason = "supplier_not_found"`.

## Article matching (per line)

If `articole.CSV` exists, similar:
1. If `cod_art_on_receipt` exists and matches an `articole.CSV` `cod` → `matched_cod_art` = that cod, `match_method = "code"`.
2. Else fuzzy-match `den_art` → `match_method = "name_fuzzy"`.
3. Else → leave `matched_cod_art = ""`, `match_method = "none"` (the review app and SAGA both accept empty article codes).

## Status flagging

Default `status = "ok"`. Override to `needs_attention` with the reason if any of these apply:

| Reason | Trigger |
|---|---|
| `supplier_not_found` | No match in `furnizori.CSV` (see above). |
| `bon_nefiscal` | The document explicitly says "BON NEFISCAL" (loyalty extras, not a fiscal receipt). |
| `not_a_receipt` | Chitanta, AWB courier slip, blank instruction page, etc. |
| `wrong_client` | A "CLIENT:" CIF is printed on the receipt and does NOT match the `client.json` CIF. |
| `illegible` | Scan too poor to read totals or supplier reliably. |
| `duplicate` | Same `doc_number` + `date` + supplier already present in this batch. |

Never set `status = "deleted"` — that's a human action in the review app.

## Snapshots

After matching, populate:
- `snapshots.suppliers`: all the rows from `furnizori.CSV` that any receipt matched (one entry per unique `cod`). Include `cod`, `denumire`, `cif`.
- `snapshots.articles`: all article rows. Include `cod`, `denumire`, `um`, `tip`.

This freezes the catalog state for reproducible review.

## Top-level fields

```json
{
  "batch_id": "<derive from PDF basename, e.g. 'receipts-2026-04'>",
  "pdf_path": "<basename of the PDF>",
  "client": { "name": "...", "cif": "..." },   // from client.json
  "created_at": "<ISO8601 now>",
  "model": "claude-opus-4-7",
  "snapshots": { ... },
  "receipts": [ ... ]
}
```

## Final checks before writing

- Every `ok` receipt has `matched_cod` set, at least one line, and a `date`.
- Every line's `valoare_net + tva ≈ cantitate * gross_price` (within rounding).
- Sum of line `valoare_net` ≈ `totals.valoare_net`.
- Each receipt has a unique `id` (`r001`, `r002`, ...).
- Each line has a unique `id` (`<receipt_id>-l<n>`).
- Bboxes are in `[0, 1]`.

If a receipt fails a check, add a note in `receipt.notes` rather than silently fixing — the human reviews next.

Write the JSON, then print a short summary: total receipts, count per status, which suppliers/articles were unmatched.
