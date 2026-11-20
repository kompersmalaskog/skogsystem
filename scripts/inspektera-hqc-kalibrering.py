"""Inspektera kalibreringskurvan i sparade HQC-filer. LÄSER BARA — skriver ingenting i databasen och rör inga filer.

    py scripts\\inspektera-hqc-kalibrering.py <mapp eller fil> [--ut hqc-kalibrering.txt]

Frågan (2026-10-22): fakt_kalibrering_historik har en punkt per diameterändring (alltid position 50 cm, oftast 0 eller
-1 mm), men i Opti är diameterkorrigeringen en KURVA med många punkter per trädslag. Parsern läser bara det FÖRSTA
...CalibrationAdjustment-elementet i varje block. Det här skriptet visar vad filerna faktiskt innehåller, så att vi
vet om kurvan finns i HQC-filerna innan parser och tabell ändras.

Per fil (och sammanställt över alla filer, eftersom filerna är ackumulerande och upprepar tidigare block):
  - maskin, antal LengthCalibration- och DiameterCalibration-block
  - per block: trädslag, datum, orsak, ANTAL ...CalibrationAdjustment-element, varje punkts position (attribut) och värde
  - taggar i blocken som parsern inte läser alls
  - om något block har fler än en punkt, och i så fall hur många och vilka positioner
Skriver rapporten till skärmen och till --ut (standard hqc-kalibrering.txt i aktuell mapp). Skicka filen.
"""
import argparse
import os
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

# Det parsern (parse_hqc_file) läser ur ett kalibreringsblock. Allt annat är "oläst".
LASER_LANGD = {'SpeciesGroupUserID', 'CalibrationDate', 'LengthCalibrationReason', 'LengthCalibrationDescription',
               'LengthCalibrationAdjustment', 'LengthCalibrationAdjustmentButtLog'}
LASER_DIAMETER = {'SpeciesGroupUserID', 'CalibrationDate', 'DiameterCalibrationReason',
                 'DiameterCalibrationDescription', 'DiameterCalibrationAdjustment'}


def lokal(tagg):
    return tagg.rsplit('}', 1)[-1]


def barn_text(elem, namn):
    for b in elem:
        if lokal(b.tag) == namn:
            return (b.text or '').strip()
    return ''


def hitta_alla(root, namn):
    return [e for e in root.iter() if lokal(e.tag) == namn]


def maskin_av(root):
    for namn in ('BaseMachineManufacturerID', 'MachineKey'):
        for e in root.iter():
            if lokal(e.tag) == namn and (e.text or '').strip():
                return e.text.strip()
    return '?'


def block_av(elem, typ):
    laser = LASER_LANGD if typ == 'langd' else LASER_DIAMETER
    just = [b for b in elem if lokal(b.tag).endswith('CalibrationAdjustment')]
    punkter = []
    for b in just:
        attr = {lokal(k): v for k, v in b.attrib.items()}
        punkter.append({'tagg': lokal(b.tag), 'varde': (b.text or '').strip(), 'attribut': attr})
    return {
        'typ': typ,
        'tradslag': barn_text(elem, 'SpeciesGroupUserID'),
        'datum': barn_text(elem, 'CalibrationDate'),
        'orsak': barn_text(elem, 'LengthCalibrationReason' if typ == 'langd' else 'DiameterCalibrationReason'),
        'punkter': punkter,
        'olasta_taggar': sorted({lokal(b.tag) for b in elem} - laser),
        'barn_totalt': len(list(elem)),
    }


def las_fil(sokvag):
    root = ET.parse(sokvag).getroot()
    block = []
    for cv in hitta_alla(root, 'CalibrationValues'):
        for e in cv:
            t = lokal(e.tag)
            if t == 'LengthCalibration':
                block.append(block_av(e, 'langd'))
            elif t == 'DiameterCalibration':
                block.append(block_av(e, 'diameter'))
    return maskin_av(root), block, len(hitta_alla(root, 'CalibrationValues'))


def hitta_filer(sokvag):
    if os.path.isfile(sokvag):
        return [sokvag]
    ut = []
    for rot, _, filer in os.walk(sokvag):
        ut.extend(os.path.join(rot, f) for f in filer if f.lower().endswith('.hqc'))
    return sorted(ut)


def punkt_text(p):
    attr = ', '.join(f'{k}={v}' for k, v in sorted(p['attribut'].items())) or 'inga attribut'
    return f"{p['tagg']} = {p['varde'] or '(tomt)'}  [{attr}]"


def kor(filer, skriv):
    unika = {}                      # (maskin, typ, trädslag, datum, orsak) -> block (första förekomsten) + filer
    per_antal = Counter()           # (typ, antal punkter) -> antal unika block
    olasta = defaultdict(Counter)   # typ -> tagg -> antal block
    fel = []
    for sokvag in filer:
        try:
            maskin, block, antal_cv = las_fil(sokvag)
        except Exception as e:                                   # en trasig fil stoppar inte genomgången
            fel.append((sokvag, f'{type(e).__name__}: {e}'))
            continue
        skriv(f"\n{os.path.basename(sokvag)}  [{maskin}]  CalibrationValues-block: {antal_cv}  "
              f"längd: {sum(b['typ']=='langd' for b in block)}  diameter: {sum(b['typ']=='diameter' for b in block)}")
        for b in block:
            skriv(f"   {b['typ']:8} {b['tradslag'] or '(inget trädslag)':14} {b['datum'][:19]:19}  orsak: {b['orsak'] or '-':14} "
                  f"punkter: {len(b['punkter'])}")
            for p in b['punkter']:
                skriv(f"       {punkt_text(p)}")
            if b['olasta_taggar']:
                skriv(f"       taggar parsern inte läser: {', '.join(b['olasta_taggar'])}")
            nyckel = (maskin, b['typ'], b['tradslag'], b['datum'], b['orsak'])
            if nyckel not in unika:
                unika[nyckel] = {'block': b, 'filer': [os.path.basename(sokvag)]}
                per_antal[(b['typ'], len(b['punkter']))] += 1
                for t in b['olasta_taggar']:
                    olasta[b['typ']][t] += 1
            else:
                unika[nyckel]['filer'].append(os.path.basename(sokvag))

    skriv('\n' + '=' * 78)
    skriv(f"SAMMANSTÄLLNING  filer lästa: {len(filer) - len(fel)} av {len(filer)}  |  unika kalibreringsblock "
          f"(maskin, typ, trädslag, datum, orsak): {len(unika)}")
    for (typ, n), antal in sorted(per_antal.items()):
        skriv(f"   {typ:8} block med {n} justeringspunkt(er): {antal}")
    flera = [(k, v) for k, v in unika.items() if len(v['block']['punkter']) > 1]
    skriv(f"\nBlock med MER ÄN EN punkt (parsern behåller bara den första): {len(flera)}")
    for k, v in flera[:40]:
        b = v['block']
        pos = []
        for p in b['punkter']:
            pos.append(next((val for att, val in sorted(p['attribut'].items()) if 'osition' in att), '?') + ':' + (p['varde'] or '?'))
        skriv(f"   {k[0]} {k[1]:8} {k[2]:12} {k[3][:10]}  {len(b['punkter'])} punkter  position:värde  {'  '.join(pos)}")
    if len(flera) > 40:
        skriv(f"   … och {len(flera) - 40} till")
    if olasta:
        skriv("\nTaggar i kalibreringsblocken som parsern INTE läser alls (antal unika block):")
        for typ, c in olasta.items():
            for t, n in c.most_common():
                skriv(f"   {typ:8} {t}: {n}")
    for sokvag, e in fel:
        skriv(f"\nKunde inte läsa {sokvag}: {e}")
    skriv("\nSVAR: " + (f"kurvan FINNS i filerna ({len(flera)} block med flera punkter)." if flera else
          "inget block har mer än en justeringspunkt i de här filerna — kurvan finns INTE i HQC-filerna."))
    return len(flera)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('sokvag', help='mapp (söks rekursivt efter *.hqc) eller en enskild fil')
    ap.add_argument('--ut', default='hqc-kalibrering.txt', help='rapportfil (standard: hqc-kalibrering.txt)')
    a = ap.parse_args(argv)
    filer = hitta_filer(a.sokvag)
    if not filer:
        print(f'Inga .hqc-filer hittades under {a.sokvag}')
        return 2
    rader = []

    def skriv(t):
        print(t)
        rader.append(t)

    skriv(f"Inspekterar {len(filer)} HQC-fil(er) under {a.sokvag}  (läser bara — inget skrivs i databasen)")
    kor(filer, skriv)
    with open(a.ut, 'w', encoding='utf-8') as f:
        f.write('\n'.join(rader) + '\n')
    print(f"\nRapporten sparad: {os.path.abspath(a.ut)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
