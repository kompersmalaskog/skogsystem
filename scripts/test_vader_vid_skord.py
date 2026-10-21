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
        lat, lon, t = M.valj_vaderpunkt(stockar, '2026-05-14')
        self.assertEqual((lat, lon), (56.8, 15.0))
        self.assertEqual(t, datetime(2026, 5, 14, 12, 59, 35, tzinfo=UTC))   # svensk sommartid = UTC+2

    def test_vintertid_ar_utc_plus_ett(self):
        _, _, t = M.valj_vaderpunkt([{'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': datetime(2026, 1, 20, 10, 0)}], '2026-01-20')
        self.assertEqual(t, datetime(2026, 1, 20, 9, 0, tzinfo=UTC))

    def test_saknad_koordinat_ar_noll_och_hoppas_over_aldrig_en_gissning(self):
        # safe_float ger 0.0 för en saknad koordinat — (0, 0) är "saknas", inte en plats i Guineabukten
        stockar = [{'stem_lat': 0.0, 'stem_lon': 0.0, 'harvest_date': datetime(2026, 5, 14, 9, 0)},
                   {'stem_lat': None, 'stem_lon': 15.0, 'harvest_date': datetime(2026, 5, 14, 9, 5)},
                   {'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': None}]
        self.assertIsNone(M.valj_vaderpunkt(stockar, '2026-05-14'))
        self.assertIsNone(M.valj_vaderpunkt([], '2026-05-14'))


def stam(lat, lon, lokal):
    """En kontrollstock som den läses i importen: naiv svensk väggklocka."""
    return {'stem_lat': lat, 'stem_lon': lon, 'harvest_date': lokal}


# En ackumulerande Scorpion-fil: stammar från tre olika dagar (8, 9 och 13 april), två av dem på 13 april.
ACKUMULERANDE = [
    stam(56.10, 15.10, datetime(2026, 4, 8, 10, 0)),
    stam(56.20, 15.20, datetime(2026, 4, 9, 11, 0)),
    stam(56.40, 15.40, datetime(2026, 4, 13, 14, 0)),
    stam(56.30, 15.30, datetime(2026, 4, 13, 9, 30)),
]


class ValjPunktAckumulerande(unittest.TestCase):
    """Scorpionens HQC-filer är ackumulerande: en fil innehåller ofta stammar från tidigare kontroller. 'Tidigaste stammen i
    filen' gav 34 av 330 kontroller väder från mer än ett dygn före sitt eget datum (Hössjömåla 13/15/21 april fick alla
    8 april; Äskebäck id 1281 fick Krokshults tid)."""

    def test_valjer_tidigaste_stammen_pa_kontrollens_dag_inte_filens_tidigaste(self):
        lat, lon, t = M.valj_vaderpunkt(ACKUMULERANDE, '2026-04-13')
        self.assertEqual((lat, lon), (56.30, 15.30))                       # 13 april 09:30, inte 8 april
        self.assertEqual(t, datetime(2026, 4, 13, 7, 30, tzinfo=UTC))      # sommartid = UTC+2

    def test_samma_fil_ger_olika_stam_for_olika_kontrollers_datum(self):
        self.assertEqual(M.valj_vaderpunkt(ACKUMULERANDE, '2026-04-08')[:2], (56.10, 15.10))
        self.assertEqual(M.valj_vaderpunkt(ACKUMULERANDE, '2026-04-09')[:2], (56.20, 15.20))
        self.assertEqual(M.valj_vaderpunkt(ACKUMULERANDE, '2026-04-13')[:2], (56.30, 15.30))

    def test_den_tidigaste_PA_DAGEN_som_har_gps(self):
        stockar = [stam(None, None, datetime(2026, 4, 13, 8, 0)),          # tidigast på dagen men utan position
                   stam(0.0, 0.0, datetime(2026, 4, 13, 8, 30)),           # (0, 0) = saknad
                   stam(56.30, 15.30, datetime(2026, 4, 13, 9, 30)),
                   stam(56.10, 15.10, datetime(2026, 4, 8, 10, 0))]
        self.assertEqual(M.valj_vaderpunkt(stockar, '2026-04-13')[:2], (56.30, 15.30))

    def test_saknas_stam_for_dagen_galler_den_senaste_med_gps(self):
        self.assertEqual(M.valj_vaderpunkt(ACKUMULERANDE, '2026-04-20')[:2], (56.40, 15.40))   # senaste = 13 april 14:00
        stockar = ACKUMULERANDE + [stam(None, 15.0, datetime(2026, 4, 14, 8, 0))]               # senare men utan GPS: räknas inte
        self.assertEqual(M.valj_vaderpunkt(stockar, '2026-04-20')[:2], (56.40, 15.40))

    def test_saknat_datum_ar_ingen_dag_och_ger_den_senaste(self):
        for datum in (None, '', 'inte ett datum'):
            self.assertEqual(M.valj_vaderpunkt(ACKUMULERANDE, datum)[:2], (56.40, 15.40))

    def test_datum_kan_vara_date_datetime_eller_text(self):
        from datetime import date
        for datum in (date(2026, 4, 9), datetime(2026, 4, 9, 23, 59), '2026-04-09', '2026-04-09T00:00:00'):
            self.assertEqual(M.valj_vaderpunkt(ACKUMULERANDE, datum)[:2], (56.20, 15.20))

    def test_ingen_stock_med_gps_ger_none_oavsett_datum(self):
        self.assertIsNone(M.valj_vaderpunkt([stam(None, None, datetime(2026, 4, 13, 9, 0))], '2026-04-13'))
        self.assertIsNone(M.valj_vaderpunkt([stam(56.3, 15.3, None)], '2026-04-13'))

    def test_lokal_dag_avgor_inte_utc_dag(self):
        # 00:30 svensk sommartid den 13 april är 22:30 UTC den 12:e — kontrollens datum är den LOKALA dagen
        stockar = [stam(56.10, 15.10, datetime(2026, 4, 12, 23, 0)), stam(56.30, 15.30, datetime(2026, 4, 13, 0, 30))]
        self.assertEqual(M.valj_vaderpunkt(stockar, '2026-04-13')[:2], (56.30, 15.30))


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
        v, fel, art = M.hamta_vader_vid_skord(56.8123456, 15.0, datetime(2026, 5, 14, 12, 59, 35, tzinfo=UTC), http=h, nu=NU)
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
        v, fel, art = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 23, 40, tzinfo=UTC), http=h, nu=NU)
        self.assertIsNone(fel)
        self.assertEqual(h.anrop[0][1]['start_date'], '2026-05-15')

    def test_for_ny_kontroll_ar_inte_klar_an_och_inget_anrop_gors(self):
        h = FejkHttp(Svar(200, timsvar('2026-10-20')))
        v, fel, art = M.hamta_vader_vid_skord(56.8, 15.0, NU - timedelta(hours=3), http=h, nu=NU)
        self.assertIsNone(v); self.assertTrue(fel.startswith('inte klart än')); self.assertEqual(h.anrop, [])
        self.assertEqual(art, M.VADER_EJ_KLART)

    def test_null_varden_fran_arkivet_ar_inte_klart_an(self):
        h = FejkHttp(Svar(200, timsvar('2026-10-10', saknar=True)))
        v, fel, art = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 10, 10, 9, 0, tzinfo=UTC), http=h, nu=NU)
        self.assertIsNone(v); self.assertTrue(fel.startswith('inte klart än'))

    def test_400_med_felkropp_ar_ett_fel_inte_ett_varde(self):
        h = FejkHttp(Svar(400, {'error': True, 'reason': 'Parameter foo'}))
        v, fel, art = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 9, 0, tzinfo=UTC), http=h, nu=NU)
        self.assertIsNone(v); self.assertIn('Parameter foo', fel)
        self.assertEqual(art, M.VADER_PERMANENT)     # 4xx avvisas igen nästa gång

    def test_200_med_error_flagga_och_ogiltig_json(self):
        for svar in (Svar(200, {'error': True, 'reason': 'x'}), Svar(200, ogiltig=True), Svar(500, ogiltig=True)):
            v, fel, art = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 9, 0, tzinfo=UTC), http=FejkHttp(svar), nu=NU)
            self.assertIsNone(v); self.assertTrue(fel)

    def test_utfallens_art(self):
        k = lambda svar: M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 9, 0, tzinfo=UTC), http=FejkHttp(svar), nu=NU)[2]
        self.assertEqual(k(Svar(500, {'error': True, 'reason': 'x'})), M.VADER_TILLFALLIGT)
        self.assertEqual(k(Svar(503, ogiltig=True)), M.VADER_TILLFALLIGT)
        self.assertEqual(k(Svar(429, {'error': True, 'reason': 'limit'})), M.VADER_TILLFALLIGT)
        self.assertEqual(k(Svar(200, ogiltig=True)), M.VADER_TILLFALLIGT)     # trasig leverans: försök igen
        self.assertEqual(k(Svar(404, ogiltig=True)), M.VADER_PERMANENT)
        self.assertEqual(k(Svar(200, timsvar('2026-05-13'))), M.VADER_PERMANENT)   # timmen saknas i svaret

    def test_natverksfel_kastar_aldrig(self):
        for e in (TimeoutError('slut'), ConnectionError('nere'), RuntimeError('vadsomhelst')):
            v, fel, art = M.hamta_vader_vid_skord(56.8, 15.0, datetime(2026, 5, 14, 9, 0, tzinfo=UTC), http=FejkHttp(kasta=e), nu=NU)
            self.assertIsNone(v); self.assertIn(type(e).__name__, fel); self.assertEqual(art, M.VADER_TILLFALLIGT)


class LaggPa(unittest.TestCase):
    def setUp(self):
        self.fel = []
        self.orig = M._rapportera_import_fel
        M._rapportera_import_fel = lambda *a: self.fel.append(a)
        self.orig_hamta = M.hamta_vader_vid_skord
        M._vader_nat['nere_sedan'] = None
        self.stockar = [{'stem_lat': 56.8, 'stem_lon': 15.0, 'harvest_date': datetime(2026, 5, 14, 14, 59, 35)}]

    def tearDown(self):
        M._rapportera_import_fel = self.orig
        M.hamta_vader_vid_skord = self.orig_hamta
        M._vader_nat['nere_sedan'] = None

    def test_lyckad_hamtning_satter_nyckeln(self):
        M.hamta_vader_vid_skord = lambda *a, **k: ({'temperature_c': 1.0, 'precipitation_mm': 0.0, 'wind_speed_ms': 2.0}, None, 'ok')
        rad = {'filnamn': 'a.hqc'}
        self.assertTrue(M.lagg_pa_vader(rad, self.stockar, 'a.hqc'))
        self.assertIn('weather_at_harvest', rad); self.assertEqual(self.fel, [])

    def test_tillfalligt_fel_lamnar_raden_utan_nyckel_syns_i_import_fel_och_markerar_natet(self):
        # utan nyckeln rör en merge-upsert inte ett befintligt värde
        M.hamta_vader_vid_skord = lambda *a, **k: (None, 'Open-Meteo svarade HTTP 500', 'tillfalligt')
        rad = {'filnamn': 'a.hqc'}
        self.assertFalse(M.lagg_pa_vader(rad, self.stockar, 'a.hqc'))
        self.assertNotIn('weather_at_harvest', rad)
        self.assertEqual(self.fel[0][:2] + self.fel[0][3:4], ('fakt_kalibrering', 'a.hqc', 'VADER_SAKNAS'))
        self.assertIsNotNone(M._vader_nat['nere_sedan'])

    def test_permanent_fel_skrivs_som_permanent(self):
        M.hamta_vader_vid_skord = lambda *a, **k: (None, 'Open-Meteo svarade fel: x', 'permanent')
        self.assertFalse(M.lagg_pa_vader({}, self.stockar, 'a.hqc'))
        self.assertEqual(self.fel[0][3], 'VADER_PERMANENT'); self.assertIsNone(M._vader_nat['nere_sedan'])

    def test_inte_klart_an_ar_inget_fel_i_import_fel(self):
        M.hamta_vader_vid_skord = lambda *a, **k: (None, 'inte klart än: ERA5 ...', 'inte_klart')
        self.assertFalse(M.lagg_pa_vader({}, self.stockar, 'a.hqc')); self.assertEqual(self.fel, [])

    def test_utan_position_loggas_som_permanent(self):
        rad = {}
        self.assertFalse(M.lagg_pa_vader(rad, [{'stem_lat': 0.0, 'stem_lon': 0.0, 'harvest_date': datetime(2026, 5, 14, 9)}], 'b.hqc'))
        self.assertNotIn('weather_at_harvest', rad); self.assertEqual(self.fel[0][3], 'VADER_PERMANENT')


class FejkRequests:
    """Supabase-fejk med riktig filtrering: fakt_kalibrering (id=gt.N, weather_at_harvest=is.null, limit), stockar per filnamn,
    import_fel (läs/skriv) och PATCH med villkor. Loggar alla anrop."""
    def __init__(self, kontroller, stockar, patch_status=200):
        self.kontroller = kontroller            # lista av {'id','filnamn','maskin_id','weather_at_harvest'}
        self.stockar = stockar                  # filnamn -> lista stockrader
        self.import_fel = []                    # [{'filnamn','felkod'}]
        self.patch_status, self.anrop = patch_status, []

    @staticmethod
    def _q(url):
        from urllib.parse import urlparse, parse_qsl
        return dict(parse_qsl(urlparse(url).query))

    def get(self, url, headers=None, timeout=None):
        self.anrop.append(('GET', url))
        q = self._q(url)
        if '/import_fel' in url:
            return Svar(200, [{'filnamn': x['filnamn']} for x in self.import_fel if x['felkod'] == 'VADER_PERMANENT'])
        if '/fakt_kalibrering' in url:
            rader = [k for k in sorted(self.kontroller, key=lambda k: k['id']) if k['id'] > int(q['id'][3:])]
            if q.get('weather_at_harvest') == 'is.null':
                rader = [k for k in rader if k.get('weather_at_harvest') is None]
            return Svar(200, rader[:int(q['limit'])])
        from urllib.parse import unquote
        return Svar(200, self.stockar.get(unquote(q['filnamn'])[3:], []))

    def patch(self, url, headers=None, json=None, timeout=None):
        self.anrop.append(('PATCH', url, json))
        q = self._q(url)
        id_ = int(q['id'][3:])
        rad = next(k for k in self.kontroller if k['id'] == id_)
        if q.get('weather_at_harvest') == 'is.null' and rad.get('weather_at_harvest') is not None:
            return Svar(200, [])
        gammalt = q.get('weather_at_harvest->>fetched_at')
        if gammalt and (rad.get('weather_at_harvest') or {}).get('fetched_at') != gammalt[3:]:
            return Svar(200, [])
        if self.patch_status != 200:
            return Svar(self.patch_status, [])
        rad['weather_at_harvest'] = json['weather_at_harvest']
        return Svar(200, [{'id': id_}])

    def post(self, url, headers=None, json=None, timeout=None):
        self.anrop.append(('POST', url, json))
        if '/import_fel' in url:
            self.import_fel.append({'filnamn': json['filnamn'], 'felkod': json['felkod']})
        return Svar(201, [])


def stock(lat=56.8, lon=15.0, tid='2026-05-14 12:59:35.010087+00', utc=True):
    return [{'stem_lat': lat, 'stem_lon': lon, 'harvest_date': tid, 'tid_ar_utc': utc}]


def stockar_db(*stammar):
    """Flera kontrollstockar som de ligger i detalj_kontroll_stock: (lat, lon, 'YYYY-MM-DD HH:MM:SS+00') = verkligt UTC."""
    return [{'stem_lat': la, 'stem_lon': lo, 'harvest_date': t, 'tid_ar_utc': True} for la, lo, t in stammar]


def kontroll(i, vader=None, fil=None, datum=None):
    return {'id': i, 'filnamn': fil or f'k{i}.hqc', 'maskin_id': 'R64428', 'datum': datum, 'weather_at_harvest': vader}


class RaknaHttp:
    """Open-Meteo-fejk som räknar anrop och svarar per anrop via en funktion."""
    def __init__(self, svara):
        self.svara, self.anrop = svara, 0

    def get(self, url, params=None, timeout=None):
        self.anrop += 1
        return self.svara(params)


def bra(params):
    return Svar(200, timsvar(params['start_date']))


class Komplettera(unittest.TestCase):
    def setUp(self):
        self.orig = M.requests
        M._vader_nat['nere_sedan'] = None
        self.fel = []

    def tearDown(self):
        M.requests = self.orig
        M._vader_nat['nere_sedan'] = None

    def fejk(self, kontroller, stockar):
        M.requests = fr = FejkRequests(kontroller, stockar)
        return fr

    def test_fyller_bara_rader_som_saknar_vader_och_patchar_med_samma_villkor(self):
        fr = self.fejk([kontroll(7), kontroll(8, vader={'fetched_at': 'x', 'harvest_time': 'y'})], {'k7.hqc': stock(), 'k8.hqc': stock()})
        h = RaknaHttp(bra)
        r = M.komplettera_saknat_vader(http=h, nu=NU)
        self.assertEqual((r['sokta'], r['fyllda'], r['misslyckade']), (1, 1, []))
        self.assertIn('weather_at_harvest=is.null', [a for a in fr.anrop if '/fakt_kalibrering?' in a[1] and a[0] == 'GET'][0][1])
        patch = [a for a in fr.anrop if a[0] == 'PATCH']
        self.assertEqual(len(patch), 1)
        self.assertIn('weather_at_harvest=is.null', patch[0][1])
        self.assertEqual(patch[0][2]['weather_at_harvest']['harvest_time'], '2026-05-14T12:59:35.010087+00:00')
        self.assertEqual(fr.kontroller[1]['weather_at_harvest']['fetched_at'], 'x')    # raden med väder orörd

    def test_aldre_rad_med_vaggklocka_som_utc_tolkas_samma(self):
        fr = self.fejk([kontroll(7)], {'k7.hqc': stock(tid='2026-05-14 14:59:35.010087+00', utc=False)})
        M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU)
        self.assertEqual(fr.kontroller[0]['weather_at_harvest']['harvest_time'], '2026-05-14T12:59:35.010087+00:00')

    def test_torrkorning_skriver_ingenting(self):
        fr = self.fejk([kontroll(7)], {'k7.hqc': stock()})
        r = M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, skriv=False)
        self.assertEqual(r['fyllda'], 1)
        self.assertFalse([a for a in fr.anrop if a[0] in ('PATCH', 'POST')])

    def test_skrivning_som_inte_traffar_exakt_en_rad_ar_ett_fel(self):
        fr = self.fejk([kontroll(7)], {'k7.hqc': stock()})
        fr.patch = lambda *a, **k: Svar(200, [])
        r = M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU)
        self.assertEqual(r['fyllda'], 0); self.assertEqual(len(r['misslyckade']), 1)

    def test_inte_klara_raknas_separat_och_kostar_inget_anrop(self):
        self.fejk([kontroll(7)], {'k7.hqc': stock()})
        h = RaknaHttp(bra)
        r = M.komplettera_saknat_vader(http=h, nu=datetime(2026, 5, 15, tzinfo=UTC))
        self.assertEqual((r['fyllda'], r['inte_klara'], h.anrop), (0, 1, 0))

    def test_trasig_anslutning_kastar_inte(self):
        M.requests = None
        self.assertEqual(M.komplettera_saknat_vader(nu=NU)['fyllda'], 0)

    # --- kön får aldrig svältas -------------------------------------------------------------------------------------

    def test_kontroller_utan_position_svalter_inte_nya_och_hoppas_over_nasta_gang(self):
        # 40 äldre kontroller utan användbar position ligger först i kön; en ny kontroll med position ligger sist.
        kontroller = [kontroll(i) for i in range(1, 41)] + [kontroll(41)]
        stockar = {f'k{i}.hqc': stock(lat=0.0, lon=0.0) for i in range(1, 41)}
        stockar['k41.hqc'] = stock()
        fr = self.fejk(kontroller, stockar)
        h = RaknaHttp(bra)
        r = M.komplettera_saknat_vader(max_antal=25, http=h, nu=NU)
        self.assertEqual(r['fyllda'], 1)                       # den nya fick väder trots att 40 stod före
        self.assertIsNotNone(fr.kontroller[-1]['weather_at_harvest'])
        self.assertEqual(len([x for x in fr.import_fel if x['felkod'] == 'VADER_PERMANENT']), 40)   # de 40 syns i datahälsan
        # nästa körning: de 40 hoppas över utan att ens läsa deras stockar
        fr.anrop.clear()
        kontroller.append(kontroll(42)); stockar['k42.hqc'] = stock()
        r2 = M.komplettera_saknat_vader(max_antal=25, http=h, nu=NU)
        self.assertEqual((r2['fyllda'], r2['hoppade_permanent']), (1, 40))
        lasta = [a[1] for a in fr.anrop if a[0] == 'GET' and 'detalj_kontroll_stock' in a[1]]
        self.assertEqual(len(lasta), 1)                         # bara kontroll 42, inte de 40 permanenta

    def test_permanent_avvisade_av_open_meteo_tar_inte_alla_platser_for_alltid(self):
        # 30 kontroller som Open-Meteo avvisar (400) före en ny som går bra; taket är 25 nätanrop per körning.
        kontroller = [kontroll(i) for i in range(1, 31)] + [kontroll(31)]
        fr = self.fejk(kontroller, {f'k{i}.hqc': stock() for i in range(1, 32)})
        # kontroll 1–30 har en position som Open-Meteo avvisar
        for i in range(1, 31):
            fr.stockar[f'k{i}.hqc'] = stock(lat=56.1234, lon=15.0)
        def svara(p):
            return Svar(400, {'error': True, 'reason': 'avvisad'}) if p['latitude'] == '56.1234' else bra(p)
        h = RaknaHttp(svara)
        r1 = M.komplettera_saknat_vader(max_antal=25, http=h, nu=NU)
        self.assertEqual(h.anrop, 25)                           # taket gäller nätanrop
        r2 = M.komplettera_saknat_vader(max_antal=25, http=h, nu=NU)
        self.assertEqual(r2['fyllda'], 1)                       # andra körningen: de 25 hoppas över, de sista 5 avvisas, den nya går igenom
        self.assertIsNotNone(fr.kontroller[-1]['weather_at_harvest'])

    def test_uppgivna_skrivs_inte_till_import_fel_en_gang_till_vid_explicit_korning(self):
        fr = self.fejk([kontroll(1)], {'k1.hqc': stock(lat=0.0, lon=0.0)})
        M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU)
        M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, ignorera_permanenta=True)   # backfill-skriptets läge
        self.assertEqual(len([x for x in fr.import_fel if x['filnamn'] == 'k1.hqc']), 1)

    # --- nätverksfel ------------------------------------------------------------------------------------------------

    def test_forsta_natverksfelet_avbryter_och_loggas_en_gang(self):
        fr = self.fejk([kontroll(i) for i in range(1, 31)], {f'k{i}.hqc': stock() for i in range(1, 31)})
        h = FejkHttp(kasta=ConnectionError('ingen väg'))
        with self.assertLogs(M.logger, level='WARNING') as lg:
            r = M.komplettera_saknat_vader(max_antal=25, http=h, nu=NU)
        self.assertEqual(len(h.anrop), 1)                       # inte 25 × timeout
        self.assertIn('ConnectionError', r['avbrutet'])
        self.assertEqual(len([m for m in lg.output if 'avbryter kompletteringen' in m]), 1)
        self.assertEqual(r['fyllda'], 0)
        self.assertFalse([a for a in fr.anrop if a[0] == 'PATCH' or (a[0] == 'POST' and 'import_fel' in a[1])])   # inget markeras permanent

    def test_5xx_och_429_avbryter_ocksa(self):
        for status in (500, 429):
            M._vader_nat['nere_sedan'] = None
            self.fejk([kontroll(i) for i in range(1, 6)], {f'k{i}.hqc': stock() for i in range(1, 6)})
            h = RaknaHttp(lambda p, s=status: Svar(s, {'error': True, 'reason': 'x'}))
            r = M.komplettera_saknat_vader(http=h, nu=NU)
            self.assertEqual(h.anrop, 1); self.assertTrue(r['avbrutet'])

    def test_natfel_vid_importens_egen_hamtning_hindrar_kompletteringen_fran_att_vanta_igen(self):
        self.fejk([kontroll(i) for i in range(1, 6)], {f'k{i}.hqc': stock() for i in range(1, 6)})
        M._vader_nat['nere_sedan'] = NU - timedelta(seconds=20)
        h = RaknaHttp(bra)
        r = M.komplettera_saknat_vader(http=h, nu=NU)
        self.assertEqual(h.anrop, 0); self.assertTrue(r['avbrutet'])
        r = M.komplettera_saknat_vader(http=h, nu=NU + timedelta(seconds=M.VADER_NAT_PAUS_S + 1))   # pausen har gått
        self.assertEqual(r['fyllda'], 5)


class AckumulerandeFil(unittest.TestCase):
    """Hela kedjan (import och komplettering) med en ackumulerande fil: stammar från tre dagar, kontroller med olika datum."""
    # 8, 13 och 15 april (UTC; svensk sommartid = +2 h)
    FIL = stockar_db((57.00, 15.00, '2026-04-08 08:00:00+00'), (57.01, 15.01, '2026-04-13 07:00:00+00'),
                     (57.02, 15.02, '2026-04-15 07:00:00+00'))

    def setUp(self):
        self.orig = M.requests
        self.orig_hamta = M.hamta_vader_vid_skord
        self.orig_fel = M._rapportera_import_fel
        M._vader_nat['nere_sedan'] = None
        M._rapportera_import_fel = lambda *a: None

    def tearDown(self):
        M.requests = self.orig
        M.hamta_vader_vid_skord = self.orig_hamta
        M._rapportera_import_fel = self.orig_fel
        M._vader_nat['nere_sedan'] = None

    def test_komplettering_hamtar_vader_for_kontrollens_dag_inte_filens_tidigaste_stam(self):
        M.requests = fr = FejkRequests([kontroll(1, datum='2026-04-15')], {'k1.hqc': self.FIL})
        anrop = []
        def svara(p):
            anrop.append(p)
            return bra(p)
        r = M.komplettera_saknat_vader(http=RaknaHttp(svara), nu=NU)
        self.assertEqual(r['fyllda'], 1)
        self.assertEqual((anrop[0]['latitude'], anrop[0]['start_date']), ('57.0200', '2026-04-15'))   # inte 57.0000 / 8 april
        self.assertEqual(fr.kontroller[0]['weather_at_harvest']['harvest_time'], '2026-04-15T07:00:00+00:00')
        # fejken lämnar alla kolumner oavsett select — riktiga PostgREST gör det inte, så select måste be om datum
        lasning = [a[1] for a in fr.anrop if a[0] == 'GET' and '/fakt_kalibrering?' in a[1]][0]
        self.assertIn('datum', lasning.split('select=')[1].split('&')[0].split(','))

    def test_importens_lagg_pa_vader_anvander_kalibreringsradens_datum(self):
        fangade = []
        M.hamta_vader_vid_skord = lambda lat, lon, t, **k: (fangade.append((lat, lon, t)) or ({'temperature_c': 1.0, 'precipitation_mm': 0.0, 'wind_speed_ms': 2.0}, None, 'ok'))
        from datetime import date
        stockar = [stam(56.10, 15.10, datetime(2026, 4, 8, 10, 0)), stam(56.30, 15.30, datetime(2026, 4, 13, 9, 30)),
                   stam(56.50, 15.50, datetime(2026, 4, 15, 8, 0))]       # senare än kontrollens dag: ska inte väljas
        rad = {'datum': date(2026, 4, 13), 'filnamn': 'a.hqc'}
        self.assertTrue(M.lagg_pa_vader(rad, stockar, 'a.hqc'))
        self.assertEqual(fangade, [(56.30, 15.30, datetime(2026, 4, 13, 7, 30, tzinfo=UTC))])

    def test_skriv_over_byter_fel_stam_mot_ratt_och_en_omkorning_andrar_inget(self):
        # Hössjömåla: tre kontroller 13/15/21 april i samma ackumulerande fil fick alla väder från 8 april
        fil = stockar_db((57.00, 15.00, '2026-04-08 08:00:00+00'), (57.01, 15.01, '2026-04-13 07:00:00+00'),
                         (57.02, 15.02, '2026-04-15 07:00:00+00'), (57.03, 15.03, '2026-04-21 07:00:00+00'))
        gammalt = lambda: {'source': 'open-meteo.com', 'fetched_at': '2026-05-20T17:08:56+00:00',
                           'harvest_time': '2026-04-08T08:00:00+00:00', 'temperature_c': 3.0, 'is_freezing': False}
        kontroller = [kontroll(1, gammalt(), 'h13.hqc', '2026-04-13'), kontroll(2, gammalt(), 'h15.hqc', '2026-04-15'),
                      kontroll(3, gammalt(), 'h21.hqc', '2026-04-21')]
        M.requests = fr = FejkRequests(kontroller, {'h13.hqc': fil, 'h15.hqc': fil, 'h21.hqc': fil})
        r = M.komplettera_saknat_vader(max_antal=None, http=RaknaHttp(bra), nu=NU, skriv_over=True)
        self.assertEqual((r['ersatta'], r['redan_ratta']), (3, 0))
        self.assertEqual([k['weather_at_harvest']['harvest_time'][:10] for k in fr.kontroller],
                         ['2026-04-13', '2026-04-15', '2026-04-21'])
        fr.anrop.clear()
        r2 = M.komplettera_saknat_vader(max_antal=None, http=RaknaHttp(bra), nu=NU, skriv_over=True)
        self.assertEqual((r2['ersatta'], r2['redan_ratta']), (0, 3))
        self.assertFalse([a for a in fr.anrop if a[0] == 'PATCH'])


class SkrivOver(unittest.TestCase):
    """Backfill-skriptets uttryckliga läge: hämta om väder även för rader som har det (gamla raderna med fel UTC-tid)."""
    GAMMALT = {'source': 'open-meteo.com', 'fetched_at': '2026-05-20T17:08:56.195628+00:00',
               'harvest_time': '2026-05-14T14:59:35.010087+00:00', 'temperature_c': 10.6, 'precipitation_mm': 0.2,
               'snowfall_cm': 0, 'wind_speed_ms': 4.74, 'is_freezing': False}

    def setUp(self):
        self.orig = M.requests
        M._vader_nat['nere_sedan'] = None

    def tearDown(self):
        M.requests = self.orig
        M._vader_nat['nere_sedan'] = None

    def test_importens_lage_ror_aldrig_en_rad_med_vader(self):
        M.requests = fr = FejkRequests([kontroll(1, dict(self.GAMMALT))], {'k1.hqc': stock()})
        h = RaknaHttp(bra)
        r = M.komplettera_saknat_vader(http=h, nu=NU)                 # utan skriv_over
        self.assertEqual((r['sokta'], r['ersatta'], h.anrop), (0, 0, 0))
        self.assertEqual(fr.kontroller[0]['weather_at_harvest'], self.GAMMALT)

    def test_ersatter_gammalt_med_ratt_utc_tid_och_returnerar_gamla_for_aterstallning(self):
        M.requests = fr = FejkRequests([kontroll(1, dict(self.GAMMALT))], {'k1.hqc': stock()})
        r = M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, skriv_over=True)
        self.assertEqual((r['ersatta'], r['fyllda']), (1, 0))
        nytt = fr.kontroller[0]['weather_at_harvest']
        self.assertEqual(nytt['harvest_time'], '2026-05-14T12:59:35.010087+00:00')     # rätt UTC, två timmar före det gamla
        self.assertEqual(r['aterstall'], [(1, self.GAMMALT)])
        patch = [a for a in fr.anrop if a[0] == 'PATCH'][0]
        self.assertIn('fetched_at', patch[1])                          # PATCH kräver att raden fortfarande har vädret vi läste

    def test_omkorning_andrar_ingenting(self):
        M.requests = fr = FejkRequests([kontroll(1, dict(self.GAMMALT))], {'k1.hqc': stock()})
        M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, skriv_over=True)
        fr.anrop.clear()
        h = RaknaHttp(bra)
        r = M.komplettera_saknat_vader(http=h, nu=NU, skriv_over=True)
        self.assertEqual((r['redan_ratta'], r['ersatta'], h.anrop), (1, 0, 0))
        self.assertFalse([a for a in fr.anrop if a[0] == 'PATCH'])

    def test_misslyckad_hamtning_lamnar_gammalt_vader_orort(self):
        M.requests = fr = FejkRequests([kontroll(1, dict(self.GAMMALT))], {'k1.hqc': stock()})
        r = M.komplettera_saknat_vader(http=RaknaHttp(lambda p: Svar(400, {'error': True, 'reason': 'x'})), nu=NU, skriv_over=True)
        self.assertEqual(r['ersatta'], 0); self.assertEqual(fr.kontroller[0]['weather_at_harvest'], self.GAMMALT)

    def test_andrad_rad_under_korningen_tas_inte_over(self):
        M.requests = fr = FejkRequests([kontroll(1, dict(self.GAMMALT))], {'k1.hqc': stock()})
        orig_get = fr.get
        def get_och_andra(url, headers=None, timeout=None):
            sv = orig_get(url, headers, timeout)
            if 'detalj_kontroll_stock' in url:       # någon annan hinner skriva nytt väder innan vi patchar
                fr.kontroller[0]['weather_at_harvest'] = {**self.GAMMALT, 'fetched_at': '2026-10-21T10:00:00+00:00'}
            return sv
        fr.get = get_och_andra
        r = M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, skriv_over=True)
        self.assertEqual(r['ersatta'], 0); self.assertEqual(len(r['misslyckade']), 1)
        self.assertEqual(fr.kontroller[0]['weather_at_harvest']['fetched_at'], '2026-10-21T10:00:00+00:00')


if __name__ == '__main__':
    unittest.main(verbosity=2)
