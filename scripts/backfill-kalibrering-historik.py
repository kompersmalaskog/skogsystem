"""Fyller i fakt_kalibrering_historik för raderna som lästes in innan parsern sparade rotstockens längdjustering och
diameterbeskrivningen — ur de sparade HQC-filerna.

    py scripts\\backfill-kalibrering-historik.py <mapp med .hqc>                # TORRKÖRNING: läser, skriver ingenting
    py scripts\\backfill-kalibrering-historik.py <mapp med .hqc> --skriv        # fyller i
    py scripts\\backfill-kalibrering-historik.py <mapp med .hqc> --ut rapport.txt

Vad som fylls i (och bara det):
  langd_justering_rot_mm  ur LengthCalibrationAdjustmentButtLog      — längdrader
  beskrivning             ur DiameterCalibrationDescription           — diameterrader
En kolumn skrivs BARA där den är NULL (villkoret `…=is.null` följer med i PATCH:en), så ett värde som redan finns rörs aldrig
och en omkörning ändrar inget. Inget raderas, ingen annan kolumn skrivs, unika nyckeln (datum, maskin_id, tradslag, typ)
ändras inte och inga rader skapas: en rad som finns i en fil men inte i databasen rapporteras, den läggs inte till.
Ångra: sätt tillbaka NULL på de två kolumnerna (rapporten listar vilka rader som fick värde).

Parsern är importens egen (parse_hqc_file), så filerna läses exakt som en ny import skulle läsa dem. HQC-filerna är
ackumulerande och upprepar samma block fil efter fil: ett block räknas en gång per (datum, maskin, trädslag, typ), och säger
två filer olika om samma block (annat rotvärde eller annan beskrivning) rörs det blocket inte och rapporteras som konflikt.
En saknad justering är okänd (NULL), aldrig 0.

Kräver NEXT_PUBLIC_SUPABASE_URL (eller SUPABASE_URL) och SUPABASE_SERVICE_ROLE_KEY i miljön — samma som importen.
Migrationen 20261023…_kalibrering_historik_rot_och_omkalibrering ska vara körd först (kolumnen langd_justering_rot_mm).
Exit 1 om något block är en konflikt eller en fil inte gick att läsa; exit 2 om inga .hqc-filer hittades.
"""
import importlib.util, os, sys, tempfile
from collections import defaultdict

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        os.chdir(tempfile.mkdtemp(prefix='kalibhist_'))
        os.makedirs(r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer", exist_ok=True)
    try:
        spec = importlib.util.spec_from_file_location('imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m
    finally:
        os.chdir(kvar)


def hitta_filer(sokvag):
    if os.path.isfile(sokvag):
        return [sokvag]
    ut = []
    for rot, _, filer in os.walk(sokvag):
        ut.extend(os.path.join(rot, f) for f in filer if f.lower().endswith('.hqc'))
    return sorted(ut)


def nyckel_av(rad):
    datum = rad['datum']
    return (datum.isoformat() if hasattr(datum, 'isoformat') else str(datum), rad['maskin_id'], rad['tradslag'], rad['typ'])


def samla(m, filer):
    """-> (block, konflikter, fel): block[nyckel] = {'rot': int|None, 'beskrivning': str|None, 'filer': [...]}"""
    block, konflikter, fel = {}, {}, []
    for sokvag in filer:
        try:
            rader = m.parse_hqc_file(sokvag).get('kalibrering_historik') or []
        except Exception as e:                               # en trasig fil stoppar inte genomgången
            fel.append((sokvag, f'{type(e).__name__}: {e}'))
            continue
        for r in rader:
            k = nyckel_av(r)
            varde = {'rot': r.get('langd_justering_rot_mm'), 'beskrivning': r.get('beskrivning') if r['typ'] == 'diameter' else None}
            if k not in block:
                block[k] = {**varde, 'filer': [os.path.basename(sokvag)]}
            elif {x: block[k][x] for x in varde} != varde:
                konflikter.setdefault(k, [(block[k]['filer'][0], {x: block[k][x] for x in varde})]).append((os.path.basename(sokvag), varde))
            else:
                block[k]['filer'].append(os.path.basename(sokvag))
    for k in konflikter:
        block.pop(k, None)
    return block, konflikter, fel


def _villkor(k):
    datum, maskin, tradslag, typ = k
    return {'datum': f'eq.{datum}', 'maskin_id': f'eq.{maskin}', 'tradslag': f'eq.{tradslag}', 'typ': f'eq.{typ}'}


def _anropa(m, kolumn, varde, k, skriv):
    """Rader som får (eller skulle få) värdet: bara de där kolumnen är NULL. Torrkörning = samma villkor som GET."""
    params = {**_villkor(k), kolumn: 'is.null'}
    if skriv:
        r = m.requests.patch(f"{m.SUPABASE_URL}/rest/v1/fakt_kalibrering_historik", params=params,
                             headers={**m.SUPABASE_HEADERS, 'Prefer': 'return=representation'}, json={kolumn: varde}, timeout=30)
    else:
        r = m.requests.get(f"{m.SUPABASE_URL}/rest/v1/fakt_kalibrering_historik", params={**params, 'select': 'id'},
                           headers=m.SUPABASE_HEADERS, timeout=30)
    if r.status_code not in (200, 204):
        raise RuntimeError(f"{'PATCH' if skriv else 'GET'} {kolumn}: {r.status_code} {str(r.text)[:160]}")
    return [x['id'] for x in (r.json() or [])]


def finns_i_db(m, k):
    r = m.requests.get(f"{m.SUPABASE_URL}/rest/v1/fakt_kalibrering_historik", params={**_villkor(k), 'select': 'id'},
                       headers=m.SUPABASE_HEADERS, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"läsning: {r.status_code} {str(r.text)[:160]}")
    return len(r.json() or [])


def kor(m, block, skriv, ut=print):
    """Går igenom blocken mot databasen. Returnerar räknare."""
    res = {'fyllda_rot': [], 'fyllda_beskrivning': [], 'saknas_i_db': [], 'redan': 0, 'utan_varde': 0, 'fel': []}
    for k in sorted(block):
        b = block[k]
        try:
            if finns_i_db(m, k) == 0:
                res['saknas_i_db'].append(k)
                continue
            if k[3] == 'langd' and b['rot'] is not None:
                kolumn, varde, lista = 'langd_justering_rot_mm', b['rot'], res['fyllda_rot']
            elif k[3] == 'diameter' and b['beskrivning']:
                kolumn, varde, lista = 'beskrivning', b['beskrivning'], res['fyllda_beskrivning']
            else:
                res['utan_varde'] += 1
                continue
            ids = _anropa(m, kolumn, varde, k, skriv)
            if ids:
                lista.append((k, varde, ids))
            else:
                res['redan'] += 1
        except Exception as e:
            res['fel'].append((k, f'{type(e).__name__}: {e}'))
    return res


def rapport(filer, fel_filer, block, konflikter, res, skriv, ut):
    verb = 'fylldes i' if skriv else 'skulle fyllas i'
    ut(f"{'SKRIVER' if skriv else 'TORRKÖRNING (skriver ingenting)'}  filer lästa: {len(filer) - len(fel_filer)} av {len(filer)}  |  "
       f"unika block: {len(block) + len(konflikter)}")
    per = defaultdict(lambda: defaultdict(int))
    for k, b in block.items():
        per[k[3]]['block'] += 1
        if k[3] == 'langd':
            per['langd']['med rotjustering i filen'] += b['rot'] is not None
        else:
            per['diameter']['med beskrivning i filen'] += bool(b['beskrivning'])
    for typ in ('langd', 'diameter'):
        ut(f"  {typ:8} " + '  '.join(f"{n}: {v}" for n, v in per[typ].items()))
    rotvarden = defaultdict(lambda: defaultdict(int))
    for k, b in block.items():
        if k[3] == 'langd' and b['rot'] is not None:
            rotvarden[k[1]][b['rot']] += 1
    for maskin, c in sorted(rotvarden.items()):
        ut(f"  rotjustering {maskin}: " + ', '.join(f"{v} mm × {n}" for v, n in sorted(c.items())))
    ut(f"\nrotjustering {verb}: {len(res['fyllda_rot'])} rader   |   diameterbeskrivning {verb}: {len(res['fyllda_beskrivning'])} rader")
    for k, v, ids in res['fyllda_rot'] + res['fyllda_beskrivning']:
        ut(f"   id {','.join(map(str, ids)):10} {k[1]} {k[0][:19]} {k[2]:8} {k[3]:8} -> {v}")
    ut(f"redan ifyllda (rörs inte): {res['redan']}   |   block utan värde i filen: {res['utan_varde']}")
    if res['saknas_i_db']:
        ut(f"\nBlock i filerna som inte finns i databasen (läggs INTE till): {len(res['saknas_i_db'])}")
        for k in res['saknas_i_db'][:20]:
            ut(f"   {k[1]} {k[0][:19]} {k[2]} {k[3]}")
    for k, lista in konflikter.items():
        ut(f"\nKONFLIKT (rörs inte): {k[1]} {k[0][:19]} {k[2]} {k[3]}")
        for fil, v in lista:
            ut(f"   {fil}: {v}")
    for k, e in res['fel']:
        ut(f"\nFEL {k[1]} {k[0][:19]} {k[2]} {k[3]}: {e}")
    for sokvag, e in fel_filer:
        ut(f"\nKunde inte läsa {sokvag}: {e}")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    skriv = '--skriv' in argv
    ut_fil = argv[argv.index('--ut') + 1] if '--ut' in argv else None
    sokvag = next((a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] != '--ut')), None)
    if not sokvag:
        print(__doc__)
        return 2
    filer = hitta_filer(sokvag)
    if not filer:
        print(f"Inga .hqc-filer under {sokvag}")
        return 2
    m = ladda_import()
    block, konflikter, fel_filer = samla(m, filer)
    res = kor(m, block, skriv)
    rader = []
    def ut(s=''):
        rader.append(s)
        print(s)
    rapport(filer, fel_filer, block, konflikter, res, skriv, ut)
    if ut_fil:
        with open(ut_fil, 'w', encoding='utf-8') as f:
            f.write('\n'.join(rader) + '\n')
    return 1 if (konflikter or fel_filer or res['fel']) else 0


if __name__ == '__main__':
    sys.exit(main())
