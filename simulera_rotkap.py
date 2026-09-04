"""Simulering: vad hade hänt om rotbiten kapats 3,4 m i stället för 3,0?

    python simulera_rotkap.py <objekt_id>

Skriver ingenting — läser och rapporterar. Allt objektet behöver kommer ur
objektets egna data: barkfunktion ur dess ob/ub-par, prismatris ur dess egen
HPR-fil, fönster ur dim_objekt_sortiment_fonster (korskontrollerat mot HPR),
kurvor ur detalj_stam_diameter (service-rollen).

── TVÅ GRUPPER, FÖR RÖTAN GÅR OLIKA LÅNGT ──────────────────────────────────
Populationen är stammar med en massabit på 300–314 cm före första sågbara
stocken. Apteraren kan inte se röta, så den delas på vad föraren gjorde:

  Grupp 1  EN massabit före sågstocken. Sågstocken börjar direkt över roten.
           A: rot som kapad, apterad rest.  B: rot +40 cm, apterad rest.
           40 cm av det grövsta virket blir massaved. Det är den verkliga
           kostnaden och den kan ingen apterare rädda.

  Grupp 2  FLERA massabitar i rad — rötan gick längre. Sågstocken börjar
           där kedjan slutar, och det bestämde rötan, inte rotkapet. Ett
           40 cm längre rotkap flyttas INOM massaveden och kostar noll timmer
           — men bara om någon senare bit i kedjan har slack ner till 300 cm.
           Ligger alla på 300–314 skjuts hela kedjan 40 cm uppåt och
           sågstocken med den. Båda fallen räknas, och noll verifieras bara
           där slacken faktiskt finns.

  Scenario C, grupp 2: ersätt HELA kedjan med ett enda kap på 3,4 m. Det är
  vinsten OM rötan tog slut inom 3,4 m. Datan kan inte säga hur ofta: StemGrade
  har en enda grad på position 0 för varje stam, ingen kvalitetsgräns längs
  stammen. C är alltså ett tak, inte en förväntan.

Stammar utan sågbar stock alls redovisas men simuleras inte: där finns inget
timmer att förlora eller vinna, och apteraren skulle bara hitta sågstockar
som föraren av goda skäl inte tog.

Innan något simuleras valideras maskineriet mot maskinens egna stockar:
position, bark och volym. Är de fel är resten värdelös.
"""
import os, sys, io, json, math, glob, collections, importlib.util
import xml.etree.ElementTree as ET
import requests

HAR = os.path.dirname(os.path.abspath(__file__))
SCRATCH = os.path.join(
    os.environ['USERPROFILE'], 'AppData', 'Local', 'Temp', 'claude',
    'C--Kompersm-la-Skog-Kompersm-la-Skog-Appen-skogsystem-claude',
    'f31f7433-7467-4d14-9193-e8156481536d', 'scratchpad')
BAS = os.path.join(os.environ['USERPROFILE'], 'Kompersmåla Skog',
                   'Maskindata - Dokument', 'MOM-filer', 'Behandlade')
SKIFT = 40
MASSA_MIN = 300          # manuell 3 m-massa får kapas ner till 300


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


def hamta(tabell, filt, select, order):
    ut = []
    start = 0
    while True:
        r = requests.get('%s/rest/v1/%s?select=%s&%s&order=%s&limit=1000&offset=%d'
                         % (M.SUPABASE_URL, tabell, select, filt, order, start),
                         headers=M.SUPABASE_HEADERS, timeout=60)
        r.raise_for_status()
        rad = r.json()
        ut.extend(rad)
        if len(rad) < 1000:
            return ut
        start += 1000


def hitta_hpr(objekt_id, maskin_id, objnamn):
    """Största HPR-filen för objektet, identifierad på ObjectKey ur huvudet."""
    cache_fil = os.path.join(HAR, '.diameter_huvud.json')
    cache = json.load(io.open(cache_fil, encoding='utf-8')) if os.path.exists(cache_fil) else {}
    kand = [f for f, (mask, karta) in cache.items()
            if mask == maskin_id and objekt_id in (karta or {}).values() and os.path.exists(f)]
    if kand:
        return max(kand, key=os.path.getsize)
    spec = importlib.util.spec_from_file_location('dimp', os.path.join(HAR, 'import_diameterserie.py'))
    D = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(D)
    except SystemExit:
        pass
    ord_ = [w.lower() for w in objnamn.replace('-', ' ').split() if len(w) >= 4]
    kand = []
    for f in glob.glob(os.path.join(BAS, maskin_id, 'HPR', '*.hpr')):
        if not any(w in os.path.basename(f).lower() for w in ord_):
            continue
        mask, karta, fel = D.huvud(f)
        if not fel and mask == maskin_id and objekt_id in karta.values():
            kand.append(f)
    if not kand:
        raise SystemExit('ingen HPR-fil för %s (%s)' % (objekt_id, objnamn))
    return max(kand, key=os.path.getsize)


def las_prismatris(fil):
    prod = []
    for ev, el in ET.iterparse(fil, events=('start', 'end')):
        if ev == 'start' and L(el.tag) == 'Stem':
            break
        if ev == 'end' and L(el.tag) == 'ProductDefinition':
            prod.append(el)

    def txt(el, tag):
        for b in el.iter():
            if L(b.tag) == tag and b.text:
                return b.text.strip()
        return None

    ut = {}
    for pd in prod:
        key = txt(pd, 'ProductKey'); namn = txt(pd, 'ProductName'); grupp = txt(pd, 'ProductGroupName')
        if not namn or namn == 'Unclassified':
            continue
        p = {'key': key, 'namn': namn, 'grupp': (grupp or '?'),
             'dia_min_top': txt(pd, 'DiameterMINTop'), 'dia_max': txt(pd, 'DiameterClassMAX'),
             'dia_max_butt': txt(pd, 'DiameterMAXButt'), 'langd_max': txt(pd, 'LengthClassMAX'),
             'langd_klasser': set(), 'dia_klasser': set(), 'matris': []}
        for b in pd.iter():
            t = L(b.tag)
            if t == 'LengthClassLowerLimit' and b.text:
                p['langd_klasser'].add(int(b.text))
            elif t == 'DiameterClassLowerLimit' and b.text:
                p['dia_klasser'].add(int(b.text))
            elif t == 'ProductMatrixItem':
                pris = bc = None
                for x in b:
                    if L(x.tag) == 'Price' and x.text:
                        pris = float(x.text)
                    elif L(x.tag) == 'BuckingCriteria' and x.text:
                        bc = x.text.strip()
                p['matris'].append({'l': int(b.attrib.get('lengthClassLowerLimit', 0)),
                                    'd': int(b.attrib.get('diameterClassLowerLimit', 0)),
                                    'pris': pris, 'bc': bc})
        p['langd_klasser'] = sorted(p['langd_klasser']); p['dia_klasser'] = sorted(p['dia_klasser'])
        ut[key] = p
    return ut


class Produkt:
    def __init__(self, p):
        self.key = p['key']; self.namn = p['namn']; self.grupp = p['grupp'].capitalize()
        self.dia_min = int(p['dia_min_top']); self.dia_max = int(p['dia_max'])
        self.dia_max_butt = int(p['dia_max_butt']); self.langd_max = int(p['langd_max'])
        self.langd_klasser = p['langd_klasser']; self.dia_klasser = p['dia_klasser']
        self.pris = {}; self.manuella = 0
        for c in p['matris']:
            if not c['pris'] or c['pris'] <= 0:
                continue
            if c['bc'] != 'No limit':
                self.manuella += 1
                continue
            self.pris[(c['l'], c['d'])] = c['pris']

    def diaklass(self, dtop):
        k = None
        for d in self.dia_klasser:
            if d <= dtop:
                k = d
        return k


def ar_massa(p):
    return p['grupp'].lower() == 'massa' and 'hemved' not in p['namn'].lower()


def main():
    if len(sys.argv) < 2:
        print('python simulera_rotkap.py <objekt_id>'); return 2
    OBJ = sys.argv[1]
    if not M.init_supabase():
        print('FEL: ingen anslutning'); return 1
    namn_rad = hamta('dim_objekt', 'objekt_id=eq.%s' % OBJ, 'object_name', 'objekt_id.asc')
    objnamn = namn_rad[0]['object_name'] if namn_rad else OBJ
    print('=' * 72); print('OBJEKT %s  %s' % (OBJ, objnamn)); print('=' * 72)

    stockar = hamta('detalj_stock', 'objekt_id=eq.%s&stem_key=not.is.null&log_key=not.is.null' % OBJ,
                    'maskin_id,stem_key,log_key,langd_cm,toppdia_ob_mm,toppdia_ub_mm,volym_m3sub,sortiment_id',
                    'stem_key.asc,log_key.asc')
    maskiner = sorted({s['maskin_id'] for s in stockar})
    if len(maskiner) != 1:
        print('STOPP: %d maskiner (%s) — kör per maskin.' % (len(maskiner), maskiner)); return 1
    MASKIN = maskiner[0]

    par = [(s['toppdia_ob_mm'], s['toppdia_ub_mm']) for s in stockar
           if s['toppdia_ob_mm'] and s['toppdia_ub_mm'] and s['toppdia_ob_mm'] > 0]
    n = len(par); mx = sum(p[0] for p in par) / n; my = sum(p[1] for p in par) / n
    sxx = sum((p[0] - mx) ** 2 for p in par); sxy = sum((p[0] - mx) * (p[1] - my) for p in par)
    BARK_B = sxy / sxx; BARK_A = my - BARK_B * mx
    r2 = (sxy * sxy) / (sxx * sum((p[1] - my) ** 2 for p in par))
    print('bark: dub = %.3f + %.5f*dob   (n %d, R² %.5f)' % (BARK_A, BARK_B, n, r2))

    hpr = hitta_hpr(OBJ, MASKIN, objnamn)
    prod_raw = las_prismatris(hpr)
    print('prismatris ur %s' % os.path.basename(hpr)[:60])
    fonster = {f['sortiment_id'].split('_')[-1]: f for f in hamta(
        'dim_objekt_sortiment_fonster', 'objekt_id=eq.%s' % OBJ,
        'sortiment_id,langd_min_cm,langd_max_cm,dia_min_top_mm,dia_max_mm', 'sortiment_id.asc')}
    produkter = {}
    for k, v in prod_raw.items():
        if v['grupp'].lower() in ('timmer', 'kubb') or ar_massa(v):
            produkter[k] = Produkt(v)
            f = fonster.get(k); P = produkter[k]
            ok = (f and f['langd_min_cm'] == P.langd_klasser[0] and f['langd_max_cm'] == P.langd_max
                  and f['dia_min_top_mm'] == P.dia_min and f['dia_max_mm'] == P.dia_max)
            print('  %-24s %-6s L %d-%d  D %d-%d  auto %2d  manuella %2d  fönster: %s'
                  % (v['namn'][:24], P.grupp[:6], P.langd_klasser[0], P.langd_max, P.dia_min, P.dia_max,
                     len(P.pris), P.manuella, 'STÄMMER' if ok else ('SAKNAS' if not f else 'AVVIKER')))
    grupp_av_key = {k: v['grupp'].capitalize() for k, v in prod_raw.items()}
    namn_av_key = {k: v['namn'] for k, v in prod_raw.items()}

    serier = {s['stam_key']: s for s in hamta(
        'detalj_stam_diameter', 'objekt_id=eq.%s&maskin_id=eq.%s' % (OBJ, MASKIN),
        'stam_key,diametrar,steg_cm,forsta_position_cm,slut_hojd_cm', 'stam_key.asc')}

    per_stam = collections.defaultdict(list)
    for s in stockar:
        s['key'] = s['sortiment_id'].split('_')[-1]
        s['grupp'] = grupp_av_key.get(s['key'], '?'); s['namn'] = namn_av_key.get(s['key'], '?')
        per_stam[s['stem_key']].append(s)

    # ── Population och grupper ─────────────────────────────────────────────
    def ar_massabit(lg):
        return lg['grupp'] == 'Massa' and 'hemved' not in lg['namn'].lower()

    g1, g2, utan_sag, utan_kurva = [], [], [], 0
    for sk, logs in per_stam.items():
        logs.sort(key=lambda x: x['log_key'])
        kedja = []
        for lg in logs:
            if ar_massabit(lg):
                kedja.append(lg['langd_cm'])
            else:
                break
        if not kedja or not any(300 <= c <= 314 for c in kedja):
            continue
        if len(kedja) == len(logs):           # ingen sågbar stock alls
            utan_sag.append(sk); continue
        if sk not in serier:
            utan_kurva += 1; continue
        (g1 if len(kedja) == 1 else g2).append((sk, kedja))
    print('population %d: grupp 1 (en bit) %d, grupp 2 (flera) %d, utan sågstock %d, utan kurva %d'
          % (len(g1) + len(g2) + len(utan_sag) + utan_kurva, len(g1), len(g2), len(utan_sag), utan_kurva))
    print('  grupp 2 kedjor: %s' % dict(collections.Counter(len(k) for _, k in g2)))

    # ── Kurvor + validering ────────────────────────────────────────────────
    dia_fel = []; vol_fel = []; utanfor = 0; n_val = 0; kurvor = {}
    for sk, _ in g1 + g2:
        ser = serier[sk]; steg = ser['steg_cm']; f0 = ser['forsta_position_cm'] or 0
        dob = ser['diametrar']; END_grid = f0 + (len(dob) - 1) * steg
        END = max(END_grid, int(ser.get('slut_hojd_cm') or 0))
        lut = (dob[-1] - dob[-2]) / steg if len(dob) > 1 else 0.0
        dub = [0.0] * (END + 1)
        for x in range(END + 1):
            if x >= END_grid:
                d_ob = dob[-1] + lut * (x - END_grid)
            else:
                i = (x - f0) // steg; t = ((x - f0) - i * steg) / steg if steg else 0
                d_ob = dob[i] + (dob[i + 1] - dob[i]) * t
            dub[x] = max(0.0, BARK_A + BARK_B * d_ob)
        V = [0.0] * (END + 2)
        for x in range(END + 1):
            V[x + 1] = V[x] + math.pi / 4 * (dub[x] / 1000.0) ** 2 * 0.01
        kurvor[sk] = (dub, V, END)
        pos = 0
        for lg in per_stam[sk]:
            topp = pos + lg['langd_cm']
            if topp > END:
                utanfor += 1; pos = topp; continue
            n_val += 1
            if lg['toppdia_ub_mm']:
                dia_fel.append(dub[topp] - lg['toppdia_ub_mm'])
            if lg['volym_m3sub']:
                vol_fel.append(100 * ((V[topp] - V[pos]) / float(lg['volym_m3sub']) - 1.0))
            pos = topp

    def kvant(v):
        v = sorted(v); k = len(v)
        return {'n': k, 'median': v[k // 2], 'p10': v[k // 10], 'p90': v[9 * k // 10]} if v else {}
    vd = kvant(dia_fel); vv = kvant(vol_fel)
    print('VALIDERING mot %d stockar: toppdia median %+.2f (p10 %+.2f, p90 %+.2f) mm   volym median %+.2f (p10 %+.2f, p90 %+.2f) %%   utanför kurva %d'
          % (n_val, vd['median'], vd['p10'], vd['p90'], vv['median'], vv['p10'], vv['p90'], utanfor))

    # ── Apteraren ─────────────────────────────────────────────────────────
    def aptera(dub, V, END, R):
        best = [0.0] * (END + 2); val = [None] * (END + 2)
        for x in range(END, R - 1, -1):
            b = 0.0; c = None
            for p in produkter.values():
                if dub[x] > p.dia_max_butt:
                    continue
                for Lc in p.langd_klasser:
                    y = x + Lc
                    if y > END:
                        break
                    dt = dub[y]
                    if dt < p.dia_min or dt > p.dia_max:
                        continue
                    pris = p.pris.get((Lc, p.diaklass(dt)))
                    if pris is None:
                        continue
                    v = (V[y] - V[x]) * pris + best[y]
                    if v > b:
                        b = v; c = (p.grupp, y)
            best[x] = b; val[x] = c
        ut = collections.Counter(); x = R
        while val[x]:
            g, y = val[x]; ut[g] += V[y] - V[x]; x = y
        ut['rest'] = V[END] - V[x]
        return ut

    def scenario(stammar, start_av):
        """start_av(sk, kedja) -> massastart (cm) eller None att hoppa."""
        tot = collections.Counter(); n_med = 0
        for sk, kedja in stammar:
            dub, V, END = kurvor[sk]
            S = start_av(sk, kedja)
            if S is None or S > END:
                continue
            n_med += 1
            tot['Massa'] += V[S] - V[0]
            tot.update(aptera(dub, V, END, S))
        tot['n'] = n_med
        return tot

    NYCK = ('Timmer', 'Kubb', 'Massa', 'rest')

    def diff(a, b):
        return collections.Counter({k: b[k] - a[k] for k in NYCK})

    def rad(namn, c):
        return '  %-34s timmer %+7.2f  kubb %+7.2f  massa %+7.2f  rest %+6.2f' % (
            namn, c['Timmer'], c['Kubb'], c['Massa'], c.get('rest', 0))

    # Grupp 1: sågstocken börjar direkt över roten.
    A1 = scenario(g1, lambda sk, k: k[0])
    B1 = scenario(g1, lambda sk, k: k[0] + SKIFT)
    D1 = diff(A1, B1)

    # Grupp 2: sågstocken börjar där kedjan slutar.
    A2 = scenario(g2, lambda sk, k: sum(k))
    # B, kedjeslut fast (40 cm flyttas inom massaveden) — kräver slack.
    slack_ok = [(sk, k) for sk, k in g2 if sum(max(0, c - MASSA_MIN) for c in k[1:]) >= SKIFT]
    slack_nej = [(sk, k) for sk, k in g2 if (sk, k) not in slack_ok]
    B2_fast = scenario(g2, lambda sk, k: sum(k))
    D2_fast = diff(A2, B2_fast)
    # B, kedjan skjuts 40 cm (ingen slack).
    B2_skjut = scenario(g2, lambda sk, k: sum(k) + SKIFT)
    D2_skjut = diff(A2, B2_skjut)
    # B, verkligt: fast där slack finns, skjuten där den saknas.
    ok_set = {sk for sk, _ in slack_ok}
    B2_verk = scenario(g2, lambda sk, k: sum(k) if sk in ok_set else sum(k) + SKIFT)
    D2_verk = diff(A2, B2_verk)
    # Scenario C: hela kedjan blir ETT kap på 340.
    C2 = scenario(g2, lambda sk, k: 340)
    DC = diff(A2, C2)

    print('\nGRUPP 1 — en massabit, %d stammar' % A1['n'])
    print(rad('A', A1)); print(rad('B rot +40', B1)); print(rad('B - A', D1))
    print('\nGRUPP 2 — flera massabitar, %d stammar   (slack >= 40 cm i senare bitar: %d, saknas: %d)'
          % (A2['n'], len(slack_ok), len(slack_nej)))
    print(rad('A (sågstock vid kedjeslut)', A2))
    print(rad('B - A, kedjeslut fast', D2_fast) + '   <- verifiering: ska vara noll')
    print(rad('B - A, kedjan skjuts 40', D2_skjut) + '   <- utan slack')
    print(rad('B - A, verkligt (slack avgör)', D2_verk))
    print(rad('C - A, hela kedjan = ett 3,4 m-kap', DC) + '   <- tak: gäller OM rötan slutade inom 3,4 m')
    tot = collections.Counter({k: D1[k] + D2_verk[k] for k in NYCK})
    print('\nTOTALT B - A (grupp 1 + grupp 2 verkligt), %d stammar' % (A1['n'] + A2['n']))
    print(rad('B - A', tot))

    io.open(os.path.join(SCRATCH, 'sim_%s.json' % OBJ), 'w', encoding='utf-8').write(json.dumps({
        'objekt_id': OBJ, 'namn': objnamn, 'maskin': MASKIN, 'stammar': len(per_stam),
        'population': len(g1) + len(g2) + len(utan_sag) + utan_kurva,
        'g1': A1['n'], 'g2': A2['n'], 'utan_sag': len(utan_sag), 'utan_kurva': utan_kurva,
        'g2_kedjor': dict(collections.Counter(len(k) for _, k in g2)),
        'slack_ok': len(slack_ok), 'slack_nej': len(slack_nej),
        'bark': {'a': BARK_A, 'b': BARK_B, 'n': n, 'r2': r2},
        'validering': {'dia': vd, 'vol': vv, 'utanfor': utanfor},
        'A1': dict(A1), 'B1': dict(B1), 'D1': dict(D1),
        'A2': dict(A2), 'D2_fast': dict(D2_fast), 'D2_skjut': dict(D2_skjut), 'D2_verk': dict(D2_verk),
        'C2': dict(C2), 'DC': dict(DC), 'tot': dict(tot),
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
