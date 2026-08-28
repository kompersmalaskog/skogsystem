#!/usr/bin/env python3
"""
Beräknar SKÖRDARSTRÅK ur detalj_gps_spar och skriver till tabellen `skordarstrak`.
PR 1 av skotarvy-serien. Kör detta EFTER migrationen 20260825_skordarstrak.sql.

Pipeline per (maskin_id, objekt):
  steg 0  DEDUP på (tidpunkt, lat, lon) — arbetspositions-bursten (en rad per stock på samma
          uppställning; ~22 identiska rader) → EN punkt, annars viktas stråket mot stockrika stopp.
  steg 1  Sortera på tidpunkt, SEGMENTERA: ny stråk vid tidslucka > TIDSLUCKA_S eller
          avståndshopp > hopptröskeln (förflyttning till annan del av beståndet).
          Tröskeln är ADAPTIV per (objekt, maskin) — se HOPP_FAKTOR nedan.
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
TIDSLUCKA_S = 120      # > 2 min glapp → ny stråk (Martins beslut: speglar hur skördaren jobbade;
                       #                          recompute-idempotent → billigt att trimma om)
# Hopptröskeln är ADAPTIV, inte ett fast meterantal. Skälet är mätt, inte gissat: maskinerna
# loggar med helt olika täthet, så EN fast tröskel kan inte tjäna båda.
#   PONS20SDJAA270231 (slutavverkning, tidsstyrd logg ~30 s):  mediansteg  1,7 m,  p99 27 m
#   R64101 / R64428   (gallring,      avståndsstyrd logg):     mediansteg 10,2 m,  p99 23–74 m
# Fasta 200 m klippte ingenting alls på Ponsse-objekten: förflyttningen mellan två arbetspunkter
# ligger där på 20–30 m per punkt, så stråket löpte vidare TVÄRS beståndet (spaghettit på Akelius,
# vo 11208196 — 9 stråk, längsta 7,4 km på ett annat objekt). 50 m ändrade exakt noll punkter.
# Tröskeln sätts därför mot maskinens EGET normalsteg på just det objektet: ett steg som är
# HOPP_FAKTOR gånger längre än medianen är en förflyttning, inte arbete. Golv mot GPS-brus,
# tak mot orimligt glesa loggar.
HOPP_FAKTOR = 3.0      # klipp när steget > FAKTOR × mediansteget för (objekt, maskin)
HOPP_MIN_M  = 15.0     # golv — klipp aldrig på kortare steg än så (GPS-brus/kranrörelse)
HOPP_TAK_M  = 200.0    # tak — > 200 m är alltid glapp/teleport, oavsett mediansteg
HOPP_M      = None     # sätts av --hopp för att TVINGA en fast tröskel (annars adaptiv)
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

def hopptroskel(dedup):
    """Adaptiv hopptröskel (m) för EN (objekt, maskin)-serie. dedup = [(lng,lat,tid), ...] i tidsordning.

    Mediansteget är maskinens normala loggavstånd på just detta objekt (tidsstyrd logg → litet;
    avståndsstyrd → ~10 m). Ett steg som är HOPP_FAKTOR gånger längre är en förflyttning mellan
    arbetspunkter — det ska bli ny stråk, inte en linje tvärs beståndet. --hopp tvingar fast värde.
    """
    if HOPP_M is not None:
        return float(HOPP_M)
    steg = []
    for i in range(1, len(dedup)):
        a, b = dedup[i - 1], dedup[i]
        if (b[2] - a[2]).total_seconds() > TIDSLUCKA_S:
            continue          # dygns-/rastglapp säger inget om loggtätheten
        steg.append(haversine_m(a[1], a[0], b[1], b[0]))
    if not steg:
        return HOPP_MIN_M
    steg.sort()
    median = steg[len(steg) // 2]
    return min(HOPP_TAK_M, max(HOPP_MIN_M, HOPP_FAKTOR * median))

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
def get(path, _forsok=5):
    import time
    for i in range(_forsok):
        try:
            r = requests.get(f"{URL}/rest/v1/{path}", headers=H, timeout=60)
            r.raise_for_status(); return r.json()
        except Exception:
            if i == _forsok - 1: raise
            time.sleep(2 * (i + 1))  # transient 522/timeout → backoff + retry

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

        # steg 1a: hopptröskel ur maskinens EGET normalsteg på detta objekt. Bara steg inom
        # TIDSLUCKA_S räknas — ett dygnsuppehåll säger inget om hur tätt maskinen loggar.
        trosk = hopptroskel(dedup)

        # steg 1: segmentera
        segs, cur = [], []
        for i, p in enumerate(dedup):
            if not cur:
                cur = [p]; continue
            prev = cur[-1]
            gap = (p[2] - prev[2]).total_seconds()
            dist = haversine_m(prev[1], prev[0], p[1], p[0])
            if gap > TIDSLUCKA_S or dist > trosk:
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
                'berakning': {'tidslucka_s': TIDSLUCKA_S, 'hopp_m': round(trosk, 1), 'rdp_m': RDP_M,
                              'hopp_adaptiv': HOPP_M is None, 'hopp_faktor': HOPP_FAKTOR},
            })
            stats['langd'] += langd
        stats['strak'] += nr
        stats.setdefault('trosk', []).append((maskin, round(trosk, 1)))
    return strak_recs, stats

def skriv_strak(objekt_uuid, recs):
    # Recompute-idempotent: radera objektets stråk, skriv nya.
    requests.delete(f"{URL}/rest/v1/skordarstrak?objekt_id=eq.{objekt_uuid}", headers=H, timeout=60).raise_for_status()
    for i in range(0, len(recs), BATCH):
        r = requests.post(f"{URL}/rest/v1/skordarstrak", headers=H, json=recs[i:i+BATCH], timeout=120)
        r.raise_for_status()

def main():
    global TIDSLUCKA_S, HOPP_M, HOPP_FAKTOR, RDP_M
    ap = argparse.ArgumentParser()
    ap.add_argument('--vo', help='bara detta vo_nummer')
    ap.add_argument('--dry-run', action='store_true', help='räkna + rapportera, skriv inget')
    ap.add_argument('--detalj', action='store_true', help='lista varje stråk (nr, punkter, längd, tid)')
    ap.add_argument('--tidslucka', type=float, help=f'override TIDSLUCKA_S (default {TIDSLUCKA_S})')
    ap.add_argument('--hopp', type=float, help='TVINGA fast hopptröskel i meter (default: adaptiv)')
    ap.add_argument('--hopp-faktor', type=float, help=f'override HOPP_FAKTOR (default {HOPP_FAKTOR})')
    ap.add_argument('--rdp', type=float, help=f'override RDP_M (default {RDP_M})')
    ap.add_argument('--lista-omatchade', action='store_true', help='sampla detalj_gps_spar-objekt utan app-objekt')
    a = ap.parse_args()
    if a.tidslucka is not None: TIDSLUCKA_S = a.tidslucka
    if a.hopp is not None: HOPP_M = a.hopp
    if a.hopp_faktor is not None: HOPP_FAKTOR = a.hopp_faktor
    if a.rdp is not None: RDP_M = a.rdp

    vo_map = las_objekt_map()
    hopptxt = (f"{HOPP_M}m (tvingad)" if HOPP_M is not None
               else f"adaptiv {HOPP_FAKTOR}×median, {HOPP_MIN_M:.0f}–{HOPP_TAK_M:.0f}m")
    print(f"Objekt i appen med vo_nummer: {len(vo_map)}  |  trösklar: tidslucka={TIDSLUCKA_S}s hopp={hopptxt} rdp={RDP_M}m")

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

    todo = [(a.vo, vo_map.get(a.vo))] if a.vo else list(vo_map.items())
    tot = {'objekt': 0, 'strak': 0, 'ra': 0, 'dedup': 0}
    for vo, uuid in todo:
        if uuid is None and not a.dry_run:
            print(f"  {vo}: inget app-objekt (vo saknas i objekt-tabellen) → hoppar (skarp körning kräver mappning)")
            continue
        try:
            rows = las_gps_for_vo(vo)
            if not rows:
                print(f"  {vo}: 0 punkter")
                continue
            recs, st = bygg_strak_for_objekt(vo, uuid or '(omappad)', rows)
            if not recs:
                print(f"  {vo}: {st['ra']} punkter → {st['dedup']} efter dedup → 0 stråk (för korta?)")
                continue
            if not a.dry_run:
                skriv_strak(uuid, recs)
            tot['objekt'] += 1; tot['strak'] += st['strak']; tot['ra'] += st['ra']; tot['dedup'] += st['dedup']
            idtxt = uuid[:8] if uuid else 'omappad'
            trosktxt = ' '.join(f"{m}:{t:.0f}m" for m, t in st.get('trosk', []))
            print(f"  {vo} ({idtxt}): {st['ra']} pkt → dedup {st['dedup']} → {st['strak']} stråk, {st['langd']/1000:.2f} km"
                  + (f"  [hopp {trosktxt}]" if trosktxt else "")
                  + ("  [DRY]" if a.dry_run else ""))
            if a.detalj:
                for r in recs:
                    minst = ''
                    t0, t1 = parse_tid(r['tid_start']), parse_tid(r['tid_slut'])
                    if t0 and t1: minst = f"  {(t1 - t0).total_seconds()/60:>4.0f} min"
                    print(f"       #{r['strak_nr']:>2} [{r['maskin_id']}]  {r['langd_m']:>6.0f} m  {r['antal_punkter_ra']:>4}→{r['antal_punkter']:>3} pkt{minst}")
        except Exception as e:
            # Ett trasigt objekt (t.ex. statement-timeout innan index) får INTE döda hela körningen.
            print(f"  {vo}: FEL ({type(e).__name__}: {str(e)[:120]}) → hoppar, fortsätter med nästa")
            tot['fel'] = tot.get('fel', 0) + 1
            continue
    print(f"\nKLART: {tot['objekt']} objekt, {tot['strak']} stråk, {tot['ra']} råpunkter → {tot['dedup']} efter dedup"
          + ("  (DRY-RUN, inget skrivet)" if a.dry_run else ""))

if __name__ == '__main__':
    main()
