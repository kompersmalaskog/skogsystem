"""Test: vilka statusrader gap_check.py skriver, och att den inte läser import_fel.

Bakgrund (2026-11-25): importfel bevakas i databasen (pg_cron-jobbet 'import-larm' →
import_larm_kontroll() → raden 'import_live' i meta_datahalsa_status + notis till admin).
gap_check.py ska därför
  - inte läsa tabellen import_fel alls,
  - inte skriva samlingsraden 'gap_check',
  - fortfarande skriva en rad per kontroll som bara importdatorn kan göra.

Ingen nätverksåtkomst och ingen databas: kontrollerna och urllib är utbytta.

Kör:  python scripts/test_gap_check_statusrader.py
"""
import os, sys, io, json, tempfile, unittest, importlib

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)
os.chdir(REPO)
# Importmodulen kräver nycklar när den laddas. Testet når aldrig nätet (urllib och kontrollerna är utbytta).
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')

gp = importlib.import_module('gap_check')

FORVANTADE_RADER = {
    'fakt_tid_mot_mom', 'deploy_drift', 'stammar_utan_stockar',
    'fakt_sortiment_mot_stock', 'parkerade_filer', 'inkommande_ko',
}


class _Svar:
    def read(self):
        return b'[]'


class StatusraderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.anrop = []          # (metod, url, kropp)
        self._spara = {}
        for namn in ('GAP_LOG', 'LARM_FIL', '_ensure_creds', 'check_invarianter', 'discover_machines',
                     'mom_ceiling', 'db_day_pt', 'check_deploy_drift', 'check_stammar_utan_stockar',
                     'check_fakt_sortiment_mot_stock', 'check_parkerade_filer', 'check_inkommande_ko'):
            self._spara[namn] = getattr(gp, namn)
        self._urlopen = gp.urllib.request.urlopen
        self._init = gp.imp.init_supabase
        self._argv = sys.argv

        gp.GAP_LOG = os.path.join(self.tmp, 'gap_logg.txt')
        gp.LARM_FIL = os.path.join(self.tmp, 'gap_LARM_senaste.txt')
        gp.imp.init_supabase = lambda: None
        gp.imp.SUPABASE_URL = 'http://fake'
        gp.imp.SUPABASE_KEY = 'fake'
        gp._ensure_creds = lambda: None
        # Allt grönt som utgångsläge; varje test ändrar det den provar.
        gp.check_invarianter = lambda: ([], 1611, 0)
        gp.discover_machines = lambda: ['M1']
        gp.mom_ceiling = lambda maskin, dayset: {}
        gp.db_day_pt = lambda maskin, dayset: {}
        gp.check_deploy_drift = lambda: ([], 'OK', 'OK — 9 importfiler byte-identiska med origin/main (abc)')
        gp.check_stammar_utan_stockar = lambda: ([], 0)
        gp.check_fakt_sortiment_mot_stock = lambda: ([], 0)
        gp.check_parkerade_filer = lambda: ([], 0)
        gp.check_inkommande_ko = lambda: ([], 0)

        def fake_urlopen(req, timeout=None):
            self.anrop.append((req.get_method(), req.full_url, req.data))
            return _Svar()
        gp.urllib.request.urlopen = fake_urlopen
        sys.argv = ['gap_check.py', '--quiet']

    def tearDown(self):
        for namn, v in self._spara.items():
            setattr(gp, namn, v)
        gp.urllib.request.urlopen = self._urlopen
        gp.imp.init_supabase = self._init
        sys.argv = self._argv

    def kor(self):
        with self.assertRaises(SystemExit) as slut:
            gp.main()
        rader = {}
        for metod, url, kropp in self.anrop:
            if 'meta_datahalsa_status' in url and metod == 'POST':
                rad = json.loads(kropp.decode('utf-8'))
                rader[rad['id']] = rad
        return slut.exception.code, rader

    def test_skriver_en_rad_per_kontroll_och_ingen_gap_check_rad(self):
        kod, rader = self.kor()
        self.assertEqual(kod, 0)
        self.assertEqual(set(rader), FORVANTADE_RADER)
        self.assertNotIn('gap_check', rader)
        self.assertTrue(all(r['status'] == 'OK' and r['larm_antal'] == 0 for r in rader.values()))

    def test_laser_aldrig_import_fel(self):
        self.kor()
        self.assertEqual([u for _, u, _ in self.anrop if 'import_fel' in u], [])
        with open(gp.GAP_LOG, encoding='utf-8') as fh:
            logg = fh.read()
        self.assertNotIn('import_fel', logg)
        self.assertNotIn('IMPORTFEL', logg)

    def test_raderar_ingenting(self):
        self.kor()
        self.assertEqual([m for m, _, _ in self.anrop if m not in ('POST', 'GET')], [])

    def test_mom_gap_larmar_pa_sin_egen_rad(self):
        dag = sorted(gp.window_days(14))[-1]
        gp.mom_ceiling = lambda maskin, dayset: {dag: 10 * 3600}
        gp.db_day_pt = lambda maskin, dayset: {dag: 5 * 3600}
        kod, rader = self.kor()
        self.assertEqual(kod, 1)
        self.assertEqual(rader['fakt_tid_mot_mom']['status'], 'LARM')
        self.assertEqual(rader['fakt_tid_mot_mom']['larm_antal'], 1)
        self.assertIn('under-count', rader['fakt_tid_mot_mom']['sammanfattning'])
        self.assertIn('M1', rader['fakt_tid_mot_mom']['sammanfattning'])
        # De andra kontrollerna smittas inte.
        self.assertEqual(rader['parkerade_filer']['status'], 'OK')

    def test_invariantlarm_hamnar_pa_fakt_tid_raden(self):
        gp.check_invarianter = lambda: (['  LARM  M1 2026-11-20 motortid 26.0h > 24h'], 1611, 0)
        kod, rader = self.kor()
        self.assertEqual(kod, 1)
        self.assertEqual(rader['fakt_tid_mot_mom']['status'], 'LARM')
        self.assertIn('26.0h', rader['fakt_tid_mot_mom']['sammanfattning'])

    def test_parkerade_filer_larmar_utan_att_fakt_tid_raden_gor_det(self):
        gp.check_parkerade_filer = lambda: (['  LARM  OIMPORTERADE FILER i _vanta_stor_hpr: 5 st'], 5)
        kod, rader = self.kor()
        self.assertEqual(kod, 1)                      # exitkoden larmar fortfarande
        self.assertEqual(rader['parkerade_filer']['status'], 'LARM')
        self.assertEqual(rader['fakt_tid_mot_mom']['status'], 'OK')

    def test_kontroll_som_inte_gick_att_gora_ar_okand_inte_ok(self):
        gp.check_inkommande_ko = lambda: ([], None)
        _, rader = self.kor()
        self.assertEqual(rader['inkommande_ko']['status'], 'OKÄND')

    def test_kallan_namner_inte_den_borttagna_kontrollen(self):
        with open(os.path.join(REPO, 'gap_check.py'), encoding='utf-8') as fh:
            kalla = fh.read()
        self.assertNotIn('def check_import_fel', kalla)
        self.assertNotIn('check_import_fel()', kalla)
        self.assertNotIn("/rest/v1/import_fel", kalla)
        self.assertNotIn("'id': 'gap_check'", kalla)


if __name__ == '__main__':
    unittest.main()
