"""Förberäkning av rotkapssimuleringen: en rad per (objekt, kaplängd) i sim_rotkap.

    python berakna_rotkap.py               inkrementellt: objekt vars stockar
                                           eller serier ändrats sedan sist
    python berakna_rotkap.py --alla        räkna om allt
    python berakna_rotkap.py <objekt_id>   ett objekt, oavsett

Körs EFTER import, aldrig live. Skärmen /rotkap läser bara sim_rotkap.
Kurvorna ligger i detalj_stam_diameter, som är stängd för authenticated —
det här skriptet går som service-rollen och tar minuter per full körning.

Vad som räknas, för varje objekt som har en diameterserie:

  Population   stammar vars första stock är massaved på 300–314 cm — rotbiten
               föraren kapade. Stammar utan sågbar stock alls räknas men
               simuleras inte (inget timmer att förlora). Stammar utan kurva
               likaså.
  Grupp 1      EN massabit före sågstocken. Kaplängden k ger rotbit
               kedja[0] + (k − 300): 40 cm av det grövsta virket blir massa.
  Grupp 2      FLERA massabitar i rad — rötan gick längre. Sågstocken börjar
               där kedjan slutar. Förlängningen ryms i senare bitars slack
               ner till 300 cm; det som inte ryms skjuter kedjan uppåt.
  Fem rader    300 (som kördes), 320, 340, 360, 380. Volymerna är absoluta;
               skärmen räknar rad(k) − rad(300).

Varje maskin på objektet räknas för sig — egen barkfunktion ur dess ob/ub-
par, egen prismatris ur filen serien kom ur — och summeras per objekt.

Innan något simuleras valideras kurvan mot maskinens egna stockar:
toppdiameter och volym. Talen sparas på raden så skärmen kan visa dem.

Skrivningen verifieras på innehåll: raden för 340 läses tillbaka och jämförs.
"""
import os, sys, io, json, math, time, collections, importlib.util, datetime
import requests

HAR = os.path.dirname(os.path.abspath(__file__))
KAPLANGDER = (300, 320, 340, 360, 380)
ROT_MIN, ROT_MAX = 300, 314
MASSA_MIN = 300          # manuell 3 m-massa får kapas ner till 300
BARK_MIN_N, BARK_MIN_R2 = 50, 0.95


def ladda(namn, fil):
    spec = importlib.util.spec_from_file_location(namn, os.path.join(HAR, fil))
    m = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(m)
    except SystemExit:
        pass
    return m


S = ladda('simrot', 'simulera_rotkap.py')      # hamta, las_prismatris, Produkt, BAS
M = S.M


def rakna(tabell, filt):
    """Antal rader utan att hämta dem."""
    r = requests.get('%s/rest/v1/%s?select=objekt_id&%s' % (M.SUPABASE_URL, tabell, filt),
                     headers=dict(M.SUPABASE_HEADERS, **{'Prefer': 'count=exact', 'Range': '0-0'}),
                     timeout=60)
    r.raise_for_status()
    return int(r.headers['Content-Range'].split('/')[-1])


def barkfit(stockar):
    par = [(s['toppdia_ob_mm'], s['toppdia_ub_mm']) for s in stockar
           if s['toppdia_ob_mm'] and s['toppdia_ub_mm'] and s['toppdia_ob_mm'] > 0]
    n = len(par)
    if n < BARK_MIN_N:
        return None, n, 0.0
    mx = sum(p[0] for p in par) / n; my = sum(p[1] for p in par) / n
    sxx = sum((p[0] - mx) ** 2 for p in par); syy = sum((p[1] - my) ** 2 for p in par)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in par)
    if sxx <= 0 or syy <= 0:
        return None, n, 0.0
    b = sxy / sxx; a = my - b * mx; r2 = sxy * sxy / (sxx * syy)
    if r2 < BARK_MIN_R2:
        return None, n, r2
    return (a, b), n, r2


def bygg_kurva(ser, bark):
    """dub[x] under bark per cm, V[x] volym från marken, END = kurvans slut."""
    a, b = bark
    dob = ser['diametrar']
    steg = ser['steg_cm'] or 10; f0 = ser['forsta_position_cm'] or 0
    if not dob or len(dob) < 2:
        return None
    END_grid = f0 + (len(dob) - 1) * steg
    END = max(END_grid, int(ser.get('slut_hojd_cm') or 0))
    lut = (dob[-1] - dob[-2]) / steg
    dub = [0.0] * (END + 1)
    for x in range(END + 1):
        if x >= END_grid:
            d = dob[-1] + lut * (x - END_grid)
        elif x < f0:
            d = dob[0]
        else:
            i = (x - f0) // steg; t = ((x - f0) - i * steg) / steg
            d = dob[i] + (dob[i + 1] - dob[i]) * t
        dub[x] = max(0.0, a + b * d)
    V = [0.0] * (END + 2)
    for x in range(END + 1):
        V[x + 1] = V[x] + math.pi / 4 * (dub[x] / 1000.0) ** 2 * 0.01
    return dub, V, END


def aptera(produkter, dub, V, END, R):
    """Värdeoptimal aptering från R till kurvans slut, mot maskinens egen prismatris."""
    best = [0.0] * (END + 2); val = [None] * (END + 2)
    for x in range(END, R - 1, -1):
        b = 0.0; c = None
        for p in produkter:
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
                    b = v; c = (p.hink, y)
        best[x] = b; val[x] = c
    ut = collections.Counter(); x = R
    while val[x]:
        g, y = val[x]; ut[g] += V[y] - V[x]; x = y
    ut['rest'] = V[END] - V[x]
    return ut


def kvant(v):
    v = sorted(v); k = len(v)
    return (v[k // 2], v[k // 10], v[9 * k // 10]) if v else (None, None, None)


def ar_massabit(lg):
    return lg['grupp'] == 'Massa' and 'hemved' not in lg['namn'].lower()


def kor_objekt(objekt_id, par):
    """Returnerar (rader_utan_nycklar, sammanfattning). Ingen skrivning här."""
    stockar = S.hamta('detalj_stock',
                      'objekt_id=eq.%s&stem_key=not.is.null&log_key=not.is.null' % objekt_id,
                      'maskin_id,stem_key,log_key,langd_cm,toppdia_ob_mm,toppdia_ub_mm,volym_m3sub,sortiment_id',
                      'stem_key.asc,log_key.asc')
    fonster = {f['sortiment_id'].split('_')[-1]: f for f in S.hamta(
        'dim_objekt_sortiment_fonster', 'objekt_id=eq.%s' % objekt_id,
        'sortiment_id,langd_min_cm,langd_max_cm,dia_min_top_mm,dia_max_mm', 'sortiment_id.asc')}

    anm = []
    per_k = {k: collections.Counter() for k in KAPLANGDER}
    pop = collections.Counter()
    dia_fel, vol_fel, utanfor, n_val = [], [], 0, 0
    maskiner_med = []
    bark_info = {}

    for p in par:
        mid = p['maskin_id']
        per_stam = collections.defaultdict(list)
        for s in stockar:
            if s['maskin_id'] == mid:
                per_stam[s['stem_key']].append(s)
        pop['stammar_objekt'] += len(per_stam)
        if not per_stam:
            anm.append('%s: inga stockar i detalj_stock' % mid); continue

        fil = os.path.join(S.BAS, mid, 'HPR', p['filnamn'] or '')
        if not p['filnamn'] or not os.path.exists(fil):
            anm.append('%s: filen %s finns inte i Behandlade' % (mid, p['filnamn'])); continue
        bark, n_bark, r2 = barkfit([s for s in stockar if s['maskin_id'] == mid])
        if bark is None:
            anm.append('%s: ingen barkfunktion (n %d, R² %.3f)' % (mid, n_bark, r2)); continue
        bark_info[mid] = {'a': round(bark[0], 3), 'b': round(bark[1], 5), 'n': n_bark, 'r2': round(r2, 5)}

        prod_raw = S.las_prismatris(fil)
        produkter = []; grupp_av_key = {}; namn_av_key = {}
        for key, v in prod_raw.items():
            grupp_av_key[key] = v['grupp'].capitalize(); namn_av_key[key] = v['namn']
            g = v['grupp'].lower()
            if g not in ('timmer', 'kubb', 'klentimmer') and not (g == 'massa' and 'hemved' not in v['namn'].lower()):
                continue
            try:
                P = S.Produkt(v)
            except (TypeError, ValueError):
                anm.append('%s: %s saknar gränser i filen' % (mid, v['namn'])); continue
            P.hink = 'Timmer' if P.grupp in ('Timmer', 'Klentimmer') else P.grupp
            if P.grupp == 'Klentimmer':
                anm.append('%s: klentimmer räknas som timmer' % mid)
            produkter.append(P)
            f = fonster.get(key)
            if f and not (f['langd_min_cm'] == P.langd_klasser[0] and f['langd_max_cm'] == P.langd_max
                          and f['dia_min_top_mm'] == P.dia_min and f['dia_max_mm'] == P.dia_max):
                anm.append('%s: fönstret för %s avviker från filen' % (mid, v['namn']))
        if not any(P.hink in ('Timmer', 'Kubb') for P in produkter):
            anm.append('%s: inget sågbart sortiment i filen' % mid); continue

        serier = {s['stam_key']: s for s in S.hamta(
            'detalj_stam_diameter', 'objekt_id=eq.%s&maskin_id=eq.%s' % (objekt_id, mid),
            'stam_key,diametrar,steg_cm,forsta_position_cm,slut_hojd_cm', 'stam_key.asc')}

        for sk, logs in per_stam.items():
            logs.sort(key=lambda x: x['log_key'])
            for lg in logs:
                key = (lg['sortiment_id'] or '').split('_')[-1]
                lg['grupp'] = grupp_av_key.get(key, '?'); lg['namn'] = namn_av_key.get(key, '?')
            rot = logs[0]
            if rot['log_key'] != 1 or not ar_massabit(rot) or not (ROT_MIN <= rot['langd_cm'] <= ROT_MAX):
                continue
            kedja = []
            for lg in logs:
                if ar_massabit(lg):
                    kedja.append(lg['langd_cm'])
                else:
                    break
            if len(kedja) == len(logs):
                pop['utan_sag'] += 1; continue
            ser = serier.get(sk)
            kurva = bygg_kurva(ser, bark) if ser else None
            if kurva is None:
                pop['utan_kurva'] += 1; continue
            dub, V, END = kurva
            grupp = 1 if len(kedja) == 1 else 2
            slack = sum(max(0, c - MASSA_MIN) for c in kedja[1:])
            # Samma stam i alla fem raderna, eller i ingen — annars kan en rad
            # inte jämföras med sin referens.
            langsta = (kedja[0] if grupp == 1 else sum(kedja)) + (KAPLANGDER[-1] - 300)
            if langsta > END:
                pop['utan_kurva'] += 1; continue

            pos = 0
            for lg in logs:
                topp = pos + lg['langd_cm']
                if topp > END:
                    utanfor += 1; pos = topp; continue
                n_val += 1
                if lg['toppdia_ub_mm']:
                    dia_fel.append(dub[topp] - lg['toppdia_ub_mm'])
                if lg['volym_m3sub']:
                    vol_fel.append(100 * ((V[topp] - V[pos]) / float(lg['volym_m3sub']) - 1.0))
                pos = topp

            pop['g%d' % grupp] += 1
            for k in KAPLANGDER:
                skift = k - 300
                if grupp == 1:
                    start = kedja[0] + skift
                else:
                    start = sum(kedja) + max(0, skift - slack)
                    if skift <= slack:
                        per_k[k]['g2_fast'] += 1
                ut = aptera(produkter, dub, V, END, start)
                ut['Massa'] += V[start] - V[0]
                c = per_k[k]
                for h in ('Timmer', 'Kubb', 'Massa', 'rest'):
                    c[h] += ut[h]
                c['g%d_timmer' % grupp] += ut['Timmer']
        maskiner_med.append(mid)

    dm, d10, d90 = kvant(dia_fel); vm, v10, v90 = kvant(vol_fel)
    validering = None if not n_val else {
        'n': n_val, 'dia_median_mm': round(dm, 2), 'dia_p10': round(d10, 2), 'dia_p90': round(d90, 2),
        'vol_median_pct': round(vm, 2), 'vol_p10': round(v10, 2), 'vol_p90': round(v90, 2),
        'utanfor': utanfor, 'bark': bark_info}
    # Dubbletter i anmärkningarna säger inget mer än en.
    anm = list(dict.fromkeys(anm))
    rader = []
    for k in KAPLANGDER:
        c = per_k[k]
        rader.append({
            'objekt_id': objekt_id, 'kaplangd_cm': k, 'maskiner': maskiner_med,
            'stammar_objekt': pop['stammar_objekt'],
            'stammar': pop['g1'] + pop['g2'], 'grupp1_stammar': pop['g1'], 'grupp2_stammar': pop['g2'],
            'utan_sagstock': pop['utan_sag'], 'utan_kurva': pop['utan_kurva'],
            'timmer_m3': round(c['Timmer'], 3), 'kubb_m3': round(c['Kubb'], 3),
            'massa_m3': round(c['Massa'], 3), 'rest_m3': round(c['rest'], 3),
            'grupp1_timmer_m3': round(c['g1_timmer'], 3), 'grupp2_timmer_m3': round(c['g2_timmer'], 3),
            'grupp2_kedja_fast': int(c['g2_fast']),
            'validering': validering, 'anmarkning': '; '.join(anm) or None,
        })
    return rader


def skriv_och_verifiera(rader):
    r = requests.post('%s/rest/v1/sim_rotkap?on_conflict=objekt_id,kaplangd_cm' % M.SUPABASE_URL,
                      headers=dict(M.SUPABASE_HEADERS,
                                   **{'Prefer': 'resolution=merge-duplicates,return=minimal'}),
                      json=rader, timeout=120)
    if r.status_code not in (200, 201, 204):
        return 'SKRIVFEL %s: %s' % (r.status_code, r.text[:200])
    # Läs tillbaka VÄRDET — en radräkning bevisar bara att något rördes.
    vill = [x for x in rader if x['kaplangd_cm'] == 340][0]
    fick = S.hamta('sim_rotkap', 'objekt_id=eq.%s&kaplangd_cm=eq.340' % vill['objekt_id'],
                   'timmer_m3,stammar,stockar_antal', 'objekt_id.asc')
    if not fick:
        return 'INTE VERIFIERAD: raden för 340 finns inte efter skrivningen'
    f = fick[0]
    if abs(float(f['timmer_m3']) - vill['timmer_m3']) > 0.0005 or f['stammar'] != vill['stammar'] \
            or f['stockar_antal'] != vill['stockar_antal']:
        return 'INTE VERIFIERAD: läste %s, skrev %s' % (f, {k: vill[k] for k in ('timmer_m3', 'stammar', 'stockar_antal')})
    return None


def main():
    argv = sys.argv[1:]
    alla = '--alla' in argv
    bara = [a for a in argv if not a.startswith('--')]
    if not M.init_supabase():
        print('FEL: ingen Supabase-anslutning. Inget räknat.'); return 1

    par = S.hamta('vy_sim_rotkap_par', 'objekt_id=not.is.null',
                  'objekt_id,maskin_id,serier,filnamn', 'objekt_id.asc,maskin_id.asc')
    per_objekt = collections.defaultdict(list)
    for p in par:
        per_objekt[p['objekt_id']].append(p)
    ids = sorted(per_objekt)
    if bara:
        ids = [i for i in ids if i in bara]
        if not ids:
            print('inget av %s har diameterserie' % bara); return 2
    namn = {r['objekt_id']: r['object_name'] for r in S.hamta(
        'dim_objekt', 'objekt_id=in.(%s)' % ','.join('"%s"' % i for i in ids),
        'objekt_id,object_name', 'objekt_id.asc')}
    forra = {r['objekt_id']: r for r in S.hamta(
        'sim_rotkap', 'kaplangd_cm=eq.300', 'objekt_id,stockar_antal,serier_antal', 'objekt_id.asc')}
    print('objekt med diameterserie: %d   (%s)' % (len(ids), 'alla räknas om' if alla else
          'ett objekt' if bara else 'inkrementellt'))

    t0 = time.time(); utfall = []; fel = 0; raknade = 0
    for objekt_id in ids:
        stockar_antal = rakna('detalj_stock', 'objekt_id=eq.%s' % objekt_id)
        serier_antal = sum(p['serier'] for p in per_objekt[objekt_id])
        f = forra.get(objekt_id)
        if f and not alla and not bara and f['stockar_antal'] == stockar_antal and f['serier_antal'] == serier_antal:
            continue
        t1 = time.time()
        rader = kor_objekt(objekt_id, per_objekt[objekt_id])
        nu = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for r in rader:
            r['objekt_namn'] = namn.get(objekt_id); r['stockar_antal'] = stockar_antal
            r['serier_antal'] = serier_antal; r['beraknad'] = nu
        problem = skriv_och_verifiera(rader)
        raknade += 1
        r0 = rader[0]; r340 = rader[2]
        d = r340['timmer_m3'] - r0['timmer_m3']
        print('  %-30s %4d st (g1 %3d, g2 %3d, utan såg %3d, utan kurva %3d)  340: timmer %+6.2f  %s  (%.0f s)%s'
              % ((namn.get(objekt_id) or objekt_id)[:30], r0['stammar'], r0['grupp1_stammar'], r0['grupp2_stammar'],
                 r0['utan_sagstock'], r0['utan_kurva'], d, problem or 'VERIFIERAT', time.time() - t1,
                 ('\n      ' + r0['anmarkning']) if r0['anmarkning'] else ''))
        if problem:
            fel += 1
        utfall.append({'objekt_id': objekt_id, 'namn': namn.get(objekt_id), 'rader': rader, 'problem': problem})

    print('\nräknade %d objekt, hoppade över %d oförändrade, fel %d  (%.0f s)'
          % (raknade, len(ids) - raknade, fel, time.time() - t0))
    io.open(os.path.join(HAR, '.rotkap_utfall.json'), 'w', encoding='utf-8').write(
        json.dumps(utfall, ensure_ascii=False, indent=1))
    return 1 if fel else 0


if __name__ == '__main__':
    sys.exit(main())
