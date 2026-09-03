"""Simulering: vad hade hänt om rotbiten kapats 3,4 m i stället för 3,0?

ETT objekt: Åbogen RP 2026. Skriver ingenting — läser och rapporterar.

För varje stam vars första stock är massaved på 300–314 cm:
  1. läs avsmalningskurvan (över bark, 10 cm-steg)
  2. dra av bark med maskinens egen barkfunktion (skattad ur 4 406 par
     toppdia ob/ub i detalj_stock: dub = -3,007 + 0,957·dob, R² 0,9998)
  3. kapa rotbiten på 3,0 respektive 3,4
  4. aptera resten värdeoptimalt mot maskinens prismatris ur HPR-filen
     (ProductMatrixItem) med fönstren ur dim_objekt_sortiment_fonster,
     BARA celler med BuckingCriteria = "No limit" — en automatisk apterare
     får inte välja manuella celler
  5. jämför timmer / kubb / massaved

Innan något simuleras valideras maskineriet mot maskinens egna stockar:
positionen på stammen, barkavdraget och volymen. Är de fel är resten
värdelös.

detalj_stam_diameter är oläsbar för authenticated — körs via service-rollen.
"""
import os, sys, io, json, math, collections, importlib.util
import requests

HAR = os.path.dirname(os.path.abspath(__file__))
OBJ = '11217413'
MASKIN = 'PONS20SDJAA270231'
BARK_A, BARK_B = -3.007, 0.95737          # dub = A + B*dob, ur detalj_stock
PRISMATRIS = os.path.join(
    os.environ['USERPROFILE'], 'AppData', 'Local', 'Temp', 'claude',
    'C--Kompersm-la-Skog-Kompersm-la-Skog-Appen-skogsystem-claude',
    'f31f7433-7467-4d14-9193-e8156481536d', 'scratchpad', 'prismatris_abogen.json')


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


class Produkt:
    def __init__(self, p):
        self.key = p['key']; self.namn = p['namn']; self.grupp = p['grupp']
        self.dia_min = int(p['dia_min_top']); self.dia_max = int(p['dia_max'])
        self.dia_max_butt = int(p['dia_max_butt']); self.langd_max = int(p['langd_max'])
        self.langd_klasser = sorted(p['langd_klasser'])
        self.dia_klasser = sorted(p['dia_klasser'])
        # (langdklass, diaklass) -> pris, BARA automatiskt tillåtna celler
        self.pris = {}
        self.manuella = 0
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


def main():
    if not M.init_supabase():
        print('FEL: ingen anslutning')
        return 1
    prod_raw = json.load(io.open(PRISMATRIS, encoding='utf-8'))
    # De tre frågan gäller. Hemved går till markägaren, energi är manuellt/lågt.
    produkter = {k: Produkt(v) for k, v in prod_raw.items()
                 if v['grupp'] in ('Timmer', 'Kubb') or v['namn'] == 'BmavFall_V3'}
    for p in produkter.values():
        print('produkt %-22s %-6s celler auto %2d  manuella/förbjudna %2d'
              % (p.namn, p.grupp, len(p.pris), p.manuella))
    grupp_av_key = {k: v['grupp'] for k, v in prod_raw.items()}

    filt = 'objekt_id=eq.%s&maskin_id=eq.%s' % (OBJ, MASKIN)
    stockar = hamta('detalj_stock', filt + '&stem_key=not.is.null&log_key=not.is.null',
                    'stem_key,log_key,langd_cm,toppdia_ob_mm,toppdia_ub_mm,volym_m3sub,sortiment_id',
                    'stem_key.asc,log_key.asc')
    serier = {s['stam_key']: s for s in hamta(
        'detalj_stam_diameter', filt,
        'stam_key,diametrar,antal_punkter,steg_cm,forsta_position_cm,slut_hojd_cm', 'stam_key.asc')}
    print('stockar %d   kurvor %d' % (len(stockar), len(serier)))

    per_stam = collections.defaultdict(list)
    for s in stockar:
        s['key'] = s['sortiment_id'].split('_')[-1]
        s['grupp'] = grupp_av_key.get(s['key'], '?')
        s['namn'] = prod_raw.get(s['key'], {}).get('namn', '?')
        per_stam[s['stem_key']].append(s)

    # Urval: FÖRSTA stocken är massaved (ej hemved) på 300-314.
    urval = []
    for sk, logs in per_stam.items():
        logs.sort(key=lambda x: x['log_key'])
        r = logs[0]
        if (r['log_key'] == 1 and r['namn'] == 'BmavFall_V3'
                and 300 <= r['langd_cm'] <= 314 and sk in serier):
            urval.append(sk)
    print('stammar i urvalet: %d' % len(urval))

    # ── Validering mot maskinens egna stockar ──────────────────────────────
    dia_fel = []; vol_fel = []; utanfor = 0; n_val = 0
    kurvor = {}
    for sk in urval:
        ser = serier[sk]
        steg = ser['steg_cm']; f0 = ser['forsta_position_cm'] or 0
        dob = ser['diametrar']
        END_grid = f0 + (len(dob) - 1) * steg
        # Kurvan slutar exakt vid sista kapet (DiameterMeasuredEndHeight), men
        # gridpunkterna ligger var 10:e cm — sista 1-9 cm faller mellan. De
        # extrapoleras med sista segmentets lutning så stammens slut är exakt.
        END = max(END_grid, int(ser.get('slut_hojd_cm') or 0))
        lut = (dob[-1] - dob[-2]) / steg if len(dob) > 1 else 0.0
        # 1 cm-upplösning under bark, plus prefixvolym (m3) per cm
        dub = [0.0] * (END + 1)
        for x in range(END + 1):
            if x >= END_grid:
                d_ob = dob[-1] + lut * (x - END_grid)
            else:
                i = (x - f0) // steg
                t = ((x - f0) - i * steg) / steg if steg else 0
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
                utanfor += 1
                pos = topp
                continue
            n_val += 1
            if lg['toppdia_ub_mm']:
                dia_fel.append(dub[topp] - lg['toppdia_ub_mm'])
            if lg['volym_m3sub']:
                vol_fel.append((V[topp] - V[pos]) / float(lg['volym_m3sub']) - 1.0)
            pos = topp

    def stat(v):
        v = sorted(v); n = len(v)
        if not v:
            return 'inga'
        return 'n %d  medel %+.2f  median %+.2f  p10 %+.2f  p90 %+.2f' % (
            n, sum(v) / n, v[n // 2], v[n // 10], v[9 * n // 10])
    print('\nVALIDERING (maskinens stockar mot kurva+bark+integration)')
    print('  toppdiameter ub, mm:  %s' % stat(dia_fel))
    print('  volym m3sub, procent: %s' % stat([100 * x for x in vol_fel]))
    print('  stockar bortom kurvans slut: %d av %d' % (utanfor, n_val + utanfor))

    # ── Apteraren ─────────────────────────────────────────────────────────
    def aptera(dub, V, END, R):
        """Värdeoptimal DP från R till END. Bara automatiska celler."""
        best = [0.0] * (END + 2)
        val = [None] * (END + 2)
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
                    dk = p.diaklass(dt)
                    pris = p.pris.get((Lc, dk))
                    if pris is None:
                        continue
                    v = (V[y] - V[x]) * pris + best[y]
                    if v > b:
                        b = v; c = (p.grupp, Lc, y)
            best[x] = b; val[x] = c
        ut = collections.Counter(); st = collections.Counter()
        x = R
        while val[x]:
            g, L, y = val[x]
            ut[g] += V[y] - V[x]; st[g] += 1
            x = y
        ut['rest'] = V[END] - V[x]
        return ut, st, best[R]

    def kor(skift, fast=None):
        """skift: cm att lägga på rotbiten. fast: absolut rotlängd (300/340)."""
        tot = collections.Counter(); st = collections.Counter(); varde = 0.0
        for sk in urval:
            dub, V, END = kurvor[sk]
            rot = fast if fast else per_stam[sk][0]['langd_cm'] + skift
            if rot > END:
                continue
            tot['Massa'] += V[rot] - V[0]; st['Massa'] += 1           # rotbiten
            ut, s2, v = aptera(dub, V, END, rot)
            tot.update(ut); st.update(s2); varde += v
        return tot, st, varde

    # Faktiskt utfall på samma stammar (ur detalj_stock), för jämförelse med A.
    fakt = collections.Counter(); fakt_st = collections.Counter()
    for sk in urval:
        for lg in per_stam[sk]:
            fakt[lg['grupp']] += float(lg['volym_m3sub'] or 0); fakt_st[lg['grupp']] += 1

    A, A_st, A_v = kor(0)
    B, B_st, B_v = kor(40)
    A3, _, _ = kor(0, fast=300)
    B3, _, _ = kor(0, fast=340)

    def rad(namn, c, st=None):
        extra = ''
        if st:
            extra = '   (st T/K/M %d/%d/%d)' % (st['Timmer'], st['Kubb'], st['Massa'])
        return '  %-26s timmer %6.2f  kubb %6.2f  massa %6.2f  rest %5.2f%s' % (
            namn, c['Timmer'], c['Kubb'], c['Massa'], c.get('rest', 0), extra)

    def diff(x, y):
        return collections.Counter({k: y[k] - x[k] for k in ('Timmer', 'Kubb', 'Massa', 'rest')})

    print('\nUTFALL, m3sub, %d stammar' % len(urval))
    print(rad('faktiskt (detalj_stock)', fakt, fakt_st))
    print(rad('A: rot som kapad, DP rest', A, A_st))
    print(rad('B: rot +40 cm, DP rest', B, B_st))
    print(rad('B - A', diff(A, B)))
    print(rad('A fast 300', A3))
    print(rad('B fast 340', B3))
    print(rad('B340 - A300', diff(A3, B3)))
    print('\nvärde A %.0f kr   B %.0f kr   diff %+.0f kr' % (A_v, B_v, B_v - A_v))

    # ── Konisk kontrollmodell: INGEN omaptering ────────────────────────────
    # Stocken direkt över roten tar hela förskjutningen. Är den timmer förlorar
    # den 40 cm av sin ROTÄNDA (det grövsta virket på stammen) till massaved.
    # Är den kubb dör den helt: 305 - 40 ryms inte i 305-325. Det är vad en
    # uppskattning utan apterare gör, och det den värdeoptimala apteraren ovan
    # slipper — den flyttar snitten och räddar det mesta av kubben.
    kon = collections.Counter(); kon_st = collections.Counter()
    forsta_typ = collections.Counter()
    for sk in urval:
        logs = per_stam[sk]
        if len(logs) < 2:
            continue
        dub, V, END = kurvor[sk]
        R = logs[0]['langd_cm']
        nasta = logs[1]
        forsta_typ[nasta['grupp']] += 1
        if nasta['grupp'] == 'Timmer':
            if nasta['langd_cm'] - 40 >= 372:
                kon['Timmer'] -= V[R + 40] - V[R]; kon_st['Timmer'] += 1
            else:
                kon['Timmer'] -= float(nasta['volym_m3sub'] or 0); kon_st['Timmer hel'] += 1
        elif nasta['grupp'] == 'Kubb':
            kon['Kubb'] -= float(nasta['volym_m3sub'] or 0); kon_st['Kubb'] += 1
    print('\nKONISK KONTROLL (första stocken över roten tar 40 cm, ingen omaptering)')
    print('  stocken över roten är: %s' % dict(forsta_typ))
    print('  timmer %+.2f  (%d rotändor à 40 cm%s)   kubb %+.2f  (%d hela kubbar)'
          % (kon['Timmer'], kon_st['Timmer'],
             (', %d hela' % kon_st['Timmer hel']) if kon_st['Timmer hel'] else '',
             kon['Kubb'], kon_st['Kubb']))
    print('\nFACIT (konisk uppskattning): timmer -2,72   kubb -3,0')
    return 0


if __name__ == '__main__':
    sys.exit(main())
