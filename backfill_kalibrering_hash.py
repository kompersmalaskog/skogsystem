"""Engångs: fyll fakt_kalibrering.innehalls_hash + (separat) radera dubbletter.

Använder parserns KANONISKA kontroll_innehalls_hash (samma källa) så backfillade
rader matchar framtida importer exakt.

Flaggor (oberoende):
  APPLY_HASH=1    → patcha innehalls_hash på alla 458 rader (Fas A)
  APPLY_DELETE=1  → radera 241 innehållsdubbletter + deras detaljrader (Fas B)
  (ingen flagg)   → DRY-RUN: räkna och rapportera, skriv INGET.

Fas A kör med APPLY_HASH=1 (INTE APPLY_DELETE).
"""
import os, sys, collections, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skogsmaskin_import_version_6 import kontroll_innehalls_hash

APPLY_HASH = os.environ.get('APPLY_HASH') == '1'
APPLY_DELETE = os.environ.get('APPLY_DELETE') == '1'

env = {}
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env.local'), encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def fetch_all(path):
    out, off = [], 0
    while True:
        b = requests.get(f"{URL}/rest/v1/{path}", headers={**H, 'Range': f'{off}-{off+999}'}, timeout=60).json()
        out += b
        if len(b) < 1000: break
        off += 1000
    return out

def q(v):
    import urllib.parse; return urllib.parse.quote(str(v), safe='')

# 1) Läs kontroller + stockar, bygg hash per filnamn (parserns funktion)
ctrl = fetch_all("fakt_kalibrering?select=id,filnamn,maskin_id,datum")
stocks = fetch_all("detalj_kontroll_stock?select=filnamn,stam_nummer,stock_nummer,machine_measurement_date,operator_measurement_date,maskin_langd_cm,maskin_toppdia_mm,operator_langd_cm,operator_toppdia_mm,stem_dbh_mm")
by_file = collections.defaultdict(list)
for s in stocks: by_file[s['filnamn']].append(s)
hash_of = {fn: kontroll_innehalls_hash(rows) for fn, rows in by_file.items()}
print(f"Kontroller: {len(ctrl)}  |  APPLY_HASH={APPLY_HASH}  APPLY_DELETE={APPLY_DELETE}")

# 2) Patcha innehalls_hash (Fas A)
if APPLY_HASH:
    n = 0
    for c in ctrl:
        h = hash_of.get(c['filnamn'])  # None = tom kontroll
        r = requests.patch(f"{URL}/rest/v1/fakt_kalibrering?id=eq.{c['id']}", headers=H,
                           json={'innehalls_hash': h}, timeout=30)
        if r.status_code not in (200, 204):
            print("  PATCH-fel", c['id'], r.status_code, r.text[:120]); continue
        n += 1
    print(f"innehalls_hash patchade: {n}/{len(ctrl)}")
else:
    print("(hash EJ patchad — sätt APPLY_HASH=1)")

# 3) Grupperingskontroll (räknar bara — inget raderas här)
groups = collections.defaultdict(list)
tomma = 0
for c in ctrl:
    h = hash_of.get(c['filnamn'])
    if h is None:
        tomma += 1; continue
    groups[(c['maskin_id'], h)].append(c)
overskjutande = sum(len(v) - 1 for v in groups.values() if len(v) > 1)
print(f"\n=== GRUPPERING (maskin_id, innehalls_hash) ===")
print(f"distinkta grupper: {len(groups)}  |  överskjutande rader: {overskjutande}  |  tomma (hash=NULL): {tomma}")

# 4) Radering (Fas B — endast med APPLY_DELETE=1)
to_delete = []
for k, v in groups.items():
    if len(v) < 2: continue
    v_sorted = sorted(v, key=lambda c: (c['datum'] or '', c['filnamn']))
    to_delete += v_sorted[1:]
if not APPLY_DELETE:
    print(f"\n(radering AV — {len(to_delete)} rader skulle raderas i Fas B med APPLY_DELETE=1)")
    sys.exit(0)

for c in to_delete:
    enc = q(c['filnamn'])
    ids = requests.get(f"{URL}/rest/v1/detalj_kontroll_stock?filnamn=eq.{enc}&select=id", headers=H, timeout=30).json()
    for sid in [r['id'] for r in ids]:
        requests.delete(f"{URL}/rest/v1/detalj_kontroll_stock_matpunkt?detalj_kontroll_stock_id=eq.{sid}", headers=H, timeout=30)
    requests.delete(f"{URL}/rest/v1/detalj_kontroll_stock?filnamn=eq.{enc}", headers=H, timeout=30)
    requests.delete(f"{URL}/rest/v1/detalj_kontroll_stam?filnamn=eq.{enc}", headers=H, timeout=30)
    requests.delete(f"{URL}/rest/v1/fakt_kalibrering?id=eq.{c['id']}", headers=H, timeout=30)
print(f"RADERADE {len(to_delete)} dubblettkontroller. Kör migrationens DEL 2 (unikt index).")
