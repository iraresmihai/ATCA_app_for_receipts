"""
test2.DBF: same schema, but references suppliers and articles that DO NOT exist
in furnizori.CSV / articole.CSV. Goal: see how SAGA handles unknown codes
(auto-create? reject? prompt?).
"""
import struct
from datetime import date
from pathlib import Path

FOLDER = Path(r"C:\Users\Rares\Desktop\testATCA")
REF_DBF = FOLDER / "IN_01-04-2017_01-01-2026_36857.DBF"
OUT_DBF = FOLDER / "test2.DBF"

HEADER_LEN = 1064
RECORD_LEN = 486

# Fake suppliers (codes 99xxx don't exist in furnizori.CSV)
# Fake articles (codes 99999xxx don't exist in articole.CSV)
docs = [
    {
        "nr_nir": 9101, "nr_intrare": "TEST201", "cod": "99001",
        "data": date(2026, 5, 4), "tip": "B",
        "lines": [
            {"cod_art": "99999901", "den_art": "PRODUS FICTIV ALFA", "um": "BUC",
             "den_tip": "Nedefinit", "gestiune": "", "den_gest": "",
             "cant": 1.0, "valoare": 100.00, "tva": 21.00, "cont": "604"},
            {"cod_art": "99999902", "den_art": "PRODUS FICTIV BETA", "um": "KG",
             "den_tip": "Nedefinit", "gestiune": "", "den_gest": "",
             "cant": 2.5, "valoare": 50.00, "tva": 10.50, "cont": "604"},
        ],
    },
    {
        "nr_nir": 9102, "nr_intrare": "TEST202", "cod": "99002",
        "data": date(2026, 5, 5), "tip": "F",
        "lines": [
            {"cod_art": "99999903", "den_art": "SERVICIU FICTIV X", "um": "buc",
             "den_tip": "Nedefinit", "gestiune": "", "den_gest": "",
             "cant": 1.0, "valoare": 250.00, "tva": 52.50, "cont": "628"},
        ],
    },
    {
        "nr_nir": 9103, "nr_intrare": "TEST203", "cod": "99003",
        "data": date(2026, 5, 6), "tip": " ",  # factura
        "lines": [
            {"cod_art": "99999904", "den_art": "MARFA INVENTATA GAMMA", "um": "L",
             "den_tip": "Obiecte de inventar", "gestiune": "06", "den_gest": "Obiecte de inventar",
             "cant": 10.0, "valoare": 500.00, "tva": 105.00, "cont": "303"},
        ],
    },
]

def pad_c(s, n):
    return (s or "")[:n].ljust(n).encode("ascii", errors="replace")

def pad_n(v, n, dec):
    return f"{v:.{dec}f}".rjust(n).encode("ascii")

def pad_d(d):
    return d.strftime("%Y%m%d").encode("ascii")

def pack_int(v):
    return struct.pack("<i", v)

def make_record(doc, line):
    parts = bytearray()
    parts += b" "
    parts += pad_c(str(doc["nr_nir"]), 16)
    parts += pad_c(doc["nr_intrare"], 16)
    parts += pad_c(line["gestiune"], 4)
    parts += pad_c(line["den_gest"], 24)
    parts += pad_c(doc["cod"], 8)
    parts += pad_d(doc["data"])
    parts += pad_d(doc["data"])
    parts += pad_c(doc["tip"], 1)
    parts += pack_int(0)
    parts += pad_c(line["cod_art"], 16)
    parts += pad_c(line["den_tip"], 36)
    parts += pad_c("", 3)
    parts += pad_c(line["den_art"], 60)
    parts += pack_int(0)
    parts += pad_c(line["um"], 5)
    parts += pad_n(line["cant"], 20, 3)
    parts += pad_n(line["valoare"], 20, 2)
    parts += pad_n(line["tva"], 20, 2)
    parts += pad_c(line["cont"], 20)
    parts += pad_n(0.0, 20, 4)
    parts += pad_c("", 16)
    parts += pad_c("", 3)
    parts += pad_c("", 150)
    parts += b"\x00\x00\x00"
    assert len(parts) == RECORD_LEN
    return bytes(parts)

records = [make_record(d, l) for d in docs for l in d["lines"]]

header = bytearray(REF_DBF.read_bytes()[:HEADER_LEN])
struct.pack_into("<i", header, 4, len(records))
today = date.today()
header[1] = today.year - 2000
header[2] = today.month
header[3] = today.day

with open(OUT_DBF, "wb") as f:
    f.write(header)
    for r in records:
        f.write(r)
    f.write(b"\x1A")

print(f"Wrote {OUT_DBF} with {len(records)} records ({len(docs)} documents)")
for d in docs:
    print(f"  {d['nr_intrare']} (TIP={d['tip']!r}) supplier {d['cod']} (NEW): {len(d['lines'])} lines, articles {[l['cod_art'] for l in d['lines']]} (NEW)")
