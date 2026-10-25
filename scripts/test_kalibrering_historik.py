"""Test: kalibreringshistoriken — rotstockens längdjustering, diameterbeskrivningen och backfill-skriptet (2026-10-23).

    python scripts/test_kalibrering_historik.py

Ingen nätverksåtkomst: Supabase är fejkat. Parsern läser riktig XML ur en tillfällig fil. Databasens sida (generated column
`omkalibrering`, merge-upsert) testas mot en lokal Postgres: sh supabase/tests/kalibrering_historik_lokal/kor.sh
"""
import importlib.util, os, sys, tempfile, unittest
from datetime import datetime
from urllib.parse import parse_qsl, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_vader_vid_skord import M, Svar  # noqa: E402

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location('backfill_kalib', os.path.join(HAR, 'scripts', 'backfill-kalibrering-historik.py'))
B = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(B)


def hqc(langd='', diameter=''):
    return f"""<?xml version="1.0"?>
<HarvestedProductionQualityControl>
  <HarvestingQualityControlHeader><CreationDate>2026-10-01T10:00:00+02:00</CreationDate></HarvestingQualityControlHeader>
  <Machine>
    <BaseMachineManufacturerID>R64428</BaseMachineManufacturerID>
    <MachineKey>R64428</MachineKey>
    <CalibrationValues>{langd}{diameter}</CalibrationValues>
  </Machine>
</HarvestedProductionQualityControl>"""


def langd_block(tradslag='SE1_Gran', datum='2026-08-03T10:00:00+02:00', orsak='Repair of measurement system', rot='-2', adj='-4',
                beskr='ny slang'):
    rot_tagg = f'<LengthCalibrationAdjustmentButtLog>{rot}</LengthCalibrationAdjustmentButtLog>' if rot is not None else ''
    return f"""<LengthCalibration><SpeciesGroupUserID>{tradslag}</SpeciesGroupUserID><CalibrationDate>{datum}</CalibrationDate>
      <LengthCalibrationReason>{orsak}</LengthCalibrationReason><LengthCalibrationDescription>{beskr}</LengthCalibrationDescription>
      <LengthCalibrationAdjustment lengthCalibrationPosition="550">{adj}</LengthCalibrationAdjustment>{rot_tagg}</LengthCalibration>"""


def dia_block(tradslag='SE1_Gran', datum='2026-08-03T10:00:00+02:00', orsak='Repair of measurement system', adj='56', beskr='mätte om'):
    b = f'<DiameterCalibrationDescription>{beskr}</DiameterCalibrationDescription>' if beskr is not None else ''
    return f"""<DiameterCalibration><SpeciesGroupUserID>{tradslag}</SpeciesGroupUserID><CalibrationDate>{datum}</CalibrationDate>
      <DiameterCalibrationReason>{orsak}</DiameterCalibrationReason>{b}
      <DiameterCalibrationAdjustment diameterCalibrationPosition="50">{adj}</DiameterCalibrationAdjustment></DiameterCalibration>"""


class Tmp(unittest.TestCase):
    def setUp(self):
        self.katalog = tempfile.mkdtemp(prefix='hqc_')

    def fil(self, namn, xml):
        sokvag = os.path.join(self.katalog, namn)
        with open(sokvag, 'w', encoding='utf-8') as f:
            f.write(xml)
        return sokvag

    def rader(self, namn, xml):
        return M.parse_hqc_file(self.fil(namn, xml))['kalibrering_historik']


class Parser(Tmp):
    def test_rotjusteringen_sparas_pa_langdraden(self):
        (rad,) = self.rader('a.hqc', hqc(langd=langd_block(rot='-2', adj='-4')))
        self.assertEqual((rad['typ'], rad['langd_justering_mm'], rad['langd_justering_rot_mm']), ('langd', -4, -2))

    def test_saknad_rotjustering_ar_none_aldrig_noll(self):
        (rad,) = self.rader('a.hqc', hqc(langd=langd_block(rot=None)))
        self.assertIsNone(rad['langd_justering_rot_mm'])

    def test_en_rotjustering_pa_noll_ar_noll(self):
        (rad,) = self.rader('a.hqc', hqc(langd=langd_block(rot='0')))
        self.assertEqual(rad['langd_justering_rot_mm'], 0)

    def test_tom_eller_ogiltig_rotjustering_ar_none(self):
        for text in ('', '  ', 'abc'):
            (rad,) = self.rader('a.hqc', hqc(langd=langd_block(rot=text)))
            self.assertIsNone(rad['langd_justering_rot_mm'], repr(text))

    def test_diameterbeskrivningen_sparas(self):
        (rad,) = self.rader('a.hqc', hqc(diameter=dia_block(beskr='mätte om')))
        self.assertEqual((rad['typ'], rad['beskrivning'], rad['dia_justering_mm']), ('diameter', 'mätte om', 56))
        self.assertIsNone(rad['langd_justering_rot_mm'])

    def test_saknad_diameterbeskrivning_ar_none(self):
        (rad,) = self.rader('a.hqc', hqc(diameter=dia_block(beskr=None)))
        self.assertIsNone(rad['beskrivning'])

    def test_langdbeskrivningen_ar_oforandrad(self):
        (rad,) = self.rader('a.hqc', hqc(langd=langd_block(beskr='ny slang')))
        self.assertEqual(rad['beskrivning'], 'ny slang')

    def test_orsaken_sparas_ordagrant_sa_att_databasens_markering_traffar(self):
        (rad,) = self.rader('a.hqc', hqc(diameter=dia_block(orsak='Repair of measurement system')))
        self.assertEqual(rad['orsak'], 'Repair of measurement system')

    def test_importen_skriver_aldrig_markeringen_omkalibrering(self):
        rader = self.rader('a.hqc', hqc(langd=langd_block(), diameter=dia_block()))
        self.assertTrue(rader and all('omkalibrering' not in r for r in rader))

    def test_alla_rader_har_samma_kolumner(self):
        rader = self.rader('a.hqc', hqc(langd=langd_block(), diameter=dia_block()))
        self.assertEqual(len({frozenset(r) for r in rader}), 1)


class FejkDb:
    """fakt_kalibrering_historik med riktig filtrering på de villkor skriptet använder (eq.*, is.null) och PATCH som loggas."""
    def __init__(self, rader):
        self.rader, self.patchar, self.anrop = rader, [], []

    @staticmethod
    def _q(url, params):
        q = dict(parse_qsl(urlparse(url).query))
        q.update(params or {})
        return q

    def _traffar(self, q):
        ut = list(self.rader)
        for kol, val in q.items():
            if kol == 'select':
                continue
            if val == 'is.null':
                ut = [r for r in ut if r.get(kol) is None]
            elif val.startswith('eq.'):
                ut = [r for r in ut if str(r.get(kol)) == val[3:]]
        return ut

    def get(self, url, params=None, headers=None, timeout=None):
        self.anrop.append(('GET', url, params))
        return Svar(200, [{'id': r['id']} for r in self._traffar(self._q(url, params))])

    def patch(self, url, params=None, headers=None, json=None, timeout=None):
        self.anrop.append(('PATCH', url, params))
        traff = self._traffar(self._q(url, params))
        for r in traff:
            r.update(json)
        self.patchar.append((params, json, [r['id'] for r in traff]))
        return Svar(200, [{'id': r['id']} for r in traff])


def db_rad(id_, datum, typ, tradslag='Gran', rot=None, beskrivning=None):
    return {'id': id_, 'datum': datum, 'maskin_id': 'R64428', 'tradslag': tradslag, 'typ': typ,
            'langd_justering_rot_mm': rot, 'beskrivning': beskrivning}


class Backfill(Tmp):
    def setUp(self):
        super().setUp()
        self.orig = M.requests

    def tearDown(self):
        M.requests = self.orig

    def block_av(self, *filer):
        sokvagar = [self.fil(n, x) for n, x in filer]
        return B.samla(M, sokvagar)

    def test_torrkorning_skriver_ingenting_och_rapporterar_vad_som_skulle_fyllas(self):
        block, konflikter, fel = self.block_av(('a.hqc', hqc(langd=langd_block(rot='-2'), diameter=dia_block(datum='2026-08-04T10:00:00+02:00'))))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd'), db_rad(2, '2026-08-04T10:00:00', 'diameter')])
        res = B.kor(M, block, skriv=False)
        self.assertEqual([x[2] for x in res['fyllda_rot']], [[1]])
        self.assertEqual([x[2] for x in res['fyllda_beskrivning']], [[2]])
        self.assertEqual(db.patchar, [])
        self.assertTrue(all(a[0] == 'GET' for a in db.anrop))
        self.assertIsNone(db.rader[0]['langd_justering_rot_mm'])

    def test_skriv_fyller_i_bara_de_tva_kolumnerna(self):
        block, _, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot='-2'), diameter=dia_block(datum='2026-08-04T10:00:00+02:00'))))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd'), db_rad(2, '2026-08-04T10:00:00', 'diameter')])
        B.kor(M, block, skriv=True)
        self.assertEqual(db.rader[0]['langd_justering_rot_mm'], -2)
        self.assertEqual(db.rader[1]['beskrivning'], 'mätte om')
        self.assertEqual({k for _, body, _ in db.patchar for k in body}, {'langd_justering_rot_mm', 'beskrivning'})

    def test_ett_varde_som_redan_finns_skrivs_aldrig_over(self):
        block, _, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot='-2'))))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd', rot=7)])
        res = B.kor(M, block, skriv=True)
        self.assertEqual(db.rader[0]['langd_justering_rot_mm'], 7)
        self.assertEqual((res['redan'], res['fyllda_rot']), (1, []))
        self.assertTrue(all(p.get('langd_justering_rot_mm') == 'is.null' for p, _, _ in db.patchar))

    def test_omkorning_andrar_inget(self):
        block, _, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot='-2'))))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd')])
        B.kor(M, block, skriv=True)
        efter_forsta = [dict(r) for r in db.rader]
        res = B.kor(M, block, skriv=True)
        self.assertEqual(db.rader, efter_forsta)
        self.assertEqual(res['fyllda_rot'], [])

    def test_en_saknad_rotjustering_ar_inget_att_skriva(self):
        block, _, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot=None))))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd')])
        res = B.kor(M, block, skriv=True)
        self.assertEqual((db.patchar, res['utan_varde']), ([], 1))
        self.assertIsNone(db.rader[0]['langd_justering_rot_mm'])

    def test_en_nolla_i_filen_skrivs_som_noll(self):
        block, _, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot='0'))))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd')])
        B.kor(M, block, skriv=True)
        self.assertEqual(db.rader[0]['langd_justering_rot_mm'], 0)

    def test_ett_block_som_inte_finns_i_databasen_laggs_inte_till(self):
        block, _, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot='-2'))))
        db = M.requests = FejkDb([])
        res = B.kor(M, block, skriv=True)
        self.assertEqual((len(res['saknas_i_db']), db.patchar, db.rader), (1, [], []))

    def test_ackumulerande_filer_raknas_en_gang(self):
        block, konflikter, _ = self.block_av(('a.hqc', hqc(langd=langd_block())), ('b.hqc', hqc(langd=langd_block())))
        self.assertEqual((len(block), konflikter), (1, {}))
        self.assertEqual(list(block.values())[0]['filer'], ['a.hqc', 'b.hqc'])

    def test_filer_som_sager_emot_varandra_ger_konflikt_och_blocket_rors_inte(self):
        block, konflikter, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot='-2'))), ('b.hqc', hqc(langd=langd_block(rot='5'))))
        self.assertEqual((block, len(konflikter)), ({}, 1))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd')])
        B.kor(M, block, skriv=True)
        self.assertEqual(db.patchar, [])

    def test_en_trasig_fil_stoppar_inte_resten(self):
        block, _, fel = self.block_av(('a.hqc', 'inte xml'), ('b.hqc', hqc(langd=langd_block(rot='-2'))))
        self.assertEqual((len(block), len(fel)), (1, 1))

    def test_databasfel_rapporteras_och_andra_block_fortsatter(self):
        block, _, _ = self.block_av(('a.hqc', hqc(langd=langd_block(rot='-2', tradslag='SE1_Gran') + langd_block(rot='3', tradslag='SE1_Tall'))))
        db = M.requests = FejkDb([db_rad(1, '2026-08-03T10:00:00', 'langd', 'Gran'), db_rad(2, '2026-08-03T10:00:00', 'langd', 'Tall')])
        orig_patch = db.patch
        db.patch = lambda url, params=None, **kw: Svar(400, 'column does not exist') if 'Gran' in params['tradslag'] else orig_patch(url, params=params, **kw)
        res = B.kor(M, block, skriv=True)
        self.assertEqual(len(res['fel']), 1)
        self.assertEqual(db.rader[1]['langd_justering_rot_mm'], 3)


class Anslutning(Tmp):
    """Första körningen gav 401 "No API key found" på varje läsning: skriptet laddade importmodulen men anropade aldrig
    init_supabase(), som är det som fyller SUPABASE_HEADERS. FejkDb ser aldrig headrarna, så ingen test fångade det."""
    def setUp(self):
        super().setUp()
        self.orig_ladda, self.orig_req = B.ladda_import, M.requests
        self.orig_headers = getattr(M, 'SUPABASE_HEADERS', None)
        self.orig_init = M.init_supabase

    def tearDown(self):
        B.ladda_import, M.requests = self.orig_ladda, self.orig_req
        M.SUPABASE_HEADERS, M.init_supabase = self.orig_headers, self.orig_init

    def kor_main(self, init_ok):
        M.SUPABASE_HEADERS = {}                     # som i en nyladdad importmodul
        anrop = {'init': 0, 'utan_nyckel': 0}

        def init():
            anrop['init'] += 1
            if init_ok:
                M.SUPABASE_HEADERS = {'apikey': 'k', 'Authorization': 'Bearer k'}
            return init_ok

        class Strikt(FejkDb):
            def get(s, url, params=None, headers=None, timeout=None):
                if not (headers or {}).get('apikey'):
                    anrop['utan_nyckel'] += 1
                return super().get(url, params, headers, timeout)

        M.init_supabase = init
        M.requests = Strikt([db_rad(1, '2026-08-03T10:00:00', 'langd')])
        B.ladda_import = lambda: M
        self.fil('a.hqc', hqc(langd=langd_block(rot='-2')))
        import io, contextlib
        with contextlib.redirect_stdout(io.StringIO()):
            kod = B.main([self.katalog])
        return kod, anrop

    def test_main_initierar_supabase_sa_att_varje_lasning_har_nyckel(self):
        kod, anrop = self.kor_main(True)
        self.assertEqual(anrop['init'], 1)
        self.assertEqual(anrop['utan_nyckel'], 0)
        self.assertEqual(kod, 0)

    def test_utan_anslutning_stannar_skriptet_med_exit_2_och_ror_inte_databasen(self):
        kod, anrop = self.kor_main(False)
        self.assertEqual(kod, 2)
        self.assertEqual(anrop['utan_nyckel'], 0)


class Kallkod(unittest.TestCase):
    def test_skriptet_skriver_bara_de_tva_kolumnerna_och_aldrig_raderar_eller_skapar(self):
        with open(os.path.join(HAR, 'scripts', 'backfill-kalibrering-historik.py'), encoding='utf-8') as f:
            src = f.read()
        self.assertNotIn('requests.post', src)
        self.assertNotIn('requests.delete', src)
        self.assertEqual(src.count('requests.patch'), 1)
        self.assertIn("kolumn: 'is.null'", src)

    def test_importen_skickar_nya_kolumnen_pa_varje_historikrad(self):
        with open(os.path.join(HAR, 'skogsmaskin_import_version_6.py'), encoding='utf-8') as f:
            src = f.read()
        self.assertEqual(src.count("'langd_justering_rot_mm'"), 2)    # längdraden (värdet) + diameterraden (None)


if __name__ == '__main__':
    unittest.main()
