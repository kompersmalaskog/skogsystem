"""Test: en ny MOM-fil får bara UTÖKA ett befintligt pass i fakt_skift (tidigaste inloggning, senaste utloggning).

    python scripts/test_skift_kuvert.py

Ingen nätverksåtkomst: requests byts mot en attrapp med en riktig (liten) fakt_skift-tabell, så testet ser exakt vad som
läses och SKRIVS.

Bakgrund: R64428 2026-10-12 (Oskar). Passet 07:04–15:14 blev 13:49–14:52 när Sandåsen-filen (exporterad 2026-10-14, bär
bara Sandåsens del av dagen) importerades. Sammanslagningen "inloggning = min, utloggning = max" fanns, men var best
effort: kunde den befintliga raden inte läsas blev det ingen sammanslagning och upserten skrev filens egna tider rakt
över. Arbetsdagen blev 45 min i stället för 471. Fixturen nedan är Oskars dag med prodvärdena.
"""
import os, sys, json, tempfile, unittest, importlib.util
from datetime import datetime

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Importmodulen avbryter utan Supabase-uppgifter och loggar till en Windows-sökväg (OneDrive). Testet pratar aldrig med
# nätet, så attrappvärden räcker; utanför Windows läggs loggkatalogen (ett enda mappnamn med backslash) i en tillfällig
# katalog så inget skräp hamnar i repot.
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        tmp = tempfile.mkdtemp(prefix='skift_kuvert_')
        os.chdir(tmp)
        os.makedirs(r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer", exist_ok=True)
    try:
        spec = importlib.util.spec_from_file_location(
            'imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
        m = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(m)
        except SystemExit:
            pass
        return m
    finally:
        os.chdir(kvar)


M = ladda_import()
M.SKIFT_LAS_PAUS_SEK = 0          # inga riktiga sömnpauser i testet

NYCKEL = 'SYN_2026-10-12_R64428_8'


class Svar:
    def __init__(self, kod=200, kropp=None):
        self.status_code = kod
        self._kropp = kropp if kropp is not None else []
        self.text = json.dumps(self._kropp)
        self.ok = kod < 400

    def json(self):
        return self._kropp


class Attrapp:
    """requests-attrapp med en riktig fakt_skift-tabell. `las_fel` styr vad GET mot fakt_skift gör (en lista, ett värde
    per anrop; tom lista = fungerar): 'http500', 'timeout' eller None (fungerar)."""
    def __init__(self, rader, las_fel=None):
        self.db = [dict(r) for r in rader]
        self.las_fel = list(las_fel or [])
        self.log = []
        self.import_fel = []

    # Postgres/PostgREST lämnar tillbaka timestamptz som text, med avslutande nollor i sekundbråket borta
    def get(self, url, params=None, **kw):
        self.log.append(('GET', url.rsplit('/', 1)[-1], dict(params or {})))
        if url.endswith('/fakt_skift'):
            fel = self.las_fel.pop(0) if self.las_fel else None
            if fel == 'timeout':
                raise TimeoutError('read timed out')
            if fel == 'http500':
                return Svar(500, {'message': 'boom'})
            filt = {k: v[3:] for k, v in (params or {}).items() if k in ('maskin_id', 'datum', 'shift_key')}
            traff = [r for r in self.db if all(str(r.get(k)) == v for k, v in filt.items())]
            sel = [c for c in (params or {}).get('select', '').split(',') if c]
            return Svar(200, [{c: r.get(c) for c in sel} if sel else dict(r) for r in traff])
        return Svar(200, [])

    def post(self, url, json=None, headers=None, **kw):
        tabell = url.split('/rest/v1/')[-1].split('?')[0]
        self.log.append(('POST', tabell, json))
        if tabell == 'fakt_skift':
            for n in json:
                lagrad = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in n.items()}
                for r in self.db:
                    if (r['maskin_id'], r['datum'], r['shift_key']) == (lagrad['maskin_id'], str(lagrad['datum']), lagrad['shift_key']):
                        r.update(lagrad)
                        break
                else:
                    self.db.append(lagrad)
        elif tabell == 'import_fel':
            self.import_fel.append(json)
        return Svar(201, [])

    def patch(self, url, **kw):
        self.log.append(('PATCH', url.rsplit('/', 1)[-1], kw.get('data')))
        return Svar(204)

    def delete(self, url, **kw):
        self.log.append(('DELETE', url.rsplit('/', 1)[-1], None))
        return Svar(204)

    def skrivningar_till_skift(self):
        return [l for l in self.log if l[0] == 'POST' and l[1] == 'fakt_skift']


# ── Oskars dag, prodvärden ──
# Befintligt pass i databasen (före 2026-10-14): Toftåsa-filen gav starten, den tidigare Sandåsen-versionen slutet.
# Sekundbråken är valda så att PostgREST klipper bort avslutande nollor: .4 (1 siffra), .80883 (5 siffror).
OSKAR_BEFINTLIGT = {
    'id': 69971, 'maskin_id': 'R64428', 'datum': '2026-10-12', 'operator_id': 'R64428_8', 'shift_key': NYCKEL,
    'inloggning_tid': '2026-10-12T07:04:20.4+00:00',
    'utloggning_tid': '2026-10-12T15:14:10.80883+00:00',
    'maskin_inloggning_tid': '2026-10-12T07:04:07.329814+00:00',
    'langd_sek': 29390, 'filnamn': 'Toftåsa gallring 2026 2026-10-12 1253.mom',
}


def sandasen_filen():
    """Raden Sandåsen-filen (2026-10-14 1303) ger för 2026-10-12: bara Sandåsens del av dagen."""
    return {
        'datum': datetime(2026, 10, 12).date(), 'maskin_id': 'R64428', 'operator_id': 'R64428_8',
        'inloggning_tid': datetime(2026, 10, 12, 13, 49, 44, 808830),
        'maskin_inloggning_tid': datetime(2026, 10, 12, 7, 4, 7, 329814),
        'utloggning_tid': datetime(2026, 10, 12, 14, 52, 45, 261796),
        'langd_sek': 3780, 'filnamn': 'Sandåsen gallring 2025 2026-10-14 1303.mom', 'shift_key': NYCKEL,
        'gps_lat': None, 'gps_long': None, 'logout_lat': None, 'logout_lon': None,
    }


def importera(attrapp, *rader):
    M.requests = attrapp
    return M.save_mom_to_supabase({'skift': [dict(r) for r in rader]})


class OskarsDag(unittest.TestCase):
    def test_sandasen_filen_kortar_inte_oskars_pass(self):
        a = Attrapp([OSKAR_BEFINTLIGT])
        importera(a, sandasen_filen())
        r = a.db[0]
        self.assertEqual(r['inloggning_tid'][:19], '2026-10-12T07:04:20')     # tidigaste
        self.assertEqual(r['utloggning_tid'][:19], '2026-10-12T15:14:10')     # senaste
        self.assertEqual(r['langd_sek'], 29390)                              # spännet 07:04:20.4 → 15:14:10.80883
        self.assertTrue(r['maskin_inloggning_tid'].startswith('2026-10-12T07:04:07'))

    def test_filens_saknade_maskininloggning_raderar_inte_den_som_finns(self):
        sen = sandasen_filen()
        sen['maskin_inloggning_tid'] = None
        a = Attrapp([OSKAR_BEFINTLIGT])
        importera(a, sen)
        self.assertTrue(a.db[0]['maskin_inloggning_tid'].startswith('2026-10-12T07:04:07'))

    def test_samma_resultat_om_filen_importeras_igen(self):
        a = Attrapp([OSKAR_BEFINTLIGT])
        importera(a, sandasen_filen())
        forsta = dict(a.db[0])
        importera(a, sandasen_filen())
        self.assertEqual({k: a.db[0][k] for k in ('inloggning_tid', 'utloggning_tid', 'langd_sek')},
                         {k: forsta[k] for k in ('inloggning_tid', 'utloggning_tid', 'langd_sek')})

    def test_en_fil_som_forlanger_passet_far_forlanga_det(self):
        sen = sandasen_filen()
        sen['utloggning_tid'] = datetime(2026, 10, 12, 15, 40, 0)
        a = Attrapp([OSKAR_BEFINTLIGT])
        importera(a, sen)
        self.assertEqual(a.db[0]['utloggning_tid'][:19], '2026-10-12T15:40:00')
        self.assertEqual(a.db[0]['inloggning_tid'][:19], '2026-10-12T07:04:20')

    def test_passet_finns_inte_skrivs_som_filen_sager(self):
        a = Attrapp([])
        importera(a, sandasen_filen())
        self.assertEqual(len(a.db), 1)
        self.assertEqual(a.db[0]['inloggning_tid'][:19], '2026-10-12T13:49:44')
        self.assertEqual(a.import_fel, [])


class LasningenFallerUtan(unittest.TestCase):
    """Kan det befintliga passet inte läsas skrivs raden INTE (förut: tyst överskrivning)."""

    def _kor(self, las_fel):
        a = Attrapp([OSKAR_BEFINTLIGT], las_fel=las_fel)
        importera(a, sandasen_filen())
        return a

    def test_http_500_overskriver_inte(self):
        a = self._kor(['http500'] * 3)
        self.assertEqual(a.skrivningar_till_skift(), [])
        self.assertEqual(a.db[0]['inloggning_tid'], OSKAR_BEFINTLIGT['inloggning_tid'])
        self.assertEqual(a.db[0]['utloggning_tid'], OSKAR_BEFINTLIGT['utloggning_tid'])

    def test_timeout_overskriver_inte(self):
        a = self._kor(['timeout'] * 3)
        self.assertEqual(a.skrivningar_till_skift(), [])
        self.assertEqual(a.db[0]['utloggning_tid'], OSKAR_BEFINTLIGT['utloggning_tid'])

    def test_felet_syns_i_import_fel(self):
        a = self._kor(['http500'] * 3)
        self.assertEqual(len(a.import_fel), 1)
        self.assertEqual(a.import_fel[0]['tabell'], 'fakt_skift')
        self.assertEqual(a.import_fel[0]['felkod'], 'skift_kuvert_las')
        self.assertIn(NYCKEL, a.import_fel[0]['feltext'])
        self.assertIn('HTTP 500', a.import_fel[0]['feltext'])

    def test_ett_enstaka_fel_klaras_av_omforsok(self):
        a = self._kor(['http500', 'timeout'])      # tredje försöket går bra
        self.assertEqual(a.db[0]['inloggning_tid'][:19], '2026-10-12T07:04:20')
        self.assertEqual(a.db[0]['utloggning_tid'][:19], '2026-10-12T15:14:10')
        self.assertEqual(a.import_fel, [])

    def test_omforsok_ar_begransade(self):
        a = self._kor(['http500'] * 10)
        lasningar = [l for l in a.log if l[0] == 'GET' and l[1] == 'fakt_skift']
        self.assertEqual(len(lasningar), 3)       # tre försök, inte fler: ett nedtimat nät ska inte hängas på

    def test_en_oklarbar_tid_i_databasen_ar_inte_saknas(self):
        trasig = dict(OSKAR_BEFINTLIGT, utloggning_tid='inte-en-tid')
        a = Attrapp([trasig])
        importera(a, sandasen_filen())
        self.assertEqual(a.skrivningar_till_skift(), [])
        self.assertEqual(a.db[0]['utloggning_tid'], 'inte-en-tid')
        self.assertEqual(len(a.import_fel), 1)

    def test_ett_ologsbart_pass_hindrar_inte_de_andra_i_filen(self):
        andra = dict(sandasen_filen(), datum=datetime(2026, 10, 13).date(), shift_key='SYN_2026-10-13_R64428_8',
                     inloggning_tid=datetime(2026, 10, 13, 7, 1, 3), utloggning_tid=datetime(2026, 10, 13, 16, 53, 8))
        a = Attrapp([OSKAR_BEFINTLIGT], las_fel=['http500'] * 3)   # bara första passets läsning faller
        importera(a, sandasen_filen(), andra)
        nycklar = sorted(r['shift_key'] for r in a.db)
        self.assertEqual(nycklar, ['SYN_2026-10-12_R64428_8', 'SYN_2026-10-13_R64428_8'])
        self.assertEqual(a.db[0]['utloggning_tid'], OSKAR_BEFINTLIGT['utloggning_tid'])      # Oskar 12/10 orörd
        self.assertTrue(any(r['shift_key'] == 'SYN_2026-10-13_R64428_8' for r in a.db))     # 13/10 skrevs


class Tidstolkning(unittest.TestCase):
    """PostgREST klipper avslutande nollor ("…44.808830" → ".80883"); Python före 3.11 tolkar bara 3 eller 6 siffror."""

    def test_brak_med_alla_langder(self):
        for s, forvantat in [
            ('2026-10-12T13:49:44.80883+00:00', datetime(2026, 10, 12, 13, 49, 44, 808830)),
            ('2026-10-12T07:04:20.4+00:00', datetime(2026, 10, 12, 7, 4, 20, 400000)),
            ('2026-10-12T07:04:20.12+00:00', datetime(2026, 10, 12, 7, 4, 20, 120000)),
            ('2026-10-12T07:04:20.123+00:00', datetime(2026, 10, 12, 7, 4, 20, 123000)),
            ('2026-10-12T07:04:20.1234+00:00', datetime(2026, 10, 12, 7, 4, 20, 123400)),
            ('2026-10-12T07:04:20.808830+00:00', datetime(2026, 10, 12, 7, 4, 20, 808830)),
            ('2026-10-12T07:04:20+00:00', datetime(2026, 10, 12, 7, 4, 20)),
            ('2026-10-12T07:04:20', datetime(2026, 10, 12, 7, 4, 20)),
        ]:
            self.assertEqual(M.parse_datetime(s), forvantat, s)

    def test_parse_datetime_gar_via_normaliseraren(self):
        anrop = []
        riktig = M.normalisera_sekundbrak
        M.normalisera_sekundbrak = lambda s: (anrop.append(s), riktig(s))[1]
        try:
            M.parse_datetime('2026-10-12T13:49:44.80883+00:00')
        finally:
            M.normalisera_sekundbrak = riktig
        self.assertEqual(anrop, ['2026-10-12T13:49:44.80883'])

    def test_sekundbraket_normaliseras_till_sex_siffror(self):
        # På strängnivå, så att testet också fångar felet på en Python som själv tolkar alla längder (3.13 gör det).
        for s, forvantat in [
            ('2026-10-12T13:49:44.80883', '2026-10-12T13:49:44.808830'),     # Oskars inloggning, så som PostgREST ger den
            ('2026-10-12T07:04:20.4', '2026-10-12T07:04:20.400000'),
            ('2026-10-12T07:04:20.12', '2026-10-12T07:04:20.120000'),
            ('2026-10-12T07:04:20.1234567', '2026-10-12T07:04:20.123456'),   # fler än sex klipps, avrundas inte
            ('2026-10-12T07:04:20.808830', '2026-10-12T07:04:20.808830'),
            ('2026-10-12T07:04:20', '2026-10-12T07:04:20'),
        ]:
            self.assertEqual(M.normalisera_sekundbrak(s), forvantat, s)

    def test_skrap_ger_none(self):
        for s in ('', None, 'inte-en-tid', '2026-13-45T99:99:99'):
            self.assertIsNone(M.parse_datetime(s), repr(s))


class RenSammanslagning(unittest.TestCase):
    def _t(self, h, m=0, s=0):
        return datetime(2026, 10, 12, h, m, s)

    def test_andrar_inte_indatan(self):
        rad = {'inloggning_tid': self._t(13, 49), 'utloggning_tid': self._t(14, 52), 'langd_sek': 3780}
        kopia = dict(rad)
        M.sla_ihop_skift_kuvert(rad, {'inloggning_tid': self._t(7), 'utloggning_tid': self._t(15), 'maskin_inloggning_tid': None})
        self.assertEqual(rad, kopia)

    def test_bara_utoka(self):
        rad = {'inloggning_tid': self._t(13, 49), 'utloggning_tid': self._t(14, 52), 'langd_sek': 0}
        for bef_in, bef_ut, ar_in, ar_ut in [
            (self._t(7), self._t(15), self._t(7), self._t(15)),            # filen ligger inuti passet → passet består
            (self._t(14), self._t(14, 30), self._t(13, 49), self._t(14, 52)),   # passet ligger inuti filen → filen utökar
            (self._t(7), self._t(14, 10), self._t(7), self._t(14, 52)),
            (self._t(15), self._t(16), self._t(13, 49), self._t(16)),
        ]:
            ut = M.sla_ihop_skift_kuvert(rad, {'inloggning_tid': bef_in, 'utloggning_tid': bef_ut, 'maskin_inloggning_tid': None})
            self.assertEqual((ut['inloggning_tid'], ut['utloggning_tid']), (ar_in, ar_ut))
            self.assertEqual(ut['langd_sek'], int((ar_ut - ar_in).total_seconds()))

    def test_maskininloggning_tappas_inte_och_tidigaste_gar_fore(self):
        rad = {'inloggning_tid': self._t(13), 'utloggning_tid': self._t(14), 'maskin_inloggning_tid': None}
        ut = M.sla_ihop_skift_kuvert(rad, {'inloggning_tid': None, 'utloggning_tid': None, 'maskin_inloggning_tid': self._t(7, 4, 7)})
        self.assertEqual(ut['maskin_inloggning_tid'], self._t(7, 4, 7))
        rad['maskin_inloggning_tid'] = self._t(8)
        ut = M.sla_ihop_skift_kuvert(rad, {'inloggning_tid': None, 'utloggning_tid': None, 'maskin_inloggning_tid': self._t(7, 4, 7)})
        self.assertEqual(ut['maskin_inloggning_tid'], self._t(7, 4, 7))

    def test_utan_befintligt_pass_oforandrat(self):
        rad = {'inloggning_tid': self._t(13, 49), 'utloggning_tid': self._t(14, 52), 'langd_sek': 1}
        ut = M.sla_ihop_skift_kuvert(rad, None)
        self.assertEqual((ut['inloggning_tid'], ut['utloggning_tid']), (rad['inloggning_tid'], rad['utloggning_tid']))


if __name__ == '__main__':
    unittest.main(verbosity=2)
