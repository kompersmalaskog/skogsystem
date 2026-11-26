"""Test: apteringsfönstrets byte — maskinens fil gäller, historik sparas, bara pendling larmar.

    python scripts/test_apteringsfonster_byte.py

Bakgrund: Gallring Santhe (11287866 / R64428_865) hade langd_max 330 i tabellen medan filerna sa 315. Importen
vägrade skriva och larmade i import_fel på varje timfil (17 larm på tre dagar). Nu skrivs det nya fönstret, det gamla
sparas i dim_objekt_sortiment_fonster_historik och bytet loggas som INFO; bara ett fält som går tillbaka till ett
värde det redan lämnat ger ett larm (FONSTER_FLIPFLOP).
"""
import logging, os, sys, tempfile, unittest, importlib.util

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        tmp = tempfile.mkdtemp(prefix='fonster_byte_')
        os.chdir(tmp)
        os.makedirs(r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer", exist_ok=True)
    try:
        spec = importlib.util.spec_from_file_location('imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
        m = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(m)
        except SystemExit:
            pass
        return m
    finally:
        os.chdir(kvar)


M = ladda_import()
SANTHE = ('11287866', 'R64428_865')


class Svar:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self._data = data if data is not None else []

    def json(self):
        return self._data


class FakeRequests:
    """Tabellerna ligger i minnet; varje anrop loggas så testet ser vad som skrevs."""

    def __init__(self, fonster=None, historik=None, historik_status=201):
        self.fonster = fonster or []
        self.historik = historik or []
        self.historik_status = historik_status
        self.poster = []   # (tabell, json)

    def get(self, url, **kw):
        if 'dim_objekt_sortiment_fonster_historik' in url:
            return Svar(200, self.historik)
        if 'dim_objekt_sortiment_fonster' in url:
            return Svar(200, self.fonster)
        return Svar(200, [])

    def post(self, url, json=None, **kw):
        tabell = url.rsplit('/', 1)[-1]
        self.poster.append((tabell, json))
        if tabell == 'dim_objekt_sortiment_fonster_historik':
            return Svar(self.historik_status)
        return Svar(201)


def fonster(langd_max=330, **extra):
    r = {'objekt_id': SANTHE[0], 'sortiment_id': SANTHE[1], 'dia_min_top_mm': 30, 'dia_max_mm': 650,
         'dia_max_butt_mm': 700, 'dia_under_bark': True, 'langd_min_cm': 270, 'langd_max_cm': langd_max,
         'filnamn': 'Gallring Santhe 2026. 2026-11-09 1537.hpr'}
    r.update(extra)
    return r


class Fonsterbyte(unittest.TestCase):
    def kor(self, fake, rader, filnamn='Gallring Santhe 2026. 2026-11-21 1111.hpr'):
        self.skrivna = []
        gammal_req, gammal_ups = M.requests, M.upsert_nyckelgrupperat
        M.requests = fake
        M.upsert_nyckelgrupperat = lambda tabell, rows, nycklar: (self.skrivna.extend(rows) or len(rows))
        try:
            with self.assertLogs(M.logger, level=logging.INFO) as logg:
                M.logger.info('start')   # assertLogs kräver minst en rad
                resultat = M.spara_apteringsfonster(rader, filnamn)
        finally:
            M.requests, M.upsert_nyckelgrupperat = gammal_req, gammal_ups
        self.logg = logg
        return resultat

    def felkoder(self, fake):
        return [j['felkod'] for t, j in fake.poster if t == 'import_fel']

    def test_santhe_byte_skrivs_historik_sparas_inget_importfel(self):
        fake = FakeRequests(fonster=[fonster(330)])
        skrivna, oforandrade, bytten = self.kor(fake, [fonster(315)])
        self.assertEqual((skrivna, oforandrade, bytten), (1, 0, 1))
        self.assertEqual(self.skrivna[0]['langd_max_cm'], 315)
        self.assertIn('uppdaterad', self.skrivna[0])
        hist = [j for t, j in fake.poster if t == 'dim_objekt_sortiment_fonster_historik']
        self.assertEqual(hist, [[{'objekt_id': '11287866', 'sortiment_id': 'R64428_865', 'falt': 'langd_max_cm',
                                  'fran_varde': '330', 'till_varde': '315',
                                  'filnamn': 'Gallring Santhe 2026. 2026-11-21 1111.hpr'}]])
        self.assertEqual(self.felkoder(fake), [])
        self.assertTrue(any('ändrat' in rad and '330 -> 315' in rad and rad.startswith('INFO')
                            for rad in self.logg.output))

    def test_historiken_skrivs_fore_fonstret(self):
        fake = FakeRequests(fonster=[fonster(330)])
        ordning = []
        orig = fake.post
        fake.post = lambda url, **kw: (ordning.append('historik' if 'historik' in url else 'annat'), orig(url, **kw))[1]
        gammal = M.upsert_nyckelgrupperat
        M.upsert_nyckelgrupperat = lambda *a: (ordning.append('fonster'), 1)[1]
        gammal_req, M.requests = M.requests, fake
        try:
            M.spara_apteringsfonster([fonster(315)], 'f.hpr')
        finally:
            M.requests, M.upsert_nyckelgrupperat = gammal_req, gammal
        self.assertEqual(ordning, ['historik', 'fonster'])

    def test_oforandrat_skriver_ingenting(self):
        fake = FakeRequests(fonster=[fonster(315)])
        self.assertEqual(self.kor(fake, [fonster(315)]), (0, 1, 0))
        self.assertEqual(fake.poster, [])
        self.assertEqual(self.skrivna, [])

    def test_nytt_objekt_skrivs_utan_historik(self):
        fake = FakeRequests()
        self.assertEqual(self.kor(fake, [fonster(315)]), (1, 0, 0))
        self.assertEqual(fake.poster, [])

    def test_en_ny_andring_efter_en_tidigare_ar_inte_pendling(self):
        # 330 -> 315 har skett (fran 330). Nu 315 -> 300: nytt värde, inte ett som lämnats.
        fake = FakeRequests(fonster=[fonster(315)],
                            historik=[{'objekt_id': SANTHE[0], 'sortiment_id': SANTHE[1],
                                       'falt': 'langd_max_cm', 'fran_varde': '330'}])
        self.kor(fake, [fonster(300)])
        self.assertEqual(self.felkoder(fake), [])
        self.assertEqual(self.skrivna[0]['langd_max_cm'], 300)

    def test_pendling_tillbaka_till_lamnat_varde_larmar_men_skriver_aven_da(self):
        fake = FakeRequests(fonster=[fonster(315)],
                            historik=[{'objekt_id': SANTHE[0], 'sortiment_id': SANTHE[1],
                                       'falt': 'langd_max_cm', 'fran_varde': '330'}])
        self.kor(fake, [fonster(330)])
        self.assertEqual(self.felkoder(fake), ['FONSTER_FLIPFLOP'])
        self.assertEqual(self.skrivna[0]['langd_max_cm'], 330)   # maskinens fil gäller
        text = [j['feltext'] for t, j in fake.poster if t == 'import_fel'][0]
        self.assertIn('langd_max_cm', text)

    def test_historik_for_annat_falt_eller_annat_objekt_ger_ingen_pendling(self):
        fake = FakeRequests(fonster=[fonster(315)],
                            historik=[{'objekt_id': SANTHE[0], 'sortiment_id': SANTHE[1],
                                       'falt': 'dia_max_mm', 'fran_varde': '330'},
                                      {'objekt_id': 'ANNAT', 'sortiment_id': SANTHE[1],
                                       'falt': 'langd_max_cm', 'fran_varde': '330'}])
        self.kor(fake, [fonster(330)])
        self.assertEqual(self.felkoder(fake), [])

    def test_boolean_och_flera_falt_i_samma_byte(self):
        fake = FakeRequests(fonster=[fonster(330)])
        self.kor(fake, [fonster(315, dia_under_bark=False)])
        hist = [j for t, j in fake.poster if t == 'dim_objekt_sortiment_fonster_historik'][0]
        self.assertEqual({(h['falt'], h['fran_varde'], h['till_varde']) for h in hist},
                         {('langd_max_cm', '330', '315'), ('dia_under_bark', 'True', 'False')})

    def test_pendling_pa_boolean(self):
        fake = FakeRequests(fonster=[fonster(330, dia_under_bark=False)],
                            historik=[{'objekt_id': SANTHE[0], 'sortiment_id': SANTHE[1],
                                       'falt': 'dia_under_bark', 'fran_varde': 'True'}])
        self.kor(fake, [fonster(330, dia_under_bark=True)])
        self.assertEqual(self.felkoder(fake), ['FONSTER_FLIPFLOP'])

    def test_saknas_historiktabellen_byts_inte_fonstret(self):
        # Migrationen ej körd: det gamla värdet får inte försvinna spårlöst.
        fake = FakeRequests(fonster=[fonster(330)], historik_status=404)
        skrivna, oforandrade, bytten = self.kor(fake, [fonster(315)])
        self.assertEqual((skrivna, bytten), (0, 1))
        self.assertEqual(self.skrivna, [])
        self.assertEqual(self.felkoder(fake), ['FONSTER_BYTTE'])

    def test_planeringen_ar_ren_och_andrar_inte_indata(self):
        rader = [fonster(315)]
        befintliga = {SANTHE: fonster(330)}
        plan = M.planera_fonsterbyten(rader, befintliga, {})
        self.assertEqual(len(plan['byten']), 1)
        self.assertEqual(plan['byten'][0]['forandringar'], [('langd_max_cm', 330, 315)])
        self.assertEqual(rader, [fonster(315)])
        self.assertEqual(befintliga, {SANTHE: fonster(330)})


if __name__ == '__main__':
    unittest.main()
