"""Fyller i fakt_kalibrering.weather_at_harvest (Open-Meteo ERA5-arkiv) — backfill för kontroller utan väder, och
(uttryckligt läge) omhämtning av väder med fel UTC-tid.

    python scripts/backfill-kontroll-vader.py                      # TORRKÖRNING: hämtar och räknar, skriver ingenting
    python scripts/backfill-kontroll-vader.py --skriv              # fyller i kontroller som SAKNAR väder
    python scripts/backfill-kontroll-vader.py --skriv-over         # torrkörning: hämtar om även rader som HAR väder
    python scripts/backfill-kontroll-vader.py --skriv-over --skriv # skriver över dem (se nedan)
    python scripts/backfill-kontroll-vader.py --aterstall FIL      # lägger tillbaka det gamla vädret ur en säkerhetskopia

Kräver NEXT_PUBLIC_SUPABASE_URL (eller SUPABASE_URL) och SUPABASE_SERVICE_ROLE_KEY i miljön (samma som importen) och
nätåtkomst till archive-api.open-meteo.com. Använder EXAKT samma funktioner som importen (skogsmaskin_import_version_6.py:
komplettera_saknat_vader) — position = första skördade stammens GPS, tid = tidigaste skördetid i filen, närmaste hela
timme i UTC.

--skriv-over finns BARA här, aldrig i importen. De 176 första raderna (hämtade 2026-05-20) har harvest_time som svensk
väggklocka stämplad som UTC, 1–2 h fel; de hämtas om med rätt tid. Bara rader där den lagrade tiden skiljer sig från den rätta
ändras (en omkörning ändrar inget), en rad skrivs bara om den fortfarande har det väder som lästes (fetched_at), och de gamla
värdena sparas FÖRST i en säkerhetskopia (--sakerhetskopia FIL, annars kontroll-vader-fore-<tid>.json) som --aterstall läser.

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


def main():
    skriv, skriv_over = '--skriv' in sys.argv, '--skriv-over' in sys.argv
    m = ladda_import()
    m.init_supabase()
    if argvarde('--aterstall'):
        return aterstall(m, argvarde('--aterstall'))
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
          f"inte klara än (yngre än {m.VADER_ARKIV_FORDROJNING_DAGAR} dygn): {r['inte_klara']}  |  misslyckade: {len(r['misslyckade'])}  |  sökta: {r['sokta']}")
    print(f"Efter: {med1} av {tot1} kontroller har väder")
    if r['avbrutet']:
        print(f"AVBRÖTS: {r['avbrutet']}")
    for id_, fil, skal in r['misslyckade']:
        print(f"  EJ IFYLLD  id={id_}  {fil}  —  {skal}")
    return 1 if (r['misslyckade'] or r['avbrutet']) else 0


if __name__ == '__main__':
    sys.exit(main())
