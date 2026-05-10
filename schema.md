# Receipts JSON Schema

One JSON file per scanned PDF. Produced by Claude (vision step), consumed and edited by the review app, finally converted to `IN_*.DBF` for SAGA import.

## Top-level structure

```json
{
  "batch_id": "2026-05-scan-01",
  "pdf_path": "receipts_sample.pdf",
  "client": {
    "name": "METRICAROM 23 INVEST CONSTRUCT SRL",
    "cif": "RO47990281"
  },
  "created_at": "2026-05-07T11:30:00Z",
  "model": "claude-opus-4-7",

  "receipts": [ /* one entry per receipt found in the PDF */ ],
  "annotations": [ /* human-placed marks on the PDF — see below */ ]
}
```

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `batch_id` | string | Unique id for this scan batch (e.g. `2026-05-scan-01`). |
| `pdf_path` | string | Path of the source PDF, relative to the JSON file. |
| `client` | object | The client this batch belongs to (name + CIF). Used to detect receipts that were scanned in by mistake for the wrong client. |
| `created_at` | ISO 8601 | When Claude produced this JSON. |
| `model` | string | Which Claude model produced it (audit trail). |
| `receipts` | array | One entry per receipt found on the PDF. |
| `annotations` | array | Optional. Green-check / red-cross marks the human reviewer placed on PDF pages. Auto-saved on every change. Empty/absent on Claude's first output; the review app initializes it on open. |

The review app reads `furnizori.CSV` (and `articole.CSV`) live from the client folder when the batch is opened — there is no frozen snapshot in the JSON. Since those CSVs are append-only, the live copy is always at least as complete as any snapshot would be.

## `receipts[]`

```json
{
  "id": "r001",
  "page": 1,
  "bbox": { "x": 0.05, "y": 0.02, "w": 0.9, "h": 0.28 },

  "status": "ok",
  "status_reason": null,

  "doc_type": "B",
  "doc_number": "4001010710",
  "date": "2026-03-01",

  "supplier": {
    "name_on_receipt": "OCTANO DOWNSTREAM SRL",
    "cif_on_receipt": "RO38075752",
    "matched_cod": "00042",
    "match_method": "cif",
    "bbox": { "x": 0.06, "y": 0.03, "w": 0.5, "h": 0.04 }
  },

  "totals": {
    "valoare_net": 83.61,
    "tva": 17.56,
    "total": 101.17,
    "bbox": { "x": 0.55, "y": 0.22, "w": 0.4, "h": 0.05 }
  },

  "lines": [ /* see line schema below */ ],
  "edits": [],
  "notes": ""
}
```

### Receipt fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique within the batch (`r001`, `r002`, ...). |
| `page` | int | 1-based page number in the source PDF. |
| `bbox` | bbox or null | Receipt-level bounding box used by the app to scroll/highlight. |
| `status` | enum | `ok` \| `needs_attention` \| `deleted`. Only `ok` receipts go into the DBF. |
| `status_reason` | enum or null | Required when `status != "ok"`. See enum below. |
| `doc_type` | char | SAGA `TIP` value: `B` (bon de casa), `C` (bon de casa cu cod fiscal), `" "` (factura), etc. |
| `doc_number` | string or null | Document number printed on the receipt (`NR_INTRARE` in DBF). |
| `date` | YYYY-MM-DD | Document date. |
| `supplier` | object | See below. |
| `totals` | object | Document totals. May be partially null when illegible. |
| `lines` | array | Line items; can be empty for `needs_attention` / `deleted` receipts. |
| `edits` | array | Audit trail of human edits (see below). |
| `notes` | string | Free text from Claude or the user. |

### `status_reason` enum

| Value | Meaning |
|---|---|
| `supplier_not_found` | No supplier in the snapshot matches; needs to be added in SAGA first. |
| `illegible` | Scan quality too poor to read reliably. |
| `not_a_receipt` | Page contains a chitanta, AWB, loyalty extras, etc. |
| `wrong_client` | Receipt is for a different client (CIF mismatch). |
| `bon_nefiscal` | Marked "BON NEFISCAL" — not a fiscal document. |
| `user_deleted` | Human chose to delete in the app. |
| `duplicate` | Same doc_number + date + supplier already present. |

### `supplier` object

| Field | Description |
|---|---|
| `name_on_receipt` | Raw name as Claude read it from the PDF. Kept even after matching. |
| `cif_on_receipt` | Raw CIF as Claude read it (may be null). |
| `matched_cod` | Internal SAGA `cod` (string, **always 5 digits, zero-padded**, e.g. `"00042"`, `"00002"`) if matched, else null. |
| `match_method` | `cif` \| `name_exact` \| `name_fuzzy` \| `none`. |
| `bbox` | Where on the page the supplier name was found (or null). |

### `totals` object

All amounts in lei. Any field can be null if illegible.

| Field | Description |
|---|---|
| `valoare_net` | Net total (without TVA). |
| `tva` | TVA total. |
| `total` | Gross total (= `valoare_net + tva`). |
| `bbox` | Where on the page the totals block was found. |

### `edits` audit trail

Every change made in the review app appends an entry. Lets us see what humans corrected vs what Claude produced — useful signal for improving the extraction prompt later.

```json
{ "field": "lines[0].cont", "old": "604", "new": "6024", "at": "2026-05-07T12:01:00Z" }
```

`field` uses dot/index path notation rooted at the receipt object.

## Line items (`receipts[].lines[]`)

```json
{
  "id": "r001-l1",
  "den_art": "MOTORINA EURO 5 - POMPA 3",
  "cod_art_on_receipt": "",
  "matched_cod_art": "",
  "match_method": "none",
  "um": "L",
  "cantitate": 12.1599,
  "pret_unitar_net": 6.88,
  "valoare_net": 83.61,
  "tva": 17.56,
  "tva_cota": 21,
  "cont": "6022",
  "bbox": { "x": 0.06, "y": 0.10, "w": 0.88, "h": 0.04 },
  "notes": ""
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | `<receipt_id>-l<n>`. |
| `den_art` | string | Article name (will be DEN_ART in DBF). |
| `cod_art_on_receipt` | string | Code printed on the receipt (often empty). |
| `matched_cod_art` | string | Internal `cod` from `articole.CSV` if we found a match, else empty. |
| `match_method` | enum | `code` \| `name_exact` \| `name_fuzzy` \| `none`. |
| `um` | string | Unit of measure (`BUC`, `L`, `KG`, ...). |
| `cantitate` | number | Quantity. |
| `pret_unitar_net` | number | Unit price net (without TVA). Romanian receipts print gross — Claude must split. |
| `valoare_net` | number | Line value net. |
| `tva` | number | TVA value for the line. |
| `tva_cota` | number | TVA percentage (`21`, `9`, `5`, `0`). Stored as percent; written into SAGA's `TVA_ART` field at DBF emit time (`TVAI` is hardcoded to `0`, matching real SAGA exports). |
| `cont` | string | Cont contabil for this line (`6022`, `604`, `303`, ...). One per line, not per receipt. |
| `bbox` | bbox or null | Where on the page this specific line is. |
| `notes` | string | Free text. |

## `annotations[]`

Free-form marks placed by the human reviewer on PDF pages — typically a green check `✓` to confirm a receipt was reviewed and a red cross `✗` to flag something to revisit. Multiple marks per page are normal (one page can hold several receipts).

```json
{
  "id": "a001",
  "page": 1,
  "kind": "check",
  "x": 0.62,
  "y": 0.18
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique within the batch (`a001`, `a002`, ...). |
| `page` | int | 1-based page number. |
| `kind` | enum | `check` (green ✓) or `cross` (red ✗). |
| `x`, `y` | number | Page-relative fractions in `[0, 1]`, top-left origin. Stored in the **original** (unrotated) page coordinate system, like bboxes. |

The review app saves the JSON immediately whenever a mark is added or removed (no manual save needed). Annotations are never derived from receipt content; they are purely a human signal. They are not emitted to the DBF and have no effect on `status`. An "Export marked PDF" action in the app can bake them into a copy of the source PDF using `pdf-lib`.

## Bounding boxes

All bboxes use page-relative fractions in `[0, 1]`:

```json
{ "x": 0.05, "y": 0.10, "w": 0.90, "h": 0.05 }
```

- `x`, `y` = top-left corner (origin top-left of the page).
- `w`, `h` = width / height as fractions of page width / height.
- Resolution- and DPI-independent. Works whether the PDF is rendered at 72 dpi or 300 dpi.
- May be null when not detected or when the receipt is fully illegible.

## `client.json` (per-client config)

A small file saved once per client, next to their `furnizori.CSV` / `articole.CSV`. Provides the client identity to the receipt-classification prompt so it can stamp the output JSON's `client` field and detect cross-contaminated receipts (a receipt printed for a *different* CIF that ended up in the same scan).

```json
{
  "name": "METRICAROM 23 INVEST CONSTRUCT SRL",
  "cif": "RO47990281"
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Legal name as it would appear printed on a receipt's "CLIENT:" line. Used for display only. |
| `cif` | string | Fiscal code with the `RO` prefix (when applicable). Used for matching against the CIF printed on receipts. |

Suggested folder layout:

```
clients/
  <client-slug>/
    client.json
    furnizori.CSV
    articole.CSV
    <batch-folder>/
      receipts.pdf                              ← the monthly scan
      receipts.json                             ← produced by the prompt; consumed by the review app
      missingSuppliers_receipts.csv             ← created by the review app on open (see below)
```

The classification prompt walks up from the PDF's folder looking for `client.json`.

## `missingSuppliers_<jsonbase>.csv` (per-batch sidecar)

A small CSV the review app keeps next to the receipts JSON. Filename pattern: `missingSuppliers_<basename-of-json>.csv`. Created on open if it doesn't exist yet (header-only).

```csv
cif,denumire
RO12345678,SOME NEW SUPPLIER SRL
RO87654321,
```

| Column | Description |
|---|---|
| `cif` | The supplier's fiscal code as the user typed it (kept verbatim). Required. |
| `denumire` | Optional human-readable name, just for the user's convenience. |

Behavior:

- The file is **only** appended to when the user explicitly clicks "+ Create new supplier" in the picker. It is never auto-populated from receipts. So every row is a deliberate human action.
- The review app loads these into the supplier picker alongside `furnizori.CSV` entries (with a small `new` badge). Their `matched_cod` on a receipt is the CIF itself — that's the only stable identifier we have until SAGA assigns a real one.
- Duplicates are blocked at create time: if the CIF already exists in `furnizori.CSV` or this CSV, the existing entry is reused instead.

When the user clicks "Export data", these custom suppliers are written into the export folder as a SAGA-style XLS (see DBF emission rules below).

## "Export data" output

When the user clicks "Export data" in the review app:

1. The user picks a parent folder.
2. The app creates a subfolder named after the source PDF (basename without `.pdf`) and writes everything inside it. Parent directories are created on demand.

Folder contents:

```
<parent>/
  <pdf-basename>/
    IN_<dd-mm-yyyy>_<dd-mm-yyyy>_<5digits>.DBF   ← SAGA Intrari import
    <batch_id>_skipped.json                       ← receipts that didn't make it
    xls-<5digits>-<5digits>.xls                   ← only when there are custom suppliers
```

### `IN_*.DBF` (Visual FoxPro)

- Only receipts with `status == "ok"` are emitted.
- One DBF row per `lines[]` entry. Header fields (`NR_INTRARE`, `COD`, `DATA`, `TIP`) are repeated on every line of the same receipt.
- `COD` (supplier) ← `supplier.matched_cod`, zero-padded to 5 digits if numeric (`1` → `00001`). If null → receipt should never have been `ok`; emit step rejects it. Note: custom suppliers (created from the picker) carry their CIF as `matched_cod`; SAGA's `COD` field is 8 chars, so 10-digit CIFs may get truncated — typically the user imports the missing-suppliers XLS into SAGA first to obtain real codes before re-exporting the DBF.
- `COD_ART` ← `lines[i].matched_cod_art` (may be empty string — SAGA accepts that, see SAGA_observations.txt).
- `DEN_ART`, `UM`, `CANTITATE`, `VALOARE`, `TVA`, `CONT` ← directly from line.
- `DATA`, `SCADENT` ← `date`, formatted as `YYYYMMDD`.
- `TIP` ← `doc_type`.

### `<batch_id>_skipped.json`

Receipts in `needs_attention` / `deleted` (and any `ok` receipts blocked at export, e.g. missing `matched_cod` / `lines` / `date`) are written here so the user can see what didn't make it into SAGA.

### `xls-<5digits>-<5digits>.xls` (custom suppliers, BIFF8)

Only written when at least one row exists in `missingSuppliers_<jsonbase>.csv`. Single sheet `furnizori` with the same column order as `furnizori.CSV` (`cod, denumire, cod_fiscal, analitic, tara, judet, localitate, adresa, cont_banca, banca, tel, email, grupa, reg_com, den_agent`). Only `denumire` and `cod_fiscal` are filled from the user's entries; every other column is blank for the user to complete in SAGA. The filename pattern (`xls-<random>-<random>.xls`) matches what SAGA expects for supplier imports.
