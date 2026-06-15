---
name: Receipts classifier project (testATCA)
description: POC pentru clasificare bonuri fiscale RO cu LLM, output catre SAGA - context pentru folder-ul testATCA
type: project
originSessionId: f5101169-d207-439b-9787-973a2f8334de
---
User's parents run an accounting firm in Romania. They manually enter clients' fiscal receipts (bonuri fiscale) into SAGA monthly. The testATCA project is a proof-of-concept that an LLM can extract receipt fields from PDFs and propose the correct **cont contabil** (Romanian chart of accounts).

**Why:** if the LLM classification works, parents save hours/month per client and we can build a real pipeline (Claude API + ANAF CUI lookup + SAGA-format export).

**How to apply:**
- Schema per linie produs: Furnizor, Data, Nr. document, Nume produs, Cod produs, Cantitate, Pret unitar (NET), Valoare (NET), TVA, Total, Cont contabil, Observatii
- Receipts in RO show GROSS unit prices - always split to net for SAGA
- One cont contabil per LINE, not per receipt
- Treat as generic company (no industry-specific rules) per parents' direction
- Main client in current sample: METRICAROM 23 INVEST CONSTRUCT SRL (RO47990281) - constructii
- Default conturi: 6022 carburanti, 604 nestocate, 6231 protocol, 628 servicii, 303 obiecte inventar
- Watch for: facturi mixed in with bonuri fiscale, "BON NEFISCAL" (loyalty printouts - skip), chitante (not fiscal receipts), receipts for OTHER clients accidentally in same scan
- Output files: `receipts_classified.csv` (semicolon-separated for RO Excel) and `receipts_classified.xlsx` (formatted)
- User's Claude Pro/Max subscription does NOT cover API credits - separate billing
