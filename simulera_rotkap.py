"""Simulering: vad hade hänt om rotbiten kapats 3,4 m i stället för 3,0?

    python simulera_rotkap.py <objekt_id>

Skriver ingenting — läser och rapporterar. Allt objektet behöver kommer ur
objektets egna data, inte ur något annat objekt:

  barkfunktion   skattad ur objektets egna toppdia ob/ub-par i detalj_stock
  prismatris     ProductMatrixItem ur objektets egen HPR-fil
  fönster        dim_objekt_sortiment_fonster, korskontrollerat mot HPR
  kurvor         detalj_stam_diameter (service-rollen; oläsbar för authenticated)

För varje stam vars första stock är massaved på 300–314 cm:
  1. läs avsmalningskurvan (över bark, 10 cm-steg)
  2. dra av bark
  3. kapa rotbiten som den kapades (A) respektive +40 cm (B)
  4. aptera resten värdeoptimalt mot prismatrisen — BARA celler med
     BuckingCriteria = "No limit"; en automatisk apterare får inte välja
     manuella celler
  5. jämför timmer / kubb / massaved

Innan något simuleras valideras maskineriet mot maskinens egna stockar:
positionen på stammen, barkavdraget och volymen. Är de fel är resten
värdelös, så de skrivs ut först.

Resultatet sparas som JSON i scratchpad för sammanställning över objekt.
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


# ── Prismatrisen ur objektets egen HPR-fil ────────────────────────────────
def hitta_hpr(objekt_id, maskin_id, objnamn):
    """Största HPR-filen för objektet, identifierad på ObjectKey ur huvudet.

    Först importens huvudcache. Saknas den, eller saknar den objektet, letas
    kandidater upp på filnamn och VERIFIERAS mot ObjectDefinition i huvudet —
    filnamnet är maskinens, inte objektets, så det får bara peka, aldrig
    avgöra. Samma läsare som diameterimporten använder.
    """
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
        bn = os.path.basename(f).lower()
        if not any(w in bn for w in ord_):
            continue
        mask, karta, fel = D.huvud(f)
        if not fel and mask == maskin_id and objekt_id in karta.values():
            kand.append(f)
    if not kand:
        raise SystemExit('ingen HPR-fil för %s (%s) — varken i cache eller på disk' % (objekt_id, objnamn))
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
        print('STOPP: %d maskiner på objektet (%s) — nyckeln är (objekt, maskin), kör per maskin.'
              % (len(maskiner), maskiner)); return 1
    MASKIN = maskiner[0]

    # ── Bark ur objektets egna par ─────────────────────────────────────────
    par = [(s['toppdia_ob_mm'], s['toppdia_ub_mm']) for s in stockar
           if s['toppdia_ob_mm'] and s['toppdia_ub_mm'] and s['toppdia_ob_mm'] > 0]
    n = len(par); mx = sum(p[0] for p in par) / n; my = sum(p[1] for p in par) / n
    sxx = sum((p[0] - mx) ** 2 for p in par); sxy = sum((p[0] - mx) * (p[1] - my) for p in par)
    BARK_B = sxy / sxx; BARK_A = my - BARK_B * mx
    syy = sum((p[1] - my) ** 2 for p in par)
    r2 = (sxy * sxy) / (sxx * syy)
    print('bark: dub = %.3f + %.5f*dob   (n %d, R² %.5f, snitt %.1f mm)'
          % (BARK_A, BARK_B, n, r2, sum(p[0] - p[1] for p in par) / n))

    # ── Prismatris + fönster ───────────────────────────────────────────────
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
            f = fonster.get(k)
            ok = (f and f['langd_min_cm'] == produkter[k].langd_klasser[0]
                  and f['langd_max_cm'] == produkter[k].langd_max
                  and f['dia_min_top_mm'] == produkter[k].dia_min and f['dia_max_mm'] == produkter[k].dia_max)
            print('  %-24s %-6s L %d-%d  D %d-%d  celler auto %2d  manuella %2d   fönster i DB: %s'
                  % (v['namn'][:24], v['grupp'][:6], produkter[k].langd_klasser[0], produkter[k].langd_max,
                     produkter[k].dia_min, produkter[k].dia_max, len(produkter[k].pris),
                     produkter[k].manuella, 'STÄMMER' if ok else ('SAKNAS' if not f else 'AVVIKER')))
    grupp_av_key = {k: v['grupp'] for k, v in prod_raw.items()}
    namn_av_key = {k: v['namn'] for k, v in prod_raw.items()}

    serier = {s['stam_key']: s for s in hamta(
        'detalj_stam_diameter', 'objekt_id=eq.%s&maskin_id=eq.%s' % (OBJ, MASKIN),
        'stam_key,diametrar,steg_cm,forsta_position_cm,slut_hojd_cm', 'stam_key.asc')}

    per_stam = collections.defaultdict(list)
    for s in stockar:
        s['key'] = s['sortiment_id'].split('_')[-1]
        s['grupp'] = grupp_av_key.get(s['key'], '?').capitalize(); s['namn'] = namn_av_key.get(s['key'], '?')
        per_stam[s['stem_key']].append(s)

    urval = []; utan_kurva = 0
    for sk, logs in per_stam.items():
        logs.sort(key=lambda x: x['log_key'])
        r = logs[0]
        if (r['log_key'] == 1 and r['grupp'].lower() == 'massa' and 'hemved' not in r['namn'].lower()
                and 300 <= r['langd_cm'] <= 314):
            if sk in serier:
                urval.append(sk)
            else:
                utan_kurva += 1
    print('stammar %d   rotbit log1 300-314: %d   varav utan kurva: %d   räknas: %d'
          % (len(per_stam), len(urval) + utan_kurva, utan_kurva, len(urval)))

    # ── Validering ─────────────────────────────────────────────────────────
    dia_fel = []; vol_fel = []; utanfor = 0; n_val = 0
    kurvor = {}
    for sk in urval:
        ser = serier[sk]; steg = ser['steg_cm']; f0 = ser['forsta_position_cm'] or 0
        dob = ser['diametrar']
        END_grid = f0 + (len(dob) - 1) * steg
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
        return {'n': k, 'medel': sum(v) / k, 'median': v[k // 2], 'p10': v[k // 10], 'p90': v[9 * k // 10]} if v else {}
    vd = kvant(dia_fel); vv = kvant(vol_fel)
    print('\nVALIDERING mot maskinens %d stockar' % n_val)
    print('  toppdiameter ub, mm:  median %+.2f  p10 %+.2f  p90 %+.2f' % (vd['median'], vd['p10'], vd['p90']))
    print('  volym m3sub, procent: median %+.2f  p10 %+.2f  p90 %+.2f' % (vv['median'], vv['p10'], vv['p90']))
    print('  stockar bortom kurvans slut: %d' % utanfor)

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
        ut = collections.Counter(); st = collections.Counter(); x = R
        while val[x]:
            g, y = val[x]; ut[g] += V[y] - V[x]; st[g] += 1; x = y
        ut['rest'] = V[END] - V[x]
        return ut, st, best[R]

    def kor(skift):
        tot = collections.Counter(); st = collections.Counter(); varde = 0.0
        for sk in urval:
            dub, V, END = kurvor[sk]
            rot = per_stam[sk][0]['langd_cm'] + skift
            if rot > END:
                continue
            tot['Massa'] += V[rot] - V[0]; st['Massa'] += 1
            ut, s2, v = aptera(dub, V, END, rot)
            tot.update(ut); st.update(s2); varde += v
        return tot, st, varde

    fakt = collections.Counter(); fakt_st = collections.Counter()
    for sk in urval:
        for lg in per_stam[sk]:
            fakt[lg['grupp']] += float(lg['volym_m3sub'] or 0); fakt_st[lg['grupp']] += 1
    A, A_st, A_v = kor(0); B, B_st, B_v = kor(40)

    def rad(namn, c, st=None):
        extra = '   (st T/K/M %d/%d/%d)' % (st['Timmer'], st['Kubb'], st['Massa']) if st else ''
        return '  %-26s timmer %6.2f  kubb %6.2f  massa %6.2f  rest %5.2f%s' % (
            namn, c['Timmer'], c['Kubb'], c['Massa'], c.get('rest', 0), extra)
    D = collections.Counter({k: B[k] - A[k] for k in ('Timmer', 'Kubb', 'Massa', 'rest')})
    print('\nUTFALL, m3sub, %d stammar' % len(urval))
    print(rad('faktiskt (detalj_stock)', fakt, fakt_st))
    print(rad('A: rot som kapad, DP rest', A, A_st))
    print(rad('B: rot +40 cm, DP rest', B, B_st))
    print(rad('B - A', D))

    # Konisk kontroll: första stocken över roten tar 40 cm, ingen omaptering.
    kon = collections.Counter(); forsta = collections.Counter()
    for sk in urval:
        logs = per_stam[sk]
        if len(logs) < 2:
            continue
        dub, V, END = kurvor[sk]; R = logs[0]['langd_cm']; nx = logs[1]
        forsta[nx['grupp']] += 1
        if nx['grupp'] == 'Timmer':
            kon['Timmer'] -= (V[R + 40] - V[R]) if nx['langd_cm'] - 40 >= 372 else float(nx['volym_m3sub'] or 0)
        elif nx['grupp'] == 'Kubb':
            kon['Kubb'] -= float(nx['volym_m3sub'] or 0)
    print('konisk kontroll (ingen omaptering): timmer %+.2f  kubb %+.2f   stocken över roten: %s'
          % (kon['Timmer'], kon['Kubb'], dict(forsta)))

    io.open(os.path.join(SCRATCH, 'sim_%s.json' % OBJ), 'w', encoding='utf-8').write(json.dumps({
        'objekt_id': OBJ, 'namn': objnamn, 'maskin': MASKIN, 'stammar': len(per_stam),
        'rotbitar': len(urval) + utan_kurva, 'utan_kurva': utan_kurva, 'raknade': len(urval),
        'bark': {'a': BARK_A, 'b': BARK_B, 'n': n, 'r2': r2},
        'validering': {'dia': vd, 'vol': vv, 'utanfor': utanfor},
        'fakt': dict(fakt), 'A': dict(A), 'B': dict(B), 'diff': dict(D),
        'A_st': dict(A_st), 'B_st': dict(B_st), 'konisk': dict(kon), 'forsta_over_rot': dict(forsta),
        'varde_A': A_v, 'varde_B': B_v,
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
