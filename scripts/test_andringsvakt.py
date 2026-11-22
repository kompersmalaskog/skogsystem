"""Test: andringsvakt.py (Fart 1, 2026-11-22). Ingen nätverksåtkomst — en attrapp av requests med en liten "databas".

    python scripts/test_andringsvakt.py
"""
import os
import sys
import unittest

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HAR)
import andringsvakt as AV  # noqa: E402


class Svar:
    def __init__(self, status, data=None):
        self.status_code, self._d = status, data

    def json(self):
        return self._d


class Http:
    """Låtsas-PostgREST: detalj_version, berakna_version, detalj_smutsig och RPC:n diameter_filer."""
    def __init__(self, version=5, berakna=None, smutsiga=None, finns=(), saknas=False, kast=False):
        self.version, self.berakna, self.smutsiga = version, dict(berakna or {}), dict(smutsiga or {})
        self.finns, self.saknas, self.kast = set(finns), saknas, kast
        self.anrop = []

    def get(self, url, headers=None, timeout=None):
        self.anrop.append(('GET', url))
        if self.kast:
            raise OSError('nät')
        if self.saknas:
            return Svar(404, {})
        vag = url.split('/rest/v1/')[1]
        if vag.startswith('detalj_version'):
            return Svar(200, [{'v': self.version}])
        if vag.startswith('berakna_version'):
            namn = vag.split('namn=eq.')[1]
            return Svar(200, [{'v': self.berakna[namn]}] if namn in self.berakna else [])
        if vag.startswith('detalj_smutsig'):
            sedd = int(vag.split('v=gt.')[1].split('&')[0])
            start = int(vag.split('offset=')[1]) if 'offset=' in vag else 0
            alla = [{'objekt_id': o} for o, v in sorted(self.smutsiga.items()) if v > sedd]
            return Svar(200, alla[start:start + 1000])
        raise AssertionError(vag)

    def post(self, url, headers=None, json=None, timeout=None):
        self.anrop.append(('POST', url, json))
        if self.kast:
            raise OSError('nät')
        if self.saknas:
            return Svar(404, {})
        if url.endswith('/rpc/diameter_filer'):
            return Svar(200, sorted(set(json['p_filnamn']) & self.finns))
        if 'berakna_version' in url:
            self.berakna[json['namn']] = json['v']
            return Svar(201, None)
        raise AssertionError(url)


def vakt(http):
    return AV.Vakt('https://x.invalid', {'apikey': 'k', 'Prefer': 'return=minimal'}, http=http)


class PlanTest(unittest.TestCase):
    def test_orort_sedan_sist_ger_inget(self):
        p = vakt(Http(version=5, berakna={'rotkap': 5}, smutsiga={'A': 3})).plan('rotkap')
        self.assertEqual((p['lage'], p['version']), ('inget', 5))

    def test_andrat_ger_bara_de_smutsiga_objekten(self):
        h = Http(version=9, berakna={'rotkap': 5}, smutsiga={'A': 3, 'B': 7, 'C': 9})
        p = vakt(h).plan('rotkap')
        self.assertEqual((p['lage'], p['ids'], p['version']), ('objekt', {'B', 'C'}, 9))

    def test_en_ny_version_utan_smutsigt_objekt_ar_inte_inget(self):
        # Versionen flyttades (t.ex. TRUNCATE) men ingen rad är smutsigare än sedd: räkna inte "inget" på en gissning.
        p = vakt(Http(version=9, berakna={'rotkap': 5}, smutsiga={'A': 3})).plan('rotkap')
        self.assertEqual(p['lage'], 'objekt')
        self.assertEqual(p['ids'], set())

    def test_forsta_korningen_utan_notering_ar_full(self):
        p = vakt(Http(version=5)).plan('rotkap')
        self.assertEqual((p['lage'], p['ids'], p['version']), ('full', None, 5))

    def test_tvinga_ger_full_men_med_version_att_notera(self):
        p = vakt(Http(version=5, berakna={'rotkap': 5})).plan('rotkap', tvinga=True)
        self.assertEqual((p['lage'], p['version']), ('full', 5))

    def test_saknad_migration_ger_full_utan_version(self):
        for h in (Http(saknas=True), Http(kast=True)):
            p = vakt(h).plan('rotkap')
            self.assertEqual((p['lage'], p['ids'], p['version']), ('full', None, None))

    def test_laser_inte_smutsiga_ger_full(self):
        class Halt(Http):
            def get(self, url, headers=None, timeout=None):
                if 'detalj_smutsig' in url:
                    return Svar(500, {})
                return super().get(url, headers, timeout)
        p = vakt(Halt(version=9, berakna={'rotkap': 5})).plan('rotkap')
        self.assertEqual(p['lage'], 'full')

    def test_sidor_om_tusen(self):
        h = Http(version=3000, berakna={'rotkap': 0}, smutsiga={'o%05d' % i: 1 for i in range(2500)})
        p = vakt(h).plan('rotkap')
        self.assertEqual(len(p['ids']), 2500)


class NoteraTest(unittest.TestCase):
    def test_noterar_versionen(self):
        h = Http(version=5)
        self.assertTrue(vakt(h).notera('rotkap', 5))
        self.assertEqual(h.berakna, {'rotkap': 5})

    def test_noterar_inget_utan_version(self):
        h = Http()
        self.assertFalse(vakt(h).notera('rotkap', None))
        self.assertEqual(h.berakna, {})

    def test_fel_vid_notering_kastar_inte(self):
        self.assertFalse(vakt(Http(kast=True)).notera('rotkap', 5))


class FiltTest(unittest.TestCase):
    def test_in_filter_delar_och_citerar(self):
        f = AV.in_filter(['b', 'a'] + ['x%d' % i for i in range(90)])
        self.assertEqual(len(f), 3)
        self.assertTrue(f[0].startswith('objekt_id=in.("a","b",'))
        self.assertEqual(sum(x.count('"') // 2 for x in f), 92)


class FinnsFleraTest(unittest.TestCase):
    def test_en_fraga_for_alla_filer(self):
        h = Http(finns={'a.hpr', 'c.hpr'})
        ut = AV.finns_flera('https://x.invalid', {'apikey': 'k'}, ['a.hpr', 'b.hpr', 'c.hpr'], lambda f: self.fail('per fil'), http=h)
        self.assertEqual(ut, {'a.hpr', 'c.hpr'})
        self.assertEqual(len([a for a in h.anrop if a[0] == 'POST']), 1)

    def test_utan_rpc_fragas_det_per_fil_som_forut(self):
        fragade = []
        ut = AV.finns_flera('https://x.invalid', {'apikey': 'k'}, ['a.hpr', 'b.hpr'], lambda f: fragade.append(f) or f == 'b.hpr', http=Http(saknas=True))
        self.assertEqual((ut, fragade), ({'b.hpr'}, ['a.hpr', 'b.hpr']))

    def test_tom_lista_ingen_fraga(self):
        h = Http()
        self.assertEqual(AV.finns_flera('https://x.invalid', {}, [], lambda f: True, http=h), set())
        self.assertEqual(h.anrop, [])


class KalltextTest(unittest.TestCase):
    """Källvakter: skripten använder vakten, och noterar versionen BARA efter en komplett körning utan fel."""
    def test_rotkap(self):
        s = open(os.path.join(HAR, 'berakna_rotkap.py'), encoding='utf-8').read()
        self.assertIn("vakt.plan('rotkap', tvinga=alla or bool(bara))", s)
        self.assertIn("if not fel and not bara:\n        vakt.notera('rotkap', plan['version'])", s)
        self.assertIn("if plan['lage'] == 'inget':", s)

    def test_diameter_en_fraga(self):
        s = open(os.path.join(HAR, 'import_diameterserie.py'), encoding='utf-8').read()
        self.assertIn('AV.finns_flera(', s)
        self.assertNotIn('finns_i_tabellen(os.path.basename(f))', s)

    def test_driftfilerna_har_modulen(self):
        for fil in ('gap_check.py', 'deploy_import.ps1'):
            self.assertIn("'andringsvakt.py'", open(os.path.join(HAR, fil), encoding='utf-8').read(), fil)


if __name__ == '__main__':
    unittest.main(verbosity=1)
