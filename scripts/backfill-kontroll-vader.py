"""Fyller i fakt_kalibrering.weather_at_harvest (Open-Meteo ERA5-arkiv) — backfill för kontroller utan väder, och
(uttryckligt läge) omhämtning av väder med fel UTC-tid.

    python scripts/backfill-kontroll-vader.py                      # TORRKÖRNING: hämtar och räknar, skriver ingenting
    python scripts/backfill-kontroll-vader.py --skriv              # fyller i kontroller som SAKNAR väder
    python scripts/backfill-kontroll-vader.py --skriv-over         # torrkörning: hämtar om även rader som HAR väder
    python scripts/backfill-kontroll-vader.py --skriv-over --skriv # skriver över dem (se nedan)
    python scripts/backfill-kontroll-vader.py --aterstall FIL      # lägger tillbaka det gamla vädret ur en säkerhetskopia
    python scripts/backfill-kontroll-vader.py --jamfor             # LÄSLÄGE: gammal mot ny temperatur per rad, skriver ingenting

Kräver NEXT_PUBLIC_SUPABASE_URL (eller SUPABASE_URL) och SUPABASE_SERVICE_ROLE_KEY i miljön (samma som importen) och
nätåtkomst till archive-api.open-meteo.com. Använder EXAKT samma funktioner som importen (skogsmaskin_import_version_6.py:
komplettera_saknat_vader) — stammen väljs av valj_vaderpunkt: HQC-filerna är ackumulerande (en fil innehåller ofta stammar
från tidigare kontroller), så det är den tidigaste stammen med GPS vars skördedatum (lokal tid) är kontrollens datum
(fakt_kalibrering.datum), annars den senaste stammen med GPS; tiden är närmaste hela timme i UTC.

--skriv-over finns BARA här, aldrig i importen. De 176 första raderna (hämtade 2026-05-20) har harvest_time som svensk
väggklocka stämplad som UTC, 1–2 h fel, och en del har väder från fel STAM (en gammal kontrolls i en ackumulerande fil);
de hämtas om med rätt tid och rätt stam. Bara rader där den lagrade tiden skiljer sig från den rätta
ändras (en omkörning ändrar inget), en rad skrivs bara om den fortfarande har det väder som lästes (fetched_at), och de gamla
värdena sparas FÖRST i en säkerhetskopia (--sakerhetskopia FIL, annars kontroll-vader-fore-<tid>.json) som --aterstall läser.

--jamfor hämtar rätt väder för de gamla raderna (samma urval som --skriv-over: bara rader där den lagrade tiden skiljer
sig från den rätta) och skriver ut gammal och ny temperatur per rad, medel- och största skillnaden och hur många som byter
mellan frost och inte frost. Bara läsningar mot Supabase och Open-Meteo — ingen PATCH, ingen POST, ingen säkerhetskopia,
och kan inte kombineras med --skriv eller --aterstall. Raderna väljs av en egen slinga med samma hjälpfunktioner som
komplettera_saknat_vader (valj_vaderpunkt, hamta_vader_vid_skord); "skulle ersättas" här ska vara lika med "skulle ersätta
gamla" i torrkörningen med --skriv-over — skiljer de sig åt är något fel.

Kontroller yngre än ca 6 dygn har inget arkivvärde än och hoppas över ("inte klara"); importen fyller i dem själv senare.
Skriver före/efter-räkning och listar de som inte fick väder, med skäl. Exit 1 om någon kontroll är kvar utan väder av annat
skäl än "inte klart än".
"""
import importlib.util, json, os, sys, tempfile
from datetime import datetime

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        os.chdir(tempfile.mkdtemp(prefix='kontrollvader_'))
        os.makedirs(r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer", exist_ok=True)
    try:
        spec = importlib.util.spec_from_file_location('imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m
    finally:
        os.chdir(kvar)


def antal(m, filter_=''):
    r = m.requests.get(f"{m.SUPABASE_URL}/rest/v1/fakt_kalibrering?select=id{filter_}&limit=1",
                       headers={**m.SUPABASE_HEADERS, 'Prefer': 'count=exact'}, timeout=30)
    return int(r.headers['Content-Range'].split('/')[-1])


def rakna(m):
    """(totalt, med väder) ur fakt_kalibrering."""
    return antal(m), antal(m, '&weather_at_harvest=not.is.null')


def argvarde(namn):
    return sys.argv[sys.argv.index(namn) + 1] if namn in sys.argv else None


def aterstall(m, fil):
    with open(fil, encoding='utf-8') as f:
        rader = json.load(f)
    ok = 0
    for id_, vader in rader:
        r = m.requests.patch(f"{m.SUPABASE_URL}/rest/v1/fakt_kalibrering?id=eq.{id_}",
                             headers={**m.SUPABASE_HEADERS, 'Prefer': 'return=representation'},
                             json={'weather_at_harvest': vader}, timeout=30)
        if r.status_code in (200, 204) and len(r.json() or []) == 1:
            ok += 1
        else:
            print(f"  EJ ÅTERSTÄLLD  id={id_}  {r.status_code} {r.text[:100]}")
    print(f"Återställde {ok} av {len(rader)} rader ur {fil}")
    return 0 if ok == len(rader) else 1


def ar_frost(vader):
    """Frost enligt radens egen is_freezing; saknas den räknas temperaturen under noll (samma regel som bygg_vader_json)."""
    if isinstance(vader.get('is_freezing'), bool):
        return vader['is_freezing']
    t = vader.get('temperature_c')
    return None if t is None else float(t) < 0


def dagar_fran_datum(m, datum, tid_utc):
    """Hela lokala kalenderdagar mellan kontrollens datum och väderögonblickets lokala dag (positivt = vädret är från FÖRE
    kontrollen). None om något saknas."""
    if datum is None or tid_utc is None:
        return None
    return (datum - m.utc_till_stockholm_lokal(tid_utc).date()).days


def jamfor_gamla(m, http=None, nu=None):
    """LÄSLÄGE. För varje kontroll som HAR väder: hämta det väder som --skriv-over skulle ha skrivit och ställ det mot det
    gamla. Läser bara (GET) — skriver aldrig. Returnerar {'rader': [...], 'redan_ratta', 'inte_klara',
    'misslyckade': [(id, filnamn, skäl)], 'avbrutet'}. Varje rad: dict med id, filnamn, gammal_tid, ny_tid, gammal_c, ny_c,
    diff, gammal_frost, ny_frost."""
    from datetime import timezone, timedelta
    from urllib.parse import quote
    http = http or m.requests
    nu = nu or datetime.now(timezone.utc)
    res = {'rader': [], 'redan_ratta': 0, 'inte_klara': 0, 'saknar_stockar': 0, 'misslyckade': [], 'avbrutet': None}
    sist_id = 0
    while True:
        r = m.requests.get(f"{m.SUPABASE_URL}/rest/v1/fakt_kalibrering?id=gt.{sist_id}&weather_at_harvest=not.is.null"
                           f"&select=id,filnamn,maskin_id,datum,weather_at_harvest&order=id.asc&limit={m.VADER_PAGINERING}",
                           headers=m.SUPABASE_HEADERS, timeout=30)
        if r.status_code != 200:
            res['avbrutet'] = f"kunde inte läsa kontroller: {r.status_code} {r.text[:120]}"
            return res
        sida = r.json()
        if not sida:
            return res
        for rad in sida:
            sist_id = rad['id']
            gammalt = rad['weather_at_harvest']
            try:
                sresp = m.requests.get(
                    f"{m.SUPABASE_URL}/rest/v1/detalj_kontroll_stock?filnamn=eq.{quote(str(rad['filnamn']), safe='')}"
                    f"&maskin_id=eq.{quote(str(rad['maskin_id']), safe='')}&select=stem_lat,stem_lon,harvest_date,tid_ar_utc",
                    headers=m.SUPABASE_HEADERS, timeout=30)
                if sresp.status_code != 200:
                    res['misslyckade'].append((rad['id'], rad['filnamn'], f"kunde inte läsa stockarna: {sresp.status_code}"))
                    continue
                stockar = [{'stem_lat': None if s.get('stem_lat') is None else float(s['stem_lat']),
                            'stem_lon': None if s.get('stem_lon') is None else float(s['stem_lon']),
                            'harvest_date': m.db_tid_till_lokal(s.get('harvest_date'), bool(s.get('tid_ar_utc')))}
                           for s in sresp.json()]
                punkt = m.valj_vaderpunkt(stockar, rad.get('datum'))
                if punkt is None and not stockar:
                    res['saknar_stockar'] += 1   # ren upprepning i en ackumulerande fil: stockarna ligger i en tidigare fil
                    continue
                if punkt is None:
                    res['misslyckade'].append((rad['id'], rad['filnamn'], 'ingen stock med både GPS-position och skördetid'))
                    continue
                gammal_tid = m.parse_tid_utc(gammalt.get('harvest_time'))
                if gammal_tid is not None and abs((gammal_tid - punkt[2]).total_seconds()) < 1:
                    res['redan_ratta'] += 1
                    continue
                if punkt[2] + timedelta(minutes=30) > nu - timedelta(days=m.VADER_ARKIV_FORDROJNING_DAGAR):
                    res['inte_klara'] += 1
                    continue
                ny, skal, art = m.hamta_vader_vid_skord(*punkt, http=http, nu=nu)
                if ny is None:
                    if art == m.VADER_EJ_KLART:
                        res['inte_klara'] += 1
                    elif art == m.VADER_TILLFALLIGT:
                        res['avbrutet'] = skal
                        return res
                    else:
                        res['misslyckade'].append((rad['id'], rad['filnamn'], skal))
                    continue
                gc, nc = gammalt.get('temperature_c'), ny.get('temperature_c')
                datum = m._datum_av(rad.get('datum'))
                res['rader'].append({
                    'id': rad['id'], 'filnamn': rad['filnamn'], 'datum': datum,
                    'gammal_dagar': dagar_fran_datum(m, datum, gammal_tid),
                    'ny_dagar': dagar_fran_datum(m, datum, punkt[2]),
                    'gammal_tid': gammal_tid, 'ny_tid': punkt[2],
                    'gammal_c': None if gc is None else float(gc), 'ny_c': float(nc),
                    'diff': None if gc is None else float(nc) - float(gc),
                    'gammal_frost': ar_frost(gammalt), 'ny_frost': ar_frost(ny)})
            except Exception as e:
                res['misslyckade'].append((rad.get('id'), rad.get('filnamn'), f"{type(e).__name__}: {e}"))
        if len(sida) < m.VADER_PAGINERING:
            return res


def skriv_jamforelse(res, ut=print):
    rader = res['rader']
    ut(f"Gamla rader med fel tid som skulle ersättas: {len(rader)}  |  redan rätt tid: {res['redan_ratta']}  |  "
       f"inte klara än: {res['inte_klara']}  |  utan stockar (behålls): {res['saknar_stockar']}  |  misslyckade: {len(res['misslyckade'])}")
    ut("")
    ut("   id  fil                                  kontroll    gammal tid (UTC)  ny tid (UTC)       gammal °C   ny °C   skillnad  frost")
    for x in rader:
        fr = ('' if x['gammal_frost'] == x['ny_frost'] else
              ('frost -> ej frost' if x['gammal_frost'] else 'ej frost -> frost'))
        ft = lambda t: '-' if t is None else f"{t:%Y-%m-%d %H:%M}"
        ut(f"{x['id']:>5}  {str(x['filnamn'])[:36]:<36}  {str(x['datum'] or '-'):<10}  {ft(x['gammal_tid']):<16}  {ft(x['ny_tid']):<16}  "
           f"{'-' if x['gammal_c'] is None else format(x['gammal_c'], '.1f'):>9}  {x['ny_c']:>6.1f}  "
           f"{'-' if x['diff'] is None else format(x['diff'], '+.1f'):>8}  {fr}")
    med_diff = [x for x in rader if x['diff'] is not None]
    ut("")
    if med_diff:
        storst = max(med_diff, key=lambda x: abs(x['diff']))
        ut(f"Medelskillnad (absolut): {sum(abs(x['diff']) for x in med_diff) / len(med_diff):.2f} °C över {len(med_diff)} rader")
        ut(f"Största skillnad: {storst['diff']:+.1f} °C  (id {storst['id']}, {storst['filnamn']}: {storst['gammal_c']:.1f} -> {storst['ny_c']:.1f})")
    else:
        ut("Ingen rad att jämföra.")
    # Rätt stam? Ett väder från mer än ett dygn FÖRE kontrollens eget datum är en gammal kontrolls (ackumulerande fil).
    gamla = [x for x in rader if x['gammal_dagar'] is not None and x['gammal_dagar'] > 1]
    nya = [x for x in rader if x['ny_dagar'] is not None and x['ny_dagar'] > 1]
    ut(f"Väder från mer än ett dygn före kontrollens datum: gammalt {len(gamla)} av {len(rader)}, nytt {len(nya)} av {len(rader)}")
    for x in nya:
        ut(f"  FORTFARANDE FEL STAM?  id {x['id']}  {x['filnamn']}: kontroll {x['datum']}, nytt väder {x['ny_dagar']} dygn före")
    byten = [x for x in rader if x['gammal_frost'] is not None and x['ny_frost'] is not None and x['gammal_frost'] != x['ny_frost']]
    ut(f"Byter mellan frost och inte frost: {len(byten)} av {len(rader)}")
    for x in byten:
        ut(f"  id {x['id']}  {x['filnamn']}: {x['gammal_c']:.1f} -> {x['ny_c']:.1f} °C  "
           f"({'frost -> ej frost' if x['gammal_frost'] else 'ej frost -> frost'})")
    if res['avbrutet']:
        ut(f"AVBRÖTS: {res['avbrutet']}")
    for id_, fil, skal in res['misslyckade']:
        ut(f"  EJ JÄMFÖRD  id={id_}  {fil}  —  {skal}")


def main():
    if '--jamfor' in sys.argv and ('--skriv' in sys.argv or '--aterstall' in sys.argv):
        print("--jamfor är ett läsläge och kan inte kombineras med --skriv eller --aterstall")
        return 2
    skriv, skriv_over = '--skriv' in sys.argv, '--skriv-over' in sys.argv
    m = ladda_import()
    m.init_supabase()
    if argvarde('--aterstall'):
        return aterstall(m, argvarde('--aterstall'))
    if '--jamfor' in sys.argv:
        res = jamfor_gamla(m)
        skriv_jamforelse(res)
        return 1 if (res['misslyckade'] or res['avbrutet']) else 0
    tot0, med0 = rakna(m)
    print(f"Före:  {med0} av {tot0} kontroller har väder")
    lage = ('SKRIVER ÖVER gamla + fyller i saknade' if skriv_over else 'fyller i saknade') if skriv else 'TORRKÖRNING, skriver ingenting'
    print(f"Läge: {lage}")
    # Alla rader utvärderas om (ignorera_permanenta): en explicit körning ska alltid säga varför en kontroll inte fick väder.
    r = m.komplettera_saknat_vader(max_antal=None, skriv=skriv, skriv_over=skriv_over, ignorera_permanenta=True)
    if skriv and r['aterstall']:
        fil = argvarde('--sakerhetskopia') or f"kontroll-vader-fore-{datetime.now():%Y%m%d-%H%M%S}.json"
        with open(fil, 'w', encoding='utf-8') as f:
            json.dump(r['aterstall'], f, ensure_ascii=False)
        print(f"Säkerhetskopia av {len(r['aterstall'])} ersatta rader: {fil}")
    tot1, med1 = rakna(m)
    verb = 'Fyllde i' if skriv else 'Skulle fylla i'
    print(f"{verb}: {r['fyllda']}  |  {'ersatte' if skriv else 'skulle ersätta'} gamla: {r['ersatta']}  |  redan rätt tid: {r['redan_ratta']}  |  "
          f"inte klara än (yngre än {m.VADER_ARKIV_FORDROJNING_DAGAR} dygn): {r['inte_klara']}  |  utan stockar (behålls): {r['saknar_stockar']}  |  misslyckade: {len(r['misslyckade'])}  |  sökta: {r['sokta']}")
    print(f"Efter: {med1} av {tot1} kontroller har väder")
    if r['avbrutet']:
        print(f"AVBRÖTS: {r['avbrutet']}")
    for id_, fil, skal in r['misslyckade']:
        print(f"  EJ IFYLLD  id={id_}  {fil}  —  {skal}")
    return 1 if (r['misslyckade'] or r['avbrutet']) else 0


if __name__ == '__main__':
    sys.exit(main())
