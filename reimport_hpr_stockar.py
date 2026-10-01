"""Läs om HPR-filer för objekt som har stammar men inga stockar.

    python reimport_hpr_stockar.py                 torrkörning: parsar filerna,
                                                   jämför mot databasen, skriver INGET
    python reimport_hpr_stockar.py --skriv         skriver stammar, stockar och
                                                   bygger om fakt_sortiment
    python reimport_hpr_stockar.py --objekt 93693,876
                                                   bara de objekten, även om de
                                                   redan har stockar (går att
                                                   kombinera med --skriv)
    --aven-nyckellosa                              ta även objekt som redan har
                                                   stockrader utan nyckel — bara
                                                   efter att de rensats

Bakgrund (2026-10-01): stockparsningen i skogsmaskin_import_version_6.py
fanns inte före 2026-04-21. HPR-filerna för januari–april 2026 lästes 11 mars,
1 april och 21 april med en parser som bara skrev detalj_stam, och
meta_importerade_filer markerade dem OK — så de lästes aldrig igen. 41 objekt,
~65 000 stammar, inte en stock. Alla vyer bygger på stockar, så objekten var
osynliga i nio månader. Kontrollen kontroll_stammar_utan_stockar() hittar dem
nu, och gap_check.py larmar.

Vad skriptet gör per fil, i Behandlade-mappen (filerna flyttas inte):
  1. parse_hpr_file()                 — samma parser som importen
  2. torrkörning: jämför objekt_id, antal stammar och stockar mot databasen.
     Avviker objekt_id (namnkoppling, nytt vo) skrivs filen INTE —
     stammar får aldrig flytta mellan objekt av en omimport.
  3. --skriv: upsert detalj_stam (samma nycklar som finns, fyller tidpunkt
     och total_volym), upsert detalj_stock på (maskin_id, stem_key, log_key),
     rebuild_fakt_sortiment per (maskin, objekt) — exakt vad importen gör.
     Nya sortiment-id läggs till i dim_sortiment; befintliga namn rörs inte.

Vad som INTE skrivs, med flit: dim_objekt, dim_sortiment_pris och
apteringsfönster (gamla filers priser och fönster får inte skriva över
dagens), objekt.cert, detalj_gps_spar (2,4 M rader som redan finns),
hpr_filer/hpr_stammar (finns sedan originalimporten), meta_importerade_filer.

Verifiering på innehåll efter varje fil: antal joinbara stockar för objektet
läses tillbaka och jämförs med det parsade antalet.
"""
import os, sys, io, time, json, collections, importlib.util
from urllib.parse import quote
import requests

HAR = os.path.dirname(os.path.abspath(__file__))


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


def rpc(namn, args):
    h = {k: v for k, v in M.SUPABASE_HEADERS.items() if k != 'Prefer'}
    r = requests.post('%s/rest/v1/rpc/%s' % (M.SUPABASE_URL, namn), headers=h, json=args, timeout=120)
    if r.status_code != 200:
        raise RuntimeError('%s svarade %s: %s' % (namn, r.status_code, r.text[:300]))
    return r.json()


def rakna(tabell, filt):
    """Antal rader utan att hämta dem."""
    r = requests.get('%s/rest/v1/%s?select=objekt_id&%s' % (M.SUPABASE_URL, tabell, filt),
                     headers=dict(M.SUPABASE_HEADERS, **{'Prefer': 'count=exact', 'Range': '0-0'}),
                     timeout=120)
    r.raise_for_status()
    return int(r.headers['Content-Range'].split('/')[-1])


def hamta(tabell, filt, select):
    ut, start = [], 0
    while True:
        r = requests.get('%s/rest/v1/%s?select=%s&%s&limit=1000&offset=%d'
                         % (M.SUPABASE_URL, tabell, select, filt, start),
                         headers=M.SUPABASE_HEADERS, timeout=120)
        r.raise_for_status()
        rad = r.json()
        ut.extend(rad)
        if len(rad) < 1000:
            return ut
        start += 1000


def hitta_fil(maskin_id, filnamn):
    for sub in ('HPR', 'hpr'):
        p = os.path.join(M.BEHANDLADE, maskin_id, sub, filnamn)
        if os.path.exists(p):
            return p
    return None


def analysera(data):
    """Per objekt_id i filen: stammar, stockar, m3sub."""
    per = collections.defaultdict(lambda: {'stammar': 0, 'stockar': 0, 'm3': 0.0})
    for s in data.get('stammar') or []:
        per[s.get('objekt_id')]['stammar'] += 1
    for k in data.get('stockar') or []:
        per[k.get('objekt_id')]['stockar'] += 1
        per[k.get('objekt_id')]['m3'] += float(k.get('volym_m3sub') or 0)
    return per


def skriv_fil(data, objekt_ids):
    """Samma skrivningar som save_hpr_to_supabase för stam, stock och
    fakt_sortiment — inget annat. Returnerar lista med fel."""
    fel = []
    if data.get('tradslag'):
        if M.upsert_data('dim_tradslag', data['tradslag'], ['tradslag_id']) == 0:
            fel.append('dim_tradslag')
    # Sortiment: bara id som saknas. Befintliga namn är dagens sanning
    # (normalisering_karta mappar på namnet).
    if data.get('sortiment'):
        ids = sorted({s['sortiment_id'] for s in data['sortiment'] if s.get('sortiment_id')})
        finns = set()
        for i in range(0, len(ids), 200):
            filt = 'sortiment_id=in.(%s)' % ','.join('"%s"' % quote(x, safe='') for x in ids[i:i + 200])
            finns |= {r['sortiment_id'] for r in hamta('dim_sortiment', filt, 'sortiment_id')}
        nya = [s for s in data['sortiment'] if s.get('sortiment_id') not in finns and s.get('namn')]
        if nya:
            print('    dim_sortiment: %d nya id läggs till: %s' % (len(nya), ', '.join(s['sortiment_id'] for s in nya)))
            if M.upsert_data('dim_sortiment', nya, ['sortiment_id']) == 0:
                fel.append('dim_sortiment')
    if data.get('stammar'):
        drop_keys = {'hpr_stam_nummer', 'hpr_tradslag_namn', 'hpr_antal_stockar'}
        rename_keys = {'hpr_total_volym': 'total_volym',
                       'hpr_bio_energy_adaption': 'bio_energy_adaption',
                       'hpr_sortiment': 'sortiment'}
        rader = []
        for s in data['stammar']:
            rad = {}
            for k, v in s.items():
                if k in drop_keys:
                    continue
                rad[rename_keys.get(k, k)] = v
            rader.append(rad)
        for i in range(0, len(rader), 500):
            if M.upsert_data('detalj_stam', rader[i:i + 500], ['maskin_id', 'stam_key']) == 0:
                fel.append('detalj_stam'); break
    if data.get('stockar'):
        for i in range(0, len(data['stockar']), 500):
            if M.upsert_data('detalj_stock', data['stockar'][i:i + 500], ['maskin_id', 'stem_key', 'log_key']) == 0:
                fel.append('detalj_stock'); break
        par = sorted({(k['maskin_id'], k['objekt_id']) for k in data['stockar']
                      if k.get('maskin_id') and k.get('objekt_id')})
        for maskin_id, objekt_id in par:
            res = M.rebuild_fakt_sortiment(maskin_id, objekt_id)
            if res is None:
                fel.append('fakt_sortiment %s' % objekt_id)
            else:
                print('    fakt_sortiment %s: %s → %s rader, %s → %s m³%s' % (
                    objekt_id, res.get('rader_fore'), res.get('rader_efter'),
                    res.get('volym_fore'), res.get('volym_efter'),
                    '' if res.get('status') in (None, 'ok', 'OK') else '  [%s]' % res.get('status')))
    return fel


def main():
    argv = sys.argv[1:]
    skriv = '--skriv' in argv
    bara = None
    if '--objekt' in argv:
        bara = [x for x in argv[argv.index('--objekt') + 1].split(',') if x]
    if not M.init_supabase():
        print('FEL: ingen Supabase-anslutning.'); return 1

    objekt = rpc('kontroll_stammar_utan_stockar', {'p_min_stammar': 100})
    if bara:
        # Angivna objekt som INTE saknar stockar helt (t.ex. en avbruten
        # omimport som hann skriva en del batcher) hämtas direkt ur
        # detalj_stam: samma filer, samma väg, ingen kontroll av nycklar.
        objekt = [o for o in objekt if o['objekt_id'] in bara]
        for oid in bara:
            if any(o['objekt_id'] == oid for o in objekt):
                continue
            rader = hamta('detalj_stam', 'objekt_id=eq.%s' % quote(oid, safe=''), 'maskin_id,filnamn')
            if not rader:
                print('  %s: inga stammar i detalj_stam — hoppar' % oid); continue
            objekt.append({'objekt_id': oid, 'namn': None, 'stammar': len(rader),
                           'maskiner': ','.join(sorted({r['maskin_id'] for r in rader if r['maskin_id']})),
                           'filer': sorted({r['filnamn'] for r in rader if r['filnamn']}),
                           'stockar_utan_nyckel': rakna('detalj_stock', 'objekt_id=eq.%s&stem_key=is.null' % quote(oid, safe='')),
                           'forsta': None})
    print('%d objekt med stammar men inga joinbara stockar%s' % (len(objekt), '' if skriv else '  [TORRKÖRNING — inget skrivs]'))
    # Objekt som redan har stockrader UTAN nyckel (parsern 21 april–7 maj 2026)
    # hoppas: en omimport skulle lägga en andra uppsättning rader bredvid de
    # gamla. De gamla måste rensas först — eget beslut, eget steg.
    nyckellosa = [o for o in objekt if (o.get('stockar_utan_nyckel') or 0) > 0]
    if nyckellosa and '--aven-nyckellosa' not in argv:
        for o in nyckellosa:
            print('  hoppar %-22s %-30s %d stammar — har redan %d stockrader utan nyckel, rensa först'
                  % (o['objekt_id'], (o['namn'] or '')[:30], o['stammar'], o['stockar_utan_nyckel']))
        objekt = [o for o in objekt if o not in nyckellosa]
        print('%d objekt kvar att läsa om' % len(objekt))

    # fil -> de objekt databasen säger att filen bär stammar för, och
    # vilka maskinmappar den kan ligga i (ett objekt kan ha två skördare).
    fil_objekt, fil_maskiner = collections.OrderedDict(), collections.defaultdict(set)
    for o in objekt:
        for f in o['filer'] or []:
            fil_objekt.setdefault(f, set()).add(o['objekt_id'])
            fil_maskiner[f] |= {m for m in (o['maskiner'] or '').split(',') if m}
    t0 = time.time()
    tot = collections.Counter()
    for filnamn, db_objekt in fil_objekt.items():
        maskiner = sorted(fil_maskiner[filnamn])
        path = None
        for m in maskiner:
            path = hitta_fil(m, filnamn)
            if path:
                break
        print('\n%s  [%s]' % (filnamn, ','.join(maskiner)))
        if not path:
            print('  SAKNAS i Behandlade — hoppar'); tot['saknas'] += 1; continue
        try:
            data = M.parse_hpr_file(path)
        except Exception as e:
            print('  PARSEFEL: %s' % e); tot['parsefel'] += 1; continue
        per = analysera(data)
        parsade = {k for k in per if k}
        fel_objekt = parsade - db_objekt - {k for k in parsade if rakna('detalj_stam', 'objekt_id=eq.%s&filnamn=eq.%s' % (quote(k, safe=''), quote(filnamn, safe=''))) > 0}
        for oid, v in sorted(per.items(), key=lambda x: -x[1]['stammar']):
            db_stam = rakna('detalj_stam', 'objekt_id=eq.%s&filnamn=eq.%s' % (quote(oid or '', safe=''), quote(filnamn, safe='')))
            db_stock = rakna('detalj_stock', 'objekt_id=eq.%s&stem_key=not.is.null' % quote(oid or '', safe=''))
            flagga = ''
            if oid in fel_objekt:
                flagga = '  <-- OBJEKT SAKNAS I DB FÖR FILEN'
            elif v['stammar'] != db_stam:
                flagga = '  <-- stammar avviker mot DB (%d)' % db_stam
            print('  %-22s stammar %6d (DB %6d)  stockar %7d (DB joinbara idag %7d)  %8.1f m³%s'
                  % (oid, v['stammar'], db_stam, v['stockar'], db_stock, v['m3'], flagga))
        if fel_objekt:
            print('  STOPP: filen ger objekt som databasen inte har stammar för ur den här filen: %s' % ', '.join(sorted(fel_objekt)))
            tot['stoppade'] += 1; continue
        tot['filer'] += 1
        tot['stockar'] += sum(v['stockar'] for v in per.values())
        tot['m3'] += sum(v['m3'] for v in per.values())
        if not skriv:
            continue
        fel = skriv_fil(data, parsade)
        if fel:
            print('  FEL vid skrivning: %s' % ', '.join(fel)); tot['skrivfel'] += 1; continue
        # Verifiera på innehåll: joinbara stockar efteråt >= parsade.
        for oid, v in per.items():
            if not oid or not v['stockar']:
                continue
            efter = rakna('detalj_stock', 'objekt_id=eq.%s&stem_key=not.is.null' % quote(oid, safe=''))
            ok = efter >= v['stockar']
            print('  %s %-22s joinbara stockar efter: %d (parsade %d)' % ('verifierad' if ok else 'INTE VERIFIERAD:', oid, efter, v['stockar']))
            if not ok:
                tot['overifierade'] += 1
        tot['skrivna'] += 1

    print('\n%d filer lästa, %d stockar, %.1f m³  (saknas %d, parsefel %d, stoppade %d, skrivna %d, skrivfel %d, overifierade %d)  %.0f s'
          % (tot['filer'], tot['stockar'], tot['m3'], tot['saknas'], tot['parsefel'], tot['stoppade'],
             tot['skrivna'], tot['skrivfel'], tot['overifierade'], time.time() - t0))
    if skriv:
        kvar = rpc('kontroll_stammar_utan_stockar', {'p_min_stammar': 100})
        print('kvar efteråt: %d objekt med stammar men inga joinbara stockar' % len(kvar))
        for o in kvar:
            print('  %-22s %-30s %6d stammar  %s' % (o['objekt_id'], (o['namn'] or '')[:30], o['stammar'], o['forsta'] or '-'))
    return 1 if (tot['skrivfel'] or tot['overifierade'] or tot['stoppade']) else 0


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
    sys.exit(main())
