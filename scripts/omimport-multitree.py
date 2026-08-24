#!/usr/bin/env python3
"""Omimport av HPR efter MultiTree-fixen — en trakt i taget, med stoppknapp.

Koden lagar bara nya importer. Rader som redan ligger i databasen är
ofullständiga tills filerna körts om. Det här skriptet gör det, men under
former som gör att ett halvfärdigt läge inte kan passera obemärkt.

── VARFÖR SKRIPTET STOPPAR I STÄLLET FÖR ATT FORTSÄTTA ──────────────────────

fakt_sortiment byggs om ur detalj_stock vid varje sparning och saknar det
nedgraderingsskydd hpr_filer har. Kör man en liten delfil för ett objekt som
redan har en större snapshot, tar den fakt_sortiment TILLFÄLLIGT NED:

    23 jan-filen:  15 → 9 rader,  23,2 → 12,0 m³
    24 jan-filen:   9 → 16 rader, 12,0 → 25,583 m³

Slutläget blev rätt — men bara för att båda filerna kördes. Ett avbrott
däremellan hade lämnat trakten på 12,0 m³ utan ett ord om saken.

Därför: alla filer för ett objekt körs i ETT pass, största sist, och resultatet
verifieras mot fakt_produktion innan nästa trakt påbörjas. Matchar det inte
stannar skriptet. Det finns ingen --fortsätt-ändå-flagga, och det är avsiktligt
— ett tyst hopp till nästa trakt är precis hur man får 77 halvfärdiga objekt.

── FACIT ────────────────────────────────────────────────────────────────────

fakt_produktion (MOM) är sanningen. Den är opåverkad av den här buggen och
skrivs inte av det här skriptet. Efter omimport ska:

    antal rader i detalj_stam      ==  SUM(fakt_produktion.stammar)
    SUM(fakt_sortiment.volym_m3sub) ≈  SUM(fakt_produktion.volym_m3sub)

── ANVÄNDNING ───────────────────────────────────────────────────────────────

    python scripts/omimport-multitree.py --lista            # visa vad som är kvar
    python scripts/omimport-multitree.py --torrkor 9955     # allt utom skrivning
    python scripts/omimport-multitree.py 9955               # kör en trakt
    python scripts/omimport-multitree.py 9955 11086334      # flera, i ordning

Utan --torrkor SKRIVS DATA. Kör piloten först och läs loggen.
"""

import argparse
import io
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import importlib.util
import requests

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEHANDLADE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer\Behandlade"
LOGGFIL = os.path.join(ROT, 'omimport-multitree.log')

# Toleranser. Stamantalet ska stämma EXAKT — MOM och HPR räknar samma träd.
# Volymen tillåts avvika på sista decimalen: summering av tusentals stockar i
# olika ordning ger avrundningsbrus, inte databortfall.
TOLERANS_STAMMAR = 0
TOLERANS_VOLYM_ABS = 0.05      # m³
TOLERANS_VOLYM_ANDEL = 0.001   # 0,1 %


def ladda_importmodul():
    """Laddar importskriptet och initierar dess Supabase-headers.

    init_supabase() MÅSTE anropas — annars är SUPABASE_HEADERS tom och varje
    anrop faller på 401 utan att skriva något. (Det gör den ofarlig, men den
    ser ut som en lyckad körning i toppen av loggen.)"""
    sokvag = os.path.join(ROT, 'skogsmaskin_import_version_6.py')
    spec = importlib.util.spec_from_file_location('imp6', sokvag)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not mod.init_supabase():
        raise SystemExit('FEL: kunde inte ansluta till Supabase — avbryter utan att röra något')
    return mod


# ── Läsning ──────────────────────────────────────────────────────────────────

def _hamta(mod, path):
    """Paginerad GET. Kastar vid fel — en tyst tom lista skulle se ut som
    'trakten är tom' och få verifieringen att jämföra mot ingenting."""
    ut, from_ = [], 0
    while True:
        h = dict(mod.SUPABASE_HEADERS)
        h['Range'] = f'{from_}-{from_ + 999}'
        h.pop('Prefer', None)
        r = requests.get(f'{mod.SUPABASE_URL}/rest/v1/{path}', headers=h, timeout=60)
        if r.status_code not in (200, 206):
            raise RuntimeError(f'{path}: {r.status_code} {r.text[:200]}')
        bit = r.json()
        ut.extend(bit)
        if len(bit) < 1000:
            return ut
        from_ += 1000


def las_lage(mod, objekt_id):
    """Trakten som databasen ser den just nu."""
    fp = _hamta(mod, f'fakt_produktion?select=stammar,volym_m3sub&objekt_id=eq.{objekt_id}&order=datum')
    ds = _hamta(mod, f'detalj_stam?select=id,stam_bunt_nyckel&objekt_id=eq.{objekt_id}&order=id')
    fs = _hamta(mod, f'fakt_sortiment?select=volym_m3sub&objekt_id=eq.{objekt_id}&order=sortiment_id')
    return {
        'mom_stammar': sum(r.get('stammar') or 0 for r in fp),
        'mom_volym': sum(float(r.get('volym_m3sub') or 0) for r in fp),
        'stam_rader': len(ds),
        'bunt_rader': sum(1 for r in ds if r.get('stam_bunt_nyckel')),
        'sortiment_volym': sum(float(r.get('volym_m3sub') or 0) for r in fs),
    }


def hitta_filer(mod, objekt_id, objektnamn):
    """HPR-filerna för trakten, sorterade med den STÖRSTA SIST.

    Kandidaterna plockas på filnamn (objektnamnet är prefix i både Rottnes och
    Ponsses namngivning) men bekräftas genom att filen parsas och dess härledda
    objekt_id jämförs. Filnamnsmatchning ensam är en gissning; parsningen är ett
    svar."""
    kandidater = []
    for maskin in sorted(os.listdir(BEHANDLADE)):
        hpr_dir = os.path.join(BEHANDLADE, maskin, 'HPR')
        if not os.path.isdir(hpr_dir):
            continue
        for f in os.listdir(hpr_dir):
            if f.lower().endswith('.hpr') and objektnamn and f.startswith(objektnamn[:12]):
                kandidater.append(os.path.join(hpr_dir, f))

    traffar = []
    for p in sorted(kandidater):
        try:
            data = mod.parse_hpr_file(p)
        except Exception as e:
            print(f'    kunde inte parsa {os.path.basename(p)}: {e}')
            continue
        stammar = [s for s in data.get('stammar', []) if s.get('objekt_id') == objekt_id]
        if stammar:
            traffar.append((len(stammar), p))

    # Största sist: fakt_sortiment byggs om vid varje sparning och en delfil
    # tar den tillfälligt ned. Slutar passet med den kompletta filen är läget
    # rätt även om något gick fel däremellan.
    traffar.sort(key=lambda t: t[0])
    return [p for _, p in traffar]


# ── Verifiering ──────────────────────────────────────────────────────────────

def verifiera(lage):
    """(ok, lista med avvikelser). MOM är facit."""
    fel = []
    diff_st = lage['stam_rader'] - lage['mom_stammar']
    if abs(diff_st) > TOLERANS_STAMMAR:
        fel.append(f"detalj_stam {lage['stam_rader']} mot MOM {lage['mom_stammar']} ({diff_st:+d})")

    diff_v = lage['sortiment_volym'] - lage['mom_volym']
    grans = max(TOLERANS_VOLYM_ABS, lage['mom_volym'] * TOLERANS_VOLYM_ANDEL)
    if abs(diff_v) > grans:
        fel.append(f"fakt_sortiment {lage['sortiment_volym']:.3f} mot MOM "
                   f"{lage['mom_volym']:.3f} ({diff_v:+.3f}, gräns ±{grans:.3f})")
    return (not fel), fel


def logga(rad):
    with io.open(LOGGFIL, 'a', encoding='utf-8') as f:
        f.write(rad + '\n')
    print(rad)


# ── Körning ──────────────────────────────────────────────────────────────────

def kor_trakt(mod, objekt_id, namn, torrkor):
    print(f'\n{"=" * 78}\n{objekt_id}  {namn}\n{"=" * 78}')
    fore = las_lage(mod, objekt_id)
    print(f'  före : detalj_stam {fore["stam_rader"]:>6} · sortiment {fore["sortiment_volym"]:>10.3f}')
    print(f'  facit: MOM stammar {fore["mom_stammar"]:>6} · volym     {fore["mom_volym"]:>10.3f}')

    if fore['mom_stammar'] == 0:
        logga(f'{datetime.now():%Y-%m-%d %H:%M}  {objekt_id:<14} {namn[:26]:<28} '
              f'HOPPAD  ingen MOM-produktion att verifiera mot')
        return True

    filer = hitta_filer(mod, objekt_id, namn)
    if not filer:
        logga(f'{datetime.now():%Y-%m-%d %H:%M}  {objekt_id:<14} {namn[:26]:<28} '
              f'HOPPAD  inga HPR-filer på disk')
        return True
    print(f'  {len(filer)} HPR-fil(er), största sist:')
    for p in filer:
        print(f'     {os.path.basename(p)}')

    if torrkor:
        print('  TORRKÖR — ingenting skrivs')
        return True

    # Alla filer i ETT pass. Avbryts det här lämnas fakt_sortiment underskattad,
    # vilket verifieringen nedan fångar.
    for p in filer:
        data = mod.parse_hpr_file(p)
        if not mod.save_hpr_to_supabase(data):
            logga(f'{datetime.now():%Y-%m-%d %H:%M}  {objekt_id:<14} {namn[:26]:<28} '
                  f'STOPP   sparning misslyckades för {os.path.basename(p)}')
            return False

    efter = las_lage(mod, objekt_id)
    ok, fel = verifiera(efter)
    print(f'  efter: detalj_stam {efter["stam_rader"]:>6} · sortiment {efter["sortiment_volym"]:>10.3f} '
          f'· bunt {efter["bunt_rader"]}')

    logga(
        f'{datetime.now():%Y-%m-%d %H:%M}  {objekt_id:<14} {namn[:26]:<28} '
        f'fore {fore["stam_rader"]:>6}/{fore["sortiment_volym"]:>9.3f}  '
        f'efter {efter["stam_rader"]:>6}/{efter["sortiment_volym"]:>9.3f}  '
        f'facit {efter["mom_stammar"]:>6}/{efter["mom_volym"]:>9.3f}  '
        f'bunt {efter["bunt_rader"]:>5}  '
        f'{"OK" if ok else "AVVIKER"}'
        + ('' if ok else '  || ' + ' ; '.join(fel))
    )
    return ok


def klassificera(l):
    """Vilket av de tre kända felen trakten bär.

    Listan "inte i takt med MOM" är INTE samma sak som "lagas av det här
    skriptet". Tre olika fel ger tre olika mönster, och bara det första
    försvinner av en omimport med den lagade parsern:

      multitree     färre stammar OCH mindre volym i HPR — flerträd tappade
      dubbelrakning lika många stammar men STÖRRE volym — kumulativa filer
                    adderade i fakt_sortiment (egen gren, rör inte här)
      ingen-hpr     noll stamrader — filerna finns inte på disk
      oklart        något annat; utred innan omimport

    Köar man dubbelräknings- eller ingen-hpr-trakter här stoppar skriptet på
    dem, vilket är rätt men slöseri med tid."""
    if l['stam_rader'] == 0:
        return 'ingen-hpr'
    brist_stam = l['stam_rader'] < l['mom_stammar']
    overvolym = l['sortiment_volym'] > l['mom_volym'] * 1.02
    if overvolym and not brist_stam:
        return 'dubbelrakning'
    if brist_stam and l['sortiment_volym'] <= l['mom_volym'] * 1.02:
        return 'multitree'
    return 'oklart'


def lista_kvar(mod):
    """Trakter där HPR-sidan ännu inte är i takt med MOM."""
    dim = _hamta(mod, 'dim_objekt?select=objekt_id,object_name,huvudtyp,risskotning&order=objekt_id')
    print(f'{"objekt_id":<16}{"namn":<30}{"fel":<15}{"stam":>13}{"volym":>22}')
    kvar = []
    for o in dim:
        try:
            l = las_lage(mod, o['objekt_id'])
        except Exception:
            continue
        if l['mom_stammar'] == 0:
            continue
        ok, _ = verifiera(l)
        if ok:
            continue
        typ = ('grot' if o.get('risskotning') else
               'gallring' if 'gallr' in (o.get('huvudtyp') or '').lower() else
               'slutavverkning' if o.get('huvudtyp') else 'okänd')
        fel = klassificera(l)
        kvar.append((o['objekt_id'], o.get('object_name') or '', typ, fel, l))
        print(f'{o["objekt_id"]:<16}{(o.get("object_name") or "")[:28]:<30}{fel:<15}'
              f'{l["stam_rader"]:>6}/{l["mom_stammar"]:<6}'
              f'{l["sortiment_volym"]:>10.1f}/{l["mom_volym"]:<10.1f}')

    from collections import Counter
    per_fel = Counter(k[3] for k in kvar)
    print()
    print(f'{len(kvar)} trakter inte i takt med MOM:')
    for f, n in per_fel.most_common():
        print(f'   {f:<15} {n:>3}')
    mt = [k for k in kvar if k[3] == 'multitree']
    print()
    print(f'Det HAR skriptet lagar {len(mt)} av dem (multitree).')
    print('dubbelrakning hor till Kompersmala-grenen; ingen-hpr ar saknade filer.')
    if mt:
        print()
        print('Forslag pa ordning, storst brist forst:')
        for oid, namn, _typ, _f, l in sorted(mt, key=lambda k: k[4]['stam_rader'] - k[4]['mom_stammar'])[:10]:
            saknas = l['mom_stammar'] - l['stam_rader']
            print(f'   {oid:<16}{namn[:28]:<30}{saknas:>6} stammar saknas')
    return kvar


def main():
    ap = argparse.ArgumentParser(description='Omimport av HPR efter MultiTree-fixen')
    ap.add_argument('objekt', nargs='*', help='objekt_id att köra, i ordning')
    ap.add_argument('--lista', action='store_true', help='visa vad som är kvar, skriv inget')
    ap.add_argument('--torrkor', action='store_true', help='allt utom skrivning')
    args = ap.parse_args()

    mod = ladda_importmodul()

    if args.lista:
        lista_kvar(mod)
        return

    if not args.objekt:
        ap.error('ange minst ett objekt_id, eller --lista')

    namn = {o['objekt_id']: (o.get('object_name') or '')
            for o in _hamta(mod, 'dim_objekt?select=objekt_id,object_name&order=objekt_id')}

    for i, oid in enumerate(args.objekt, 1):
        if not kor_trakt(mod, oid, namn.get(oid, ''), args.torrkor):
            print(f'\nSTOPP efter {i} av {len(args.objekt)} trakter. '
                  f'Läget för {oid} är INTE verifierat — se {LOGGFIL}.')
            print('Rätta orsaken och kör om den trakten innan nästa påbörjas.')
            raise SystemExit(1)

    print(f'\nKlart. {len(args.objekt)} trakter, alla verifierade. Logg: {LOGGFIL}')


if __name__ == '__main__':
    main()
