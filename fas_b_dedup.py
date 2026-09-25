"""FAS B: radera 241 innehållsdubbletter. Keep = först inlästa (lägsta skapad_tid, id).

Lägen:
  (default)       LOGGA — bygg manifest till fil, radera INGET.
  APPLY_DELETE=1  RADERA exakt de id:n som står i manifestet (matpunkt→stock→stam→kalibrering).

Rör ALDRIG NULL-hash-rader (11 tomma). Behåller alltid EN rad per grupp.
"""
import os, sys, json, collections, requests
from datetime import datetime, timezone

APPLY_DELETE = os.environ.get('APPLY_DELETE') == '1'
BASE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(BASE, 'fas_b_delete_manifest.json')

env = {}
with open(os.path.join(BASE, '.env.local'), encoding='utf-8') as f:
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

def build_manifest():
    ctrl = fetch_all("fakt_kalibrering?select=id,filnamn,maskin_id,innehalls_hash,skapad_tid&innehalls_hash=not.is.null")
    groups = collections.defaultdict(list)
    for c in ctrl:
        groups[(c['maskin_id'], c['innehalls_hash'])].append(c)
    # index: filnamn -> stock-id-lista (för matpunkter)
    stocks = fetch_all("detalj_kontroll_stock?select=id,filnamn")
    stock_ids_by_file = collections.defaultdict(list)
    for s in stocks: stock_ids_by_file[s['filnamn']].append(s['id'])
    stams = fetch_all("detalj_kontroll_stam?select=id,filnamn")
    stam_ids_by_file = collections.defaultdict(list)
    for s in stams: stam_ids_by_file[s['filnamn']].append(s['id'])

    delete_entries = []
    for k, v in groups.items():
        if len(v) < 2: continue
        v_sorted = sorted(v, key=lambda c: ((c['skapad_tid'] or ''), c['id']))  # först inlästa först
        kept = v_sorted[0]
        for c in v_sorted[1:]:
            sids = stock_ids_by_file.get(c['filnamn'], [])
            # matpunkter för dessa stock-id
            mp_ids = []
            if sids:
                inlist = ','.join(str(i) for i in sids)
                mp = requests.get(f"{URL}/rest/v1/detalj_kontroll_stock_matpunkt?detalj_kontroll_stock_id=in.({inlist})&select=id",
                                  headers=H, timeout=60).json()
                mp_ids = [r['id'] for r in mp]
            delete_entries.append({
                'fakt_id': c['id'], 'filnamn': c['filnamn'], 'maskin_id': c['maskin_id'],
                'innehalls_hash': c['innehalls_hash'], 'skapad_tid': c['skapad_tid'],
                'kept_fakt_id': kept['id'], 'kept_filnamn': kept['filnamn'],
                'stock_ids': sids, 'stam_ids': stam_ids_by_file.get(c['filnamn'], []),
                'matpunkt_ids': mp_ids,
            })
    return delete_entries

if not APPLY_DELETE:
    # === STEG 1: LOGGA ===
    entries = build_manifest()
    totals = {
        'controls': len(entries),
        'stocks': sum(len(e['stock_ids']) for e in entries),
        'stams': sum(len(e['stam_ids']) for e in entries),
        'matpunkter': sum(len(e['matpunkt_ids']) for e in entries),
    }
    manifest = {'generated_utc': datetime.now(timezone.utc).isoformat(),
                'keep_rule': 'lägsta (skapad_tid, id) per (maskin_id, innehalls_hash)',
                'totals': totals, 'delete': entries}
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("=== STEG 1: MANIFEST SKRIVET ===")
    print(f"fil: {MANIFEST}")
    print(f"kontroller att radera: {totals['controls']}")
    print(f"  detalj_kontroll_stock-rader: {totals['stocks']}")
    print(f"  detalj_kontroll_stam-rader:  {totals['stams']}")
    print(f"  matpunkt-rader:              {totals['matpunkter']}")
    # sanity: varje kept_fakt_id får INTE finnas bland fakt_id som raderas
    del_ids = {e['fakt_id'] for e in entries}
    kept_ids = {e['kept_fakt_id'] for e in entries}
    overlap = del_ids & kept_ids
    print(f"SÄKERHET: överlapp behållna/raderade fakt_id: {len(overlap)} (måste vara 0)")
    print(f"exempel (3 första):")
    for e in entries[:3]:
        print(f"   radera fakt_id={e['fakt_id']} '{e['filnamn'][:45]}' → behåll fakt_id={e['kept_fakt_id']} '{e['kept_filnamn'][:45]}'")
    sys.exit(0)

# === STEG 2: RADERA (läs manifestet, radera exakt de id:n) ===
with open(MANIFEST, encoding='utf-8') as f:
    manifest = json.load(f)
entries = manifest['delete']
print(f"=== STEG 2: RADERAR {len(entries)} kontroller enligt manifest ===")
def dl(path):
    r = requests.delete(f"{URL}/rest/v1/{path}", headers={**H, 'Prefer': 'count=exact'}, timeout=60)
    if r.status_code not in (200, 204):
        print("  DELETE-fel", path[:80], r.status_code, r.text[:120]); return 0
    cr = r.headers.get('content-range', '')  # "*/N"
    try: return int(cr.split('/')[-1])
    except Exception: return None
tot = collections.Counter()
for i, e in enumerate(entries, 1):
    sids, stids = e['stock_ids'], e['stam_ids']
    if sids:
        inlist = ','.join(str(x) for x in sids)
        n = dl(f"detalj_kontroll_stock_matpunkt?detalj_kontroll_stock_id=in.({inlist})")
        tot['matpunkt'] += n or 0
        n = dl(f"detalj_kontroll_stock?id=in.({inlist})"); tot['stock'] += n or 0
    if stids:
        n = dl(f"detalj_kontroll_stam?id=in.({','.join(str(x) for x in stids)})"); tot['stam'] += n or 0
    n = dl(f"fakt_kalibrering?id=eq.{e['fakt_id']}"); tot['fakt'] += n or 0
    if i % 50 == 0: print(f"  … {i}/{len(entries)}")
print(f"raderat: fakt={tot['fakt']} stock={tot['stock']} stam={tot['stam']} matpunkt={tot['matpunkt']}")
