"""Test: importens rast_min_fran_sek följer samma tabell som appen (lib/__fixtures__/rast_avrundning.json).

    python scripts/test_rast_min.py

Samma tabell läses av lib/rastMin.test.ts mot TypeScript-funktionen. Bakgrund: importen trunkerade (int(1139 / 60) = 18)
medan routen /api/mom-import avrundade (Math.round → 19), så samma dag kunde stå med olika rast beroende på vem som skrev raden.
"""
import json, os, sys, tempfile, unittest, importlib.util

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        tmp = tempfile.mkdtemp(prefix='rast_min_')
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
TABELL = json.load(open(os.path.join(HAR, 'lib', '__fixtures__', 'rast_avrundning.json'), encoding='utf-8'))['rader']


class RastMin(unittest.TestCase):
    def test_tabellen(self):
        for r in TABELL:
            self.assertEqual(M.rast_min_fran_sek(r['sek']), r['min'], f"{r['sek']} s")

    def test_oskar_1139_ar_19(self):
        self.assertEqual(M.rast_min_fran_sek(1139), 19)

    def test_halvt_minut_gar_uppat_aven_for_jamna_minuter(self):
        # Pythons round() avrundar 18,5 till 18 (jämna tal) — appen gör 19. Därför egen funktion.
        self.assertEqual(M.rast_min_fran_sek(1110), 19)
        self.assertEqual(M.rast_min_fran_sek(90), 2)

    def test_saknat_ar_noll(self):
        for v in (None, -5):
            self.assertEqual(M.rast_min_fran_sek(v), 0)


if __name__ == '__main__':
    unittest.main()
