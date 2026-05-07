"""
Generate a test SAGA Intrari DBF using suppliers/articles from the existing nomenclator CSVs.
Schema is copied byte-for-byte from the exported reference DBF (Visual FoxPro format).
"""
import csv
import struct
from datetime import date
from pathlib import Path

FOLDER = Path(r"C:\Users\Rares\Desktop\testATCA")
REF_DBF = FOLDER / "IN_01-04-2017_01-01-2026_36857.DBF"
OUT_DBF = FOLDER / "test.DBF"

HEADER_LEN = 1064
RECORD_LEN = 486

FIELDS = [
    ("NR_NIR", "C", 16), ("NR_INTRARE", "C", 16), ("GESTIUNE", "C", 4),
    ("DEN_GEST", "C", 24), ("COD", "C", 8), ("DATA", "D", 8),
    ("SCADENT", "D", 8), ("TIP", "C", 1), ("TVAI", "I", 4),
    ("COD_ART", "C", 16), ("DEN_TIP", "C", 36), ("TIP_O", "C", 3),
    ("DEN_ART", "C", 60), ("TVA_ART", "I", 4), ("UM", "C", 5),
    ("CANTITATE", "N", 20), ("VALOARE", "N", 20), ("TVA", "N", 20),
    ("CONT", "C", 20), ("PRET_VANZ", "N", 20), ("GRUPA", "C", 16),
    ("TIP_DED", "C", 3), ("TEXT_SUPL", "C", 150), ("_NullFlags", "0", 3),
]

def load_csv(name):
    with open(FOLDER / name, encoding="cp1250") as f:
        return list(csv.DictReader(f))

furnizori = load_csv("furnizori.CSV")
articole = load_csv("articole.CSV")
tipuri = {t["cod"]: t for t in load_csv("tipuriArticole.CSV")}

# Pick a handful of real suppliers by code
sup = {f["cod"]: f for f in furnizori}

# Pick real articles - just take a few with known types
arts = articole[:50]
art_by_cod = {a["cod"]: a for a in arts}

def art_for_type(tip_cod):
    return next((a for a in arts if a.get("tip") == tip_cod), None)

# Build test documents - each = list of lines
# Using REAL supplier codes from furnizori.CSV and REAL article codes from articole.CSV
docs = []

# Doc 1: Bon de casa from DEDEMAN (cod 00002) - 2 articles
docs.append({
    "nr_nir": 9001, "nr_intrare": "TEST001", "cod": "00002",
    "data": date(2026, 5, 1), "tip": "B",
    "lines": [
        {"art": art_by_cod["00000001"], "cant": 1.0, "valoare": 70.00, "tva": 14.70, "cont": "303"},
        {"art": art_by_cod["00000002"], "cant": 2.0, "valoare": 175.40, "tva": 36.83, "cont": "303"},
    ],
})

# Doc 2: Bon de casa cu cod fiscal from LEROY MERLIN (cod 00005) - 1 article
docs.append({
    "nr_nir": 9002, "nr_intrare": "TEST002", "cod": "00005",
    "data": date(2026, 5, 3), "tip": "F",
    "lines": [
        {"art": art_by_cod["00000005"], "cant": 1.0, "valoare": 450.00, "tva": 94.50, "cont": "303"},
    ],
})

# Doc 3: Factura from HORNBACH (cod 00009) - 3 articles
docs.append({
    "nr_nir": 9003, "nr_intrare": "TEST003", "cod": "00009",
    "data": date(2026, 5, 5), "tip": " ",  # space = factura
    "lines": [
        {"art": art_by_cod["00000003"], "cant": 1.0, "valoare": 95.00, "tva": 19.95, "cont": "303"},
        {"art": art_by_cod["00000007"], "cant": 1.0, "valoare": 120.00, "tva": 25.20, "cont": "303"},
        {"art": art_by_cod["00000009"], "cant": 1.0, "valoare": 850.00, "tva": 178.50, "cont": "303"},
    ],
})

def pad_c(s, n):
    s = (s or "")[:n]
    return s.ljust(n).encode("ascii", errors="replace")

def pad_n(v, n, dec):
    # Right-aligned, fixed decimals
    s = f"{v:.{dec}f}"
    return s.rjust(n).encode("ascii")

def pad_d(d):
    return d.strftime("%Y%m%d").encode("ascii")

def pack_int(v):
    return struct.pack("<i", v)

def make_record(doc, line):
    art = line["art"]
    tip_cod = art["tip"]
    tip_info = tipuri.get(tip_cod, {})
    den_tip = tip_info.get("denumire", "Nedefinit")
    gestiune = tip_cod
    den_gest = den_tip

    parts = bytearray()
    parts += b" "  # deletion flag
    parts += pad_c(str(doc["nr_nir"]), 16)
    parts += pad_c(doc["nr_intrare"], 16)
    parts += pad_c(gestiune, 4)
    parts += pad_c(den_gest, 24)
    parts += pad_c(doc["cod"], 8)
    parts += pad_d(doc["data"])
    parts += pad_d(doc["data"])  # scadent = data
    parts += pad_c(doc["tip"], 1)
    parts += pack_int(0)  # TVAI
    parts += pad_c(art["cod"], 16)
    parts += pad_c(den_tip, 36)
    parts += pad_c("", 3)  # TIP_O
    parts += pad_c(art["denumire"], 60)
    parts += pack_int(0)  # TVA_ART
    parts += pad_c(art["um"], 5)
    parts += pad_n(line["cant"], 20, 3)
    parts += pad_n(line["valoare"], 20, 2)
    parts += pad_n(line["tva"], 20, 2)
    parts += pad_c(line["cont"], 20)
    parts += pad_n(0.0, 20, 4)  # PRET_VANZ
    parts += pad_c("", 16)  # GRUPA
    parts += pad_c("", 3)   # TIP_DED
    parts += pad_c("", 150) # TEXT_SUPL
    parts += b"\x00\x00\x00"  # _NullFlags
    assert len(parts) == RECORD_LEN, f"record len {len(parts)} != {RECORD_LEN}"
    return bytes(parts)

records = []
for doc in docs:
    for line in doc["lines"]:
        records.append(make_record(doc, line))

# Read original header bytes
ref_bytes = REF_DBF.read_bytes()
header = bytearray(ref_bytes[:HEADER_LEN])

# Patch num records (bytes 4-7)
struct.pack_into("<i", header, 4, len(records))
# Patch last update date (bytes 1-3: YY MM DD)
today = date.today()
header[1] = today.year - 2000
header[2] = today.month
header[3] = today.day

with open(OUT_DBF, "wb") as f:
    f.write(header)
    for r in records:
        f.write(r)
    f.write(b"\x1A")  # EOF marker

print(f"Wrote {OUT_DBF} with {len(records)} records ({len(docs)} documents)")
for d in docs:
    print(f"  {d['nr_intrare']} (TIP={d['tip']!r}) supplier {d['cod']}: {len(d['lines'])} lines")
