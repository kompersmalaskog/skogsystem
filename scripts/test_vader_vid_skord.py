"""Test: väder vid skörd (fakt_kalibrering.weather_at_harvest) — importens hämtning och kompletteringen.

    python scripts/test_vader_vid_skord.py

Ingen nätverksåtkomst: Open-Meteo och Supabase är fejkade. Bakgrund: vädret skrevs av en engångskörning utanför repot
(2026-05-20) och importen skrev det aldrig, så varje kontroll efter 15 maj saknade väder utan att något fallerade.
"""
import os, sys, tempfile, unittest, importlib.util
from datetime import datetime, timedelta, timezone

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        tmp = tempfile.mkdtemp(prefix='vader_')
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
UTC = timezone.utc
NU = datetime(2026, 10, 21, 12, 0, tzinfo=UTC)


class Svar:
    def __init__(self, status=200, kropp=None, ogiltig=False):
        self.status_code, self._kropp, self._ogiltig = status, kropp, ogiltig
        self.text = str(kropp)[:200]

    def json(self):
        if self._ogiltig:
            raise ValueError('inte json')
        return self._kropp


def timsvar(dag, temp=10.64, nederbord=0.24, sno=0.0, vind=4.743, saknar=False):
    tider = [f"{dag}T{h:02d}:00" for h in range(24)]
    f = lambda v: [None if saknar else v] * 24
    return {'hourly': {'time': tider, 'temperature_2m': f(temp), 'precipitation': f(nederbord),
                       'snowfall': f(sno), 'wind_speed_10m': f(vind)}}


class FejkHttp:
    def __init__(self, svar=None, kasta=None):
        self.svar, self.kasta, self.anrop = svar, kasta, []

    def get(self, url, params=None, timeout=None):
        self.anrop.append((url, params, timeout))
        if self.kasta:
            raise self.kasta
        return self.svar


class ValjPunkt(unittest.TestCase):
    def test_tidigaste_stocken_med_position_och_sommartid_blir_utc(self):
        stockar = [
            {'stem_lat': 56.9, 'stem_lon': 15.1, 'harvest_date': datetime(2026, 5, 14, 15, 31, 16)},
            {'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': datetime(2026, 5, 14, 14, 59, 35)},
        ]
        lat, lon, t = M.valj_vaderpunkt(stockar)
        self.assertEqual((lat, lon), (56.8, 15.0))
        self.assertEqual(t, datetime(2026, 5, 14, 12, 59, 35, tzinfo=UTC))   # svensk sommartid = UTC+2

    def test_vintertid_ar_utc_plus_ett(self):
        _, _, t = M.valj_vaderpunkt([{'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': datetime(2026, 1, 20, 10, 0)}])
        self.assertEqual(t, datetime(2026, 1, 20, 9, 0, tzinfo=UTC))

    def test_saknad_koordinat_ar_noll_och_hoppas_over_aldrig_en_gissning(self):
        # safe_float ger 0.0 för en saknad koordinat — (0, 0) är "saknas", inte en plats i Guineabukten
        stockar = [{'stem_lat': 0.0, 'stem_lon': 0.0, 'harvest_date': datetime(2026, 5, 14, 9, 0)},
                   {'stem_lat': None, 'stem_lon': 15.0, 'harvest_date': datetime(2026, 5, 14, 9, 5)},
                   {'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': None}]
        self.assertIsNone(M.valj_vaderpunkt(stockar))
        self.assertIsNone(M.valj_vaderpunkt([]))


class ByggJson(unittest.TestCase):
    def test_samma_form_som_befintliga_rader(self):
        v = M.bygg_vader_json({'temperature_2m': 10.64, 'precipitation': 0.24, 'snowfall': 0.0, 'wind_speed_10m': 4.743},
                              datetime(2026, 5, 14, 12, 59, 35, tzinfo=UTC), NU)
        self.assertEqual(set(v), {'source', 'fetched_at', 'harvest_time', 'temperature_c', 'precipitation_mm',
                                  'snowfall_cm', 'wind_speed_ms', 'is_freezing'})
        self.assertEqual((v['source'], v['temperature_c'], v['precipitation_mm'], v['snowfall_cm'], v['wind_speed_ms']),
                         ('open-meteo.com', 10.6, 0.2, 0.0, 4.74))
        self.assertEqual(v['harvest_time'], '2026-05-14T12:59:35+00:00')
        self.assertIs(v['is_freezing'], False)

    def test_is_freezing_ar_under_noll_som_i_befintlig_data(self):
        f = lambda t: M.bygg_vader_json({'temperature_2m': t}, NU, NU)['is_freezing']
        self.assertTrue(f(-0.1)); self.assertFalse(f(0.0)); self.assertFalse(f(1.0))

    def test_utan_temperatur_finns_inget_varde(self):
        self.assertIsNone(M.bygg_vader_json({'temperature_2m': None, 'precipitation': 1.0}, NU, NU))


class Hamta(unittest.TestCase):
    def test_hamtar_narmaste_hela_timme_med_ms_och_utc(self):
        h = FejkHttp(Svar(200, timsvar('2026-05-14')))
        v, fel = M.hamta_vader_vid_skord(56.8123456, 15.0, datetime(2026, 5, 14, 12, 59, 35, tzinfo=UTC), http=h, nu=NU)
        self.assertIsNone(fel)
        url, p, timeout = h.anrop[0]
        self.assertIn('archive-api.open-meteo.com/v1/archive', url)      # arkivet, aldrig prognos-API:t
        self.assertEqual((p['latitude'], p['longitude']), ('56.8123', '15.0000'))
        self.assertEqual((p['start_date'], p['end_date'], p['timezone'], p['wind_speed_unit']),
                         ('2026-05-14', '2026-05-14', 'UTC', 'ms'))
        self.assertTrue(timeout and timeout <= 10)
        self.assertEqual(v['temperature_c'], 10.6)

    def test_timmen_rundas_over_midnatt_till_nasta_dygn(self):
        h = FejkHttp(Svar(200, timsvar('2026-05-15')))
        v, fel = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 23, 40, tzinfo=UTC), http=h, nu=NU)
        self.assertIsNone(fel)
        self.assertEqual(h.anrop[0][1]['start_date'], '2026-05-15')

    def test_for_ny_kontroll_ar_inte_klar_an_och_inget_anrop_gors(self):
        h = FejkHttp(Svar(200, timsvar('2026-10-20')))
        v, fel = M.hamta_vader_vid_skord(56.8, 15.0, NU - timedelta(hours=3), http=h, nu=NU)
        self.assertIsNone(v); self.assertTrue(fel.startswith('inte klart än')); self.assertEqual(h.anrop, [])

    def test_null_varden_fran_arkivet_ar_inte_klart_an(self):
        h = FejkHttp(Svar(200, timsvar('2026-10-10', saknar=True)))
        v, fel = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 10, 10, 9, 0, tzinfo=UTC), http=h, nu=NU)
        self.assertIsNone(v); self.assertTrue(fel.startswith('inte klart än'))

    def test_400_med_felkropp_ar_ett_fel_inte_ett_varde(self):
        h = FejkHttp(Svar(400, {'error': True, 'reason': 'Parameter foo'}))
        v, fel = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 9, 0, tzinfo=UTC), http=h, nu=NU)
        self.assertIsNone(v); self.assertIn('Parameter foo', fel)

    def test_200_med_error_flagga_och_ogiltig_json(self):
        for svar in (Svar(200, {'error': True, 'reason': 'x'}), Svar(200, ogiltig=True), Svar(500, ogiltig=True)):
            v, fel = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 9, 0, tzinfo=UTC), http=FejkHttp(svar), nu=NU)
            self.assertIsNone(v); self.assertTrue(fel)

    def test_natverksfel_kastar_aldrig(self):
        for e in (TimeoutError('slut'), ConnectionError('nere'), RuntimeError('vadsomhelst')):
            v, fel = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 9, 0, tzinfo=UTC), http=FejkHttp(kasta=e), nu=NU)
            self.assertIsNone(v); self.assertIn(type(e).__name__, fel)


class LaggPa(unittest.TestCase):
    def setUp(self):
        self.fel = []
        self.orig = M._rapportera_import_fel
        M._rapportera_import_fel = lambda *a: self.fel.append(a)
        self.orig_hamta = M.hamta_vader_vid_skord
        self.stockar = [{'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': datetime(2026, 5, 14, 14, 59, 35)}]

    def tearDown(self):
        M._rapportera_import_fel = self.orig
        M.hamta_vader_vid_skord = self.orig_hamta

    def test_lyckad_hamtning_satter_nyckeln(self):
        M.hamta_vader_vid_skord = lambda *a, **k: ({'temperature_c': 1.0, 'precipitation_mm': 0.0, 'wind_speed_ms': 2.0}, None)
        rad = {'filnamn': 'a.hqc'}
        self.assertTrue(M.lagg_pa_vader(rad, self.stockar, 'a.hqc'))
        self.assertIn('weather_at_harvest', rad); self.assertEqual(self.fel, [])

    def test_misslyckad_hamtning_lamnar_raden_utan_nyckel_och_syns_i_import_fel(self):
        # utan nyckeln rör en merge-upsert inte ett befintligt värde
        M.hamta_vader_vid_skord = lambda *a, **k: (None, 'Open-Meteo svarade fel: HTTP 500')
        rad = {'filnamn': 'a.hqc'}
        self.assertFalse(M.lagg_pa_vader(rad, self.stockar, 'a.hqc'))
        self.assertNotIn('weather_at_harvest', rad)
        self.assertEqual(self.fel[0][:2] + self.fel[0][3:4], ('fakt_kalibrering', 'a.hqc', 'VADER_SAKNAS'))

    def test_inte_klart_an_ar_inget_fel_i_import_fel(self):
        M.hamta_vader_vid_skord = lambda *a, **k: (None, 'inte klart än: ERA5 ...')
        self.assertFalse(M.lagg_pa_vader({}, self.stockar, 'a.hqc')); self.assertEqual(self.fel, [])

    def test_utan_position_loggas_som_fel(self):
        rad = {}
        self.assertFalse(M.lagg_pa_vader(rad, [{'stem_lat': 0.0, 'stem_lon': 0.0, 'harvest_date': datetime(2026, 5, 14, 9)}], 'b.hqc'))
        self.assertNotIn('weather_at_harvest', rad); self.assertEqual(self.fel[0][3], 'VADER_SAKNAS')


class FejkRequests:
    """Supabase-fejk: läsning av kontroller utan väder, stockar, och PATCH. Loggar alla anrop."""
    def __init__(self, kontroller, stockar, patch_status=200):
        self.kontroller, self.stockar, self.patch_status, self.anrop = kontroller, stockar, patch_status, []

    def get(self, url, headers=None, timeout=None):
        self.anrop.append(('GET', url))
        if '/fakt_kalibrering' in url:
            return Svar(200, self.kontroller)
        return Svar(200, self.stockar)

    def patch(self, url, headers=None, json=None, timeout=None):
        self.anrop.append(('PATCH', url, json))
        return Svar(self.patch_status, [{'id': 1}] if self.patch_status == 200 else [])


class Komplettera(unittest.TestCase):
    def setUp(self):
        self.orig = M.requests
        self.kontroller = [{'id': 7, 'filnamn': 'a.hqc', 'maskin_id': 'R64428'}]
        self.stockar = [{'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': '2026-05-14 12:59:35.010087+00', 'tid_ar_utc': True}]

    def tearDown(self):
        M.requests = self.orig

    def kor(self, **k):
        return M.komplettera_saknat_vader(http=FejkHttp(Svar(200, timsvar('2026-05-14'))), nu=NU, **k)

    def test_fyller_bara_rader_som_saknar_vader_och_patchar_med_samma_villkor(self):
        M.requests = fr = FejkRequests(self.kontroller, self.stockar)
        r = self.kor(max_antal=25)
        self.assertEqual((r['sokta'], r['fyllda'], r['misslyckade']), (1, 1, []))
        get = fr.anrop[0][1]
        self.assertIn('weather_at_harvest=is.null', get)                       # läser aldrig rader med väder
        patch = [a for a in fr.anrop if a[0] == 'PATCH'][0]
        self.assertIn('weather_at_harvest=is.null', patch[1])                  # skriver aldrig över väder
        self.assertEqual(patch[2]['weather_at_harvest']['harvest_time'], '2026-05-14T12:59:35.010087+00:00')   # tid_ar_utc=true: 12:59 UTC

    def test_aldre_rad_med_vaggklocka_som_utc_tolkas_samma(self):
        M.requests = fr = FejkRequests(self.kontroller, [{**self.stockar[0], 'harvest_date': '2026-05-14 14:59:35.010087+00', 'tid_ar_utc': False}])
        self.kor()
        patch = [a for a in fr.anrop if a[0] == 'PATCH'][0]
        self.assertEqual(patch[2]['weather_at_harvest']['harvest_time'], '2026-05-14T12:59:35.010087+00:00')

    def test_torrkorning_skriver_ingenting(self):
        M.requests = fr = FejkRequests(self.kontroller, self.stockar)
        r = self.kor(skriv=False)
        self.assertEqual(r['fyllda'], 1); self.assertFalse([a for a in fr.anrop if a[0] == 'PATCH'])

    def test_skrivning_som_inte_traffar_exakt_en_rad_ar_ett_fel(self):
        M.requests = FejkRequests(self.kontroller, self.stockar, patch_status=200)
        M.requests.patch = lambda *a, **k: Svar(200, [])
        r = self.kor()
        self.assertEqual(r['fyllda'], 0); self.assertEqual(len(r['misslyckade']), 1)

    def test_kastar_aldrig_och_raknar_inte_klara_separat(self):
        M.requests = FejkRequests(self.kontroller, self.stockar)
        r = M.komplettera_saknat_vader(http=FejkHttp(Svar(200, timsvar('2026-05-14'))), nu=datetime(2026, 5, 15, tzinfo=UTC))
        self.assertEqual((r['fyllda'], r['inte_klara']), (0, 1))
        M.requests = None   # trasig anslutning: ska inte kasta
        self.assertEqual(M.komplettera_saknat_vader(nu=NU)['fyllda'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
