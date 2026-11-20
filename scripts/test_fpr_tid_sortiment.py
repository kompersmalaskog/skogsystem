"""Test: FPR-tider som verkliga UTC-ögonblick + ett sortimentsrad per (lass, sortiment).

    python scripts/test_fpr_tid_sortiment.py

Bakgrund (2026-10-19):
  * parse_datetime() klippte offseten ur Opti-filernas tider, så maskinens lokala klockslag lagrades som UTC i
    fakt_lass.lossnings_tid (2 h sommar / 1 h vinter för sent). parse_tid_utc() ger det verkliga ögonblicket.
  * Två PartialLoad med samma produkt i ett lass gav två rader med samma nyckel i EN POST → Postgres avvisade hela
    batchen och filens sortiment försvann; felet ignorerades. aggregera_lass_sortiment() ger EN rad per nyckel.
"""
import importlib.util, os, sys, tempfile, unittest
from datetime import datetime, timedelta, timezone

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test')


def ladda_import():
    kvar = os.getcwd()
    if os.name != 'nt':
        tmp = tempfile.mkdtemp(prefix='fpr_tid_')
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


def utc(*a):
    return datetime(*a, tzinfo=UTC)


class TidUtc(unittest.TestCase):
    def test_offset_i_filen_galler(self):
        # Facit: Opti-exemplet ur docs, 17:28:54 lokal tid med +02:00 = 15:28:54 UTC.
        self.assertEqual(M.parse_tid_utc('2026-04-30T17:28:54+02:00'), utc(2026, 4, 30, 15, 28, 54))
        self.assertEqual(M.parse_tid_utc('2026-12-10T08:00:00+01:00'), utc(2026, 12, 10, 7, 0, 0))
        self.assertEqual(M.parse_tid_utc('2026-10-06T16:20:56Z'), utc(2026, 10, 6, 16, 20, 56))
        self.assertEqual(M.parse_tid_utc('2026-10-06T16:20:56-0500'), utc(2026, 10, 6, 21, 20, 56))

    def test_utan_offset_ar_svensk_lokal_tid(self):
        self.assertEqual(M.parse_tid_utc('2026-07-01T12:00:00'), utc(2026, 7, 1, 10, 0, 0))     # CEST
        self.assertEqual(M.parse_tid_utc('2026-01-15T12:00:00'), utc(2026, 1, 15, 11, 0, 0))    # CET

    def test_sekundbrak_normaliseras(self):
        self.assertEqual(M.parse_tid_utc('2026-04-30T17:28:54.80883+02:00'), utc(2026, 4, 30, 15, 28, 54, 808830))

    def test_tomt_och_skrap_ar_none(self):
        for v in (None, '', 'inte en tid', '2026-13-45T99:99:99'):
            self.assertIsNone(M.parse_tid_utc(v), v)

    def test_parse_datetime_ar_oforandrad_lokal_naiv(self):
        # datum-nycklarna bygger på den LOKALA tiden — får aldrig bli UTC.
        d = M.parse_datetime('2026-04-30T23:50:00+02:00')
        self.assertEqual(d, datetime(2026, 4, 30, 23, 50, 0))
        self.assertIsNone(d.tzinfo)

    def test_sommartidsgranserna(self):
        # 2026: sommartid börjar söndag 29 mars 01:00 UTC och slutar söndag 25 oktober 01:00 UTC.
        self.assertEqual(M.stockholm_lokal_till_utc(datetime(2026, 3, 29, 1, 59)), utc(2026, 3, 29, 0, 59))   # CET
        self.assertEqual(M.stockholm_lokal_till_utc(datetime(2026, 3, 29, 3, 0)), utc(2026, 3, 29, 1, 0))     # CEST
        self.assertEqual(M.stockholm_lokal_till_utc(datetime(2026, 10, 25, 1, 59)), utc(2026, 10, 24, 23, 59))  # CEST
        self.assertEqual(M.stockholm_lokal_till_utc(datetime(2026, 10, 25, 3, 0)), utc(2026, 10, 25, 2, 0))   # CET

    def test_samma_som_zoneinfo_varje_halvtimme_2020_2035(self):
        try:
            from zoneinfo import ZoneInfo
            sthlm = ZoneInfo('Europe/Stockholm')
        except Exception:
            self.skipTest('ingen tidszonsdatabas (Windows utan tzdata) — just därför har importen en egen regel')
        t = datetime(2020, 1, 1)
        slut = datetime(2035, 12, 31)
        fel = []
        while t < slut:
            facit = t.replace(tzinfo=sthlm, fold=0).astimezone(UTC)
            if M.stockholm_lokal_till_utc(t) != facit:
                fel.append((t, facit, M.stockholm_lokal_till_utc(t)))
            t += timedelta(minutes=30)
        self.assertEqual(fel[:5], [])


class Aggregering(unittest.TestCase):
    def rad(self, lass, sort, sob, sub, obj='11'):
        return {'maskin_id': 'A1', 'objekt_id': obj, 'datum': '2026-10-06', 'lass_nummer': lass, 'sortiment_id': sort,
                'sortiment_namn': sort, 'volym_m3sob': sob, 'volym_m3sub': sub, 'filnamn': 'f.fpr'}

    def test_samma_nyckel_blir_en_rad_med_summerad_volym(self):
        ut = M.aggregera_lass_sortiment([self.rad(1, 'S1', 5.0, 5.0), self.rad(1, 'S2', 3.0, 3.0), self.rad(1, 'S1', 2.5, 2.5)])
        self.assertEqual([(r['sortiment_id'], r['volym_m3sob'], r['volym_m3sub']) for r in ut], [('S1', 7.5, 7.5), ('S2', 3.0, 3.0)])

    def test_summan_ar_lassets_volym(self):
        rader = [self.rad(1, 'S1', 5.0, 5.0), self.rad(1, 'S1', 2.5, 2.5), self.rad(1, 'S2', 4.0, 4.0)]
        self.assertEqual(sum(r['volym_m3sob'] for r in M.aggregera_lass_sortiment(rader)), sum(r['volym_m3sob'] for r in rader))

    def test_okand_sub_stannar_okand(self):
        ut = M.aggregera_lass_sortiment([self.rad(1, 'S1', 5.0, None), self.rad(1, 'S1', 2.0, 2.0)])
        self.assertIsNone(ut[0]['volym_m3sub'])
        self.assertEqual(ut[0]['volym_m3sob'], 7.0)

    def test_olika_lass_objekt_och_dag_slas_aldrig_ihop(self):
        rader = [self.rad(1, 'S1', 1.0, 1.0), self.rad(2, 'S1', 1.0, 1.0), self.rad(1, 'S1', 1.0, 1.0, obj='22')]
        self.assertEqual(len(M.aggregera_lass_sortiment(rader)), 3)

    def test_indatan_andras_inte(self):
        rader = [self.rad(1, 'S1', 5.0, 5.0), self.rad(1, 'S1', 2.5, 2.5)]
        M.aggregera_lass_sortiment(rader)
        self.assertEqual(rader[0]['volym_m3sob'], 5.0)


FPR = """<?xml version="1.0" encoding="utf-8"?>
<ForwardedProduction xmlns="urn:skogforsk:stanford2010" version="3.1">
  <Machine>
    <BaseMachineManufacturerID>A030353</BaseMachineManufacturerID>
    <MachineBaseModel>Wisent 2015</MachineBaseModel>
    <ProductDefinition><ProductKey>120</ProductKey><ClassifiedProductDefinition><ProductName>Massaved</ProductName></ClassifiedProductDefinition></ProductDefinition>
    <ProductDefinition><ProductKey>121</ProductKey><ClassifiedProductDefinition><ProductName>Timmer</ProductName></ClassifiedProductDefinition></ProductDefinition>
    <ObjectDefinition><ObjectKey>99</ObjectKey><ContractNumber>11251428</ContractNumber></ObjectDefinition>
    <LocationDefinition><LocationKey>5</LocationKey><ObjectKey>99</ObjectKey><LocationName>Avlägg 1</LocationName></LocationDefinition>
    <DeliveryDefinition><DeliveryKey>1</DeliveryKey><ProductKey>120</ProductKey></DeliveryDefinition>
    <DeliveryDefinition><DeliveryKey>2</DeliveryKey><ProductKey>121</ProductKey></DeliveryDefinition>
    <OperatorDefinition><OperatorKey>1</OperatorKey></OperatorDefinition>
    <Load>
      <OperatorKey>1</OperatorKey><LoadNumber>7</LoadNumber><DistanceFromLastUnloading>800</DistanceFromLastUnloading>
      <UnloadingTime>2026-10-06T23:50:10+02:00</UnloadingTime>
      <PartialLoad><DeliveryKey>1</DeliveryKey><LocationKey>5</LocationKey>
        <LoadVolume loadVolumeCategory="Volume, m3sob">5.0</LoadVolume><LoadVolume loadVolumeCategory="Volume, m3sub">5.0</LoadVolume></PartialLoad>
      <PartialLoad><DeliveryKey>2</DeliveryKey><LocationKey>5</LocationKey>
        <LoadVolume loadVolumeCategory="Volume, m3sob">3.0</LoadVolume><LoadVolume loadVolumeCategory="Volume, m3sub">3.0</LoadVolume></PartialLoad>
      <PartialLoad><DeliveryKey>1</DeliveryKey><LocationKey>5</LocationKey>
        <LoadVolume loadVolumeCategory="Volume, m3sob">2.5</LoadVolume><LoadVolume loadVolumeCategory="Volume, m3sub">2.5</LoadVolume></PartialLoad>
    </Load>
    <ForwardingStatus><LocationKey>5</LocationKey><DeliveryKey>1</DeliveryKey>
      <ForwardStartDate>2026-12-01T07:00:00+01:00</ForwardStartDate><ForwardEndDate>2026-12-02T16:30:00+01:00</ForwardEndDate></ForwardingStatus>
  </Machine>
</ForwardedProduction>
"""


class FprParse(unittest.TestCase):
    def setUp(self):
        self.fil = tempfile.NamedTemporaryFile('w', suffix='.fpr', delete=False, encoding='utf-8')
        self.fil.write(FPR)
        self.fil.close()
        self.data = M.parse_fpr_file(self.fil.name)

    def tearDown(self):
        os.unlink(self.fil.name)

    def test_lossning_ar_verkligt_utc_och_datum_ar_lokal_dag(self):
        l = self.data['lass'][0]
        self.assertEqual(l['lossnings_tid'], utc(2026, 10, 6, 21, 50, 10))
        # 23:50 lokal tid hör till den 6:e (maskinens dag), inte till den 7:e.
        self.assertEqual(str(l['datum']), '2026-10-06')
        self.assertIsNone(l['lastnings_tid'])
        self.assertTrue(l['tid_ar_utc'])

    def test_skotningsstatus_i_utc(self):
        fs = self.data['skotning_status'][0]
        self.assertEqual(fs['start_tid'], utc(2026, 12, 1, 6, 0, 0))
        self.assertEqual(fs['slut_tid'], utc(2026, 12, 2, 15, 30, 0))
        self.assertTrue(fs['tid_ar_utc'])

    def test_lasset_ger_dubblettnyckel_som_aggregeras_bort(self):
        l = self.data['lass'][0]
        nycklar = [s['sortiment_id'] for s in l['sortiment']]
        self.assertEqual(sorted(nycklar), ['A030353_120', 'A030353_120', 'A030353_121'])   # parsern: en rad per PartialLoad
        rader = [dict(s, maskin_id='A030353', objekt_id=l['objekt_id'], datum=l['datum'], lass_nummer=l['lass_nummer']) for s in l['sortiment']]
        ut = M.aggregera_lass_sortiment(rader)
        self.assertEqual(sorted((r['sortiment_id'], r['volym_m3sob']) for r in ut), [('A030353_120', 7.5), ('A030353_121', 3.0)])
        self.assertEqual(l['volym_m3sob'], 10.5)   # lassets volym är oförändrad


class SparaFpr(unittest.TestCase):
    """Hela vägen save_fpr_to_supabase → POST: fångar vad som skickas, utan nätverk."""

    def test_en_rad_per_nyckel_skickas_och_ett_fel_stoppar_importen(self):
        skickat = {}
        gammal = M.upsert_data

        def fake(table, data, unique_columns=None, on_conflict='merge'):
            skickat[table] = [dict(r) for r in data]
            return 0 if table == 'fakt_lass_sortiment' and os.environ.get('SORT_FAIL') else len(data)

        fil = tempfile.NamedTemporaryFile('w', suffix='.fpr', delete=False, encoding='utf-8')
        fil.write(FPR); fil.close()
        try:
            M.upsert_data = fake
            for fn in ('upsert_maskin', 'upsert_dim_objekt', 'auto_status_pagaende', 'auto_avslut', 'upsert_nyckelgrupperat', 'log_if_new_maskin'):
                setattr(M, fn, lambda *a, **k: 1)
            M.fpr_avvisas_manuell = lambda d: False
            data = M.parse_fpr_file(fil.name)
            self.assertTrue(M.save_fpr_to_supabase(data))
            nycklar = [(r['lass_nummer'], r['sortiment_id']) for r in skickat['fakt_lass_sortiment']]
            self.assertEqual(len(nycklar), len(set(nycklar)))
            self.assertEqual(skickat['fakt_lass'][0]['lossnings_tid'], utc(2026, 10, 6, 21, 50, 10))
            os.environ['SORT_FAIL'] = '1'
            self.assertFalse(M.save_fpr_to_supabase(M.parse_fpr_file(fil.name)), 'ett misslyckat sortimentsbatch får inte räknas som importerat')
        finally:
            os.environ.pop('SORT_FAIL', None)
            M.upsert_data = gammal
            os.unlink(fil.name)


if __name__ == '__main__':
    unittest.main()
