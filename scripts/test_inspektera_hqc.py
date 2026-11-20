"""Test: scripts/inspektera-hqc-kalibrering.py (läsläge för kalibreringskurvan i HQC-filer).

    python scripts/test_inspektera_hqc.py

Syntetiska HQC-filer i en temporär mapp. Det viktiga att bevisa: skriptet hittar block med flera
justeringspunkter (som parsern kastar), räknar block som upprepas i ackumulerande filer EN gång, anger vilka taggar
parsern inte läser, överlever en trasig fil — och skriver ingenting utom rapportfilen.
"""
import importlib.util, os, sys, tempfile, unittest

HAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('inspektera', os.path.join(HAR, 'scripts', 'inspektera-hqc-kalibrering.py'))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)

NS = 'urn:test:stanford2010'


def hqc(block, maskin='PONS20SDJAA270231'):
    return (f'<?xml version="1.0" encoding="utf-8"?><HarvestedProductionReport xmlns="{NS}"><Machine>'
            f'<MachineKey>{maskin}</MachineKey><CalibrationValues>{block}</CalibrationValues></Machine></HarvestedProductionReport>')


KURVA = ('<DiameterCalibration><SpeciesGroupUserID>SE1_Gran</SpeciesGroupUserID><CalibrationDate>2026-03-02T09:00:00</CalibrationDate>'
         '<DiameterCalibrationReason>Manual</DiameterCalibrationReason>'
         '<DiameterCalibrationAdjustment diameterCalibrationPosition="50">-1</DiameterCalibrationAdjustment>'
         '<DiameterCalibrationAdjustment diameterCalibrationPosition="150">0</DiameterCalibrationAdjustment>'
         '<DiameterCalibrationAdjustment diameterCalibrationPosition="300">2</DiameterCalibrationAdjustment>'
         '<DiameterCalibrationNote>kurva</DiameterCalibrationNote></DiameterCalibration>')
ENKEL = ('<DiameterCalibration><SpeciesGroupUserID>SE1_Tall</SpeciesGroupUserID><CalibrationDate>2026-03-03T09:00:00</CalibrationDate>'
         '<DiameterCalibrationReason>Auto</DiameterCalibrationReason>'
         '<DiameterCalibrationAdjustment diameterCalibrationPosition="50">0</DiameterCalibrationAdjustment></DiameterCalibration>')
LANGD = ('<LengthCalibration><SpeciesGroupUserID>SE1_Gran</SpeciesGroupUserID><CalibrationDate>2026-03-02T09:00:00</CalibrationDate>'
         '<LengthCalibrationReason>Manual</LengthCalibrationReason>'
         '<LengthCalibrationAdjustment lengthCalibrationPosition="1000">1</LengthCalibrationAdjustment></LengthCalibration>')


class Inspektera(unittest.TestCase):
    def skriv_filer(self, **filer):
        d = tempfile.mkdtemp(prefix='hqc_')
        for namn, innehall in filer.items():
            with open(os.path.join(d, namn + '.hqc'), 'w', encoding='utf-8') as f:
                f.write(innehall)
        return d

    def kor(self, d):
        rader = []
        antal_flera = S.kor(S.hitta_filer(d), rader.append)
        return antal_flera, '\n'.join(rader)

    def test_hittar_block_med_flera_punkter_och_visar_positionerna(self):
        d = self.skriv_filer(a=hqc(KURVA + ENKEL + LANGD))
        flera, text = self.kor(d)
        self.assertEqual(flera, 1)
        self.assertIn('3 punkter', text)
        self.assertIn('diameterCalibrationPosition=150', text)
        self.assertIn('50:-1  150:0  300:2', text)
        self.assertIn('kurvan FINNS i filerna', text)

    def test_ackumulerande_filer_raknar_samma_block_en_gang(self):
        d = self.skriv_filer(a=hqc(KURVA), b=hqc(KURVA + ENKEL), c=hqc(KURVA + ENKEL))
        flera, text = self.kor(d)
        self.assertEqual(flera, 1)
        self.assertIn('unika kalibreringsblock (maskin, typ, trädslag, datum, orsak): 2', text)
        self.assertIn('diameter block med 3 justeringspunkt(er): 1', text)
        self.assertIn('diameter block med 1 justeringspunkt(er): 1', text)

    def test_ingen_kurva_sags_rakt_ut(self):
        flera, text = self.kor(self.skriv_filer(a=hqc(ENKEL + LANGD)))
        self.assertEqual(flera, 0)
        self.assertIn('kurvan finns INTE i HQC-filerna', text)

    def test_taggar_parsern_inte_laser_redovisas(self):
        flera, text = self.kor(self.skriv_filer(a=hqc(KURVA)))
        self.assertIn('taggar parsern inte läser: DiameterCalibrationNote', text)

    def test_trasig_fil_stoppar_inte_resten(self):
        d = self.skriv_filer(bra=hqc(KURVA), trasig='<inte xml')
        flera, text = self.kor(d)
        self.assertEqual(flera, 1)
        self.assertIn('Kunde inte läsa', text)
        self.assertIn('filer lästa: 1 av 2', text)

    def test_skriver_bara_rapportfilen(self):
        d = self.skriv_filer(a=hqc(KURVA))
        ut = os.path.join(tempfile.mkdtemp(prefix='ut_'), 'rapport.txt')
        fore = sorted(os.listdir(d))
        self.assertEqual(S.main([d, '--ut', ut]), 0)
        self.assertEqual(sorted(os.listdir(d)), fore)                      # filerna orörda
        with open(ut, encoding='utf-8') as f:
            self.assertIn('SAMMANSTÄLLNING', f.read())

    def test_tom_mapp_ger_felkod(self):
        self.assertEqual(S.main([tempfile.mkdtemp(prefix='tom_'), '--ut', os.path.join(tempfile.mkdtemp(), 'x.txt')]), 2)

    def test_skriptet_har_ingen_natverks_eller_databaskod(self):
        with open(os.path.join(HAR, 'scripts', 'inspektera-hqc-kalibrering.py'), encoding='utf-8') as f:
            importer = [r for r in f.read().splitlines() if r.startswith(('import ', 'from '))]
        for r in importer:
            for forbjudet in ('requests', 'urllib', 'socket', 'http', 'supabase'):
                self.assertNotIn(forbjudet, r)


if __name__ == '__main__':
    unittest.main(verbosity=2)
