"""Förberäkning av stämplingsmodellen: utbyte per trädslag och 5 cm-klass ur
vår egen avverkade skog (stamplings_klass + stamplings_meta).

    python berakna_stamplingsmodell.py          inkrementellt: objekt vars
                                                stockar eller stammar ändrats
    python berakna_stamplingsmodell.py --alla   räkna om allt — efter en ändring
                                                i normalisering_karta eller
                                                harled_produktgrupp, som ändrar
                                                grupp utan att röra en stock

Körs EFTER import, aldrig live, i samma kedja som berakna_rotkap.py och
berakna_utfall_objekt.py. Skärmen /affarsuppfoljning/stampling läser bara
stamplings_klass och stamplings_meta — ingen stockdata vid anrop.

Räkningen är SQL: berakna_stamplingsmodell(p_allt, p_max, p_fore). Bara
service-rollen får köra den, och den har OCKSÅ 8 s genom PostgREST, så
funktionen tar högst p_max objekt per anrop och det här skriptet anropar
tills inget är kvar. Sedan verifieras på innehåll: modelltabellen har rader
och beräkningstiden är nu — inte bara att anropen svarade.
"""
import os, sys, io, time, datetime, importlib.util
import requests

HAR = os.path.dirname(os.path.abspath(__file__))


def ladda_import():
    spec = importlib.util.spec_from_file_location(
        'imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
    m = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(m)
    except SystemExit:
        pass
    return m


M = ladda_import()


def rpc(namn, args):
    h = {k: v for k, v in M.SUPABASE_HEADERS.items() if k != 'Prefer'}
    r = requests.post('%s/rest/v1/rpc/%s' % (M.SUPABASE_URL, namn), headers=h, json=args, timeout=600)
    if r.status_code != 200:
        raise RuntimeError('%s svarade %s: %s' % (namn, r.status_code, r.text[:300]))
    return r.json()


def verifiera():
    """Läs tillbaka VÄRDET: antal rader i modelltabellen och senaste beräkningstid."""
    r = requests.get('%s/rest/v1/stamplings_klass?select=slag,klass,rot,beraknad&order=beraknad.desc&limit=1'
                     % M.SUPABASE_URL,
                     headers=dict(M.SUPABASE_HEADERS, **{'Prefer': 'count=exact'}), timeout=60)
    r.raise_for_status()
    rader = int(r.headers['Content-Range'].split('/')[-1])
    senast = r.json()[0]['beraknad'] if r.json() else None
    return rader, senast


PER_ANROP = 5    # objekt per anrop — ett stort objekt (Hushållningssällskapet,
                 # 12 500 stammar / 60 000 stockar) tar omkring en sekund


def main():
    alla = '--alla' in sys.argv[1:]
    if not M.init_supabase():
        print('FEL: ingen Supabase-anslutning. Inget räknat.'); return 1
    t0 = time.time()
    fore = datetime.datetime.now(datetime.timezone.utc).isoformat()
    raknade = borttagna = anrop = db_ms = 0
    omtag = 0
    while True:
        try:
            svar = rpc('berakna_stamplingsmodell', {'p_allt': alla, 'p_max': PER_ANROP, 'p_fore': fore})
        except Exception as e:
            if '57014' in str(e) and omtag < 3:
                omtag += 1
                print('  anrop %d: statement timeout, omtag %d om 10 s' % (anrop + 1, omtag))
                time.sleep(10); continue
            print('FEL efter %d anrop: %s' % (anrop, e)); return 1
        anrop += 1
        raknade += svar['raknade']; borttagna += svar['borttagna']; db_ms += svar['ms']
        if svar['raknade']:
            print('  anrop %d: %d objekt, %s ms, %d kvar' % (anrop, svar['raknade'], svar['ms'], svar['kvar']))
        if svar['kvar'] == 0:
            break
        if anrop >= 500:
            print('FEL: %d kvar efter %d anrop — nycklarna rör sig under körningen?' % (svar['kvar'], anrop)); return 1
    rader = svar['rader']
    print('räknade %d objekt, %d borttagna — %d rader i stamplings_klass '
          '(%d anrop, %d ms i databasen, %.1f s totalt, statement_timeout %s som %s)%s'
          % (raknade, borttagna, rader, anrop, db_ms, time.time() - t0,
             svar['statement_timeout'], svar['roll'], '  [--alla]' if alla else ''))

    rader_db, senast = verifiera()
    if rader_db != rader:
        print('INTE VERIFIERAD: funktionen sade %d rader, tabellen har %d' % (rader, rader_db)); return 1
    if not senast:
        print('INTE VERIFIERAD: modelltabellen är tom'); return 1
    alder = (datetime.datetime.now(datetime.timezone.utc)
             - datetime.datetime.fromisoformat(senast.replace('Z', '+00:00'))).total_seconds()
    if alder > 300:
        print('INTE VERIFIERAD: senaste beräkning är %.0f s gammal — körningen rörde inte tabellen' % alder); return 1
    print('verifierad: %d rader, beräknade för %.0f s sedan' % (rader_db, alder))
    return 0


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.exit(main())
