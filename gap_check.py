"""gap_check.py — READ-ONLY veckovis övervakning.

TVÅ SKYDD (lärdomar från A110148-dubbleringen juli 2026 — den syntes som
snäll "obs" i juni-loggarna utan att någon larmade):

1) INVARIANTER över HELA fakt_tid-historiken (ren DB, billig):
   - >24h motortid per (maskin, dag)  -> LARM  (fysiskt omöjligt = dubblering)
   - dubblett-signatur: >=2 rader på samma (datum, maskin, objekt) med
     identiska (proc, terr, engine, bränsle) > 0 över olika operatörer
     -> LARM  (operator-omattributionens exakta fingeravtryck)

2) MOM-AVSTÄMNING senaste N dagar (fönster): fakt_tid-dagssumman (P+T)
   mot MOM-taket ur Behandlade.
   Taket byggs med SAMMA semantik som importern efter #115/#119
   (HÅLL I SYNK med _keep i skogsmaskin_import_version_6.py):
   - identitet (MonitoringStartTime, maskin) — objekt/operator är attribut
   - BELOPP från varianten med störst vikt (total duration alla tidshinkar)
   - ATTRIBUTION från versionen med högst recency (filnamnssuffix, annars mtime)
   - fallback per dag-nyckel: P=0 & T=0 & engine>0 -> P = int(0.88 * engine)

   LARM : (tak − DB) > ABS_THRESHOLD_H   (under-count, importen tappar)
   LARM : (DB − tak) > ABS_THRESHOLD_H   (över-count/dubblering ELLER MOM-fil
          försvunnen ur Behandlade — båda kräver åtgärd: nästa dag-rebuild
          raderar data vars källa saknas)
   info : gap >= REL_THRESHOLD av taket men under abs-tröskeln

Synk-fördröjning kan inte ge falsklarm: taket byggs från Behandlade, dit importern
flyttar filer FÖRST efter import. En osynkad fil finns alltså i varken tak eller DB.

READ-ONLY mot Supabase (bara GET fakt_tid). Skriver gap_logg.txt (append) och
gap_LARM_senaste.txt (skrivs över varje körning — tom vid grönt).
Exit-kod 1 om minst ett LARM, annars 0.

Körning:
  python gap_check.py            # utskrift + logg
  python gap_check.py --quiet    # bara logg (för schemalagd körning)
  python gap_check.py --days 30  # annat fönster
"""
import os, sys, glob, json, argparse, datetime, urllib.request
from collections import defaultdict

try:  # Windows-konsol är ofta cp1252 — loggen är utf-8, gör utskriften det med
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

REPO = os.path.dirname(os.path.abspath(__file__))   # skriptet bor i repo-roten
os.chdir(REPO); sys.path.insert(0, REPO)
import logging; logging.disable(logging.CRITICAL)
import skogsmaskin_import_version_6 as imp

# ----------------- Konfiguration (justera fritt) -----------------
DAYS_BACK = 14                 # fönster: senaste N dagar
ABS_THRESHOLD_H = 0.5          # LARM om |tak − DB| > detta antal timmar
REL_THRESHOLD = 0.10           # info-flagga om gap ≥ 10 % av taket (även under abs-tröskeln)
MAX_ENGINE_H = 24.0            # invariant: motortid per (maskin, dag) kan aldrig överstiga detta
KANDA_TOMGANG_ARV = 0          # Arvet (41 rader från före #124) STÄDADES 2026-07-13 via omimport
                               # av 13 filer — baslinjen är nu NOLL. Varje inkonsistent rad efter
                               # detta är ett äkta larm (#124-fixen ska hålla fältet konsistent).
GAP_LOG = os.path.join(getattr(imp, 'ONEDRIVE_BASE', REPO), 'gap_logg.txt')
LARM_FIL = os.path.join(getattr(imp, 'ONEDRIVE_BASE', REPO), 'gap_LARM_senaste.txt')

# Deploy-drift-kontroll: katalogen där importkoden KÖR (deploy-klonen) jämförs
# mot origin/main. HÅLL I SYNK med $ImportFiler i deploy_import.ps1.
DEPLOY_DIR = r'C:\skogsystem-import'
DRIFT_FILER = ['skogsmaskin_import_version_6.py', 'import_hpr.py',
               'auto_import_watch.py', 'gap_check.py']

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


def _fil_recency(path):
    """Kopia av importerns recency (HÅLL I SYNK med skogsmaskin_import_version_6):
    sista _YYYYMMDD_HHMMSS-suffixet i filnamnet, annars mtime, annars 0."""
    import re
    m = re.findall(r'_(\d{8})_(\d{6})', os.path.basename(path))
    if m:
        try:
            return datetime.datetime.strptime(m[-1][0] + m[-1][1], '%Y%m%d%H%M%S').timestamp()
        except ValueError:
            pass
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


_VIKT_FALT = ('processing_sek', 'terrain_sek', 'other_work_sek',
              'maintenance_sek', 'disturbance_sek', 'rast_sek', 'avbrott_sek')


def mom_ceiling(maskin, dayset):
    """MOM-tak per dag — SAMMA två-vinnare-semantik som importern efter #115/#119
    (HÅLL I SYNK med _keep): identitet (start, maskin); BELOPP från störst-vikt-
    varianten; ATTRIBUTION (objekt, operator) från högst recency. -> {datum: pt_sek}."""
    files = sorted(glob.glob(os.path.join(imp.BEHANDLADE, maskin, 'mom', '*.mom')))
    entries, attrs, vmeta = {}, {}, {}
    for f in files:
        try:
            d = imp.parse_mom_file(f)
        except Exception:
            continue
        rec = _fil_recency(f)
        for ek, e in d.get('tid_entries', {}).items():
            if len(ek) != 4 or ek[1] != maskin:
                continue
            if str(e.get('datum') or '') not in dayset:
                continue
            ident = (ek[0], ek[1])
            vikt = sum((e.get(fn) or 0) for fn in _VIKT_FALT)
            v = vmeta.get(ident)
            if v is None or vikt > v[0] or (vikt == v[0] and rec > v[1]):
                entries[ident] = e
                vmeta[ident] = (vikt, rec)
            a = attrs.get(ident)
            if a is None or rec > a[0] or (rec == a[0] and vikt > a[3]):
                attrs[ident] = (rec, ek[2], ek[3], vikt)
    # aggregera per (datum, objekt, operator), tillämpa fallback, summera P+T per datum
    agg = defaultdict(lambda: {f: 0 for f in TID_FIELDS})
    for ident, e in entries.items():
        _, objekt, operator, _ = attrs[ident]
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


def check_invarianter():
    """Invarianter över HELA fakt_tid (ren DB, ordnad hämtning).
    -> (larmrader, antal_rader, tomgang_arv_kvar). READ-ONLY."""
    url_bas = (imp.SUPABASE_URL +
               '/rest/v1/fakt_tid?select=datum,maskin_id,objekt_id,operator_id,'
               'processing_sek,terrain_sek,other_work_sek,kort_stopp_sek,'
               'tomgang_sek,engine_time_sek,bransle_liter'
               '&order=id&limit=1000&offset=')
    rows, offset = [], 0
    while True:
        chunk = json.load(urllib.request.urlopen(
            urllib.request.Request(url_bas + str(offset), headers=_hdr()), timeout=120))
        rows += chunk
        if len(chunk) < 1000:
            break
        offset += 1000

    larm = []
    # (a) >24h motortid per (maskin, dag)
    eng_dag = defaultdict(int)
    for r in rows:
        eng_dag[(r['maskin_id'], r['datum'])] += r.get('engine_time_sek') or 0
    for (m, d), s in sorted(eng_dag.items()):
        if s > MAX_ENGINE_H * 3600:
            larm.append(f'  LARM  INVARIANT >24h motortid: {m} {d} = {s/3600:.1f} h — dubblering?')

    # (b) dubblett-signaturen (operator-omattributionens fingeravtryck):
    #     >=2 rader samma (datum, maskin, objekt) med identiska proc/terr/eng/fuel > 0
    grupper = defaultdict(list)
    for r in rows:
        grupper[(r['datum'], r['maskin_id'], r['objekt_id'])].append(r)
    for (d, m, o), g in sorted(grupper.items()):
        if len(g) < 2:
            continue
        sedd = defaultdict(list)
        for r in g:
            fp = (r.get('processing_sek') or 0, r.get('terrain_sek') or 0,
                  r.get('engine_time_sek') or 0, r.get('bransle_liter') or 0)
            if sum(fp[:3]) > 0:
                sedd[fp].append(r.get('operator_id'))
        for fp, ops in sedd.items():
            if len(ops) > 1:
                larm.append(f'  LARM  INVARIANT dubblett-rad: {m} {d} objekt={o} — '
                            f'{len(ops)} identiska rader ({", ".join(str(x) for x in ops)}), '
                            f'eng={fp[2]/3600:.2f} h vardera')

    # (c) tomgångs-konsistens: lagrad tomgang_sek == max(0, eng − (P+T+OW − kort_stopp))?
    #     De kända arv-raderna (före #124) självläker vid omimport — räknaren visar
    #     läkningen. VÄXER antalet skapas nya inkonsistenta rader trots #124 => LARM.
    tomgang_arv = 0
    for r in rows:
        g0 = ((r.get('processing_sek') or 0) + (r.get('terrain_sek') or 0)
              + (r.get('other_work_sek') or 0) - (r.get('kort_stopp_sek') or 0))
        forv = max(0, (r.get('engine_time_sek') or 0) - g0)
        if abs((r.get('tomgang_sek') or 0) - forv) > 1:
            tomgang_arv += 1
    if tomgang_arv > KANDA_TOMGANG_ARV:
        larm.append(f'  LARM  INVARIANT tomgång-inkonsistens VÄXER: {tomgang_arv} rader '
                    f'(känt arv: {KANDA_TOMGANG_ARV}) — skapas NYA trots #124-fixen?')
    return larm, len(rows), tomgang_arv


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


def check_deploy_drift():
    """Deploy-drift: kör DRIFT (DEPLOY_DIR) den importkod som är beslutad
    (origin/main)? Jämför FIL-HASHAR, inte HEAD-sha — main får UI-mergar hela
    tiden som inte rör importen, och ett larm som tjatar vid varje sådan blir
    ignorerat (värre än inget larm). Larmar bara när en importfil i drift
    faktiskt avviker, eller när working tree är smutsigt (handpatchar —
    juli 2026 stod deploy-klonen på #84 med lös diff utan att någon märkte).
    -> (larmrader, status 'OK'|'DRIFT'|'OKÄND', detaljrad).
    OKÄND (fetch-fel/offline, katalog saknas) är ett ärligt tredje tillstånd:
    inte grönt, men inte heller larm-tjat vid varje nätverksglapp."""
    import subprocess

    def _git(*a, timeout=60):
        return subprocess.run(['git', '-C', DEPLOY_DIR] + list(a),
                              capture_output=True, text=True, timeout=timeout)

    # OBS: .git kan vara en FIL (länkad worktree — det är vad C:\skogsystem-import
    # faktiskt är), inte bara en katalog. exists, inte isdir.
    if not os.path.exists(os.path.join(DEPLOY_DIR, '.git')):
        return [], 'OKÄND', f'OKÄND — {DEPLOY_DIR} finns inte eller är inte ett git-repo'
    try:
        r = _git('fetch', 'origin', '--quiet', timeout=120)
    except Exception as e:
        return [], 'OKÄND', f'OKÄND — git fetch kunde inte köras: {e}'
    if r.returncode != 0:
        return [], 'OKÄND', ('OKÄND — git fetch misslyckades (offline?): '
                             + (r.stderr or '').strip()[:200])

    larm = []
    for f in DRIFT_FILER:
        lokal = _git('hash-object', os.path.join(DEPLOY_DIR, f))
        beslutad = _git('rev-parse', f'origin/main:{f}')
        if lokal.returncode != 0 or beslutad.returncode != 0:
            larm.append(f'  LARM  DRIFT: kunde inte hasha {f} — saknas filen i drift eller i origin/main?')
        elif lokal.stdout.strip() != beslutad.stdout.strip():
            larm.append(f'  LARM  DRIFT: {f} i drift avviker från origin/main — koden som kör '
                        f'är inte den beslutade. Deploya om (deploy_import.ps1).')
    st = _git('status', '--porcelain')
    if st.returncode == 0 and st.stdout.strip():
        filer = ', '.join(l.strip() for l in st.stdout.strip().splitlines()[:10])
        larm.append(f'  LARM  DRIFT: working tree i drift är smutsigt ({filer}) — '
                    f'handpatchar? Deploya om (deploy_import.ps1).')

    sha = (_git('rev-parse', '--short', 'origin/main').stdout or '?').strip()
    if larm:
        return larm, 'DRIFT', f'DRIFT — {len(larm)} avvikelse(r) mot origin/main ({sha})'
    return [], 'OK', f'OK — {len(DRIFT_FILER)} importfiler byte-identiska med origin/main ({sha})'


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
    L.append(f'    trösklar: |tak − DB| > {ABS_THRESHOLD_H:.2f} h ; motortid/dag > {MAX_ENGINE_H:.0f} h ; info ≥ {int(REL_THRESHOLD*100)} %')

    # ── Del 1: invarianter över HELA historiken ──
    inv_larm, n_rader, tomgang_arv = check_invarianter()
    L.append(f'    invarianter: {n_rader} fakt_tid-rader kontrollerade — '
             f'{len(inv_larm) if inv_larm else "inga"} larm')
    L.append(f'    tomgång-arv (före #124, självläker vid omimport): {tomgang_arv} rader kvar'
             + (' — LÄKT ✓' if tomgang_arv == 0 else f' (utgångsläge {KANDA_TOMGANG_ARV})'))
    L.extend(inv_larm)

    # ── Del 2: MOM-avstämning i fönstret ──
    alarms, infos = list(inv_larm), []
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
                L.append(f'  LARM  {maskin:<20} {d}  tak={c/3600:6.2f}h  DB={v/3600:6.2f}h  gap=+{gap_h:5.2f}h ({pct*100:4.1f}%) — under-count, importen tappar')
            elif gap_h < -ABS_THRESHOLD_H:
                alarms.append((maskin, d))
                L.append(f'  LARM  {maskin:<20} {d}  tak={c/3600:6.2f}h  DB={v/3600:6.2f}h  gap={gap_h:5.2f}h — DB > MOM: dubblering ELLER MOM-fil borta ur Behandlade (nästa dag-rebuild raderar då datat!)')
            elif c > 0 and pct >= REL_THRESHOLD and gap_h > 0.05:
                infos.append((maskin, d))
                L.append(f'  info  {maskin:<20} {d}  tak={c/3600:6.2f}h  DB={v/3600:6.2f}h  gap=+{gap_h:5.2f}h ({pct*100:4.1f}%)')

    # ── Del 3: deploy-drift — kör drift den beslutade koden? ──
    drift_larm, drift_status, drift_detalj = check_deploy_drift()
    L.append(f'    deploy-drift: {drift_detalj}')
    L.extend(drift_larm)
    alarms.extend(drift_larm)   # drift-larm ska larma: LARM-fil + exit-kod 1

    if alarms:
        L.append(f'>>> {len(alarms)} LARM — kontrollera per (maskin, dag) ovan.')
        # TODO: koppla ev. extern notis (mail/Teams) här — logg + LARM-fil + exit-kod 1 tills vidare.
    else:
        L.append('>>> Inga LARM — invarianter gröna och fakt_tid matchar MOM-taket inom tröskeln.')
    if infos:
        L.append(f'    ({len(infos)} info-flaggor ≥ {int(REL_THRESHOLD*100)} % men under abs-tröskeln.)')

    text = '\n'.join(L)
    with open(GAP_LOG, 'a', encoding='utf-8') as fh:
        fh.write(text + '\n\n')
    # LARM-fil skrivs över varje körning: tom betyder grönt, innehåll = senaste larmen
    with open(LARM_FIL, 'w', encoding='utf-8') as fh:
        fh.write(text + '\n' if alarms else f'INGA LARM {datetime.datetime.now():%Y-%m-%d %H:%M}\n')

    # Statusrader till appen (Datahälsa-vyn läser meta_datahalsa_status).
    # Två rader: 'gap_check' (hela körningen, inkl. drift-larm) och
    # 'deploy_drift' (bara drift-tillståndet, med OKÄND som ärligt tredje läge).
    # Mjuk felhantering: saknas tabellen (migration ej körd) får körningen
    # INTE krascha — loggen/larmfilen är fortfarande primärkanalen.
    try:
        larm_rader = [r.strip() for r in L if r.strip().startswith('LARM')]
        nu = datetime.datetime.now().astimezone().isoformat()
        statusrader = [{
            'id': 'gap_check',
            'kord_tid': nu,
            'status': 'LARM' if alarms else 'OK',
            'larm_antal': len(alarms),
            'sammanfattning': ('\n'.join(larm_rader)[:1500] if alarms
                               else f'Inga larm — {n_rader} rader kontrollerade, tomgång-arv {tomgang_arv}'),
        }, {
            'id': 'deploy_drift',
            'kord_tid': nu,
            'status': 'LARM' if drift_status == 'DRIFT' else drift_status,
            'larm_antal': len(drift_larm),
            'sammanfattning': ('\n'.join(r.strip() for r in drift_larm)[:1500]
                               if drift_larm else drift_detalj[:1500]),
        }]
        hdr = dict(_hdr())
        hdr.update({'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=minimal'})
        for rad in statusrader:
            urllib.request.urlopen(urllib.request.Request(
                imp.SUPABASE_URL + '/rest/v1/meta_datahalsa_status?on_conflict=id',
                data=json.dumps(rad).encode('utf-8'), headers=hdr, method='POST'), timeout=30)
        L_status = f'{len(statusrader)} statusrader skrivna till meta_datahalsa_status'
    except Exception as e:
        L_status = f'kunde inte skriva statusrad (migration ej körd?): {e}'
    with open(GAP_LOG, 'a', encoding='utf-8') as fh:
        fh.write(f'    ({L_status})\n\n')

    if not args.quiet:
        print(text)
        print(f'    ({L_status})')
        print(f'\n(loggat till {GAP_LOG}; larmstatus i {LARM_FIL})')
    sys.exit(1 if alarms else 0)


if __name__ == '__main__':
    main()
