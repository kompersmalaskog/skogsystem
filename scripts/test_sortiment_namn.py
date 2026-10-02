"""Test: importern får aldrig skriva över ett befintligt sortimentsnamn med tom sträng.

    python scripts/test_sortiment_namn.py

Ingen nätverksåtkomst: uppslaget mot dim_sortiment och själva skrivningen byts
ut mot attrapper, så testet ser exakt vad som SKICKAS till databasen.
Bakgrund: 2026-10-02 hade elva sortiment tomt namn (grupp NULL, massaved syntes
inte) — HPR-vägen skickade namnlösa sortiment med namn='' och merge-duplicates
skrev över. Se skogsmaskin_import_version_6.sortiment_utan_namn_for_skrivning.
"""
import os, sys, unittest, importlib.util

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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

BEFINTLIG = {'sortiment_id': 'PONS_299', 'product_key': '299', 'namn': '',
             'maskin_id': 'PONS', 'produktgrupp': 'Massa', 'kundkod': '100-1'}
NY = {'sortiment_id': 'PONS_777', 'product_key': '777', 'namn': '', 'maskin_id': 'PONS'}


class HarNamn(unittest.TestCase):
    def test_tom_och_blanksteg_ar_tomt(self):
        self.assertFalse(M.har_namn({'namn': ''}))
        self.assertFalse(M.har_namn({'namn': '   '}))
        self.assertFalse(M.har_namn({'namn': None}))
        self.assertFalse(M.har_namn({}))

    def test_riktigt_namn(self):
        self.assertTrue(M.har_namn({'namn': 'Massa: BmavFall_V3'}))


class UtanNamnForSkrivning(unittest.TestCase):
    def test_befintligt_sortiment_skickas_utan_namnnyckel(self):
        ut = M.sortiment_utan_namn_for_skrivning([BEFINTLIG], {'PONS_299'})
        self.assertEqual(len(ut), 1)
        self.assertNotIn('namn', ut[0])               # DET HÄR är fixen
        self.assertEqual(ut[0]['produktgrupp'], 'Massa')   # övriga fält får fortfarande fyllas
        self.assertEqual(ut[0]['kundkod'], '100-1')

    def test_nytt_sortiment_laggs_till_som_forut(self):
        ut = M.sortiment_utan_namn_for_skrivning([NY], {'PONS_299'})
        self.assertEqual(ut[0], NY)
        self.assertEqual(ut[0]['namn'], '')

    def test_kunde_inte_lasa_ror_inga_namn(self):
        ut = M.sortiment_utan_namn_for_skrivning([BEFINTLIG, NY], None)
        self.assertTrue(all('namn' not in r for r in ut))

    def test_originalet_andras_inte(self):
        M.sortiment_utan_namn_for_skrivning([BEFINTLIG], {'PONS_299'})
        self.assertEqual(BEFINTLIG['namn'], '')       # kopian, inte raden

    def test_rad_med_namn_ror_vi_inte(self):
        med = {'sortiment_id': 'PONS_5', 'namn': 'Timmer: X'}
        self.assertEqual(M.sortiment_utan_namn_for_skrivning([med], {'PONS_5'}), [med])


class SkrivSortimentUtanNamn(unittest.TestCase):
    """Hela vägen: uppslag + gruppering + vad som faktiskt skickas."""

    def setUp(self):
        self.skickat = []
        self._gammal = (M.hamta_befintliga_sortiment_id, M.upsert_nyckelgrupperat)
        M.upsert_nyckelgrupperat = lambda tabell, rader, nyckel: (
            self.skickat.append((tabell, [dict(r) for r in rader], nyckel)) or len(rader))

    def tearDown(self):
        M.hamta_befintliga_sortiment_id, M.upsert_nyckelgrupperat = self._gammal

    def test_blandat_befintligt_och_nytt(self):
        M.hamta_befintliga_sortiment_id = lambda ids: {'PONS_299'}
        antal = M.skriv_sortiment_utan_namn([BEFINTLIG, NY])
        self.assertEqual(antal, 2)
        tabell, rader, nyckel = self.skickat[0]
        self.assertEqual((tabell, nyckel), ('dim_sortiment', ['sortiment_id']))
        per_id = {r['sortiment_id']: r for r in rader}
        self.assertNotIn('namn', per_id['PONS_299'])        # befintligt: namnet orört
        self.assertEqual(per_id['PONS_777']['namn'], '')    # nytt: som förut

    def test_inget_skickas_med_namn_tom_streng_over_befintligt(self):
        M.hamta_befintliga_sortiment_id = lambda ids: {'PONS_299', 'PONS_777'}
        M.skriv_sortiment_utan_namn([BEFINTLIG, NY])
        for _, rader, _ in self.skickat:
            for r in rader:
                self.assertFalse('namn' in r and r['namn'] == '', r)

    def test_lasfel(self):
        M.hamta_befintliga_sortiment_id = lambda ids: None
        M.skriv_sortiment_utan_namn([BEFINTLIG, NY])
        for _, rader, _ in self.skickat:
            self.assertTrue(all('namn' not in r for r in rader))

    def test_tom_lista(self):
        self.assertEqual(M.skriv_sortiment_utan_namn([]), 0)
        self.assertEqual(self.skickat, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
