"""Fyller i fakt_kalibrering.weather_at_harvest för kontroller som saknar det (Open-Meteo ERA5-arkiv).

    python scripts/backfill-kontroll-vader.py            # TORRKÖRNING: hämtar och räknar, skriver ingenting
    python scripts/backfill-kontroll-vader.py --skriv    # skriver

Kräver SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i miljön (samma som importen) och nätåtkomst till
archive-api.open-meteo.com. Använder EXAKT samma funktioner som importen (skogsmaskin_import_version_6.py:
komplettera_saknat_vader) — position = första skördade stammens GPS, tid = tidigaste skördetid i filen, närmaste hela
timme i UTC.

Rör ALDRIG en rad som redan har väder (läser och skriver med weather_at_harvest=is.null). Kontroller yngre än ca 6 dygn
har inget arkivvärde än och hoppas över ("inte klara"); importen fyller i dem själv vid en senare import.

Skriver före/efter-räkning och listar de som inte fick väder, med skäl. Exit 1 om någon kontroll med GPS-position
saknar väder efteråt av annat skäl än "inte klart än".
"""
import importlib.util, os, sys, tempfile

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


def rakna(m):
    """(totalt, med väder) ur fakt_kalibrering."""
    def antal(filter_):
        r = m.requests.get(f"{m.SUPABASE_URL}/rest/v1/fakt_kalibrering?select=id{filter_}&limit=1",
                           headers={**m.SUPABASE_HEADERS, 'Prefer': 'count=exact'}, timeout=30)
        return int(r.headers['Content-Range'].split('/')[-1])
    return antal(''), antal('&weather_at_harvest=not.is.null')


def main():
    skriv = '--skriv' in sys.argv
    m = ladda_import()
    m.init_supabase()
    tot0, med0 = rakna(m)
    print(f"Före:  {med0} av {tot0} kontroller har väder")
    r = m.komplettera_saknat_vader(max_antal=None, skriv=skriv)
    tot1, med1 = rakna(m)
    print(f"{'Fyllde i' if skriv else 'Skulle fylla i (torrkörning)'}: {r['fyllda']}  |  inte klara än (yngre än "
          f"{m.VADER_ARKIV_FORDROJNING_DAGAR} dygn): {r['inte_klara']}  |  misslyckade: {len(r['misslyckade'])}  |  sökta: {r['sokta']}")
    print(f"Efter: {med1} av {tot1} kontroller har väder")
    for id_, fil, skal in r['misslyckade']:
        print(f"  EJ IFYLLD  id={id_}  {fil}  —  {skal}")
    return 1 if r['misslyckade'] else 0


if __name__ == '__main__':
    sys.exit(main())
