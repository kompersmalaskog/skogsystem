"""Test: en fil som är OK i meta ska aldrig bli liggande i Inkommande, och en namnkrock i Behandlade löses med suffix.

    python scripts/test_inkommande_flytt.py

Bakgrund (gap_check 22 nov): fyra filer (Mölleryd x2 hpr, Santhe mom 16 nov, Santhe hqc) var "redan OK i meta men inte
flyttade till Behandlade" och kördes om vid varje genomsökning. Orsaken var inte ett misslyckat shutil.move utan att
process_file aldrig FÖRSÖKTE flytta en fil som redan var OK i meta: grenen "Redan importerad, hoppar över" returnerade
utan att röra filen. Kontrollen "meta OK men saknas i Behandlade" hittade dessutom maskinen ur filnamnet med
_(PONS|R|A)\\d+_, vilket varken Santhe-filerna eller Ponsse-objekten (PONS20SDJAA…) matchar.
"""
import os, sys, tempfile, unittest, importlib.util, time, shutil

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        tmp = tempfile.mkdtemp(prefix='flytt_')
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


class Svar:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self._data = data if data is not None else []

    def json(self):
        return self._data


class FakeRequests:
    """meta: {filnamn: {'maskin_id','filtyp','importerad_tid'}} — bara OK-rader."""

    def __init__(self, meta):
        self.meta = dict(meta)
        self.borttagna = []

    def _namn(self, url):
        from urllib.parse import unquote
        return unquote(url.split('filnamn=eq.')[1].split('&')[0])

    def get(self, url, **kw):
        if 'meta_importerade_filer' in url and 'filnamn=eq.' in url:
            namn = self._namn(url)
            rad = self.meta.get(namn)
            if rad is None:
                return Svar(200, [])
            if 'importerad_tid' in url:
                return Svar(200, [{'importerad_tid': rad.get('importerad_tid')}])
            return Svar(200, [{'maskin_id': rad['maskin_id'], 'filtyp': rad['filtyp']}])
        return Svar(200, [])

    def delete(self, url, **kw):
        namn = self._namn(url)
        self.borttagna.append(namn)
        self.meta.pop(namn, None)
        return Svar(204)

    def post(self, url, **kw):
        return Svar(201)


class InkommandeFlytt(unittest.TestCase):
    def setUp(self):
        self.rot = tempfile.mkdtemp(prefix='flytt_rot_')
        self.inkommande = os.path.join(self.rot, 'Inkommande')
        self.behandlade = os.path.join(self.rot, 'Behandlade')
        os.makedirs(self.inkommande)
        os.makedirs(self.behandlade)
        self.gamla = (M.BEHANDLADE, M.ONEDRIVE_BASE, M.requests, time.sleep,
                      M.parse_hpr_file, M.save_hpr_to_supabase, M.mark_file_imported)
        M.BEHANDLADE, M.ONEDRIVE_BASE = self.behandlade, self.rot
        time.sleep = lambda s: None
        self.addCleanup(self.aterstall)

    def aterstall(self):
        (M.BEHANDLADE, M.ONEDRIVE_BASE, M.requests, time.sleep,
         M.parse_hpr_file, M.save_hpr_to_supabase, M.mark_file_imported) = self.gamla
        shutil.rmtree(self.rot, ignore_errors=True)

    def skriv(self, mapp, namn, innehall):
        os.makedirs(mapp, exist_ok=True)
        p = os.path.join(mapp, namn)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(innehall)
        return p

    def las(self, p):
        with open(p, encoding='utf-8') as f:
            return f.read()

    def arkiv(self, maskin, typ):
        return os.path.join(self.behandlade, maskin, typ)

    # ---- namnkrock i Behandlade ----------------------------------------
    def test_namnkrock_far_suffix_och_ingenting_skrivs_over(self):
        self.skriv(self.arkiv('R64428', 'HPR'), 'a.hpr', 'ORIGINAL')
        src = self.skriv(self.inkommande, 'a.hpr', 'KOPIA')
        self.assertTrue(M.move_to_behandlade(src, 'R64428', 'HPR'))
        self.assertFalse(os.path.exists(src))
        self.assertEqual(self.las(os.path.join(self.arkiv('R64428', 'HPR'), 'a.hpr')), 'ORIGINAL')
        filer = sorted(os.listdir(self.arkiv('R64428', 'HPR')))
        self.assertEqual(len(filer), 2)
        suffixad = [f for f in filer if f != 'a.hpr'][0]
        self.assertRegex(suffixad, r'^a_\d{8}_\d{6}\.hpr$')
        self.assertEqual(self.las(os.path.join(self.arkiv('R64428', 'HPR'), suffixad)), 'KOPIA')

    def test_tre_kopior_samma_sekund_far_varsin_sokvag(self):
        class Fast(M.datetime):
            @classmethod
            def now(cls, tz=None):
                return M.datetime(2026, 11, 22, 19, 0, 0)
        gammal = M.datetime
        M.datetime = Fast
        self.addCleanup(lambda: setattr(M, 'datetime', gammal))
        self.skriv(self.arkiv('R64428', 'HQC'), 'b.hqc', 'ORIG')
        for i in range(3):
            src = self.skriv(self.inkommande, 'b.hqc', f'KOPIA{i}')
            self.assertTrue(M.move_to_behandlade(src, 'R64428', 'HQC'))
        filer = sorted(os.listdir(self.arkiv('R64428', 'HQC')))
        self.assertEqual(filer, ['b.hqc', 'b_20261122_190000.hqc', 'b_20261122_190000_2.hqc',
                                 'b_20261122_190000_3.hqc'])
        self.assertEqual({self.las(os.path.join(self.arkiv('R64428', 'HQC'), f)) for f in filer},
                         {'ORIG', 'KOPIA0', 'KOPIA1', 'KOPIA2'})

    def test_punkt_i_namnet_gar_att_flytta(self):
        # "Gallring Santhe 2026. 2026-11-16 1606.mom" — punkt + mellanslag mitt i namnet.
        namn = 'Gallring Santhe 2026. 2026-11-16 1606.mom'
        self.skriv(self.arkiv('R64428', 'MOM'), namn, 'ORIG')
        src = self.skriv(self.inkommande, namn, 'KOPIA')
        self.assertTrue(M.move_to_behandlade(src, 'R64428', 'MOM'))
        self.assertEqual(len(os.listdir(self.arkiv('R64428', 'MOM'))), 2)

    # ---- redan OK i meta men kvar i Inkommande -------------------------
    def kor_process(self, namn, meta, innehall='KOPIA'):
        M.requests = FakeRequests(meta)
        src = self.skriv(self.inkommande, namn, innehall)
        for fn in ('parse_hpr_file', 'save_hpr_to_supabase'):
            setattr(M, fn, lambda *a, **k: (_ for _ in ()).throw(AssertionError('importen får inte köras om')))
        return src, M.process_file(src)

    def test_santhe_utan_maskin_i_namnet_flyttas(self):
        namn = 'Gallring Santhe 2026. 2026-11-16 1606.hqc'
        self.skriv(self.arkiv('R64428', 'HQC'), namn, 'ORIG')
        src, ok = self.kor_process(namn, {namn: {'maskin_id': 'R64428', 'filtyp': 'HQC'}})
        self.assertTrue(ok)
        self.assertFalse(os.path.exists(src))
        self.assertEqual(self.las(os.path.join(self.arkiv('R64428', 'HQC'), namn)), 'ORIG')
        self.assertEqual(len(os.listdir(self.arkiv('R64428', 'HQC'))), 2)
        self.assertEqual(M.requests.borttagna, [])   # metan rörs inte

    def test_ponsse_objekt_hpr_flyttas(self):
        namn = 'Mölleryd RP J-Hus -25_PONS20SDJAA270231_20261021090135.hpr'
        self.skriv(self.arkiv('PONS20SDJAA270231', 'HPR'), namn, 'ORIG')
        src, ok = self.kor_process(namn, {namn: {'maskin_id': 'PONS20SDJAA270231', 'filtyp': 'HPR'}})
        self.assertTrue(ok)
        self.assertFalse(os.path.exists(src))
        self.assertEqual(self.las(os.path.join(self.arkiv('PONS20SDJAA270231', 'HPR'), namn)), 'ORIG')

    def test_mom_som_inte_uppdaterats_flyttas_men_uppdaterad_mom_importeras_om(self):
        namn = 'Gallring Santhe 2026. 2026-11-16 1606.mom'
        self.skriv(self.arkiv('R64428', 'MOM'), namn, 'ORIG')
        meta = {namn: {'maskin_id': 'R64428', 'filtyp': 'MOM', 'importerad_tid': '2999-01-01T00:00:00+00:00'}}
        src, ok = self.kor_process(namn, meta)          # filens mtime är äldre än importen
        self.assertTrue(ok)
        self.assertFalse(os.path.exists(src))

    def test_uppdaterad_mom_importeras_om(self):
        namn = 'Gallring Santhe 2026. 2026-11-16 1606.mom'
        self.skriv(self.arkiv('R64428', 'MOM'), namn, 'ORIG')
        meta = {namn: {'maskin_id': 'R64428', 'filtyp': 'MOM', 'importerad_tid': '2000-01-01T00:00:00+00:00'}}
        M.requests = FakeRequests(meta)
        src = self.skriv(self.inkommande, namn, 'NY VERSION')
        anrop = []
        gammal = (M.parse_mom_file, M.save_mom_to_supabase)
        M.parse_mom_file = lambda p: {'maskin': {'maskin_id': 'R64428'}, 'filtyp': 'MOM'}
        M.save_mom_to_supabase = lambda d: anrop.append('sparad') or True
        M.mark_file_imported = lambda *a, **k: anrop.append('meta')
        try:
            self.assertTrue(M.process_file(src))
        finally:
            M.parse_mom_file, M.save_mom_to_supabase = gammal
        self.assertEqual(anrop, ['sparad', 'meta'])
        self.assertEqual(M.requests.borttagna, [namn])
        self.assertEqual(self.las(os.path.join(self.arkiv('R64428', 'MOM'), namn)), 'ORIG')   # inget överskrivet
        self.assertEqual(len(os.listdir(self.arkiv('R64428', 'MOM'))), 2)

    def test_ok_i_meta_men_aldrig_arkiverad_importeras_om_for_alla_filnamn(self):
        # Förut hoppade kontrollen över filer utan maskin i namnet (Santhe) — de blev liggande.
        namn = 'Gallring Santhe 2026. 2026-11-16 1606.hpr'
        M.requests = FakeRequests({namn: {'maskin_id': 'R64428', 'filtyp': 'HPR'}})
        src = self.skriv(self.inkommande, namn, 'FIL')
        anrop = []
        M.parse_hpr_file = lambda p: {'maskin': {'maskin_id': 'R64428'}, 'filtyp': 'HPR'}
        M.save_hpr_to_supabase = lambda d: anrop.append('sparad') or True
        M.mark_file_imported = lambda *a, **k: anrop.append('meta')
        self.assertTrue(M.process_file(src))
        self.assertEqual(anrop, ['sparad', 'meta'])
        self.assertTrue(os.path.exists(os.path.join(self.arkiv('R64428', 'HPR'), namn)))
        self.assertFalse(os.path.exists(src))

    def test_okand_fil_utan_meta_rors_inte_av_flyttgrenen(self):
        namn = 'Ny.hpr'
        M.requests = FakeRequests({})
        src = self.skriv(self.inkommande, namn, 'FIL')
        anrop = []
        M.parse_hpr_file = lambda p: {'maskin': {'maskin_id': 'R64428'}, 'filtyp': 'HPR'}
        M.save_hpr_to_supabase = lambda d: anrop.append('sparad') or True
        M.mark_file_imported = lambda *a, **k: anrop.append('meta')
        self.assertTrue(M.process_file(src))
        self.assertEqual(anrop, ['sparad', 'meta'])


if __name__ == '__main__':
    unittest.main()
