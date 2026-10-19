"""Test: Opti-tider lagras som verkligt UTC (tid_ar_utc) och läses tillbaka som svensk väggklocka.

    python scripts/test_opti_tider_utc.py

Ingen nätverksåtkomst. Bevisar tre saker:
  1. Omräkningen väggklocka ↔ UTC är rätt och oförändrad över sommar-/vintertid (mot zoneinfo, 2020–2035).
  2. Rätt tabeller/kolumner konverteras och märks — och fakt_produktion / fakt_kalibrering_historik / dim_objekt rörs INTE
     (tiden ingår i deras unika nyckel, resp. kolumnen är naiv).
  3. Arbetsdagens start och slut (som lönen bygger på) blir EXAKT desamma om skiftraderna ligger i den gamla eller den nya
     konventionen — den enda vägen från fakt_skift till arbetsdag.start_tid/slut_tid i importen.
"""
import os, sys, json, unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_skift_kuvert import M, Svar   # samma laddning av importmodulen (loggkatalog, attrappvärden)

STHLM = ZoneInfo('Europe/Stockholm')


class Omrakning(unittest.TestCase):
    def test_vaggklocka_till_utc_samma_som_zoneinfo_varje_kvart_2020_2035(self):
        for ar in range(2020, 2036):
            v = datetime(ar, 1, 1)
            while v.year == ar:
                ref = v.replace(tzinfo=STHLM, fold=0).astimezone(timezone.utc)
                got = M.stockholm_lokal_till_utc(v)
                # Den obefintliga timmen i mars (02:xx) har ingen riktig motsvarighet; importen tolkar den som vintertid.
                if ref.replace(tzinfo=None) + timedelta(hours=2) != v and (v.month, v.hour) == (3, 2):
                    v += timedelta(minutes=15)
                    continue
                self.assertEqual(got, ref, v.isoformat())
                v += timedelta(minutes=15)

    def test_utc_till_vaggklocka_samma_som_zoneinfo_varje_kvart_2020_2035(self):
        for ar in range(2020, 2036):
            u = datetime(ar, 1, 1, tzinfo=timezone.utc)
            while u.year == ar:
                self.assertEqual(M.utc_till_stockholm_lokal(u), u.astimezone(STHLM).replace(tzinfo=None), u.isoformat())
                u += timedelta(minutes=15)

    def test_rundtur_ar_identitet_utom_marstimmen(self):
        v = datetime(2026, 1, 1)
        while v.year == 2026:
            igen = M.utc_till_stockholm_lokal(M.stockholm_lokal_till_utc(v))
            if igen != v:
                self.assertEqual((v.month, v.day, v.hour), (3, 29, 2), v.isoformat())    # bara den obefintliga timmen
            v += timedelta(minutes=15)


class TidFranDatabasen(unittest.TestCase):
    def test_aldre_rad_tas_som_den_ar(self):
        self.assertEqual(M.db_tid_till_lokal('2026-10-12T09:04:00+00:00', False), datetime(2026, 10, 12, 9, 4))
        self.assertEqual(M.db_tid_till_lokal('2026-10-12T09:04:00+00:00', None), datetime(2026, 10, 12, 9, 4))

    def test_ny_rad_blir_svensk_vaggklocka(self):
        self.assertEqual(M.db_tid_till_lokal('2026-10-12T07:04:00+00:00', True), datetime(2026, 10, 12, 9, 4))
        self.assertEqual(M.db_tid_till_lokal('2026-01-12T08:04:00+00:00', True), datetime(2026, 1, 12, 9, 4))

    def test_postgrest_former(self):
        self.assertEqual(M.db_tid_till_lokal('2026-10-12T07:04:20.4+00:00', True), datetime(2026, 10, 12, 9, 4, 20, 400000))
        self.assertEqual(M.db_tid_till_lokal('2026-10-12T07:04:20.80883+00:00', True), datetime(2026, 10, 12, 9, 4, 20, 808830))
        self.assertEqual(M.db_tid_till_lokal('2026-10-12 07:04:20+00', True), datetime(2026, 10, 12, 9, 4, 20))
        self.assertEqual(M.db_tid_till_lokal('2026-10-12T07:04:20Z', True), datetime(2026, 10, 12, 9, 4, 20))
        self.assertEqual(M.db_tid_till_lokal('2026-10-12T09:04:20+02:00', True), datetime(2026, 10, 12, 9, 4, 20))   # annan offset räknas om

    def test_tomt_och_skrap_ger_none(self):
        for v in (None, '', 'inte-en-tid', '2026-13-45T99:99:99+00:00'):
            self.assertIsNone(M.db_tid_till_lokal(v, True), repr(v))


class Skrivning(unittest.TestCase):
    def test_registret_ar_exakt_de_fem_tabellerna(self):
        self.assertEqual(sorted(M.OPTI_TIDSKOLUMNER), ['detalj_gps_spar', 'detalj_kontroll_stock', 'detalj_stam', 'fakt_skift', 'hpr_filer'])
        # tiden ingår i den unika nyckeln / kolumnen är naiv — får aldrig hamna i registret
        for tabell in ('fakt_produktion', 'fakt_kalibrering_historik', 'dim_objekt', 'fakt_lass', 'mom_tider'):
            self.assertNotIn(tabell, M.OPTI_TIDSKOLUMNER)

    def test_konvertering_markerar_och_ror_inte_indatan(self):
        rad = {'maskin_id': 'R64428', 'stam_key': 1, 'tidpunkt': datetime(2026, 10, 12, 9, 4, 20)}
        ut = M.konvertera_opti_tider('detalj_stam', [rad])
        self.assertEqual(ut[0]['tidpunkt'], '2026-10-12T07:04:20+00:00')
        self.assertIs(ut[0]['tid_ar_utc'], True)
        self.assertEqual(rad['tidpunkt'], datetime(2026, 10, 12, 9, 4, 20))         # indatan orörd
        self.assertNotIn('tid_ar_utc', rad)

    def test_tabeller_utanfor_registret_rors_inte(self):
        rader = [{'monitoring_start': datetime(2026, 10, 12, 9, 4, 20)}]
        self.assertIs(M.konvertera_opti_tider('fakt_produktion', rader), rader)
        self.assertNotIn('tid_ar_utc', rader[0])

    def test_alla_kolumner_i_en_tabell_konverteras(self):
        rad = {'inloggning_tid': datetime(2026, 1, 12, 7, 0), 'utloggning_tid': datetime(2026, 1, 12, 15, 0), 'maskin_inloggning_tid': None}
        ut = M.konvertera_opti_tider('fakt_skift', [rad])[0]
        self.assertEqual((ut['inloggning_tid'], ut['utloggning_tid'], ut['maskin_inloggning_tid']),
                         ('2026-01-12T06:00:00+00:00', '2026-01-12T14:00:00+00:00', None))

    def test_en_naiv_strang_konverteras_aldrig_lamnas_den_markerad_true(self):
        ut = M.konvertera_opti_tider('detalj_gps_spar', [{'tidpunkt': '2026-10-12T09:04:20'}])[0]
        self.assertEqual(ut['tidpunkt'], '2026-10-12T07:04:20+00:00')
        ut = M.konvertera_opti_tider('detalj_gps_spar', [{'tidpunkt': '2026-10-12T09:04:20+02:00'}])[0]
        self.assertEqual(ut['tidpunkt'], '2026-10-12T07:04:20+00:00')
        with self.assertRaises(ValueError):
            M.konvertera_opti_tider('detalj_gps_spar', [{'tidpunkt': 'skräp'}])

    def test_upsert_data_skickar_utc_och_flagga_men_andrar_inte_anroparens_rader(self):
        skickat = {}

        class R:
            def post(self, url, json=None, headers=None, **kw):
                skickat[url.split('/rest/v1/')[-1].split('?')[0]] = json
                return Svar(201, [])
        M.requests = R()
        stam = [{'maskin_id': 'R64428', 'stam_key': 1, 'tidpunkt': datetime(2026, 10, 12, 9, 4, 20)}]
        prod = [{'maskin_id': 'R64428', 'monitoring_start': datetime(2026, 10, 12, 9, 4, 20)}]
        self.assertEqual(M.upsert_data('detalj_stam', stam, ['maskin_id', 'stam_key']), 1)
        self.assertEqual(M.upsert_data('fakt_produktion', prod, ['maskin_id', 'monitoring_start']), 1)
        self.assertEqual(skickat['detalj_stam'][0]['tidpunkt'], '2026-10-12T07:04:20+00:00')
        self.assertIs(skickat['detalj_stam'][0]['tid_ar_utc'], True)
        self.assertEqual(skickat['fakt_produktion'][0]['monitoring_start'], '2026-10-12T09:04:20')      # oförändrat
        self.assertNotIn('tid_ar_utc', skickat['fakt_produktion'][0])
        self.assertIsInstance(stam[0]['tidpunkt'], datetime)                                            # anroparens rad orörd


class ArbetsdagenBlirDensamma(unittest.TestCase):
    """_create_arbetsdag läser fakt_skift och bygger arbetsdag.start_tid/slut_tid (HH:MM). Gamla och nya skiftrader för samma
    pass måste ge samma arbetsdag — annars flyttas lönen."""

    def _bygg(self, skiftrader):
        class R:
            def get(self, url, params=None, **kw):
                if 'operator_medarbetare' in url:
                    return Svar(200, [{'operator_id': 'R64428_8', 'medarbetare_id': 'med-1'}])
                if 'dim_operator' in url:
                    return Svar(200, [{'operator_id': 'R64428_8', 'operator_namn': 'Oskar'}])
                if 'fakt_skift' in url:
                    return Svar(200, skiftrader)
                if 'fakt_tid' in url:
                    return Svar(200, [])
                return Svar(200, [])
        M.requests = R()
        skrivna = []
        M.upsert_arbetsdag = lambda rader: (skrivna.extend(rader), len(rader))[1]
        M._create_arbetsdag([], [{'datum': skiftrader[0]['datum'], 'operator_id': 'R64428_8'}])
        return {(r['datum']): (r['start_tid'], r['slut_tid']) for r in skrivna}

    def _par(self, datum, v_in, v_ut):
        """Samma pass som äldre rad (väggklocka som UTC) och som ny rad (verkligt UTC)."""
        gammal = {'operator_id': 'R64428_8', 'maskin_id': 'R64428', 'datum': datum, 'langd_sek': 28000,
                  'inloggning_tid': v_in.isoformat() + '+00:00', 'utloggning_tid': v_ut.isoformat() + '+00:00', 'tid_ar_utc': False}
        ny = dict(gammal, tid_ar_utc=True,
                  inloggning_tid=M.stockholm_lokal_till_utc(v_in).isoformat(), utloggning_tid=M.stockholm_lokal_till_utc(v_ut).isoformat())
        return gammal, ny

    def test_start_och_slut_ar_desamma_i_bada_konventionerna(self):
        # (datum efter synk-gränsen 2026-07-14 — tidigare dagar byggs aldrig om)
        fall = [
            ('2026-08-12', datetime(2026, 8, 12, 6, 59, 12), datetime(2026, 8, 12, 15, 10, 30)),     # sommartid
            ('2026-11-17', datetime(2026, 11, 17, 6, 59, 12), datetime(2026, 11, 17, 15, 10, 30)),   # vintertid
            ('2026-10-25', datetime(2026, 10, 25, 5, 0, 0), datetime(2026, 10, 25, 12, 0, 0)),       # dygnet klockan ställs tillbaka
            ('2027-03-28', datetime(2027, 3, 28, 6, 0, 0), datetime(2027, 3, 28, 14, 0, 0)),         # dygnet klockan ställs fram
            ('2026-10-12', datetime(2026, 10, 12, 0, 20, 0), datetime(2026, 10, 12, 23, 40, 0)),     # nära midnatt åt båda håll
        ]
        for datum, v_in, v_ut in fall:
            gammal, ny = self._par(datum, v_in, v_ut)
            a, b = self._bygg([gammal]), self._bygg([ny])
            self.assertEqual(a, b, datum)
            self.assertEqual(a[datum], (v_in.strftime('%H:%M'), v_ut.strftime('%H:%M')), datum)


if __name__ == '__main__':
    unittest.main(verbosity=2)
