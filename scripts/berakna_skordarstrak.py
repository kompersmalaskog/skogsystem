#!/usr/bin/env python3
"""
Beräknar SKÖRDARSTRÅK ur detalj_gps_spar och skriver till tabellen `skordarstrak`.
PR 1 av skotarvy-serien. Kör detta EFTER migrationen 20260825_skordarstrak.sql.

Pipeline per (maskin_id, objekt):
  steg 0  DEDUP på (tidpunkt, lat, lon) — arbetspositions-bursten (en rad per stock på samma
          uppställning; ~22 identiska rader) → EN punkt, annars viktas stråket mot stockrika stopp.
  steg 1  Sortera på tidpunkt, SEGMENTERA: ny stråk vid tidslucka > TIDSLUCKA_S eller
          avståndshopp > HOPP_M (GPS-glapp/förflyttning till annan del).
  steg 2  RDP-förenkling (Ramer–Douglas–Peucker) med RDP_M meters tolerans. Punkterna är redan
          glest samplade (~10–30 m isär) → låg tolerans, behåller formen.
Skriver STATISK geometri. Volym/kvar per stråk är dynamiskt (klumpning + lib/skotat, PR 2/3).

Anslutning: PostgREST via service-nyckeln ur .env.local (samma som skogsmaskin_import_version_6.py).

Användning:
  python scripts/berakna_skordarstrak.py                 # alla objekt (skriver)
  python scripts/berakna_skordarstrak.py --vo 11107310   # ett objekt
  python scripts/berakna_skordarstrak.py --dry-run       # räkna + rapportera, skriv INGET
  python scripts/berakna_skordarstrak.py --lista-omatchade  # sampla detalj_gps_spar-objekt utan app-objekt
"""
import os, sys, math, argparse
from datetime import datetime

try:
    import requests
except ImportError:
    print("FEL: 'requests' saknas (pip install requests)"); sys.exit(1)

# ── Trimbara parametrar ──────────────────────────────────────────────────────
TIDSLUCKA_S = 300      # > 5 min glapp → ny stråk
HOPP_M      = 200      # > 200 m mellan punkter → ny stråk (glapp/teleport)
RDP_M       = 4.0      # RDP-tolerans i meter (gles sampling → låg)
MIN_PUNKTER = 2        # en stråk behöver minst 2 punkter
MIN_LANGD_M = 15.0     # kortare stråk kastas
BATCH       = 500      # insert-batchstorlek

# ── .env.local ───────────────────────────────────────────────────────────────
def load_env():
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (os.path.join(here, '..', '.env.local'), os.path.join(here, '.env.local')):
        if os.path.exists(cand):
            env = {}
            for line in open(cand, encoding='utf-8'):
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1); env[k.strip()] = v.strip()
            return env
    return {}

_env = load_env()
URL = _env.get('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
KEY = _env.get('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    print("FEL: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY måste finnas i .env.local"); sys.exit(1)
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# ── Geo-hjälpare ─────────────────────────────────────────────────────────────
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))

def rdp(pts, eps_m):
    """Ramer–Douglas–Peucker. pts = [(lng,lat,tid), ...]. Perp-avstånd i meter via lokal planprojektion."""
    if len(pts) < 3:
        return pts[:]
    lat0 = sum(p[1] for p in pts) / len(pts)
    kx = 111320.0 * math.cos(math.radians(lat0))   # m per grad lng
    ky = 110540.0                                   # m per grad lat
    xy = [((p[0]) * kx, (p[1]) * ky) for p in pts]
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        (x0, y0), (x1, y1) = xy[i0], xy[i1]
        dx, dy = x1 - x0, y1 - y0
        seg2 = dx*dx + dy*dy
        dmax, imax = -1.0, -1
        for i in range(i0 + 1, i1):
            x, y = xy[i]
            if seg2 == 0:
                d = math.hypot(x - x0, y - y0)
            else:
                t = ((x - x0)*dx + (y - y0)*dy) / seg2
                t = max(0.0, min(1.0, t))
                px, py = x0 + t*dx, y0 + t*dy
                d = math.hypot(x - px, y - py)
            if d > dmax:
                dmax, imax = d, i
        if dmax > eps_m and imax != -1:
            keep[imax] = True
            stack.append((i0, imax)); stack.append((imax, i1))
    return [pts[i] for i in range(len(pts)) if keep[i]]

# ── PostgREST ────────────────────────────────────────────────────────────────
def get(path):
    r = requests.get(f"{URL}/rest/v1/{path}", headers=H, timeout=60)
    r.raise_for_status(); return r.json()

def las_objekt_map():
    """vo_nummer → objekt-uuid (bara objekt som finns i appen)."""
    rows = get("objekt?select=id,vo_nummer")
    m = {}
    for o in rows:
        vo = (o.get('vo_nummer') or '').strip()
        if vo:
            m[vo] = o['id']
    return m

def las_gps_for_vo(vo):
    """Alla detalj_gps_spar-rader för ett objekt_id (=vo), keyset-paginerat på id (unik tiebreaker)."""
    out, last = [], 0
    while True:
        rows = get(f"detalj_gps_spar?objekt_id=eq.{vo}&id=gt.{last}&select=id,maskin_id,tidpunkt,latitude,longitude&order=id.asc&limit=1000")
        if not rows:
            break
        out.extend(rows); last = rows[-1]['id']
        if len(rows) < 1000:
            break
    return out

def parse_tid(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None

# ── Kärnan: bygg stråk för ett objekt ────────────────────────────────────────
def bygg_strak_for_objekt(vo, objekt_uuid, rows):
    per_maskin = {}
    for r in rows:
        per_maskin.setdefault(r['maskin_id'], []).append(r)

    strak_recs = []
    stats = {'ra': len(rows), 'dedup': 0, 'strak': 0, 'langd': 0.0}
    for maskin, mrows in per_maskin.items():
        # steg 0: DEDUP på (tidpunkt, lat, lon)
        seen, dedup = set(), []
        for r in mrows:
            key = (r['tidpunkt'], r['latitude'], r['longitude'])
            if key in seen: continue
            seen.add(key)
            t = parse_tid(r['tidpunkt'])
            if t is None or r['latitude'] is None or r['longitude'] is None: continue
            dedup.append((r['longitude'], r['latitude'], t))
        stats['dedup'] += len(dedup)
        dedup.sort(key=lambda p: p[2])  # på tidpunkt

        # steg 1: segmentera
        segs, cur = [], []
        for i, p in enumerate(dedup):
            if not cur:
                cur = [p]; continue
            prev = cur[-1]
            gap = (p[2] - prev[2]).total_seconds()
            dist = haversine_m(prev[1], prev[0], p[1], p[0])
            if gap > TIDSLUCKA_S or dist > HOPP_M:
                segs.append(cur); cur = [p]
            else:
                cur.append(p)
        if cur: segs.append(cur)

        # steg 2: RDP + bygg record
        nr = 0
        for seg in segs:
            if len(seg) < MIN_PUNKTER: continue
            langd = sum(haversine_m(seg[i-1][1], seg[i-1][0], seg[i][1], seg[i][0]) for i in range(1, len(seg)))
            if langd < MIN_LANGD_M: continue
            forenklad = rdp(seg, RDP_M)
            nr += 1
            strak_recs.append({
                'objekt_id': objekt_uuid,
                'vo_nummer': vo,
                'maskin_id': maskin,
                'strak_nr': nr,
                'geometri': [[round(p[0], 7), round(p[1], 7)] for p in forenklad],
                'antal_punkter_ra': len(seg),
                'antal_punkter': len(forenklad),
                'langd_m': round(langd, 1),
                'tid_start': seg[0][2].isoformat(),
                'tid_slut': seg[-1][2].isoformat(),
                'berakning': {'tidslucka_s': TIDSLUCKA_S, 'hopp_m': HOPP_M, 'rdp_m': RDP_M},
            })
            stats['langd'] += langd
        stats['strak'] += nr
    return strak_recs, stats

def skriv_strak(objekt_uuid, recs):
    # Recompute-idempotent: radera objektets stråk, skriv nya.
    requests.delete(f"{URL}/rest/v1/skordarstrak?objekt_id=eq.{objekt_uuid}", headers=H, timeout=60).raise_for_status()
    for i in range(0, len(recs), BATCH):
        r = requests.post(f"{URL}/rest/v1/skordarstrak", headers=H, json=recs[i:i+BATCH], timeout=120)
        r.raise_for_status()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--vo', help='bara detta vo_nummer')
    ap.add_argument('--dry-run', action='store_true', help='räkna + rapportera, skriv inget')
    ap.add_argument('--lista-omatchade', action='store_true', help='sampla detalj_gps_spar-objekt utan app-objekt')
    a = ap.parse_args()

    vo_map = las_objekt_map()
    print(f"Objekt i appen med vo_nummer: {len(vo_map)}")

    if a.lista_omatchade:
        # Sampla objekt_id över tabellen (kan ej DISTINCT via PostgREST) → flagga vo utan app-objekt.
        funna = set()
        for off in (0, 50000, 150000, 400000, 800000, 1500000, 3000000, 5000000):
            try:
                rows = get(f"detalj_gps_spar?select=objekt_id&order=id.asc&offset={off}&limit=200")
                for r in rows: funna.add(r['objekt_id'])
            except Exception: pass
        omatchade = [v for v in funna if v not in vo_map]
        print(f"Samplade objekt_id: {sorted(funna)}")
        print(f"OMATCHADE (GPS men inget app-objekt): {sorted(omatchade) or 'inga i samplingen'}")
        return

    todo = [(a.vo, vo_map[a.vo])] if a.vo else list(vo_map.items())
    tot = {'objekt': 0, 'strak': 0, 'ra': 0, 'dedup': 0}
    for vo, uuid in todo:
        rows = las_gps_for_vo(vo)
        if not rows:
            continue
        recs, st = bygg_strak_for_objekt(vo, uuid, rows)
        if not recs:
            print(f"  {vo}: {st['ra']} punkter → {st['dedup']} efter dedup → 0 stråk (för korta?)")
            continue
        if not a.dry_run:
            skriv_strak(uuid, recs)
        tot['objekt'] += 1; tot['strak'] += st['strak']; tot['ra'] += st['ra']; tot['dedup'] += st['dedup']
        print(f"  {vo} ({uuid[:8]}): {st['ra']} pkt → dedup {st['dedup']} → {st['strak']} stråk, {st['langd']/1000:.2f} km"
              + ("  [DRY]" if a.dry_run else ""))
    print(f"\nKLART: {tot['objekt']} objekt, {tot['strak']} stråk, {tot['ra']} råpunkter → {tot['dedup']} efter dedup"
          + ("  (DRY-RUN, inget skrivet)" if a.dry_run else ""))

if __name__ == '__main__':
    main()
