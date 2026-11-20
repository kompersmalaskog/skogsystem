"""Importerar avsmalningskurvan (StemDiameters) ur behandlade HPR-filer.

En rad per stam, serien som array. Rör inte den vanliga importen.

── GRUPPERING PÅ ObjectKey, ALDRIG PÅ FILNAMN ────────────────────────────
Fönsterbackfillen grupperade på filnamn och slog därför ihop fyra olika
objekt som alla exporterats som "HPR-Onedrive": S Rimshult lövgallring,
Kjell Nilsson Brorsmåla, Flytt/Service och Stefan Svensson Björkebråten.
Bara ett av dem låg i den största filen, så S Rimshult fick noll rader.
Filnamnet är maskinens, inte objektets — objektet står i ObjectDefinition.

── 4 000-TAKET ──────────────────────────────────────────────────────────
Scorpionen kapar sin HPR-export vid 4 000 stammar per objekt. Passerar ett
objekt den gränsen skriver maskinen filer i PAR: en med exakt 4 000 stammar
och en systerfil med resten, samma minut. Största filen är då ett FÖNSTER,
inte en superset — på Jätsbygd au 2026 saknades 659 av 4 659 stammar.

Regeln: har objektets största fil exakt 4 000 stammar, läs ALLA filer för
objektet. Det är ingen gissning utan en känd filkapning, och den är billig
att upptäcka: räkna StemKey med byteregex (366 MB/s) i stället för att
XML-parsa (1,4 MB/s).

── FILER UTAN SERIE ÄR NORMALT ──────────────────────────────────────────
Ponsse slog på serien 2026-07-18 mellan 08:06 och 09:40. Allt före saknar
den, i samma StanForD-version och samma maskin. MultiTreeProcessing saknar
den alltid — flera små träd i ett grepp har ingen enskild stamprofil, och
de hoppas redan över i den vanliga importen. Bådadera räknas och redovisas,
men är inte fel.

Körs manuellt:  python import_diameterserie.py [--pa-riktigt]
"""
import xml.etree.ElementTree as ET
import os, re, sys, glob, time, json, io, collections, importlib.util

BAS = os.path.join(os.environ['USERPROFILE'], 'Kompersmåla Skog',
                   'Maskindata - Dokument', 'MOM-filer', 'Behandlade')
HAR = os.path.dirname(os.path.abspath(__file__))
NS = '{urn:skogforsk:stanford2010}'
TAK = 4000                      # Scorpionens filkapning
RE_STEMKEY = re.compile(rb'<StemKey>([^<]{1,32})</StemKey>')
# StemKey följs alltid direkt av ObjectKey i StanForD-2010. Verifierat mot
# ElementTree: samma antal, samma fördelning per objekt.
RE_PAR = re.compile(rb'<StemKey>([^<]{1,32})</StemKey>\s*<ObjectKey>([^<]{1,32})</ObjectKey>')


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


def L(t):
    return t.split('}', 1)[1] if '}' in t else t


RE_OBJDEF = re.compile(rb'<ObjectDefinition>(.*?)</ObjectDefinition>', re.S)
RE_MASKIN = re.compile(rb'<BaseMachineManufacturerID>([^<]*)</BaseMachineManufacturerID>')
RE_TILLV  = re.compile(rb'<MachineBaseManufacturer>([^<]*)</MachineBaseManufacturer>')


def _inre(block, tagg):
    m = re.search(('<%s>([^<]*)</%s>' % (tagg, tagg)).encode(), block)
    return m.group(1).decode('utf-8', 'replace').strip() if m else ''


def huvud(f):
    """maskin_id och objekten ur filhuvudet — byteläst, inte XML-parsat.

    Huvudet ligger före första <Stem>, så bara den biten läses. ElementTree
    över 1 935 filhuvuden tog tiotals minuter; det här tar sekunder, och
    frågan är enkel nog att inte behöva en XML-parser.
    """
    prefix = b''
    with open(f, 'rb') as fh:
        while b'<Stem>' not in prefix and b'<Stem ' not in prefix:
            bit = fh.read(1 << 18)
            if not bit:
                break
            prefix += bit
            if len(prefix) > (8 << 20):     # huvudet är aldrig 8 MB
                break
    klipp = min([x for x in (prefix.find(b'<Stem>'), prefix.find(b'<Stem ')) if x >= 0]
                or [len(prefix)])
    prefix = prefix[:klipp]
    mm = RE_MASKIN.search(prefix)
    mt = RE_TILLV.search(prefix)
    maskin = M.normalize_maskin_id(
        mm.group(1).decode('utf-8', 'replace').strip() if mm else '',
        mt.group(1).decode('utf-8', 'replace').strip() if mt else '')
    if not maskin:
        return None, {}, 'ingen maskin_id'
    karta = {}
    for block in RE_OBJDEF.findall(prefix):
        ok = _inre(block, 'ObjectKey')
        vo = _inre(block, 'ContractNumber') or _inre(block, 'ObjectUserID')
        if ok:
            karta[ok] = M.make_objekt_id(vo, maskin, ok)
    if not karta:
        return maskin, {}, 'ingen ObjectDefinition'
    return maskin, karta, None


def rakna_per_objekt(f):
    """Unika StemKey PER ObjectKey. Byteregex — 260 gånger snabbare än XML.

    Antalet, inte filstorleken, styr urvalet. Byte-storleken slutade vara ett
    mått på antal stammar 2026-07-18: en fil MED diameterserien är ungefär tre
    gånger större per stam, så en fil med 406 stammar blev större än en med
    858. Urval på bytes valde då fel fil på Uggleboda och tappade 452 stammar.
    """
    par = collections.defaultdict(set)
    rest = b''
    with open(f, 'rb') as fh:
        while True:
            b = fh.read(1 << 22)
            if not b:
                break
            d = rest + b
            for m in RE_PAR.finditer(d):
                par[m.group(2).decode('utf-8', 'replace')].add(m.group(1))
            rest = d[-256:]
    return {k: len(v) for k, v in par.items()}


def las_serier(f, objektkarta, maskin_id):
    """Alla stammar i filen. Ger rader + varför en stam saknar serie."""
    rader = []
    stat = collections.Counter()
    utan = []
    filen_har_serie = False
    for handelse, el in ET.iterparse(f, events=('end',)):
        if L(el.tag) != 'Stem':
            continue
        stam_key = None
        obj_key = None
        kategori = None
        for b in el:
            lb = L(b.tag)
            if lb == 'StemKey':
                stam_key = (b.text or '').strip()
            elif lb == 'ObjectKey':
                obj_key = (b.text or '').strip()
            elif lb == 'ProcessingCategory':
                kategori = (b.text or '').strip()
        objekt_id = objektkarta.get(obj_key)
        stat['stammar'] += 1

        start = slut = None
        varden = []
        diam_kat = None
        for sd in el.iter():
            if L(sd.tag) != 'StemDiameters':
                continue
            filen_har_serie = True
            if diam_kat is None:
                diam_kat = sd.attrib.get('diameterCategory')
            for x in sd:
                lx = L(x.tag)
                if lx == 'DiameterMeasuredStartHeight' and x.text:
                    start = int(x.text)
                elif lx == 'DiameterMeasuredEndHeight' and x.text:
                    slut = int(x.text)
                elif lx == 'DiameterValue' and x.text:
                    varden.append((int(x.attrib.get('diameterPosition', 0)), int(x.text)))
        el.clear()

        if not varden:
            # Klassificeras EFTER filen är läst: filen_har_serie är falsk tills
            # första serie-stammen dykt upp, så en tidig stam utan serie hade
            # annars felaktigt bokförts som "filen saknar serien".
            utan.append(kategori)
            continue
        if not (stam_key and objekt_id):
            stat['utan_nyckel'] += 1
            continue

        varden.sort()
        # Arrayformen förutsätter jämna steg — annars kan positionerna inte
        # räknas tillbaka och arrayen ljuger om var diametrarna satt. Mätt på
        # 6 000 serier är steget alltid 10 cm från position 0, men det är en
        # observation och inte en garanti, så ojämna serier skrivs INTE.
        steg = None
        if len(varden) > 1:
            avstand = {varden[i + 1][0] - varden[i][0] for i in range(len(varden) - 1)}
            if len(avstand) > 1:
                stat['ojamn_serie'] += 1
                continue
            steg = avstand.pop()
        rader.append({
            'maskin_id': maskin_id, 'objekt_id': objekt_id, 'stam_key': stam_key,
            'diameter_kategori': diam_kat or 'Over bark',
            'start_hojd_cm': start, 'slut_hojd_cm': slut, 'steg_cm': steg,
            'forsta_position_cm': varden[0][0],
            'diametrar': [v for _, v in varden],
            'antal_punkter': len(varden),
            'filnamn': os.path.basename(f),
        })
        stat['med_serie'] += 1
        stat['punkter'] += len(varden)
    for kategori in utan:
        if kategori == 'MultiTreeProcessing':
            stat['utan_multitree'] += 1
        elif not filen_har_serie:
            stat['utan_filen_saknar'] += 1
        else:
            stat['utan_okand'] += 1
    return rader, stat


def finns_i_tabellen(filnamn):
    """Ligger minst en serie ur filen redan i detalj_stam_diameter?"""
    import requests
    r = requests.get('%s/rest/v1/detalj_stam_diameter' % M.SUPABASE_URL,
                     params={'select': 'stam_key', 'filnamn': 'eq.%s' % filnamn, 'limit': 1},
                     headers=M.SUPABASE_HEADERS, timeout=60)
    r.raise_for_status()
    return len(r.json()) > 0


def skriv(rader):
    """Upsert i satser. Returnerar antal FAKTISKT skrivna rader."""
    import requests
    skrivna = 0
    sats = 300
    for i in range(0, len(rader), sats):
        del_ = rader[i:i + sats]
        # Omförsök: en bruten TLS-anslutning mitt i en uppladdning är
        # transient. Utan detta dog hela körningen på fil 341 av 342, efter
        # 42 minuters arbete, på ett fel som hade försvunnit vid nästa försök.
        for forsok in range(5):
            try:
                r = requests.post(
                    '%s/rest/v1/detalj_stam_diameter?on_conflict=maskin_id,objekt_id,stam_key'
                    % M.SUPABASE_URL,
                    headers=dict(M.SUPABASE_HEADERS,
                                 **{'Prefer': 'resolution=merge-duplicates,return=minimal'}),
                    json=del_, timeout=180)
            except requests.exceptions.RequestException as e:
                if forsok == 4:
                    print('    NÄTVERKSFEL efter 5 försök: %s' % e)
                    return skrivna, False
                time.sleep(2 ** forsok)
                continue
            if r.status_code in (200, 201, 204):
                break
            if r.status_code >= 500 and forsok < 4:
                time.sleep(2 ** forsok)
                continue
            print('    SKRIVFEL %s: %s' % (r.status_code, r.text[:200]))
            return skrivna, False
        skrivna += len(del_)
    return skrivna, True


def main():
    pa_riktigt = '--pa-riktigt' in sys.argv
    if pa_riktigt and not M.init_supabase():
        print('FEL: ingen Supabase-anslutning. Inget skrivet.')
        return 1

    alla = glob.glob(os.path.join(BAS, '*', 'HPR', '*.hpr'))
    print('HPR-filer: %d' % len(alla))

    t0 = time.time()
    fil_info = {}
    per_objekt = collections.defaultdict(list)
    CACHE = os.path.join(HAR, '.diameter_huvud.json')
    cache = {}
    if os.path.exists(CACHE):
        try:
            cache = json.load(io.open(CACHE, encoding='utf-8'))
        except Exception:
            cache = {}
    for n, f in enumerate(alla, 1):
        if f in cache:
            maskin, karta = cache[f][0], cache[f][1]
            fil_info[f] = (maskin, karta)
            for objekt_id in set(karta.values()):
                if objekt_id:
                    per_objekt[(objekt_id, maskin)].append(f)
            continue
        maskin, karta, fel = huvud(f)
        if fel or not karta:
            continue
        fil_info[f] = (maskin, karta)
        for objekt_id in set(karta.values()):
            if objekt_id:
                per_objekt[(objekt_id, maskin)].append(f)
        cache[f] = [maskin, karta]
        if n % 100 == 0:
            io.open(CACHE, 'w', encoding='utf-8').write(json.dumps(cache, ensure_ascii=False))
        if n % 300 == 0:
            print('  huvud %d/%d (%.0f s)' % (n, len(alla), time.time() - t0))
    io.open(CACHE, 'w', encoding='utf-8').write(json.dumps(cache, ensure_ascii=False))
    print('objekt x maskin: %d   (huvudpass %.0f s)' % (len(per_objekt), time.time() - t0))

    # Vilka filer måste läsas?
    #
    # Nyckeln är (objekt_id, maskin_id), inte objekt_id. Två maskiner kan köra
    # samma trakt — Svinhult och Steglehylte gjorde det — och StemKey numreras
    # per maskin, precis som tabellens primärnyckel redan säger. En fil per
    # objekt lämnade den andra maskinens 8 850 stammar oskrivna.
    #
    # Valet står på ANTAL STAMMAR för objektet i filen, aldrig på filstorlek.
    ANTAL_CACHE = os.path.join(HAR, '.diameter_antal.json')
    antal = {}
    if os.path.exists(ANTAL_CACHE):
        try:
            antal = json.load(io.open(ANTAL_CACHE, encoding='utf-8'))
        except Exception:
            antal = {}
    ts = time.time()
    behovs = sorted({f for fs in per_objekt.values() for f in fs} - set(antal))
    for i, f in enumerate(behovs, 1):
        antal[f] = rakna_per_objekt(f)
        if i % 20 == 0:
            io.open(ANTAL_CACHE, 'w', encoding='utf-8').write(json.dumps(antal, ensure_ascii=False))
        if i % 100 == 0:
            print('  raknar %d/%d (%.0f s)' % (i, len(behovs), time.time() - ts))
    if behovs:
        io.open(ANTAL_CACHE, 'w', encoding='utf-8').write(json.dumps(antal, ensure_ascii=False))
    print('stamantal cachat for %d filer (%.0f s)' % (len(antal), time.time() - ts))

    valda = set()
    kapade = []
    for (objekt_id, maskin_id), fs in sorted(per_objekt.items()):
        def antal_for(f):
            karta = fil_info[f][1]
            return sum(n for ok, n in antal.get(f, {}).items()
                       if karta.get(ok) == objekt_id)
        storst = max(fs, key=antal_for)
        if antal_for(storst) == TAK:
            kapade.append(('%s/%s' % (objekt_id, maskin_id), len(fs)))
            valda.update(fs)
        else:
            valda.add(storst)
    # ── Inkrementellt ─────────────────────────────────────────────────────
    # Körs efter varje import. En fil vars serier redan står i tabellen läses
    # inte om: filnamnet ligger på varje rad, så en räknefråga per fil avgör.
    # Filer som lästs men inte gav några serier (Ponsse före 2026-07-18)
    # finns inte i tabellen och antecknas lokalt i stället — annars hade de
    # parsats om, minuter var, vid varje körning. --alla läser om allt.
    LASTA = os.path.join(HAR, '.diameter_lasta.json')
    lasta = {}
    if os.path.exists(LASTA):
        try:
            lasta = json.load(io.open(LASTA, encoding='utf-8'))
        except Exception:
            lasta = {}
    if '--alla' not in sys.argv:
        kan_fraga = bool(M.SUPABASE_HEADERS) or M.init_supabase()
        hoppade = {f for f in valda
                   if os.path.basename(f) in lasta or (kan_fraga and finns_i_tabellen(os.path.basename(f)))}
        if hoppade:
            print('redan lästa: %d filer hoppas över (--alla läser om)' % len(hoppade))
        valda -= hoppade
    gb = sum(os.path.getsize(f) for f in valda) / 1e9
    print('valda filer: %d  (%.2f GB)   objekt vid 4000-taket: %d'
          % (len(valda), gb, len(kapade)))
    for etikett, n in kapade:
        print('    tak: %s -> laser alla %d filer' % (etikett, n))

    stat = collections.Counter()
    per_objekt_stat = collections.defaultdict(collections.Counter)
    skrivna_totalt = 0
    t1 = time.time()
    for n, f in enumerate(sorted(valda, key=os.path.getsize), 1):
        maskin, karta = fil_info[f]
        rader, s = las_serier(f, karta, maskin)
        stat.update(s)
        for r in rader:
            per_objekt_stat[r['objekt_id']]['stammar'] += 1
            per_objekt_stat[r['objekt_id']]['punkter'] += r['antal_punkter']
        if pa_riktigt and rader:
            skrivna, ok = skriv(rader)
            skrivna_totalt += skrivna
            if not ok:
                print('AVBRYTER: skrivningen misslyckades.')
                return 1
        if pa_riktigt:
            lasta[os.path.basename(f)] = len(rader)
            io.open(LASTA, 'w', encoding='utf-8').write(json.dumps(lasta, ensure_ascii=False))
        print('  [%3d/%d] %-44s %5d stammar, %5d med serie, %7d punkter (%.0f s)'
              % (n, len(valda), os.path.basename(f)[:44], s['stammar'],
                 s['med_serie'], s['punkter'], time.time() - t1))

    print('\n%s' % ('SKRIVET' if pa_riktigt else 'TORRKÖRNING — inget skrivet'))
    print('stammar totalt        %8d' % stat['stammar'])
    print('  med serie           %8d' % stat['med_serie'])
    print('  utan: multitree     %8d' % stat['utan_multitree'])
    print('  utan: filen saknar  %8d' % stat['utan_filen_saknar'])
    print('  utan: okand orsak   %8d' % stat['utan_okand'])
    print('  utan: nyckel saknas %8d' % stat['utan_nyckel'])
    print('  ojamn serie (ej skriven)%6d' % stat['ojamn_serie'])
    print('matpunkter totalt     %8d' % stat['punkter'])
    if pa_riktigt:
        print('rader FAKTISKT skrivna%8d' % skrivna_totalt)
    io.open('diameter_utfall.json', 'w', encoding='utf-8').write(json.dumps(
        {'stat': dict(stat), 'per_objekt': {k: dict(v) for k, v in per_objekt_stat.items()},
         'valda_filer': len(valda), 'kapade': kapade}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
