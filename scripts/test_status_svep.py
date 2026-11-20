"""Test: status-svepet och auto-avslut läser skotarens lass ur helikopter_lass (Opti + appen).

    python scripts/test_status_svep.py

Ingen nätverksåtkomst: requests byts mot en låtsasdatabas (PostgREST-filtren eq/neq/gt/in/is/or/order/limit)
som minns allt som SKRIVS. Siffrorna är prod 2026-11-04:
  - Mölleryd: båda flaggorna satta 26 okt, status pågående, ingen ny fil → svepet ska avsluta den.
  - Arvidstorp: planerad, Giant har producerat 28 okt–2 nov → svepet ska sätta pågående.
  - Skälviken: filerna 40 m³ skotat, filer+app 700 av 1 725 skördat → får INTE flaggas som färdigskotad.
  - Bondeskog: planerad utan aktivitet → rörs inte.
"""
import importlib.util
import logging
import os
import sys
import unittest
from urllib.parse import unquote

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HAR)
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


def ladda_import():
    spec = importlib.util.spec_from_file_location('imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
    m = importlib.util.module_from_spec(spec)
    orig = logging.FileHandler
    logging.FileHandler = lambda *a, **k: logging.NullHandler()
    try:
        spec.loader.exec_module(m)
    except SystemExit:
        pass
    finally:
        logging.FileHandler = orig
    return m


M = ladda_import()
GIANT, ELEFANT = 'PONS20SDJAA270231', 'A130743'


def _matchar(rad, nyckel, villkor):
    v = rad.get(nyckel)
    op, _, arg = villkor.partition('.')
    if op == 'eq':
        return str(v) == arg
    if op == 'neq':
        return str(v) != arg
    if op == 'gt':
        return v is not None and str(v) > arg
    if op == 'gte':
        return v is not None and float(v) >= float(arg)
    if op == 'in':
        return str(v) in [x.strip('"') for x in arg.strip('()').split(',')]
    if op == 'is':
        return v is None if arg == 'null' else v is not None
    if op == 'not':
        return not _matchar(rad, nyckel, arg)
    raise AssertionError(f'okänt filter {villkor}')


class Resp:
    def __init__(self, data, status=200):
        self._d, self.status_code = data, status

    def json(self):
        return self._d


class FakeDb:
    def __init__(self, tabeller):
        self.t = tabeller
        self.skrivet = []

    def _urval(self, url, params):
        tabell = url.split('/rest/v1/')[1].split('?')[0]
        params = dict(params or {})
        if '?' in url:  # filter i adressen (patch/delete)
            for del_ in url.split('?', 1)[1].split('&'):
                k, _, v = del_.partition('=')
                params[k] = unquote(v)
        rader = list(self.t.get(tabell, []))
        for k, v in params.items():
            if k in ('select', 'order', 'limit'):
                continue
            if k == 'or':
                delar = v[1:-1].split(',')
                rader = [r for r in rader if any(_matchar(r, d.split('.', 1)[0], d.split('.', 1)[1]) for d in delar)]
            else:
                rader = [r for r in rader if _matchar(r, k, v)]
        if 'order' in params:
            kol, _, rikt = params['order'].partition('.')
            rader.sort(key=lambda r: str(r.get(kol)), reverse=(rikt == 'desc'))
        if 'limit' in params:
            rader = rader[:int(params['limit'])]
        return tabell, rader

    def get(self, url, params=None, **_):
        return Resp(self._urval(url, params)[1])

    def patch(self, url, json=None, **_):
        tabell, rader = self._urval(url, None)
        for r in rader:
            r.update(json)
            self.skrivet.append(('patch', tabell, r.get('namn') or r.get('objekt_id'), dict(json)))
            if tabell == 'objekt' and json.get('status') == 'avslutat':  # = triggern maskin_ko_ur_vid_avslut
                self.t['maskin_ko'] = [k for k in self.t['maskin_ko'] if k['objekt_id'] != r['id']]
        return Resp(None, 204)

    def delete(self, url, **_):
        tabell, rader = self._urval(url, None)
        for r in rader:
            self.t[tabell].remove(r)
            self.skrivet.append(('delete', tabell, r.get('objekt_id'), None))
        return Resp(None, 204)


def prod_db():
    return FakeDb({
        'objekt': [
            {'id': 'u-moll', 'namn': 'Mölleryd', 'status': 'pagaende', 'vo_nummer': '11271883', 'dim_objekt_id': None, 'bolag': 'Vida'},
            {'id': 'u-arvid', 'namn': 'Arvidstorp', 'status': 'planerad', 'vo_nummer': '11277905', 'dim_objekt_id': None, 'bolag': 'Vida'},
            {'id': 'u-skalv', 'namn': 'Skälviken', 'status': 'pagaende', 'vo_nummer': '11271860', 'dim_objekt_id': None, 'bolag': 'Vida'},
            {'id': 'u-bonde', 'namn': 'Bondeskog', 'status': 'planerad', 'vo_nummer': '11280797', 'dim_objekt_id': None, 'bolag': 'Vida'},
            {'id': 'u-klar', 'namn': 'Gammal', 'status': 'avslutat', 'vo_nummer': '11000001', 'dim_objekt_id': None, 'bolag': 'Vida'},
        ],
        'dim_objekt': [
            {'objekt_id': '11271883', 'vo_nummer': '11271883', 'object_name': 'Mölleryd', 'bolag': 'Vida',
             'skordning_avslutad': '2026-10-21', 'skotning_avslutad': '2026-10-26', 'egen_skotning': False},
            {'objekt_id': '11277905', 'vo_nummer': '11277905', 'object_name': 'Arvidstorp', 'bolag': 'Vida',
             'skordning_avslutad': '2026-11-02', 'skotning_avslutad': None, 'egen_skotning': False},
            {'objekt_id': '11271860', 'vo_nummer': '11271860', 'object_name': 'Skälviken', 'bolag': 'Vida',
             'skordning_avslutad': '2026-10-28', 'skotning_avslutad': None, 'egen_skotning': False},
            {'objekt_id': '11277898', 'vo_nummer': '11277898', 'object_name': 'Edestad', 'bolag': 'Vida',
             'skordning_avslutad': None, 'skotning_avslutad': None, 'egen_skotning': False},
        ],
        'fakt_produktion': [
            {'objekt_id': '11271883', 'maskin_id': GIANT, 'datum': '2026-10-21'},
            {'objekt_id': '11277905', 'maskin_id': GIANT, 'datum': '2026-11-02'},
            {'objekt_id': '11271860', 'maskin_id': GIANT, 'datum': '2026-10-28'},
            {'objekt_id': '11277898', 'maskin_id': GIANT, 'datum': '2026-11-04'},
        ],
        'fakt_sortiment': [
            {'objekt_id': '11271883', 'maskin_id': GIANT, 'datum': '2026-10-21'},
            {'objekt_id': '11271860', 'maskin_id': GIANT, 'datum': '2026-10-28'},
            {'objekt_id': '11277905', 'maskin_id': GIANT, 'datum': '2026-11-02'},
            {'objekt_id': '11277898', 'maskin_id': GIANT, 'datum': '2026-11-04'},
        ],
        'vy_uppf_prod_per_objekt': [
            {'objekt_id': '11271883', 'volym_m3sub': 988}, {'objekt_id': '11271860', 'volym_m3sub': 1725},
            {'objekt_id': '11277905', 'volym_m3sub': 628},
        ],
        # Filerna ensamma: Skälviken 40 m³ (Elefanten rapporterar i appen sedan 20 okt).
        'fakt_lass': [
            {'objekt_id': '11271860', 'maskin_id': ELEFANT, 'datum': '2026-10-21', 'volym_m3sub': 40},
            {'objekt_id': '11277898', 'maskin_id': ELEFANT, 'datum': '2026-11-03', 'volym_m3sub': 30},
        ],
        # Opti + appen: Skälviken 700 m³, sista lass i dag, Elefanten har inte flyttat.
        'helikopter_lass': [
            {'objekt_id': '11271883', 'maskin_id': ELEFANT, 'datum': '2026-10-26', 'volym_m3sub': 930},
            {'objekt_id': '11271860', 'maskin_id': ELEFANT, 'datum': '2026-10-27', 'volym_m3sub': 600},
            {'objekt_id': '11271860', 'maskin_id': ELEFANT, 'datum': '2026-11-04', 'volym_m3sub': 100},
        ],
        'skotare_objekt_manuell': [],
        'maskin_ko': [{'id': 'k1', 'objekt_id': 'u-moll', 'maskin_id': ELEFANT}],
    })


class StatusSvep(unittest.TestCase):
    def setUp(self):
        self.db = prod_db()
        self._orig = (M.requests.get, M.requests.patch, M.requests.delete, M.AUTO_STATUS_LAGE, M.AUTO_AVSLUT_LAGE)
        M.requests.get, M.requests.patch, M.requests.delete = self.db.get, self.db.patch, self.db.delete

    def tearDown(self):
        M.requests.get, M.requests.patch, M.requests.delete, M.AUTO_STATUS_LAGE, M.AUTO_AVSLUT_LAGE = self._orig

    def status(self, namn):
        return next(o['status'] for o in self.db.t['objekt'] if o['namn'] == namn)

    def test_skriv_avslutar_molleryd_och_startar_arvidstorp(self):
        M.AUTO_STATUS_LAGE = M.AUTO_AVSLUT_LAGE = 'skriv'
        M.status_svep()
        self.assertEqual(self.status('Mölleryd'), 'avslutat')
        self.assertEqual(self.db.t['maskin_ko'], [])  # ur alla köer, som Avsluta-knappen
        self.assertEqual(self.status('Arvidstorp'), 'pagaende')
        self.assertEqual(self.status('Skälviken'), 'pagaende')
        self.assertEqual(self.status('Bondeskog'), 'planerad')  # ingen aktivitet → rörs inte
        self.assertEqual(self.status('Gammal'), 'avslutat')
        skal = next(d for d in self.db.t['dim_objekt'] if d['objekt_id'] == '11271860')
        self.assertIsNone(skal['skotning_avslutad'])  # 1 025 m³ kvar och skotaren kvar på trakten

    def test_logga_skriver_ingenting(self):
        M.AUTO_STATUS_LAGE = M.AUTO_AVSLUT_LAGE = 'logga'
        M.status_svep()
        self.assertEqual(self.db.skrivet, [])

    def test_skotat_laser_app_lass(self):
        r = M.utvardera_avslut('11271860', '11271860')
        self.assertEqual(round(r['skotat']), 700)  # fakt_lass ensam gav 40
        self.assertEqual(round(r['backen']), 1025)
        self.assertFalse(r['satter_skot'])

    def test_skotare_som_flyttat_med_liten_backe_flaggas(self):
        # Elefanten lastar sista 50 m³ på Skälviken i appen och kör sedan på Edestad.
        self.db.t['helikopter_lass'] += [
            {'objekt_id': '11271860', 'maskin_id': ELEFANT, 'datum': '2026-11-05', 'volym_m3sub': 1015},
            {'objekt_id': '11277898', 'maskin_id': ELEFANT, 'datum': '2026-11-06', 'volym_m3sub': 80},
        ]
        r = M.utvardera_avslut('11271860', '11271860')
        self.assertTrue(r['satter_skot'])
        self.assertEqual(r['skot_rule'], '2026-11-05')
        self.assertTrue(r['blir_avslutat'])


H8E, WISENT = 'R64428', 'A030353'


def privat_db():
    """Steglehylte (P-1026) och Bjällerhult (P-1027): privata objekt vi skapat själva, bolag tomt, skördarens
    filer på per-maskin-nycklar (R64428_54/_55) och skotarens på en egen nyckel (A030353_200) med samma VO."""
    return FakeDb({
        'objekt': [
            {'id': 'u-steg', 'namn': 'Steglehylte', 'status': 'pagaende', 'typ': 'gallring', 'vo_nummer': 'P-1026', 'dim_objekt_id': 'R64428_54', 'bolag': None},
            {'id': 'u-bjal', 'namn': 'Bjällerhult', 'status': 'pagaende', 'typ': 'gallring', 'vo_nummer': 'P-1027', 'dim_objekt_id': 'R64428_55', 'bolag': None},
            {'id': 'u-grot', 'namn': 'Sibbesson GROT', 'status': 'pagaende', 'typ': 'grot', 'vo_nummer': '11275090', 'dim_objekt_id': None, 'bolag': 'Vida'},
        ],
        'dim_objekt': [
            {'objekt_id': 'R64428_54', 'vo_nummer': 'P-1026', 'object_name': 'Steglehylte', 'bolag': None, 'skordning_avslutad': None, 'skotning_avslutad': None, 'egen_skotning': False},
            {'objekt_id': 'A030353_200', 'vo_nummer': 'P-1026', 'object_name': 'Steglehylte', 'bolag': None, 'skordning_avslutad': None, 'skotning_avslutad': None, 'egen_skotning': False},
            {'objekt_id': 'R64428_55', 'vo_nummer': 'P-1027', 'object_name': 'Bjällerhult', 'bolag': None, 'skordning_avslutad': None, 'skotning_avslutad': None, 'egen_skotning': False},
            {'objekt_id': '11275090', 'vo_nummer': '11275090', 'object_name': 'Sibbesson GROT', 'bolag': 'Vida', 'skordning_avslutad': None, 'skotning_avslutad': None, 'egen_skotning': False},
        ],
        'fakt_produktion': [{'objekt_id': 'R64428_54', 'maskin_id': H8E, 'datum': '2026-11-04'},
                            {'objekt_id': 'R64428_55', 'maskin_id': H8E, 'datum': '2026-11-05'}],
        'fakt_sortiment': [{'objekt_id': 'R64428_54', 'maskin_id': H8E, 'datum': '2026-11-03'},
                           {'objekt_id': 'R64428_54', 'maskin_id': H8E, 'datum': '2026-11-04'},
                           {'objekt_id': 'R64428_55', 'maskin_id': H8E, 'datum': '2026-11-05'}],
        'vy_uppf_prod_per_objekt': [{'objekt_id': 'R64428_54', 'volym_m3sub': 70}, {'objekt_id': 'R64428_55', 'volym_m3sub': 30}],
        'helikopter_lass': [],
        'fakt_lass': [],
        'skotare_objekt_manuell': [],
        'hyttspar': [  # H8E:s GPS står kvar på Steglehylte (föraren bytte inte objekt i appen) — får inte hålla kvar den
            {'objekt_id': 'u-steg', 'maskin_id': H8E, 'roll': 'skordare', 'datum': '2026-11-05', 'antal_punkter': 400}],
        'dim_maskin': [{'maskin_id': H8E, 'maskin_typ': 'Harvester'}, {'maskin_id': WISENT, 'maskin_typ': 'Forwarder'},
                       {'maskin_id': GIANT, 'maskin_typ': 'Harvester'}],
        'maskin_ko': [{'id': 'k-h8', 'objekt_id': 'u-steg', 'maskin_id': H8E},
                      {'id': 'k-wis', 'objekt_id': 'u-steg', 'maskin_id': WISENT}],
    })


class PrivataObjekt(unittest.TestCase):
    def setUp(self):
        self.db = privat_db()
        self._orig = (M.requests.get, M.requests.patch, M.requests.delete, M.AUTO_STATUS_LAGE, M.AUTO_AVSLUT_LAGE)
        M.requests.get, M.requests.patch, M.requests.delete = self.db.get, self.db.patch, self.db.delete
        M.AUTO_STATUS_LAGE = M.AUTO_AVSLUT_LAGE = 'skriv'

    def tearDown(self):
        M.requests.get, M.requests.patch, M.requests.delete, M.AUTO_STATUS_LAGE, M.AUTO_AVSLUT_LAGE = self._orig

    def dim(self, oid):
        return next(d for d in self.db.t['dim_objekt'] if d['objekt_id'] == oid)

    def test_skordaren_klar_nar_den_producerar_pa_annat_privat_objekt(self):
        M.status_svep()
        self.assertEqual(self.dim('R64428_54')['skordning_avslutad'], '2026-11-04')
        self.assertEqual(self.dim('A030353_200')['skordning_avslutad'], '2026-11-04')  # alla nycklar på raden
        self.assertIsNone(self.dim('R64428_55')['skordning_avslutad'])  # där den är nu
        ko = {(k['objekt_id'], k['maskin_id']) for k in self.db.t['maskin_ko']}
        self.assertNotIn(('u-steg', H8E), ko)  # skördaren ur kön
        self.assertIn(('u-steg', WISENT), ko)  # skotaren kvar — inget skotat än
        self.assertEqual(next(o for o in self.db.t['objekt'] if o['id'] == 'u-steg')['status'], 'pagaende')

    def test_skotaren_klar_via_gps_pa_annat_objekt_och_lass_pa_egen_nyckel(self):
        self.db.t['helikopter_lass'] += [{'objekt_id': 'A030353_200', 'maskin_id': WISENT, 'datum': '2026-11-06', 'volym_m3sub': 62}]
        self.db.t['hyttspar'] += [{'objekt_id': 'u-bjal', 'maskin_id': WISENT, 'roll': 'skotare', 'datum': '2026-11-07', 'antal_punkter': 300}]
        M.status_svep()
        self.assertEqual(self.dim('R64428_54')['skotning_avslutad'], '2026-11-06')
        self.assertEqual(next(o for o in self.db.t['objekt'] if o['id'] == 'u-steg')['status'], 'avslutat')
        self.assertFalse([k for k in self.db.t['maskin_ko'] if k['objekt_id'] == 'u-steg'])

    def test_gps_med_fa_punkter_raknas_inte(self):
        self.db.t['helikopter_lass'] += [{'objekt_id': 'A030353_200', 'maskin_id': WISENT, 'datum': '2026-11-06', 'volym_m3sub': 62}]
        self.db.t['hyttspar'] += [{'objekt_id': 'u-bjal', 'maskin_id': WISENT, 'roll': 'skotare', 'datum': '2026-11-07', 'antal_punkter': 12}]
        M.status_svep()
        self.assertIsNone(self.dim('R64428_54')['skotning_avslutad'])

    def test_stor_backe_haller_skotningen_oppen(self):
        self.db.t['helikopter_lass'] += [{'objekt_id': 'A030353_200', 'maskin_id': WISENT, 'datum': '2026-11-06', 'volym_m3sub': 40}]
        self.db.t['hyttspar'] += [{'objekt_id': 'u-bjal', 'maskin_id': WISENT, 'roll': 'skotare', 'datum': '2026-11-07', 'antal_punkter': 300}]
        M.status_svep()
        self.assertIsNone(self.dim('R64428_54')['skotning_avslutad'])  # 70 − 40 = 30 m³ kvar

    def test_grot_ror_inte_den_nya_regeln(self):
        self.assertIsNone(M.utvardera_operativt(self.db.t['objekt'][2]))

    def test_logga_skriver_ingenting(self):
        M.AUTO_STATUS_LAGE = M.AUTO_AVSLUT_LAGE = 'logga'
        M.status_svep()
        self.assertEqual(self.db.skrivet, [])
        self.assertEqual(len(self.db.t['maskin_ko']), 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
