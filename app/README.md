# Receipts Review

Desktop app to review LLM-classified fiscal receipts and export them as a SAGA-compatible DBF.

## Stack

Electron + React + Vite + Tailwind + react-pdf (PDF.js).

## Setup

```sh
cd app
npm install
```

Requires Node 18+ (developed against Node 24).

## Run

```sh
npm run dev
```

Starts Vite on http://localhost:5173 and launches Electron pointed at it.

To package for distribution: `npm run build` (Vite build only — Electron packaging not yet wired).

## Workflow

1. Click **Open receipts JSON** and pick a `*.json` file produced by the LLM step.
2. The PDF in `pdf_path` (relative to the JSON's folder) loads side-by-side.
3. If a `furnizori.CSV` sits next to the JSON, it's auto-loaded as the supplier catalog.
4. Review each receipt in the list:
   - Edit any field (header, supplier, totals, lines). Edits commit on **blur** or **Enter**.
   - Pick a supplier from the searchable dropdown — auto-fills name/CIF and sets `match_method = manual`.
   - Add/remove line items.
   - Change status to **OK / needs_attention / deleted** (with reason for non-OK).
5. Click **Save** to write changes back to the JSON file.
6. Click **Export DBF** to:
   - Generate `IN_<today>_<batch_id>.DBF` from all OK receipts (this is the file you import into SAGA).
   - Generate `<batch_id>_skipped.json` with everything that didn't make it (audit trail).

## Layout

```
app/
  electron/
    main.js          Electron main process; IPC handlers (open/save JSON, read PDF, write DBF)
    preload.cjs      Bridge exposing window.api to the renderer
  src/
    App.jsx          Top-level state, layout, action handlers
    components/
      ReceiptList.jsx     Left sidebar; filters by status
      PdfViewer.jsx       PDF + bbox overlays (positioned in % so they scale)
      DetailsPanel.jsx    Right sidebar; editable fields, lines, audit trail
      EditableField.jsx   Generic input with onCommit-on-blur
      SupplierPicker.jsx  Searchable supplier dropdown
      StatusBar.jsx       OK / needs_attention / deleted buttons + reason
      StatusTabs.jsx      Top-of-list filter tabs with counts
      Splitter.jsx        Drag-to-resize divider between panels
    lib/
      edits.js       getAt/setAt/applyEdit + line add/remove (audit-tracked)
      csv.js         Minimal CSV parser
      dbf.js         Visual FoxPro DBF writer matching SAGA's "Intrari" schema
```

## DBF schema

24 fields, 486-byte records, 1064-byte header (Visual FoxPro 0x30). Schema and import behavior are documented in `../SAGA_observations.txt`.

Notes:
- Suppliers must already exist in SAGA (matched by `cod`). Receipts with no `matched_cod` are blocked at export.
- Articles can be free-text — `COD_ART` is left empty and `DEN_ART` carries the description. SAGA accepts this for `Bonuri fiscale`.
- Dates are `YYYYMMDD` strings.
- The DBF is named `IN_*.DBF` because SAGA's importer dispatches on filename prefix.

## JSON schema

See `../schema.md` for the full receipt JSON spec consumed by this app.

## Known limitations (v1)

- No batch packaging (`electron-builder` not configured) — runs from source via `npm run dev`.
- Bboxes are read-only (you can't draw or adjust them in the UI yet).
- Article matching against `articole.CSV` not surfaced in the picker (only suppliers are pickable).
- No undo beyond the audit trail; reverting requires manually editing the field back.
- No furnizori DBF export — new suppliers still need to be added in SAGA manually before import.
