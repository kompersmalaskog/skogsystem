"""Diagnos av simuleringen: bugg eller förklaring?

Simuleringen gav timmer -3,18 (facit -2,72) men kubb -0,67 (facit -3,0).
Tre frågor, oberoende av varandra:

  1. Överskjutning. Sista stocken på varje stam sticker ut förbi kurvans
     slut. Hur långt? Några cm är gridavrundning (steget är 10 cm). En hel
     stock betyder att toppstocken saknas i BÅDA scenarierna — och kubb
     sitter i toppen, så kubbförlusten vore då konstlat liten.

  2. Stel modell. Behåll varje stocks faktiska längd, förskjut allt 40 cm
     uppåt, låt SISTA stocken förlora 40 cm. Ingen omaptering. Faller
     sista stocken ur sitt fönster räknas den som förlorad. Det är vad en
     konisk uppskattning gör. Återger den facit är skillnaden förklarad:
     apteraren räddar det den stela modellen förlorar.

  3. Manuella celler. Vilka (längd, diameter) får en automatisk apterare
     inte välja? Ligger kubbens celler där ändrar det allt.
"""
import os, sys, io, json, math, collections, importlib.util

HAR = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('sim', os.path.join(HAR, 'simulera_rotkap.py'))
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)
M = S.M


def main():
    if not M.init_supabase():
        return 1
    prod_raw = json.load(io.open(S.PRISMATRIS, encoding='utf-8'))

    print('=== 3. MANUELLA / FÖRBJUDNA CELLER ===')
    for k, v in prod_raw.items():
        if v['grupp'] not in ('Timmer', 'Kubb') and v['namn'] != 'BmavFall_V3':
            continue
        for c in v['matris']:
            if c['pris'] and c['pris'] > 0 and c['bc'] != 'No limit':
                print('  %-20s L>=%-4d D>=%-4d pris %5.0f  %s' % (v['namn'], c['l'], c['d'], c['pris'], c['bc']))

    filt = 'objekt_id=eq.%s&maskin_id=eq.%s' % (S.OBJ, S.MASKIN)
    stockar = S.hamta('detalj_stock', filt + '&stem_key=not.is.null&log_key=not.is.null',
                      'stem_key,log_key,langd_cm,toppdia_ub_mm,volym_m3sub,sortiment_id',
                      'stem_key.asc,log_key.asc')
    serier = {s['stam_key']: s for s in S.hamta(
        'detalj_stam_diameter', filt,
        'stam_key,diametrar,antal_punkter,steg_cm,forsta_position_cm,slut_hojd_cm', 'stam_key.asc')}
    grupp_av_key = {k: v['grupp'] for k, v in prod_raw.items()}
    namn_av_key = {k: v['namn'] for k, v in prod_raw.items()}
    fonster = {v['namn']: (int(v['langd_klasser'][0]), int(v['langd_max']), int(v['dia_min_top']), int(v['dia_max']))
               for v in prod_raw.values() if v['langd_klasser']}

    per_stam = collections.defaultdict(list)
    for s in stockar:
        s['key'] = s['sortiment_id'].split('_')[-1]
        s['grupp'] = grupp_av_key.get(s['key'], '?'); s['namn'] = namn_av_key.get(s['key'], '?')
        per_stam[s['stem_key']].append(s)
    urval = []
    for sk, logs in per_stam.items():
        logs.sort(key=lambda x: x['log_key'])
        r = logs[0]
        if r['log_key'] == 1 and r['namn'] == 'BmavFall_V3' and 300 <= r['langd_cm'] <= 314 and sk in serier:
            urval.append(sk)

    print('\n=== 1. ÖVERSKJUTNING: sista stockens topp minus kurvans slut ===')
    over = []; sista_typ = collections.Counter(); sista_vol = collections.Counter()
    slut_hojd_diff = []
    for sk in urval:
        ser = serier[sk]
        END = (ser['forsta_position_cm'] or 0) + (len(ser['diametrar']) - 1) * ser['steg_cm']
        topp = sum(l['langd_cm'] for l in per_stam[sk])
        over.append(topp - END)
        if ser.get('slut_hojd_cm') is not None:
            slut_hojd_diff.append(topp - ser['slut_hojd_cm'])
        sista = per_stam[sk][-1]
        sista_typ[sista['grupp']] += 1; sista_vol[sista['grupp']] += float(sista['volym_m3sub'] or 0)
    over.sort()
    n = len(over)
    print('  n %d  min %d  p10 %d  median %d  p90 %d  max %d  (cm)' % (
        n, over[0], over[n // 10], over[n // 2], over[9 * n // 10], over[-1]))
    print('  andel med överskjutning > 10 cm (mer än ett gridsteg): %d' % sum(1 for o in over if o > 10))
    if slut_hojd_diff:
        s2 = sorted(slut_hojd_diff)
        print('  mot DiameterMeasuredEndHeight: median %d  p90 %d  max %d' % (s2[len(s2)//2], s2[9*len(s2)//10], s2[-1]))
    print('  sista stockens typ: %s   volym: %s' % (dict(sista_typ), {k: round(v, 2) for k, v in sista_vol.items()}))

    print('\n=== 2. STEL MODELL: behåll längderna, skjut 40 cm, sista stocken förlorar 40 ===')
    # Kurvorna behövs för att räkna om sista stockens toppdiameter och volym.
    forlorat = collections.Counter(); forlorat_st = collections.Counter()
    kvar_kortad = collections.Counter(); byte = collections.Counter()
    for sk in urval:
        ser = serier[sk]; steg = ser['steg_cm']; f0 = ser['forsta_position_cm'] or 0; dob = ser['diametrar']
        END = f0 + (len(dob) - 1) * steg
        def dub_at(x):
            if x >= END:                       # extrapolera sista lutningen
                d = dob[-1] + (dob[-1] - dob[-2]) / steg * (x - END)
            else:
                i = (x - f0) // steg; t = ((x - f0) - i * steg) / steg
                d = dob[i] + (dob[i + 1] - dob[i]) * t
            return max(0.0, S.BARK_A + S.BARK_B * d)
        logs = per_stam[sk]
        sista = logs[-1]
        if len(logs) < 2:
            continue
        # Sista stocken blir 40 cm kortare; toppen sitter kvar där den var.
        ny_langd = sista['langd_cm'] - 40
        topp = sum(l['langd_cm'] for l in logs)
        dtop = dub_at(topp)
        # Passar den fortfarande i sitt eget fönster?
        namn = sista['namn']
        if namn not in fonster:
            continue
        lmin, lmax, dmin, dmax = fonster[namn]
        vol = float(sista['volym_m3sub'] or 0)
        if ny_langd < lmin:
            forlorat[sista['grupp']] += vol; forlorat_st[sista['grupp']] += 1
            # Vad kan den bli i stället? Massa kräver 300.
            if ny_langd >= 300 and dtop >= 30 and sista['grupp'] != 'Massa':
                byte['%s -> Massa' % sista['grupp']] += 1
            else:
                byte['%s -> rest' % sista['grupp']] += 1
        else:
            kvar_kortad[sista['grupp']] += vol * ny_langd / sista['langd_cm']
    print('  faller ur sitt längdfönster (hela stockens volym):')
    for g in ('Timmer', 'Kubb', 'Massa'):
        print('    %-7s %6.2f m3  (%d st)' % (g, forlorat[g], forlorat_st[g]))
    print('  vad de blir i stället: %s' % dict(byte))
    print('  sista stockar som bara blir 40 cm kortare men ryms: %s' % {k: round(v, 2) for k, v in kvar_kortad.items()})
    return 0


if __name__ == '__main__':
    sys.exit(main())
