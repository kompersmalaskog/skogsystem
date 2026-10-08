"""Test: ett syntetiskt (Rottne) skift slutar när nästa förare loggar in på samma maskin.

    python scripts/test_skift_overlapp.py

Ingen nätverksåtkomst: requests byts mot en attrapp, så testet ser exakt vad som läses och SKRIVS.

Bakgrund: R64428 2026-10-07. Rottne saknar OperatorShiftDefinition, så parsern bygger syntetiska skift (SYN_)
av WorkTime. ReportEndTime-fyllnaden lyfte utloggningen för ALLA förare den dagen till filens slut
(20:50:51.132817) — Oskar, som slutade 16:50, fick samma slut som Martin och arbetsdagen blev 06:59–20:50.
Upsert-sammanslagningen tar GREATEST(utloggning), så ett för långt slut kunde aldrig krympa igen.
Regeln (Martin 2026-10-08): bara SYNTETISKA skift kapas. Ponsse har maskinens egen ShiftEndTime — den rörs inte.
"""
import os, sys, unittest, importlib.util
from datetime import datetime, timedelta

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Importmodulen avbryter utan Supabase-uppgifter. Testet pratar aldrig med nätet (requests byts mot en attrapp),
# så attrappvärden räcker — och en riktig .env.local behövs inte.
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


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
D = datetime(2026, 10, 7).date()


def dt(h, m=0, s=0, us=0):
    return datetime(2026, 10, 7, h, m, s, us)


def skift(op, inl, utl, key=None, maskin='R64428'):
    return {'datum': D, 'maskin_id': maskin, 'operator_id': op, 'inloggning_tid': inl, 'utloggning_tid': utl,
            'langd_sek': int((utl - inl).total_seconds()), 'shift_key': key if key is not None else f'SYN_{D}_{op}'}


OSKAR = skift('R64428_8', dt(6, 59, 48, 738105), dt(20, 50, 51, 132817))
MARTIN = skift('R64428_9', dt(16, 50, 48, 275589), dt(20, 50, 51, 132817))


class Kapning(unittest.TestCase):
    def test_oskar_slutar_nar_martin_loggar_in(self):
        ut = M.kapa_syntetiska_skift([dict(OSKAR), dict(MARTIN)])
        o = [r for r in ut if r['operator_id'] == 'R64428_8'][0]
        m = [r for r in ut if r['operator_id'] == 'R64428_9'][0]
        self.assertEqual(o['utloggning_tid'], MARTIN['inloggning_tid'])
        self.assertEqual(o['langd_sek'], 35459)           # int() som resten av importen
        self.assertEqual(m['utloggning_tid'], MARTIN['utloggning_tid'])
        self.assertEqual(m['langd_sek'], MARTIN['langd_sek'])

    def test_indatan_andras_inte(self):
        a, b = dict(OSKAR), dict(MARTIN)
        M.kapa_syntetiska_skift([a, b])
        self.assertEqual(a, OSKAR)
        self.assertEqual(b, MARTIN)

    def test_idempotent(self):
        en = M.kapa_syntetiska_skift([dict(OSKAR), dict(MARTIN)])
        tva = M.kapa_syntetiska_skift([dict(r) for r in en])
        self.assertEqual(en, tva)

    def test_ponsse_aldrig(self):
        a = skift('A030353_2', dt(4, 7), dt(7, 42), key='649', maskin='A030353')
        b = skift('A030353_1', dt(7, 20), dt(17, 18), key='650', maskin='A030353')
        self.assertEqual(M.kapa_syntetiska_skift([dict(a), dict(b)]), [a, b])

    def test_syntetiskt_kapas_mot_aktt_skift(self):
        ut = M.kapa_syntetiska_skift([dict(OSKAR), dict(MARTIN, shift_key='9001')])
        self.assertEqual([r for r in ut if r['operator_id'] == 'R64428_8'][0]['utloggning_tid'], MARTIN['inloggning_tid'])

    def test_ingen_overlappning_inget_andras(self):
        tidig = skift('R64428_8', dt(6, 59), dt(16, 50))
        self.assertEqual(M.kapa_syntetiska_skift([dict(tidig), dict(MARTIN)])[0], tidig)

    def test_kedja(self):
        a = skift('R64428_8', dt(6, 59), dt(20, 0))
        b = skift('R64428_9', dt(16, 50), dt(20, 0))
        c = skift('R64428_10', dt(18, 30), dt(20, 0))
        ut = {r['operator_id']: r for r in M.kapa_syntetiska_skift([a, b, c])}
        self.assertEqual(ut['R64428_8']['utloggning_tid'], b['inloggning_tid'])
        self.assertEqual(ut['R64428_9']['utloggning_tid'], c['inloggning_tid'])
        self.assertEqual(ut['R64428_10']['utloggning_tid'], c['utloggning_tid'])

    def test_samma_inloggning_ger_ingen_nollang_kapning(self):
        a = skift('R64428_8', dt(6, 49), dt(16, 0))
        b = skift('R64428_9', dt(6, 49), dt(20, 0))
        self.assertEqual(M.kapa_syntetiska_skift([dict(a), dict(b)]), [a, b])

    def test_samma_forare_tva_pass_ar_inte_en_annan_forare(self):
        f1 = skift('R64428_8', dt(6, 59), dt(20, 0), key='SYN_a')
        f2 = skift('R64428_8', dt(12, 0), dt(20, 0), key='SYN_b')
        self.assertEqual(M.kapa_syntetiska_skift([dict(f1), dict(f2)]), [f1, f2])


class ParserFyllnad(unittest.TestCase):
    """bygg_syntetiska_skift: ReportEndTime fyller bara ut för förarens som slutar SIST maskindagen."""

    def op_dag(self):
        return {
            ('R64428_8', D): [(dt(6, 59, 48), 3600), (dt(15, 0, 0), 6600)],      # slutar 16:50:00
            ('R64428_9', D): [(dt(16, 50, 48), 3600), (dt(18, 0, 0), 10000)],    # slutar 20:46:40
        }

    def bygg(self, op_dag, report_end):
        return {r['operator_id']: r for r in M.bygg_syntetiska_skift(op_dag, report_end, 'R64428', 'fil.mom', {})}

    def test_oskar_fylls_inte_ut_till_filens_slut_men_martin_gor(self):
        ut = self.bygg(self.op_dag(), dt(20, 50, 51, 132817))
        self.assertEqual(ut['R64428_8']['utloggning_tid'], dt(16, 50, 0))
        self.assertEqual(ut['R64428_9']['utloggning_tid'], dt(20, 50, 51, 132817))

    def test_ensam_forare_fylls_ut_som_forut(self):
        op_dag = {('R64428_8', D): [(dt(6, 59, 48), 3600), (dt(15, 0, 0), 6600)]}
        self.assertEqual(self.bygg(op_dag, dt(20, 50, 51))['R64428_8']['utloggning_tid'], dt(20, 50, 51))

    def test_rapportslut_en_annan_dag_fyller_inte(self):
        ut = self.bygg(self.op_dag(), datetime(2026, 10, 8, 5, 0, 0))
        self.assertEqual(ut['R64428_9']['utloggning_tid'], dt(20, 46, 40))

    def test_saknas_rapportslut_inget_fylls(self):
        ut = self.bygg(self.op_dag(), None)
        self.assertEqual(ut['R64428_8']['utloggning_tid'], dt(16, 50, 0))
        self.assertEqual(ut['R64428_9']['utloggning_tid'], dt(20, 46, 40))

    def test_nyckel_och_inloggning_som_forut(self):
        ut = self.bygg(self.op_dag(), dt(20, 50, 51))
        self.assertEqual(ut['R64428_8']['shift_key'], f'SYN_{D}_R64428_8')
        self.assertEqual(ut['R64428_8']['inloggning_tid'], dt(6, 59, 48))

    def test_overlapp_inom_filen_kapas(self):
        # Oskars sista post är så lång att den sträcker sig förbi Martins inloggning
        op_dag = {('R64428_8', D): [(dt(6, 59, 48), 3600), (dt(15, 0, 0), 14400)],   # 19:00
                  ('R64428_9', D): [(dt(16, 50, 48), 3600), (dt(18, 0, 0), 10000)]}
        ut = self.bygg(op_dag, dt(20, 50, 51))
        self.assertEqual(ut['R64428_8']['utloggning_tid'], dt(16, 50, 48))

    def test_lika_slut_ger_ingen_overlapp_efter_kapning(self):
        op_dag = {('R64428_8', D): [(dt(6, 59, 48), 3600), (dt(17, 0, 0), 7200)],    # 19:00
                  ('R64428_9', D): [(dt(16, 50, 48), 3600), (dt(17, 0, 0), 7200)]}   # 19:00
        ut = self.bygg(op_dag, None)
        self.assertEqual(ut['R64428_8']['utloggning_tid'], dt(16, 50, 48))
        self.assertEqual(ut['R64428_9']['utloggning_tid'], dt(19, 0, 0))


class DbKapning(unittest.TestCase):
    """kapa_syntetiska_skift_i_db: efter upserten kapas de syntetiska passen i DATABASEN (GREATEST-sammanslagningen
    kan inte krympa ett för långt slut av sig själv)."""

    class Svar:
        def __init__(self, status=200, data=None):
            self.status_code = status; self._d = data or []; self.ok = status < 300
        def json(self):
            return self._d

    def setUp(self):
        self.rader = [
            {'id': 69621, 'maskin_id': 'R64428', 'datum': str(D), 'operator_id': 'R64428_8', 'shift_key': f'SYN_{D}_R64428_8',
             'inloggning_tid': '2026-10-07T06:59:48.738105+00:00', 'utloggning_tid': '2026-10-07T20:50:51.132817+00:00', 'langd_sek': 49862},
            {'id': 69679, 'maskin_id': 'R64428', 'datum': str(D), 'operator_id': 'R64428_9', 'shift_key': f'SYN_{D}_R64428_9',
             'inloggning_tid': '2026-10-07T16:50:48.275589+00:00', 'utloggning_tid': '2026-10-07T20:50:51.132817+00:00', 'langd_sek': 14402},
        ]
        self.patchar = []
        test = self

        class FakeRequests:
            @staticmethod
            def get(url, params=None, headers=None, timeout=None):
                return DbKapning.Svar(200, [dict(r) for r in test.rader])

            @staticmethod
            def patch(url, headers=None, data=None, timeout=None):
                import json
                test.patchar.append((url, json.loads(data)))
                rid = int(url.split('id=eq.')[1].split('&')[0])
                for r in test.rader:
                    if r['id'] == rid:
                        r.update(json.loads(data))
                return DbKapning.Svar(204)

        self.fake = FakeRequests
        self.gammal = M.requests
        M.requests = FakeRequests
        M.SUPABASE_URL = 'https://x.supabase.co'

    def tearDown(self):
        M.requests = self.gammal

    def test_oskars_rad_patchas_martins_inte(self):
        n = M.kapa_syntetiska_skift_i_db('R64428', str(D))
        self.assertEqual(n, 1)
        self.assertEqual(len(self.patchar), 1)
        url, body = self.patchar[0]
        self.assertIn('id=eq.69621', url)
        self.assertEqual(body, {'utloggning_tid': '2026-10-07T16:50:48.275589', 'langd_sek': 35459})

    def test_kors_igen_andras_inget(self):
        M.kapa_syntetiska_skift_i_db('R64428', str(D))
        self.patchar.clear()
        self.assertEqual(M.kapa_syntetiska_skift_i_db('R64428', str(D)), 0)
        self.assertEqual(self.patchar, [])

    def test_lasfel_ger_ingen_skrivning_och_ingen_krasch(self):
        self.fake.get = staticmethod(lambda *a, **k: DbKapning.Svar(500))
        self.assertEqual(M.kapa_syntetiska_skift_i_db('R64428', str(D)), 0)
        self.assertEqual(self.patchar, [])


class ArbetsdagRast(unittest.TestCase):
    """_create_arbetsdag: rasten är förarens EGEN, summerad över ALLA hans operatör-id den dagen (inte bara första)."""

    def test_rast_summeras_over_forarens_operatorer(self):
        skiftrader = [
            {'operator_id': 'A_1', 'maskin_id': 'A030353', 'datum': str(D), 'inloggning_tid': '2026-10-07T06:00:00', 'utloggning_tid': '2026-10-07T10:00:00', 'langd_sek': 14400},
            {'operator_id': 'A_3', 'maskin_id': 'A030353', 'datum': str(D), 'inloggning_tid': '2026-10-07T11:00:00', 'utloggning_tid': '2026-10-07T15:00:00', 'langd_sek': 14400},
        ]
        tidrader = [
            {'operator_id': 'A_1', 'datum': str(D), 'rast_sek': 600, 'objekt_id': None},
            {'operator_id': 'A_3', 'datum': str(D), 'rast_sek': 1200, 'objekt_id': None},
        ]

        class R:
            @staticmethod
            def get(url, params=None, headers=None, timeout=None):
                if 'operator_medarbetare' in url:
                    return DbKapning.Svar(200, [{'operator_id': 'A_1', 'medarbetare_id': 'med-max'}, {'operator_id': 'A_3', 'medarbetare_id': 'med-max'}])
                if 'dim_operator' in url:
                    return DbKapning.Svar(200, [])
                if 'fakt_skift' in url:
                    return DbKapning.Svar(200, skiftrader)
                if 'fakt_tid' in url:
                    return DbKapning.Svar(200, tidrader)
                return DbKapning.Svar(200, [])

        skrivet = []
        gammal_r, gammal_u, gammal_s = M.requests, M.upsert_arbetsdag, M.MOM_SYNK_FRAN
        M.requests = R
        M.upsert_arbetsdag = lambda rows: (skrivet.extend(rows), len(rows))[1]
        M.MOM_SYNK_FRAN = '2026-01-01'
        M.SUPABASE_URL = 'https://x.supabase.co'
        try:
            M._create_arbetsdag(tidrader, skiftrader)
        finally:
            M.requests, M.upsert_arbetsdag, M.MOM_SYNK_FRAN = gammal_r, gammal_u, gammal_s
        self.assertEqual(len(skrivet), 1)
        self.assertEqual(skrivet[0]['rast_min'], 30)


if __name__ == '__main__':
    unittest.main(verbosity=2)
