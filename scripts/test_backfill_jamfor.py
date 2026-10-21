"""Test: läsläget --jamfor i scripts/backfill-kontroll-vader.py (gammal mot ny temperatur per rad, frost-byten).

    python scripts/test_backfill_jamfor.py

Ingen nätverksåtkomst: Open-Meteo och Supabase är fejkade (samma fejk som test_vader_vid_skord.py). Det viktiga att bevisa:
läsläget SKRIVER ALDRIG (inga PATCH/POST), väljer samma rader som --skriv-over och räknar skillnaden och frost-byten rätt.
"""
import importlib.util, os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_vader_vid_skord import (M, NU, UTC, Svar, timsvar, FejkRequests, RaknaHttp, FejkHttp, stock, stockar_db, kontroll, bra)  # noqa: E402

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('backfill_script', os.path.join(HAR, 'scripts', 'backfill-kontroll-vader.py'))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)


def gammalt(temp, frost=None, harvest_time='2026-05-14T14:59:35.010087+00:00'):
    return {'source': 'open-meteo.com', 'fetched_at': '2026-05-20T17:08:56.195628+00:00', 'harvest_time': harvest_time,
            'temperature_c': temp, 'precipitation_mm': 0.2, 'snowfall_cm': 0, 'wind_speed_ms': 4.74,
            'is_freezing': (temp < 0) if frost is None else frost}


class Fejk(FejkRequests):
    """FejkRequests ignorerar weather_at_harvest=not.is.null — läsläget ska få bara rader som har väder."""
    def get(self, url, headers=None, timeout=None):
        sv = super().get(url, headers, timeout)
        if '/fakt_kalibrering' in url and 'weather_at_harvest=not.is.null' in url:
            sv._kropp = [k for k in sv._kropp if k.get('weather_at_harvest') is not None]
        return sv


def temp_per_lat(tabell, standard=10.64):
    """Open-Meteo-fejk som svarar olika temperatur beroende på latitud (en kontroll = en latitud)."""
    return lambda p: Svar(200, timsvar(p['start_date'], temp=tabell.get(p['latitude'], standard)))


class Jamfor(unittest.TestCase):
    def setUp(self):
        self.orig = M.requests
        M._vader_nat['nere_sedan'] = None

    def tearDown(self):
        M.requests = self.orig
        M._vader_nat['nere_sedan'] = None

    def kor(self, kontroller, stockar, svara=bra, **kw):
        M.requests = fr = Fejk(kontroller, stockar)
        h = RaknaHttp(svara)
        return fr, h, B.jamfor_gamla(M, http=h, nu=NU, **kw)

    def test_skriver_aldrig_och_rorer_inga_rader(self):
        kontroller = [kontroll(1, gammalt(4.0)), kontroll(2, gammalt(-1.0))]
        fore = [dict(k) for k in kontroller]
        fr, h, res = self.kor(kontroller, {'k1.hqc': stock(), 'k2.hqc': stock()})
        self.assertEqual(len(res['rader']), 2)
        self.assertFalse([a for a in fr.anrop if a[0] in ('PATCH', 'POST')])          # ingen skrivning av något slag
        self.assertEqual(kontroller, fore)

    def test_gammal_och_ny_temperatur_skillnad_och_tid_per_rad(self):
        fr, h, res = self.kor([kontroll(1, gammalt(4.0))], {'k1.hqc': stock()})
        x = res['rader'][0]
        self.assertEqual((x['id'], x['filnamn'], x['gammal_c'], x['ny_c']), (1, 'k1.hqc', 4.0, 10.6))
        self.assertAlmostEqual(x['diff'], 6.6)
        self.assertEqual(x['gammal_tid'].hour, 14); self.assertEqual(x['ny_tid'].hour, 12)   # den gamla stämplade väggklockan som UTC

    def test_frost_byten_raknas_at_bada_hall(self):
        kontroller = [kontroll(1, gammalt(-0.5)),   # frost -> (ny +10,6) ej frost
                      kontroll(2, gammalt(2.0)),    # ej frost -> frost (ny -1,0)
                      kontroll(3, gammalt(-3.0)),   # frost -> frost (ny -1,0): inget byte
                      kontroll(4, gammalt(5.0)),    # ej frost -> ej frost
                      kontroll(5, gammalt(8.0))]    # ej frost -> ej frost (fler icke-byten än byten: ett omvänt villkor syns)
        stockar = {'k1.hqc': stock(), 'k2.hqc': stock(lat=56.2), 'k3.hqc': stock(lat=56.2), 'k4.hqc': stock(), 'k5.hqc': stock()}
        fr, h, res = self.kor(kontroller, stockar, svara=temp_per_lat({'56.2000': -1.0}))
        ut = []
        B.skriv_jamforelse(res, ut.append)
        text = '\n'.join(ut)
        self.assertIn('Byter mellan frost och inte frost: 2 av 5', text)
        self.assertIn('frost -> ej frost', text); self.assertIn('ej frost -> frost', text)
        self.assertEqual(sorted(x['id'] for x in res['rader'] if x['gammal_frost'] != x['ny_frost']), [1, 2])

    def test_storsta_skillnaden_pekas_ut_med_tecken(self):
        kontroller = [kontroll(1, gammalt(10.0)), kontroll(2, gammalt(12.0)), kontroll(3, gammalt(10.6))]
        fr, h, res = self.kor(kontroller, {f'k{i}.hqc': stock() for i in (1, 2, 3)})
        ut = []
        B.skriv_jamforelse(res, ut.append)
        text = '\n'.join(ut)
        self.assertIn('Största skillnad: -1.4 °C  (id 2', text)                          # 12,0 -> 10,6
        self.assertIn('Medelskillnad (absolut): 0.67 °C över 3 rader', text)             # (0,6 + 1,4 + 0,0) / 3

    def test_rader_utan_vader_och_rader_med_ratt_tid_hoppas_over(self):
        kontroller = [kontroll(1, None),
                      kontroll(2, gammalt(5.0, harvest_time='2026-05-14T12:59:35.010087+00:00')),   # redan rätt tid
                      kontroll(3, gammalt(5.0))]
        fr, h, res = self.kor(kontroller, {f'k{i}.hqc': stock() for i in (1, 2, 3)})
        self.assertEqual([x['id'] for x in res['rader']], [3])
        self.assertEqual((res['redan_ratta'], h.anrop), (1, 1))                           # bara kontroll 3 kostar ett nätanrop

    def test_for_ny_kontroll_ar_inte_klar_och_kostar_inget_anrop(self):
        ny = stock(tid='2026-10-20 12:00:00+00')
        fr, h, res = self.kor([kontroll(1, gammalt(5.0))], {'k1.hqc': ny})
        self.assertEqual((res['rader'], res['inte_klara'], h.anrop), ([], 1, 0))

    def test_natverksfel_avbryter_utan_att_hitta_pa_varden(self):
        M.requests = Fejk([kontroll(i, gammalt(5.0)) for i in (1, 2, 3)], {f'k{i}.hqc': stock() for i in (1, 2, 3)})
        h = FejkHttp(kasta=ConnectionError('nere'))
        res = B.jamfor_gamla(M, http=h, nu=NU)
        self.assertEqual((res['rader'], len(h.anrop)), ([], 1))
        self.assertIn('ConnectionError', res['avbrutet'])
        ut = []
        B.skriv_jamforelse(res, ut.append)
        self.assertTrue([r for r in ut if r.startswith('AVBRÖTS') and 'ConnectionError' in r])   # avbrottet syns, ingen tyst tom tabell

    def test_misslyckad_hamtning_rapporteras_med_skal(self):
        fr, h, res = self.kor([kontroll(1, gammalt(5.0))], {'k1.hqc': stock(lat=0.0, lon=0.0)})
        self.assertEqual(res['rader'], [])
        self.assertEqual(res['misslyckade'][0][:1] + (res['misslyckade'][0][2],), (1, 'ingen stock med både GPS-position och skördetid'))

    def test_samma_urval_som_skriv_over_i_torrkorning(self):
        # docstringens löfte: "skulle ersättas" i läsläget == "skulle ersätta gamla" i torrkörningen med --skriv-over
        kontroller = [kontroll(1, gammalt(4.0)), kontroll(2, gammalt(5.0, harvest_time='2026-05-14T12:59:35.010087+00:00')),
                      kontroll(3, gammalt(6.0)), kontroll(4, None), kontroll(5, gammalt(7.0))]
        stockar = {f'k{i}.hqc': stock() for i in range(1, 6)}
        stockar['k5.hqc'] = stock(tid='2026-10-20 12:00:00+00')
        M.requests = Fejk(kontroller, stockar)
        res = B.jamfor_gamla(M, http=RaknaHttp(bra), nu=NU)
        M.requests = Fejk(kontroller, stockar)
        tor = M.komplettera_saknat_vader(max_antal=None, skriv=False, http=RaknaHttp(bra), nu=NU, skriv_over=True, ignorera_permanenta=True)
        self.assertEqual(len(res['rader']), tor['ersatta'])
        self.assertEqual((res['redan_ratta'], res['inte_klara']), (tor['redan_ratta'], tor['inte_klara']))

    def test_main_vagrar_kombinera_med_skriv_eller_aterstall(self):
        for extra in ('--skriv', '--aterstall'):
            sys.argv = ['x', '--jamfor', extra]
            self.assertEqual(B.main(), 2)


class Exempel(unittest.TestCase):
    """Läsläget mot de två fallen från körningen på importdatorn 2026-10-21: ackumulerande Scorpion-filer där 'tidigaste
    stammen i filen' gav väder från fel kontroll. (Syntetiska rader byggda efter fallen — inte hämtade ur databasen.)"""

    def setUp(self):
        self.orig = M.requests
        M._vader_nat['nere_sedan'] = None

    def tearDown(self):
        M.requests = self.orig
        M._vader_nat['nere_sedan'] = None

    @staticmethod
    def gammalt(harvest_time, temp=3.0):
        return {'source': 'open-meteo.com', 'fetched_at': '2026-05-20T17:08:56+00:00', 'harvest_time': harvest_time,
                'temperature_c': temp, 'is_freezing': temp < 0}

    def kor(self, kontroller, stockar):
        M.requests = Fejk(kontroller, stockar)
        anrop = []
        def svara(p):
            anrop.append(p)
            return bra(p)
        res = B.jamfor_gamla(M, http=RaknaHttp(svara), nu=NU)
        return res, anrop

    def test_hossjomala_13_15_och_21_april_fick_alla_8_april(self):
        fil = stockar_db((57.00, 15.00, '2026-04-08 08:00:00+00'), (57.01, 15.01, '2026-04-13 07:00:00+00'),
                         (57.02, 15.02, '2026-04-15 07:00:00+00'), (57.03, 15.03, '2026-04-21 07:00:00+00'))
        gammal = '2026-04-08T08:00:00+00:00'
        kontroller = [kontroll(1, self.gammalt(gammal), 'hossjomala_13.hqc', '2026-04-13'),
                      kontroll(2, self.gammalt(gammal), 'hossjomala_15.hqc', '2026-04-15'),
                      kontroll(3, self.gammalt(gammal), 'hossjomala_21.hqc', '2026-04-21')]
        res, anrop = self.kor(kontroller, {k['filnamn']: fil for k in kontroller})
        self.assertEqual([(x['id'], x['gammal_dagar'], x['ny_dagar']) for x in res['rader']], [(1, 5, 0), (2, 7, 0), (3, 13, 0)])
        self.assertEqual([p['start_date'] for p in anrop], ['2026-04-13', '2026-04-15', '2026-04-21'])
        ut = []
        B.skriv_jamforelse(res, ut.append)
        text = '\n'.join(ut)
        self.assertIn('Väder från mer än ett dygn före kontrollens datum: gammalt 3 av 3, nytt 0 av 3', text)
        self.assertNotIn('FORTFARANDE FEL STAM', text)

    def test_askeback_id_1281_far_sin_egen_stam_inte_krokshults(self):
        # filen innehåller Krokshults stammar (tidigare kontroll, 56.50) och Äskebäcks egna (56.90) på kontrollens datum
        fil = stockar_db((56.50, 15.50, '2026-04-03 08:00:00+00'), (56.51, 15.51, '2026-04-03 09:00:00+00'),
                         (56.90, 15.90, '2026-04-10 07:00:00+00'), (56.91, 15.91, '2026-04-10 12:00:00+00'))
        kontroller = [kontroll(1281, self.gammalt('2026-04-03T08:00:00+00:00'), 'askeback.hqc', '2026-04-10')]
        res, anrop = self.kor(kontroller, {'askeback.hqc': fil})
        self.assertEqual((anrop[0]['latitude'], anrop[0]['start_date']), ('56.9000', '2026-04-10'))
        lasning = [a[1] for a in M.requests.anrop if a[0] == 'GET' and '/fakt_kalibrering?' in a[1]][0]
        self.assertIn('datum', lasning.split('select=')[1].split('&')[0].split(','))     # fejken ignorerar select, PostgREST gör det inte
        x = res['rader'][0]
        self.assertEqual((x['id'], x['gammal_dagar'], x['ny_dagar']), (1281, 7, 0))

    def test_kontroll_utan_stam_pa_sin_dag_far_senaste_stammen_och_flaggas_om_den_ar_for_gammal(self):
        fil = stockar_db((57.00, 15.00, '2026-04-08 08:00:00+00'), (57.01, 15.01, '2026-04-09 07:00:00+00'))
        kontroller = [kontroll(7, self.gammalt('2026-04-08T08:00:00+00:00'), 'k7.hqc', '2026-04-13')]
        res, anrop = self.kor(kontroller, {'k7.hqc': fil})
        self.assertEqual(anrop[0]['start_date'], '2026-04-09')                       # senaste stammen i filen
        ut = []
        B.skriv_jamforelse(res, ut.append)
        text = '\n'.join(ut)
        self.assertIn('nytt 1 av 1', text)                                            # 4 dygn före: syns, tystas inte
        self.assertIn('FORTFARANDE FEL STAM?  id 7', text)

    def test_tabellen_visar_kontrollens_datum(self):
        fil = stockar_db((57.01, 15.01, '2026-04-13 07:00:00+00'))
        res, _ = self.kor([kontroll(1, self.gammalt('2026-04-08T08:00:00+00:00'), 'a.hqc', '2026-04-13')], {'a.hqc': fil})
        ut = []
        B.skriv_jamforelse(res, ut.append)
        self.assertTrue([r for r in ut if r.lstrip().startswith('1  a.hqc') and '2026-04-13' in r])


if __name__ == '__main__':
    unittest.main(verbosity=2)
