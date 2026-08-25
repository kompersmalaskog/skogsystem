"""Backfill av apteringsfönstret ur redan behandlade HPR-filer.

Importen skriver bara fönster för filer den behandlar FRAMÅT. Alla objekt som
redan är importerade skulle därför stå kvar med härledda tak för alltid, och
det härledda taket är bevisat fel: kubben har diametertak 260 (inte 220) och
ett längdtak på 325 cm som prislistan inte har alls.

Skriptet rör inte den vanliga importen. Det läser bara ProductDefinition ur
filhuvudet och skriver dim_objekt_sortiment_fonster genom exakt samma
funktion som importen använder — spara_apteringsfonster — så att
FONSTER_BYTTE-regeln gäller också här: FÖRSTA fönstret vinner och avvikelsen
går till import_fel. En backfill som skriver om historien vore precis det
tabellen finns för att förhindra.

Filerna är delvis kumulativa: samma objekt förekommer i upp till en fil per
timme. Apteringsdefinitionen är densamma i alla filer för ett objekt, så
skriptet grupperar på objekt och läser BARA den största filen per grupp.
1 914 filer blir några tiotal läsningar.

Körs manuellt:  python backfill_apteringsfonster.py [--pa-riktigt]
Utan flaggan är det en torrkörning som inte skriver något.
"""
import os
import re
import sys
import glob
import importlib.util
import xml.etree.ElementTree as ET
from collections import defaultdict

BEHANDLADE = os.path.join(
    os.environ['USERPROFILE'], 'Kompersmåla Skog', 'Maskindata - Dokument',
    'MOM-filer', 'Behandlade')

HAR = os.path.dirname(os.path.abspath(__file__))


def ladda_importmodul():
    """Återanvänd importens läsare i stället för att skriva en andra.

    En kopia av las_apteringsfonster hade blivit en andra sanning som glider
    isär från den första vid nästa rättning.
    """
    spec = importlib.util.spec_from_file_location(
        'imp6', os.path.join(HAR, 'skogsmaskin_import_version_6.py'))
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except SystemExit:
        pass
    return mod


M = ladda_importmodul()


def lokal(tag):
    return tag.split('}', 1)[1] if '}' in tag else tag


# Filnamnens tidsstämpelsuffix, ett mönster per maskintyp:
#   Ponsse  Åbogen RP 2026_PONS20SDJAA270231_20260803094447.hpr
#   Ponsse  Anna Karin Swerup_PONS20SDJAA270231_20260525174917_1.hpr
#   Rottne  Bastaremåla gallring 2026-04-30 0753.hpr
#   Rottne  Björn Martinsson Svinhult Au 2025 2026-02-23.hpr
#
# Det avslutande _1 är ett ökningsnummer, inte ett annat objekt. Utan
# (_\d+)? i mönstret blev ETT objekt till 89 grupper — 103 filer i en riktig
# grupp och 88 enfilsgrupper som var samma trakt. Grupperingen hade då läst
# 88 filer i onödan, men värre: den hade sett ut att fungera.
SUFFIX = [
    re.compile(r'_[A-Za-z0-9]+_\d{8,14}(_\d+)?$'),
    re.compile(r'\s\d{4}-\d{2}-\d{2}(\s\d{3,4})?(_\d+)?$'),
]


def gruppnyckel(sokvag):
    namn = os.path.splitext(os.path.basename(sokvag))[0]
    for m in SUFFIX:
        ny = m.sub('', namn)
        if ny != namn:
            namn = ny
            break
    maskinmapp = os.path.basename(os.path.dirname(os.path.dirname(sokvag)))
    return (maskinmapp, namn.strip())


def las_huvud(sokvag):
    """Maskin, objekt och apteringsfönster ur filhuvudet.

    Stannar vid första <Stem>. Stamdatan är 99 % av filen och behövs inte —
    ProductDefinition ligger före den.
    """
    maskin_el = None
    try:
        for handelse, el in ET.iterparse(sokvag, events=('start', 'end')):
            namn = lokal(el.tag)
            if handelse == 'start':
                if namn == 'Machine' and maskin_el is None:
                    maskin_el = el
                elif namn == 'Stem':
                    break
    except ET.ParseError as e:
        return None, [], [], 'trasig XML: %s' % e
    if maskin_el is None:
        return None, [], [], 'inget Machine-element'

    ns = '{urn:skogforsk:stanford2010}'
    if not maskin_el.tag.startswith('{'):
        ns = ''

    maskin_id = M.get_text(maskin_el, 'BaseMachineManufacturerID', ns) \
        or M.get_text(maskin_el, 'MachineKey', ns)
    tillverkare = M.get_text(maskin_el, 'MachineBaseManufacturer', ns)
    maskin_id = M.normalize_maskin_id(maskin_id, tillverkare)
    if not maskin_id:
        return None, [], [], 'ingen maskin_id'

    objekt_ids = []
    for obj_def in M.find_all_elements(maskin_el, 'ObjectDefinition', ns):
        obj_key = M.get_text(obj_def, 'ObjectKey', ns)
        kontrakt = M.get_text(obj_def, 'ContractNumber', ns)
        vo = kontrakt if kontrakt else M.get_text(obj_def, 'ObjectUserID', ns)
        oid = M.make_objekt_id(vo, maskin_id, obj_key)
        if oid and oid not in objekt_ids:
            objekt_ids.append(oid)
    if not objekt_ids:
        return maskin_id, [], [], 'ingen ObjectDefinition'

    fonster = []
    for prod_def in M.find_all_elements(maskin_el, 'ProductDefinition', ns):
        prod_key = M.get_text(prod_def, 'ProductKey', ns)
        if not prod_key:
            continue
        f = M.las_apteringsfonster(prod_def, ns)
        if f:
            fonster.append(('%s_%s' % (maskin_id, prod_key), f))
    return maskin_id, objekt_ids, fonster, None


def hamta(sokvag_del):
    import requests
    svar = requests.get('%s/rest/v1/%s' % (M.SUPABASE_URL, sokvag_del),
                        headers=M.SUPABASE_HEADERS, timeout=60)
    svar.raise_for_status()
    return svar.json()


def tackningsrapport():
    """Vad backfillen FAKTISKT gav — inte att den gick igenom.

    En tom tabell ser identisk ut med en tabell där läsaren tyst returnerade
    ingenting, så täckningen redovisas i par: hur många (objekt, sortiment)
    som fick ett fönster ur maskinen och hur många som fortfarande är
    härledda.
    """
    import requests
    svar = requests.post('%s/rest/v1/rpc/kontroll_apteringsfonster' % M.SUPABASE_URL,
                         headers=M.SUPABASE_HEADERS, json={}, timeout=60)
    if svar.status_code != 200:
        print('Kunde inte lasa kontrollen: %s %s' % (svar.status_code, svar.text[:200]))
        return
    k = svar.json()
    print('')
    print('=' * 68)
    print('TACKNING  (kontroll_apteringsfonster)')
    print('=' * 68)
    print('samlad status: %s' % k.get('status'))
    for nyckel in ('kontroll_1_falt_fylls', 'kontroll_2_tackning',
                   'kontroll_3_motsagelser', 'kontroll_4_abogen'):
        d = k.get(nyckel) or {}
        print('')
        print('%s  -> %s' % (nyckel, d.get('status')))
        for f, v in sorted(d.items()):
            if f in ('status', 'not', 'atgard'):
                continue
            print('    %-22s %s' % (f, v))


def main():
    pa_riktigt = '--pa-riktigt' in sys.argv
    # SUPABASE_HEADERS är tom tills init_supabase() körts — den anropas
    # normalt från importens main(), som aldrig kör här. Utan detta skrev
    # skriptet med tom nyckel, fick 401 på varje rad, och rapporterade ändå
    # "SKRIVET: 1922 rader". Ett skript som ljuger om utfallet är värre än
    # ett som kraschar.
    if pa_riktigt and not M.init_supabase():
        print('FEL: kunde inte ansluta till Supabase. Inget skrivet.')
        return 1
    print('Behandlade: %s' % BEHANDLADE)
    if not os.path.isdir(BEHANDLADE):
        print('FEL: mappen finns inte.')
        return 1

    alla = glob.glob(os.path.join(BEHANDLADE, '*', 'HPR', '*.hpr'))
    print('HPR-filer totalt: %d' % len(alla))
    if not alla:
        return 1

    grupper = defaultdict(list)
    for f in alla:
        grupper[gruppnyckel(f)].append(f)
    # Största filen per grupp: kumulativa filer växer, den största bär mest.
    valda = [max(fs, key=lambda x: (os.path.getsize(x), os.path.getmtime(x)))
             for fs in grupper.values()]
    print('grupper (objekt): %d  ->  läser %d filer, hoppar över %d'
          % (len(grupper), len(valda), len(alla) - len(valda)))

    rader_totalt = 0
    skrivna = [0]
    misslyckade = []
    oforandrade = [0]
    bytten = [0]
    objekt_med_fonster = set()
    utan_fonster = []
    # Äldst först. "Första fönstret vinner" måste betyda det som gällde
    # tidigast — annars avgör bokstavsordningen vad historien blir, och en
    # omkörning i en annan filordning kan ge ett annat svar.
    valda.sort(key=os.path.getmtime)
    for i, f in enumerate(valda, 1):
        maskin_id, objekt_ids, fonster, fel = las_huvud(f)
        kort = os.path.basename(f)[:52]
        if fel:
            print('  [%3d/%d] %-52s  HOPPAR: %s' % (i, len(valda), kort, fel))
            utan_fonster.append((kort, fel))
            continue
        if not fonster:
            print('  [%3d/%d] %-52s  inga fönster i filen' % (i, len(valda), kort))
            utan_fonster.append((kort, 'ProductDefinition utan gränser'))
            continue

        rader = []
        for oid in objekt_ids:
            for sortiment_id, f_varden in fonster:
                rad = {'objekt_id': oid, 'sortiment_id': sortiment_id,
                       'filnamn': os.path.basename(f)}
                rad.update(f_varden)
                rader.append(rad)
        objekt_med_fonster.update(objekt_ids)
        rader_totalt += len(rader)
        print('  [%3d/%d] %-52s  %d objekt x %d sortiment = %d rader'
              % (i, len(valda), kort, len(objekt_ids), len(fonster), len(rader)))
        if pa_riktigt:
            # SAMMA funktion som importen: första fönstret vinner, byte -> import_fel.
            nya, oforandrade_nu, bytten_nu = M.spara_apteringsfonster(rader, os.path.basename(f))
            skrivna[0] += nya
            oforandrade[0] += oforandrade_nu
            bytten[0] += bytten_nu
            if nya == 0 and oforandrade_nu == 0 and bytten_nu == 0 and rader:
                misslyckade.append(os.path.basename(f))

    if pa_riktigt:
        print('')
        print('Rader byggda: %d   FAKTISKT SKRIVNA: %d   objekt: %d'
              % (rader_totalt, skrivna[0], len(objekt_med_fonster)))
        print('Redan identiska: %d   fonsterbyten till import_fel: %d'
              % (oforandrade[0], bytten[0]))
        # Skillnaden är inte kosmetisk: 0 skrivna med 1 922 byggda är exakt
        # hur en tyst 401 ser ut.
        if misslyckade:
            print('SKRIVNINGEN MISSLYCKADES för %d filer, t.ex.:' % len(misslyckade))
            for namn in misslyckade[:5]:
                print('   %s' % namn)
            print('Inget att lita på i talen ovan. Rätta felet och kör om.')
            return 1
    else:
        print('')
        print('TORRKÖRNING (inget skrivet): %d rader från %d objekt'
              % (rader_totalt, len(objekt_med_fonster)))
    if utan_fonster:
        print('\nFiler utan användbart fönster (%d):' % len(utan_fonster))
        for namn, orsak in utan_fonster[:20]:
            print('  %-52s %s' % (namn, orsak))
    if pa_riktigt:
        tackningsrapport()
    else:
        print('Kor med --pa-riktigt for att skriva.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
