"""gap_check.py — READ-ONLY veckovis övervakning.

Hittar (maskin, dag) där fakt_tid-dagssumman (P+T) ligger UNDER MOM-sanningen
("taket") mer än en tröskel — dvs samma under-count-bugg vi reparerat. Tänkt att
köras schemalagt en gång i veckan över de senaste 14 dagarna.

MOM-tak per (maskin, dag) = EXAKT samma logik som reparationen (build_target):
  - scanna Behandlade/<maskin>/mom/*.mom
  - 4-tuple-dedup på (MonitoringStartTime, maskin, objekt, operator); max P+T vinner per session
  - summera P+T per (maskin, dag) över alla sessioner
  - fallback: P=0 & T=0 & engine>0  ->  P = int(0.88 * engine_time_sek)

DB per (maskin, dag) = SUM(processing_sek + terrain_sek) ur fakt_tid.
  (fakt_tid läses separat; INGEN join mot fakt_produktion — enl. CLAUDE.md.)

LARM  : (tak − DB) > ABS_THRESHOLD_H            (default 0.5 h)  — signifikant under-count
info  : gap ≥ REL_THRESHOLD av taket            (default 10 %)   — men under abs-tröskeln
obs   : DB > tak + ABS_THRESHOLD_H                                — saknade MOM-filer / över-count

Synk-fördröjning kan inte ge falsklarm: taket byggs från Behandlade, dit importern
flyttar filer FÖRST efter import. En osynkad fil finns alltså i varken tak eller DB.

READ-ONLY mot Supabase (bara GET fakt_tid). Skriver BARA gap_logg.txt. Rör ingen DB-data.
Exit-kod 1 om minst ett LARM (så en schemalagd task lätt kan notifiera), annars 0.

Körning:
  python gap_check.py            # utskrift + append till gap_logg.txt
  python gap_check.py --quiet    # bara logg (för schemalagd körning)
  python gap_check.py --days 30  # annat fönster
"""
import os, sys, glob, json, argparse, datetime, urllib.request
from collections import defaultdict

REPO = os.path.dirname(os.path.abspath(__file__))   # skriptet bor i repo-roten
os.chdir(REPO); sys.path.insert(0, REPO)
import logging; logging.disable(logging.CRITICAL)
import skogsmaskin_import_version_6 as imp

# ----------------- Konfiguration (justera fritt) -----------------
DAYS_BACK = 14                 # fönster: senaste N dagar
ABS_THRESHOLD_H = 0.5          # LARM om (tak − DB) > detta antal timmar
REL_THRESHOLD = 0.10           # info-flagga om gap ≥ 10 % av taket (även under abs-tröskeln)
GAP_LOG = os.path.join(getattr(imp, 'ONEDRIVE_BASE', REPO), 'gap_logg.txt')

# 13 tid-fält (samma som importern/reparationen)
TID_FIELDS = ['processing_sek', 'terrain_sek', 'other_work_sek', 'maintenance_sek',
              'disturbance_sek', 'rast_sek', 'avbrott_sek', 'kort_stopp_sek',
              'bransle_liter', 'engine_time_sek', 'korstracka_m',
              'terrain_korstracka_m', 'terrain_bransle_liter']


def _ensure_creds():
    if getattr(imp, 'SUPABASE_URL', '') and getattr(imp, 'SUPABASE_KEY', ''):
        return
    env = {}
    with open(os.path.join(REPO, '.env.local'), encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    imp.SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
    imp.SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']


def _hdr():
    return {'apikey': imp.SUPABASE_KEY, 'Authorization': 'Bearer ' + imp.SUPABASE_KEY}


def window_days(n):
    today = datetime.date.today()
    return {(today - datetime.timedelta(days=i)).isoformat() for i in range(n)}


def discover_machines():
    """Maskiner = undermappar i Behandlade som har en 'mom'-mapp."""
    base = imp.BEHANDLADE
    out = []
    for name in sorted(os.listdir(base)):
        if os.path.isdir(os.path.join(base, name, 'mom')):
            out.append(name)
    return out


def mom_ceiling(maskin, dayset):
    """MOM-tak per dag för en maskin (#40 + _keep, summerat till dagnivå). -> {datum: pt_sek}."""
    files = sorted(glob.glob(os.path.join(imp.BEHANDLADE, maskin, 'mom', '*.mom')))
    merged = {}
    for f in files:
        try:
            d = imp.parse_mom_file(f)
        except Exception:
            continue
        for ek, e in d.get('tid_entries', {}).items():
            if len(ek) != 4 or ek[1] != maskin:
                continue
            if str(e.get('datum') or '') not in dayset:
                continue
            cur = merged.get(ek)
            if cur is None or (
                (e.get('processing_sek') or 0) + (e.get('terrain_sek') or 0)
                > (cur.get('processing_sek') or 0) + (cur.get('terrain_sek') or 0)
            ):
                merged[ek] = e  # mest kompletta sessionen vinner
    # aggregera per (datum, objekt, operator), tillämpa fallback, summera P+T per datum
    agg = defaultdict(lambda: {f: 0 for f in TID_FIELDS})
    for ek, e in merged.items():
        _, _mk, objekt, operator = ek
        datum = str(e.get('datum') or '')
        for f in TID_FIELDS:
            agg[(datum, objekt, operator)][f] += (e.get(f) or 0)
    day_pt = defaultdict(int)
    for (datum, _o, _op), vals in agg.items():
        P, T = vals['processing_sek'], vals['terrain_sek']
        if P == 0 and T == 0 and vals['engine_time_sek'] > 0:
            P = int(vals['engine_time_sek'] * 0.88)  # samma fallback som importern
        day_pt[datum] += P + T
    return dict(day_pt)


def db_day_pt(maskin, dayset):
    """DB: SUM(P+T) per dag ur fakt_tid för maskinen, inom fönstret. READ-ONLY GET."""
    lo, hi = min(dayset), max(dayset)
    url = (imp.SUPABASE_URL +
           f'/rest/v1/fakt_tid?select=datum,processing_sek,terrain_sek'
           f'&maskin_id=eq.{maskin}&datum=gte.{lo}&datum=lte.{hi}')
    out = defaultdict(int)
    start, step = 0, 1000
    while True:
        h = dict(_hdr()); h['Range-Unit'] = 'items'; h['Range'] = f'{start}-{start+step-1}'
        chunk = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60))
        for r in chunk:
            d = r.get('datum')
            if d in dayset:
                out[d] += (r.get('processing_sek') or 0) + (r.get('terrain_sek') or 0)
        if len(chunk) < step:
            break
        start += step
    return dict(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quiet', action='store_true', help='Bara logg, ingen utskrift (schemalagd körning).')
    ap.add_argument('--days', type=int, default=DAYS_BACK, help=f'Fönster i dagar (default {DAYS_BACK}).')
    args = ap.parse_args()

    imp.init_supabase()
    _ensure_creds()
    dayset = window_days(args.days)
    lo, hi = min(dayset), max(dayset)

    L = []
    L.append(f'=== gap_check {datetime.datetime.now():%Y-%m-%d %H:%M:%S} | fönster {lo}..{hi} ({args.days} d) ===')
    L.append(f'    tröskel: LARM om (MOM-tak − DB) > {ABS_THRESHOLD_H:.2f} h ; info om gap ≥ {int(REL_THRESHOLD*100)} %')

    alarms, infos, obs = [], [], []
    for maskin in discover_machines():
        ceil = mom_ceiling(maskin, dayset)
        db = db_day_pt(maskin, dayset)
        for d in sorted(set(ceil) | set(db)):
            c, v = ceil.get(d, 0), db.get(d, 0)
            gap = c - v
            gap_h = gap / 3600.0
            pct = (gap / c) if c > 0 else 0.0
            if gap_h > ABS_THRESHOLD_H:
                alarms.append((maskin, d))
                L.append(f'  LARM  {maskin:<20} {d}  tak={c/3600:6.2f}h  DB={v/3600:6.2f}h  gap=+{gap_h:5.2f}h ({pct*100:4.1f}%)')
            elif c > 0 and pct >= REL_THRESHOLD and gap_h > 0.05:
                infos.append((maskin, d))
                L.append(f'  info  {maskin:<20} {d}  tak={c/3600:6.2f}h  DB={v/3600:6.2f}h  gap=+{gap_h:5.2f}h ({pct*100:4.1f}%)')
            elif gap_h < -ABS_THRESHOLD_H:
                obs.append((maskin, d))
                L.append(f'  obs   {maskin:<20} {d}  tak={c/3600:6.2f}h  DB={v/3600:6.2f}h  (DB > MOM {-gap_h:.2f}h — saknade MOM-filer?)')

    if alarms:
        L.append(f'>>> {len(alarms)} LARM (under-count > {ABS_THRESHOLD_H}h). Kontrollera importen för dessa (maskin, dag).')
        # TODO: koppla ev. extern notis (mail/Teams) här — just nu räcker logg + exit-kod 1.
    else:
        L.append('>>> Inga LARM — fakt_tid matchar MOM-taket inom tröskeln.')
    if infos:
        L.append(f'    ({len(infos)} info-flaggor ≥ {int(REL_THRESHOLD*100)} % men under abs-tröskeln.)')
    if obs:
        L.append(f'    ({len(obs)} obs: DB > MOM — trolig saknad/arkiverad MOM-fil, ej import-bugg.)')

    text = '\n'.join(L)
    with open(GAP_LOG, 'a', encoding='utf-8') as fh:
        fh.write(text + '\n\n')
    if not args.quiet:
        print(text)
        print(f'\n(loggat till {GAP_LOG})')
    sys.exit(1 if alarms else 0)


if __name__ == '__main__':
    main()
