"""Test: HPR-fil → objekt när ordernumret inte matchar objekt.vo_nummer (objekt_koppling.py + _save_hpr_tables).

    python scripts/test_objekt_koppling.py

Ingen nätverksåtkomst: requests byts mot en attrapp som lagrar allt som SKICKAS till databasen, så testet ser
exakt vilken hpr_filer-rad (objekt_id, objekt_nyckel) och vilket alias som skrivs. De fyra exemplen är de
verkliga filerna ur produktionen (2026-10-14): två kopplas via namn, Vällust och Flyttobjekt blir okopplade.
"""
import importlib.util
import logging
import os
import sys
import unittest

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HAR)
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')

import objekt_koppling as K  # noqa: E402


def ladda_import():
    spec = importlib.util.spec_from_file_location('imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
    m = importlib.util.module_from_spec(spec)
    # Importern öppnar en loggfil på en Windows-sökväg vid import; testet ska inte skriva några filer.
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

# ── De fyra filerna (namn ur filnamnet) och objekten de ska/inte ska träffa ───────────────────────
MASKIN = 'PONS20SDJAA270231'
F_BAGSKYTT = f'Bågskyttebanan RP J-Hus- 25_{MASKIN}_20261013082121.hpr'
F_MOLLERYD = f'Mölleryd RP J-Hus -25_{MASKIN}_20261013091500.hpr'
F_VALLUST = f'Gallring Vällust_{MASKIN}_20261013101010.hpr'
F_FLYTT = f'Flyttobjekt_{MASKIN}_20261013111111.hpr'

OBJEKT = [
    {'id': 'u-bagskytt', 'namn': 'Bågskyttebanan RP J-Hus- 25', 'vo_nummer': '11166440'},
    {'id': 'u-molleryd', 'namn': 'Mölleryd RP J-Hus -25', 'vo_nummer': '11166477'},
    {'id': 'u-vallust', 'namn': 'Vällust RP M-R -25', 'vo_nummer': '11200001'},
    {'id': 'u-annat', 'namn': 'Älmehult Au 2026', 'vo_nummer': '11250002'},
]


class Svar:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self._d = data
        self.text = ''

    def json(self):
        return self._d


class FakeRequests:
    """Lagrar allt som skrivs. objekt/alias läses ur listorna; alias-POST läggs till i listan (som databasen)."""

    def __init__(self, objekt, alias=None, maskindata=None, byte_kolumn_saknas=False):
        self.objekt = [dict(o) for o in objekt]
        self.alias = list(alias or [])
        self.maskindata = dict(maskindata or {})        # nummer → tabell där det finns maskindata (t.ex. {'11166477': 'fakt_tid'})
        self.byte_kolumn_saknas = byte_kolumn_saknas    # migrationen med byte_till ej körd
        self.hpr_filer_rader = []
        self.alias_skrivna = []
        self.objekt_patchar = []
        self.anrop = []
        self._n = 0

    def get(self, url, params=None, headers=None, timeout=None):
        self.anrop.append(('GET', url))
        if '/rest/v1/objekt_alt_nummer' in url:
            return Svar(200, [{'nummer': a['nummer'], 'maskin_id': a.get('maskin_id'), 'objekt_id': a['objekt_id']} for a in self.alias])
        if url.split('?')[0].endswith('/rest/v1/objekt'):
            if '?select=id,vo_nummer' in url:     # huvudimportens uuid-karta (vo → id)
                return Svar(200, [{'id': o['id'], 'vo_nummer': o['vo_nummer']} for o in self.objekt if o.get('vo_nummer')])
            return Svar(200, [dict(o) for o in self.objekt])
        for tabell in ('detalj_stam', 'fakt_produktion', 'fakt_lass', 'fakt_tid'):
            if f'/rest/v1/{tabell}' in url:
                nr = str((params or {}).get('objekt_id', '')).replace('eq.', '')
                return Svar(200, [{'objekt_id': nr}] if self.maskindata.get(nr) == tabell else [])
        if '/rest/v1/hpr_filer' in url:
            return Svar(200, [])
        return Svar(200, [])

    def post(self, url, json=None, headers=None, timeout=None):
        self.anrop.append(('POST', url))
        if '/rest/v1/objekt_alt_nummer' in url:
            if self.byte_kolumn_saknas and 'byte_till' in json:
                return Svar(400, None)
            self.alias_skrivna.append(json)
            self.alias.append(json)
            return Svar(201, None)
        if '/rest/v1/hpr_filer' in url:
            self._n += 1
            self.hpr_filer_rader.append(json)
            return Svar(201, [{'id': f'fil-{self._n}'}])
        return Svar(201, [])

    def delete(self, url, headers=None, timeout=None):
        self.anrop.append(('DELETE', url))
        return Svar(200, [])

    def patch(self, url, json=None, headers=None, timeout=None):
        self.anrop.append(('PATCH', url))
        if '/rest/v1/objekt?' in url:
            # ?id=eq.<id>&vo_nummer=eq.<gammalt> — som databasen: bara raden som fortfarande har numret, och vo_nummer är unikt
            villkor = dict(p.split('=', 1) for p in url.split('?', 1)[1].split('&'))
            oid, gammalt = villkor['id'].replace('eq.', ''), villkor['vo_nummer'].replace('eq.', '')
            nytt = json['vo_nummer']
            if any(o.get('vo_nummer') == nytt for o in self.objekt):
                return Svar(409, None)
            for o in self.objekt:
                if o['id'] == oid and o.get('vo_nummer') == gammalt:
                    o['vo_nummer'] = nytt
                    self.objekt_patchar.append((oid, gammalt, nytt))
                    return Svar(200, [dict(o)])
            return Svar(200, [])
        return Svar(200, [])


class LoggFangst(logging.Handler):
    def __init__(self):
        super().__init__()
        self.rader = []

    def emit(self, record):
        self.rader.append((record.levelno, record.getMessage()))


def hpr_data(filnamn, vo_nummer, object_key):
    """Det parse_hpr_file ger för en fil med ETT objekt (bara de fält _save_hpr_tables läser)."""
    namn = M.harled_objektnamn(filnamn)
    return {
        'filnamn': filnamn, 'maskin': {'maskin_id': MASKIN},
        'objekt': [{'objekt_id': M.make_objekt_id(vo_nummer, MASKIN, object_key), 'object_key': object_key,
                    'object_name': namn, 'vo_nummer': vo_nummer, 'maskin_id': MASKIN}],
        'stammar': [{'hpr_stam_nummer': 1, 'hpr_tradslag_namn': 'GRAN', 'dbh_mm': 200, 'latitude': 56.4, 'longitude': 14.7,
                     'hpr_antal_stockar': 3, 'hpr_total_volym': 0.3, 'tidpunkt': None}],
    }


class Harness:
    """Kör _save_hpr_tables mot attrappen och fångar loggen."""

    def __init__(self, objekt=OBJEKT, alias=None, maskindata=None, byte_kolumn_saknas=False):
        self.fake = FakeRequests(objekt, alias, maskindata, byte_kolumn_saknas)
        self.logg = LoggFangst()
        M.logger.addHandler(self.logg)
        self._orig = M.requests
        M.requests = self.fake

    def kor(self, data):
        M._save_hpr_tables(data)
        return self.fake.hpr_filer_rader[-1]

    def stang(self):
        M.requests = self._orig
        M.logger.removeHandler(self.logg)

    def varningar(self):
        return [m for lvl, m in self.logg.rader if lvl >= logging.WARNING]


class NamnUrFilnamn(unittest.TestCase):
    def test_samma_namn_som_huvudimportens_harledning(self):
        for fn in (F_BAGSKYTT, F_MOLLERYD, F_VALLUST, F_FLYTT):
            self.assertEqual(K.namn_ur_filnamn(fn), M.harled_objektnamn(fn), fn)

    def test_rottne_filnamn(self):
        fn = 'Hössjömåla AU 2026-10-13 0753.hpr'
        self.assertEqual(K.namn_ur_filnamn(fn), M.harled_objektnamn(fn))
        self.assertEqual(K.namn_ur_filnamn(fn), 'Hössjömåla AU')


class NamnMatchning(unittest.TestCase):
    def test_exakt(self):
        o, orsak = K.hitta_objekt_via_namn('Mölleryd RP J-Hus -25', OBJEKT)
        self.assertEqual(o['id'], 'u-molleryd')
        self.assertEqual(orsak, 'exakt namn')

    def test_utan_skillnad_i_mellanslag_och_versaler(self):
        rader = [{'id': 'x', 'namn': 'Mölleryd  RP J-hus -25', 'vo_nummer': '1'}]
        o, orsak = K.hitta_objekt_via_namn('Mölleryd RP J-Hus -25', rader)
        self.assertEqual(o['id'], 'x')
        self.assertIn('mellanslag/versaler', orsak)

    def test_skiljetecken_raknas_inte_bort(self):
        # "J-Hus -25" och "J Hus 25" är olika objekt för oss — bara mellanslag och versaler får skilja
        o, _ = K.hitta_objekt_via_namn('Mölleryd RP J-Hus -25', [{'id': 'x', 'namn': 'Mölleryd RP J Hus 25'}])
        self.assertIsNone(o)

    def test_flera_exakta_ar_ingen_koppling(self):
        rader = OBJEKT + [{'id': 'dubblett', 'namn': 'Mölleryd RP J-Hus -25', 'vo_nummer': '11999999'}]
        o, orsak = K.hitta_objekt_via_namn('Mölleryd RP J-Hus -25', rader)
        self.assertIsNone(o)
        self.assertIn('2 objekt', orsak)

    def test_flera_exakta_faller_inte_vidare_till_loslig_matchning(self):
        rader = [{'id': 'a', 'namn': 'Ekeby'}, {'id': 'b', 'namn': 'Ekeby'}, {'id': 'c', 'namn': 'EKEBY'}]
        o, _ = K.hitta_objekt_via_namn('Ekeby', rader)
        self.assertIsNone(o)             # två exakta → stopp, trots att en tredje skulle gett "tre lika"

    def test_flera_loslig_ar_ingen_koppling(self):
        o, orsak = K.hitta_objekt_via_namn('ekeby', [{'id': 'a', 'namn': 'Ekeby'}, {'id': 'b', 'namn': 'EKEBY'}])
        self.assertIsNone(o)
        self.assertIn('2 objekt', orsak)

    def test_inget_namn_eller_ingen_traff(self):
        self.assertIsNone(K.hitta_objekt_via_namn(None, OBJEKT)[0])
        self.assertIsNone(K.hitta_objekt_via_namn('   ', OBJEKT)[0])
        self.assertIsNone(K.hitta_objekt_via_namn('Gallring Vällust', OBJEKT)[0])   # delnamn är ingen träff
        self.assertIsNone(K.hitta_objekt_via_namn('Flyttobjekt', OBJEKT)[0])


class FyraExemplen(unittest.TestCase):
    """_save_hpr_tables med de fyra riktiga filerna."""

    def test_bagskyttebanan_kopplas_via_namn_och_BYTER_nummer_nar_gamla_numret_saknar_data(self):
        h = Harness()
        try:
            rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(rad['objekt_id'], 'u-bagskytt')
            self.assertEqual(rad['objekt_nyckel'], f'{MASKIN}:11271849')           # nyckeln ändras ALDRIG
            # objekt.vo_nummer är nu filens nummer ...
            self.assertEqual(next(o for o in h.fake.objekt if o['id'] == 'u-bagskytt')['vo_nummer'], '11271849')
            self.assertEqual(h.fake.objekt_patchar, [('u-bagskytt', '11166440', '11271849')])
            # ... och det GAMLA numret är sparat som extra nummer, märkt med bytet
            self.assertEqual(h.fake.alias_skrivna, [{'objekt_id': 'u-bagskytt', 'nummer': '11166440', 'kalla': 'namn',
                                                     'filnamn': F_BAGSKYTT, 'byte_till': '11271849'}])
            self.assertEqual(h.varningar(), [])
            self.assertTrue(any('11166440 → 11271849' in m for lvl, m in h.logg.rader))
        finally:
            h.stang()

    def test_molleryd_gamla_numret_har_data_ger_extra_nummer_i_stallet(self):
        h = Harness(maskindata={'11166477': 'fakt_tid'})
        try:
            rad = h.kor(hpr_data(F_MOLLERYD, '11271883', '2'))
            self.assertEqual(rad['objekt_id'], 'u-molleryd')
            self.assertEqual(rad['objekt_nyckel'], f'{MASKIN}:11271883')
            self.assertEqual(next(o for o in h.fake.objekt if o['id'] == 'u-molleryd')['vo_nummer'], '11166477')   # orört
            self.assertEqual(h.fake.objekt_patchar, [])
            self.assertEqual(h.fake.alias_skrivna, [{'objekt_id': 'u-molleryd', 'nummer': '11271883', 'kalla': 'namn', 'filnamn': F_MOLLERYD}])
            self.assertTrue(any('har maskindata' in m for lvl, m in h.logg.rader))
        finally:
            h.stang()

    def test_vallust_utan_kontraktsnummer_blir_okopplad_och_loggas(self):
        h = Harness()
        try:
            rad = h.kor(hpr_data(F_VALLUST, '', '132'))
            self.assertNotIn('objekt_id', rad)
            self.assertEqual(rad['objekt_nyckel'], f'{MASKIN}:k132')               # skrivs som förut
            self.assertEqual(h.fake.alias_skrivna, [])
            varn = h.varningar()
            self.assertEqual(len(varn), 1)
            self.assertIn('Okopplad', varn[0])
            self.assertIn(F_VALLUST, varn[0])
            self.assertIn('Filer utan objekt', varn[0])
        finally:
            h.stang()

    def test_flyttobjekt_blir_okopplad(self):
        h = Harness()
        try:
            rad = h.kor(hpr_data(F_FLYTT, '', '7'))
            self.assertNotIn('objekt_id', rad)
            self.assertEqual(h.fake.alias_skrivna, [])
            self.assertEqual(len(h.varningar()), 1)
        finally:
            h.stang()

    def test_alla_fyra_i_rad_exakt_tva_alias(self):
        h = Harness(maskindata={'11166477': 'fakt_produktion'})
        try:
            h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            h.kor(hpr_data(F_MOLLERYD, '11271883', '2'))
            h.kor(hpr_data(F_VALLUST, '', '132'))
            h.kor(hpr_data(F_FLYTT, '', '7'))
            self.assertEqual(sorted(a['nummer'] for a in h.fake.alias_skrivna), ['11166440', '11271883'])   # byte + extra nummer
            kopplade = [r['filnamn'] for r in h.fake.hpr_filer_rader if r.get('objekt_id')]
            self.assertEqual(sorted(kopplade), sorted([F_BAGSKYTT, F_MOLLERYD]))
        finally:
            h.stang()


class RedanKopplatOforandrat(unittest.TestCase):
    def test_nummer_som_matchar_vo_nummer_gar_som_forut_utan_namn_eller_alias(self):
        h = Harness()
        try:
            rad = h.kor(hpr_data('Bågskyttebanan RP J-Hus- 25_X_20261013082121.hpr', '11166440', '1'))
            self.assertEqual(rad['objekt_id'], 'u-bagskytt')
            self.assertEqual(h.fake.alias_skrivna, [])
            # varken alias-tabellen eller en andra objektläsning behövdes
            self.assertFalse([a for a in h.fake.anrop if 'objekt_alt_nummer' in a[1]])
            self.assertEqual(h.varningar(), [])
        finally:
            h.stang()

    def test_namnet_spelar_ingen_roll_nar_numret_matchar(self):
        h = Harness()
        try:
            # Numret pekar på Mölleryd, men filnamnet säger Bågskyttebanan → numret vinner, ingen namnkoppling
            rad = h.kor(hpr_data(F_BAGSKYTT, '11166477', '1'))
            self.assertEqual(rad['objekt_id'], 'u-molleryd')
            self.assertEqual(h.fake.alias_skrivna, [])
        finally:
            h.stang()


class AliasGerDirektKoppling(unittest.TestCase):
    def test_nasta_fil_med_samma_nummer_kopplas_direkt_utan_namn(self):
        h = Harness(alias=[{'nummer': '11271849', 'maskin_id': None, 'objekt_id': 'u-bagskytt'}])
        try:
            # Objektet har fått nytt namn sedan dess — aliaset räcker
            rad = h.kor(hpr_data('Helt annat namn_X_20261014080000.hpr', '11271849', '1'))
            self.assertEqual(rad['objekt_id'], 'u-bagskytt')
            self.assertEqual(h.fake.alias_skrivna, [])
        finally:
            h.stang()

    def test_forsta_filen_skapar_aliaset_och_andra_filen_anvander_det(self):
        h = Harness()
        try:
            h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(len(h.fake.alias_skrivna), 1)
            rad2 = h.kor(hpr_data('Annat namn_X_20261014080000.hpr', '11271849', '1'))
            self.assertEqual(rad2['objekt_id'], 'u-bagskytt')
            self.assertEqual(len(h.fake.alias_skrivna), 1)       # inget nytt alias
        finally:
            h.stang()

    def test_k_nummer_ar_per_maskin(self):
        alias = [{'nummer': 'k132', 'maskin_id': MASKIN, 'objekt_id': 'u-vallust'}]
        self.assertEqual(K.hitta_alias(alias, 'k132', MASKIN), 'u-vallust')
        self.assertIsNone(K.hitta_alias(alias, 'k132', 'R64101'))        # annan maskins k132 är ett annat jobb
        self.assertEqual(K.hitta_alias([{'nummer': '11271849', 'maskin_id': None, 'objekt_id': 'u'}], '11271849', 'R64101'), 'u')

    def test_namnkopplat_k_nummer_sparas_med_maskin(self):
        h = Harness(objekt=OBJEKT + [{'id': 'u-gv', 'namn': 'Gallring Vällust', 'vo_nummer': '11300003'}])
        try:
            rad = h.kor(hpr_data(F_VALLUST, '', '132'))
            self.assertEqual(rad['objekt_id'], 'u-gv')
            self.assertEqual(h.fake.alias_skrivna[0]['nummer'], 'k132')
            self.assertEqual(h.fake.alias_skrivna[0]['maskin_id'], MASKIN)
        finally:
            h.stang()


class TvetydigtKopplasInte(unittest.TestCase):
    def test_tva_objekt_med_samma_namn(self):
        h = Harness(objekt=OBJEKT + [{'id': 'dubblett', 'namn': 'Mölleryd RP J-Hus -25', 'vo_nummer': '11999999'}])
        try:
            rad = h.kor(hpr_data(F_MOLLERYD, '11271883', '2'))
            self.assertNotIn('objekt_id', rad)
            self.assertEqual(h.fake.alias_skrivna, [])
            self.assertIn('Okopplad', h.varningar()[0])
        finally:
            h.stang()


class NummerByte(unittest.TestCase):
    """Namnträff: byt objekt.vo_nummer och spara det gamla som extra nummer — men bara om det gamla numret saknar maskindata."""

    def vo(self, h, oid='u-bagskytt'):
        return next(o for o in h.fake.objekt if o['id'] == oid)['vo_nummer']

    def test_data_i_vilken_som_helst_av_de_fyra_tabellerna_stoppar_bytet(self):
        for tabell in ('detalj_stam', 'fakt_produktion', 'fakt_lass', 'fakt_tid'):
            with self.subTest(tabell=tabell):
                h = Harness(maskindata={'11166440': tabell})
                try:
                    rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
                    self.assertEqual(rad['objekt_id'], 'u-bagskytt')                 # kopplad ändå
                    self.assertEqual(self.vo(h), '11166440')                         # numret orört
                    self.assertEqual([a['nummer'] for a in h.fake.alias_skrivna], ['11271849'])
                    self.assertNotIn('byte_till', h.fake.alias_skrivna[0])
                finally:
                    h.stang()

    def test_efter_bytet_nasta_fil_med_nya_numret_kopplas_pa_vo_nummer_och_gamla_numret_pa_aliaset(self):
        h = Harness()
        try:
            h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(self.vo(h), '11271849')
            antal_alias = len(h.fake.alias_skrivna)
            rad2 = h.kor(hpr_data('Annat_X_20261014080000.hpr', '11271849', '1'))     # nya numret: ren vo_nummer-träff, som förut
            self.assertEqual(rad2['objekt_id'], 'u-bagskytt')
            rad3 = h.kor(hpr_data('Annat_X_20261015080000.hpr', '11166440', '1'))     # gamla numret: extra nummer, INGET nytt byte
            self.assertEqual(rad3['objekt_id'], 'u-bagskytt')
            self.assertEqual(len(h.fake.alias_skrivna), antal_alias)
            self.assertEqual(len(h.fake.objekt_patchar), 1)
        finally:
            h.stang()

    def test_kan_inte_kontrollera_maskindata_ger_inget_byte(self):
        class OlasbarTabell(FakeRequests):
            def get(self, url, params=None, headers=None, timeout=None):
                if '/rest/v1/fakt_lass' in url:
                    return Svar(500, None)
                return super().get(url, params, headers, timeout)
        h = Harness()
        h.fake = OlasbarTabell(OBJEKT)
        M.requests = h.fake
        try:
            rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(rad['objekt_id'], 'u-bagskytt')
            self.assertEqual(self.vo(h), '11166440')                                  # okänt är aldrig "ingen data"
            self.assertEqual([a['nummer'] for a in h.fake.alias_skrivna], ['11271849'])
            self.assertTrue(any('kunde inte kontrollera' in m for lvl, m in h.logg.rader))
        finally:
            h.stang()

    def test_migrationen_med_byte_till_ej_kord_bytet_rullas_tillbaka_och_nya_numret_blir_extra_nummer(self):
        h = Harness(byte_kolumn_saknas=True)
        try:
            rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(rad['objekt_id'], 'u-bagskytt')
            self.assertEqual(self.vo(h), '11166440')                                  # tillbakasatt — allt eller inget
            self.assertEqual([(a['nummer'], 'byte_till' in a) for a in h.fake.alias_skrivna], [('11271849', False)])
            self.assertEqual(h.fake.objekt_patchar[-2:], [('u-bagskytt', '11166440', '11271849'), ('u-bagskytt', '11271849', '11166440')])
        finally:
            h.stang()

    def test_nya_numret_ar_redan_ett_annat_objekts_vo_nummer_ger_inget_byte(self):
        # (unik objekt_vo_nummer_key) — numret används av ett annat objekt: databasen avvisar bytet
        h = Harness(objekt=OBJEKT + [{'id': 'u-annat2', 'namn': 'Något annat', 'vo_nummer': '11271849'}])
        try:
            # numret ÄR då ett vo_nummer → regel 1 kopplar till det objektet, aldrig till namnet
            rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(rad['objekt_id'], 'u-annat2')
            self.assertEqual(h.fake.objekt_patchar, [])
        finally:
            h.stang()

    def test_objektet_hann_ändras_ingen_rad_uppdateras_ingen_koppling_forlorad(self):
        class HannAndras(FakeRequests):
            def patch(self, url, json=None, headers=None, timeout=None):
                for o in self.objekt:
                    o['vo_nummer'] = '11000000' if o['id'] == 'u-bagskytt' else o['vo_nummer']   # någon annan hann före
                return super().patch(url, json, headers, timeout)
        h = Harness()
        h.fake = HannAndras(OBJEKT)
        M.requests = h.fake
        try:
            rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(rad['objekt_id'], 'u-bagskytt')                           # kopplad via extra nummer ändå
            self.assertEqual([a['nummer'] for a in h.fake.alias_skrivna], ['11271849'])
        finally:
            h.stang()

    def test_icke_numeriskt_gammalt_vo_byts_aldrig(self):
        h = Harness(objekt=OBJEKT + [{'id': 'u-p', 'namn': 'Privat jobb', 'vo_nummer': 'P-1012'}])
        try:
            rad = h.kor(hpr_data(f'Privat jobb_{MASKIN}_20261013120000.hpr', '11271900', '3'))
            self.assertEqual(rad['objekt_id'], 'u-p')
            self.assertEqual(self.vo(h, 'u-p'), 'P-1012')
            self.assertEqual([a['nummer'] for a in h.fake.alias_skrivna], ['11271900'])
        finally:
            h.stang()

    def test_k_nummer_byter_aldrig_vo_nummer(self):
        h = Harness(objekt=OBJEKT + [{'id': 'u-gv', 'namn': 'Gallring Vällust', 'vo_nummer': '11300003'}])
        try:
            h.kor(hpr_data(F_VALLUST, '', '132'))
            self.assertEqual(self.vo(h, 'u-gv'), '11300003')
            self.assertEqual(h.fake.objekt_patchar, [])
            self.assertEqual(h.fake.alias_skrivna[0]['nummer'], 'k132')
        finally:
            h.stang()

    def test_samma_nummer_som_gamla_ger_ingen_byte(self):
        # numret ÄR objektets vo_nummer → regel 1, ingen läsning av maskindata alls
        h = Harness()
        try:
            h.kor(hpr_data(F_BAGSKYTT, '11166440', '1'))
            self.assertFalse([a for a in h.fake.anrop if any(t in a[1] for t in ('detalj_stam', 'fakt_tid'))])
        finally:
            h.stang()


class StubbVakt(unittest.TestCase):
    """Steg B skapar annars en NY objekt-rad för ett nummer som inte finns — en dubblett som gör namnet tvetydigt."""

    def test_namntraff_skapar_ingen_stubb(self):
        h = Harness()
        try:
            self.assertTrue(M._kopplas_till_befintligt_objekt('11271849', MASKIN, 'Bågskyttebanan RP J-Hus- 25'))
        finally:
            h.stang()

    def test_alias_skapar_ingen_stubb(self):
        h = Harness(alias=[{'nummer': '11271849', 'maskin_id': None, 'objekt_id': 'u-bagskytt'}])
        try:
            self.assertTrue(M._kopplas_till_befintligt_objekt('11271849', MASKIN, 'Något annat'))
        finally:
            h.stang()

    def test_okant_namn_far_stubb_som_forut(self):
        h = Harness()
        try:
            self.assertFalse(M._kopplas_till_befintligt_objekt('11271999', MASKIN, 'Helt nytt objekt'))
        finally:
            h.stang()


class FelSomInteStoppar(unittest.TestCase):
    def test_objekt_kan_inte_lasas_filen_skrivs_okopplad(self):
        class Trasig(FakeRequests):
            def get(self, url, params=None, headers=None, timeout=None):
                if url.split('?')[0].endswith('/rest/v1/objekt') and '?select=id,vo_nummer' not in url:
                    return Svar(500, None)
                return super().get(url, params, headers, timeout)
        h = Harness()
        h.fake = Trasig(OBJEKT)
        M.requests = h.fake
        try:
            rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertNotIn('objekt_id', rad)
            self.assertEqual(rad['objekt_nyckel'], f'{MASKIN}:11271849')
            self.assertTrue(any('Okopplad' in m for m in h.varningar()))
        finally:
            h.stang()

    def test_alias_tabellen_saknas_migrationen_ej_kord_ger_namnkoppling_men_inget_krasch(self):
        class UtanTabell(FakeRequests):
            def get(self, url, params=None, headers=None, timeout=None):
                if 'objekt_alt_nummer' in url:
                    return Svar(404, None)
                return super().get(url, params, headers, timeout)

            def post(self, url, json=None, headers=None, timeout=None):
                if 'objekt_alt_nummer' in url:
                    return Svar(404, None)
                return super().post(url, json, headers, timeout)
        h = Harness()
        h.fake = UtanTabell(OBJEKT)
        M.requests = h.fake
        try:
            rad = h.kor(hpr_data(F_BAGSKYTT, '11271849', '1'))
            self.assertEqual(rad['objekt_id'], 'u-bagskytt')      # filen kopplas ändå denna gång
            self.assertTrue(any('INTE sparas' in m for lvl, m in h.logg.rader))   # men ärligt: aliaset sparades inte
        finally:
            h.stang()


if __name__ == '__main__':
    unittest.main(verbosity=2)
