"""Test: ackumulerande HQC-filer ger inga dubbletter i detalj_kontroll_stock (2026-10-22).

    python scripts/test_kontroll_dubbletter.py

Ingen nätverksåtkomst: Supabase är fejkat. Databasens sida (rensningen och unika indexet) testas separat mot en lokal
Postgres: sh supabase/tests/kontroll_dubbletter_lokal/kor.sh

Bakgrund: Scorpionen exporterar HQC-filer som upprepar alla tidigare kontrollstockar. Nyckeln (filnamn, stam_nummer,
stock_nummer) släppte igenom varje kopia, så 881 av 2 632 rader var samma mätning igen. Den nyckel som togs fram då hade
med stam_nummer — men maskinen numrerar om stammarna i varje kumulativ fil, så ytterligare 410 rader var samma fysiska
mätning under ett annat stam_nummer. Importen skriver nu mot detalj_kontroll_stock_fysisk_unik (maskin, skördetid,
stocknummer, mättider — inte stam_nummer) med ignore-duplicates: det som redan finns hoppas över, bara det nya läggs till.
"""
import os, sys, unittest
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_vader_vid_skord import M, NU, Svar, FejkRequests, RaknaHttp, kontroll, bra, stock  # noqa: E402

TID = datetime(2026, 1, 15, 10, 7, 40)


def stockrad(stam, nr, harvest=TID, fil='b.hqc', op_tid=datetime(2026, 1, 15, 10, 9)):
    return {'maskin_id': 'PONS', 'objekt_id': '1', 'kontroll_datum': date(2026, 1, 16), 'filnamn': fil,
            'stam_nummer': stam, 'stock_nummer': nr, 'harvest_date': harvest, 'machine_measurement_date': harvest,
            'operator_measurement_date': op_tid}


def matpunkt(stam, nr, pos=100):
    return {'stam_nummer': stam, 'stock_nummer': nr, 'position_cm': pos, 'diameter_maskin_mm': 200,
            'diameter_operator_mm': 201, 'klave_first_mm': None, 'klave_second_mm': None}


class Fejk:
    """Supabase-fejk för save_hqc_to_supabase: innehålls-hash-kontrollen (ingen träff) och stock-id-uppslaget per filnamn."""
    def __init__(self, ids_i_filen, lookup_status=200):
        self.ids, self.lookup_status = ids_i_filen, lookup_status

    def get(self, url, headers=None, timeout=None):
        if '/fakt_kalibrering' in url:
            return Svar(200, [])
        if '/detalj_kontroll_stock' in url:
            if self.lookup_status != 200:
                return Svar(self.lookup_status, [])
            return Svar(200, [{'id': i, 'stam_nummer': s, 'stock_nummer': n} for (s, n), i in self.ids.items()])
        return Svar(200, [])


class SparaHqc(unittest.TestCase):
    def setUp(self):
        self.orig = (M.requests, M.upsert_data, M.komplettera_saknat_vader, M.lagg_pa_vader)
        self.anrop = []

        def upsert(tabell, rader, unique_columns=None, on_conflict='merge'):
            self.anrop.append((tabell, rader, unique_columns, on_conflict))
            return len(rader)
        M.upsert_data = upsert
        M.komplettera_saknat_vader = lambda **kw: {'fyllda': 0, 'misslyckade': [], 'inte_klara': 0, 'hoppade_permanent': 0}
        M.lagg_pa_vader = lambda *a, **k: None

    def tearDown(self):
        M.requests, M.upsert_data, M.komplettera_saknat_vader, M.lagg_pa_vader = self.orig

    def data(self, stockar, matpunkter=()):
        return {'filnamn': 'b.hqc', 'kalibrering': [{'maskin_id': 'PONS', 'filnamn': 'b.hqc', 'innehalls_hash': None}],
                'kontroll_stockar': list(stockar), 'kontroll_matpunkter': list(matpunkter)}

    def stock_anrop(self):
        return [a for a in self.anrop if a[0] == 'detalj_kontroll_stock']

    def test_stockarna_skrivs_mot_matningsnyckeln_med_ignore_duplicates(self):
        M.requests = Fejk({(1, 1): 10})
        self.assertTrue(M.save_hqc_to_supabase(self.data([stockrad(1, 1)])))
        (tabell, rader, nyckel, konflikt), = self.stock_anrop()
        self.assertEqual(nyckel, ['maskin_id', 'harvest_date', 'stock_nummer',
                                  'machine_measurement_date', 'operator_measurement_date'])
        self.assertNotIn('stam_nummer', nyckel)                   # maskinen numrerar om stammarna i varje fil
        self.assertEqual(konflikt, 'ignore')                      # en upprepad stock får aldrig skriva över den äldsta kopian
        for kolumn in nyckel:                                     # varje nyckelkolumn finns på raderna som skickas
            self.assertIn(kolumn, rader[0])

    def test_nyckeln_ar_samma_som_i_databasens_index(self):
        migr = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'supabase', 'migrations')
        fil = next(f for f in os.listdir(migr) if f.endswith('kontroll_stock_fysisk_2_unikt_index.sql'))
        with open(os.path.join(migr, fil), encoding='utf-8') as f:
            sql = ' '.join(f.read().split())
        self.assertIn('detalj_kontroll_stock_fysisk_unik', sql)
        self.assertIn('NULLS NOT DISTINCT', sql)
        self.assertIn('(' + ', '.join(M.KONTROLL_STOCK_NYCKEL) + ')', sql)

    def test_en_omnumrerad_kopia_ar_samma_stock(self):
        # Samma stock (samma skördetid, stocknummer och mättider) men stam 7 i stället för 1 → samma nyckel → hoppas över av databasen
        a, b = stockrad(1, 1), stockrad(7, 1)
        self.assertNotEqual(a['stam_nummer'], b['stam_nummer'])
        nyckel = lambda r: tuple(r[k] for k in M.KONTROLL_STOCK_NYCKEL)
        self.assertEqual(nyckel(a), nyckel(b))
        self.assertNotEqual(nyckel(a), nyckel(stockrad(1, 2)))                   # annan stock på samma stam är en annan stock
        self.assertNotEqual(nyckel(a), nyckel(stockrad(1, 1, harvest=datetime(2026, 1, 16, 9))))  # annan stam (skördetid)
        self.assertNotEqual(nyckel(a), nyckel(stockrad(1, 1, op_tid=datetime(2026, 1, 25, 7))))   # riktig omkontroll

    def test_matpunkter_for_redan_importerade_stockar_ar_inget_fel(self):
        # Filen har stam 1 stock 1 (finns redan under en tidigare fil → inget id här) och stam 2 stock 1 (ny, id 11)
        M.requests = Fejk({(2, 1): 11})
        data = self.data([stockrad(1, 1), stockrad(2, 1)], [matpunkt(1, 1), matpunkt(2, 1)])
        with self.assertLogs(M.logger, level='INFO') as lg:
            self.assertTrue(M.save_hqc_to_supabase(data))
        mp, = [a for a in self.anrop if a[0] == 'detalj_kontroll_stock_matpunkt']
        self.assertEqual([r['detalj_kontroll_stock_id'] for r in mp[1]], [11])      # bara den nya stockens mätpunkt skrivs
        text = '\n'.join(lg.output)
        self.assertIn('redan importerats under en tidigare fil', text)
        self.assertNotIn('saknade detalj_kontroll_stock_id', text)                   # och det varnas inte

    def test_gar_uppslaget_inte_att_lasa_varnas_det_fortfarande(self):
        M.requests = Fejk({}, lookup_status=500)
        with self.assertLogs(M.logger, level='INFO') as lg:
            M.save_hqc_to_supabase(self.data([stockrad(1, 1)], [matpunkt(1, 1)]))
        self.assertIn('saknade detalj_kontroll_stock_id', '\n'.join(lg.output))

    def test_hel_fil_av_upprepningar_ar_ingen_felaktig_import(self):
        M.requests = Fejk({})
        self.assertTrue(M.save_hqc_to_supabase(self.data([stockrad(1, 1)], [matpunkt(1, 1)])))


class VaderUtanStockar(unittest.TestCase):
    """En kontroll vars stockar alla låg i en tidigare fil har inga egna stockrader efter rensningen. Har den väder sedan förut
    lämnas det som det är — det är inget permanent fel och ska inte skrivas som import_fel."""
    def setUp(self):
        self.orig = M.requests
        M._vader_nat['nere_sedan'] = None

    def tearDown(self):
        M.requests = self.orig
        M._vader_nat['nere_sedan'] = None

    VADER = {'source': 'open-meteo.com', 'fetched_at': '2026-05-20T17:08:56+00:00', 'harvest_time': '2026-05-14T12:59:35+00:00',
             'temperature_c': 4.0, 'is_freezing': False}

    def test_med_vader_och_utan_stockar_behalls_det_tyst(self):
        M.requests = fr = FejkRequests([kontroll(1, self.VADER)], {})
        r = M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, skriv_over=True, skriv=True)
        self.assertEqual((r['saknar_stockar'], len(r['misslyckade']), r['ersatta']), (1, 0, 0))
        self.assertEqual(fr.import_fel, [])
        self.assertFalse([a for a in fr.anrop if a[0] == 'PATCH'])                    # väderraden rörs inte

    def test_utan_vader_och_utan_stockar_ar_fortfarande_ett_fel(self):
        M.requests = fr = FejkRequests([kontroll(1, None)], {})
        r = M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, skriv=True)
        self.assertEqual((r['saknar_stockar'], len(r['misslyckade'])), (0, 1))
        self.assertEqual([x['felkod'] for x in fr.import_fel], ['VADER_PERMANENT'])

    def test_med_vader_men_stockar_utan_gps_ar_fortfarande_ett_fel(self):
        M.requests = fr = FejkRequests([kontroll(1, self.VADER)], {'k1.hqc': stock(lat=None, lon=None)})
        r = M.komplettera_saknat_vader(http=RaknaHttp(bra), nu=NU, skriv_over=True, skriv=True)
        self.assertEqual((r['saknar_stockar'], len(r['misslyckade'])), (0, 1))        # stockar finns men går inte att använda


if __name__ == '__main__':
    unittest.main(verbosity=2)
