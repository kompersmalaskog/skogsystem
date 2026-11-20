#!/usr/bin/env python3
"""
OMRÄKNING av fakt_avbrott: ta bort ÖGONBLICKSBILDER av pågående stopp.

Samma familj som delat segment (#630): de timvisa exporterna visar ett pågående
stopp som "Default" (Ponsse) / "Other" (Rottne) tills föraren valt orsak; nästa
fil bär samma starttid med slutlig kategori och full längd — eller som rast/
arbete utan avbrottsrad alls. Importen lät ögonblicksbilden stå kvar bredvid
slutversionen (nyckel maskin+datum+klockslag+kategori). Scorpion 27 rader /
18,0 h, Rottne 27 / 11,8 h sedan aug 2026, varav 3,7 + 4,1 h i själva verket
raster. Drabbar Avbrott-fliken och TU.

Regeln (avbrott_vinnare_ur_fil / avbrott_att_radera i
skogsmaskin_import_version_6.py — importeras, kopieras aldrig): per
(maskin, datum, klockslag) gäller SENASTE exportversionens kategori.

TORRKÖRNING ÄR STANDARD — ingenting skrivs utan --skriv. Visar per maskin och
dag vilka rader som försvinner (klockslag, kategori, längd → slutlig version),
summan, och vad Avbrott-fliken ("Stopp" ≥ 15 min utan flytt) och TU visar före
och efter. RADERAR BARA — lägger aldrig till rader (slutversionerna skrevs av
importen när filen kom; saknas en rapporteras det).

  python scripts/omrakna_fakt_avbrott_ogonblicksbilder.py                 # torrkörning, Scorpion + Rottne sedan 2026-08-01
  python scripts/omrakna_fakt_avbrott_ogonblicksbilder.py --maskiner A030353,A130743
  python scripts/omrakna_fakt_avbrott_ogonblicksbilder.py --skriv          # efter att Martin tittat
"""
import argparse
import os
import sys
from collections import defaultdict
from datetime import date

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROT)

import requests  # noqa: E402

import skogsmaskin_import_version_6 as imp  # noqa: E402

TIMEXPORT = ['PONS20SDJAA270231', 'R64428']   # de drabbade — skotarna exporterar per dygn och har 0
G15_GRANS_SEK = 900
FLYTT = 'Trailer transportation'


def h(sek) -> str:
    return f"{(sek or 0) / 3600:.1f}"


def vinnare_ur_rafiler(maskin: str, fran: str, till: str):
    """Alla MOM-filer i Behandlade/<maskin>/MOM i recency-ordning; senare fil skriver över.
    Returnerar (vinnare {(maskin, datum, klockslag): kod|None}, antal filer)."""
    mom_dir = os.path.join(imp.BEHANDLADE, maskin, 'MOM')
    if not os.path.isdir(mom_dir):
        mom_dir = os.path.join(imp.BEHANDLADE, maskin, 'mom')
    if not os.path.isdir(mom_dir):
        print(f"  {maskin}: ingen MOM-mapp i Behandlade", file=sys.stderr)
        return {}, 0
    fran_d = date.fromisoformat(fran).toordinal() - 1
    till_d = date.fromisoformat(till).toordinal() + 1
    filer = []
    for f in os.listdir(mom_dir):
        if not f.lower().endswith('.mom'):
            continue
        p = os.path.join(mom_dir, f)
        rec = imp.fil_recency(p)
        stampel = date.fromtimestamp(rec).toordinal() if rec else None
        if stampel is not None and (stampel < fran_d or stampel > till_d):
            continue
        filer.append((rec, f, p))
    vinnare = {}
    for rec, f, p in sorted(filer):
        try:
            data = imp.parse_mom_file(p)
        except Exception as e:  # noqa: BLE001
            print(f"  kunde inte parsa {f}: {e}", file=sys.stderr)
            continue
        for key, kod in imp.avbrott_vinnare_ur_fil(data).items():
            if key[0] == maskin and fran <= key[1] <= till:
                vinnare[key] = kod
    return vinnare, len(filer)


def hamta_db(maskin: str, fran: str, till: str):
    rader, off = [], 0
    while True:
        r = requests.get(
            f"{imp.SUPABASE_URL}/rest/v1/fakt_avbrott?maskin_id=eq.{maskin}&datum=gte.{fran}&datum=lte.{till}"
            f"&select=id,maskin_id,datum,klockslag,kategori_kod,langd_sek,filnamn&order=datum,klockslag,id&limit=1000&offset={off}",
            headers=imp.SUPABASE_HEADERS, timeout=60)
        r.raise_for_status()
        batch = r.json()
        rader.extend(batch)
        if len(batch) < 1000:
            return rader
        off += 1000


def hamta_tid(maskin: str, fran: str, till: str):
    r = requests.get(
        f"{imp.SUPABASE_URL}/rest/v1/fakt_tid?maskin_id=eq.{maskin}&datum=gte.{fran}&datum=lte.{till}"
        f"&select=processing_sek,terrain_sek,other_work_sek&limit=5000",
        headers=imp.SUPABASE_HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()


def tu(pt, ow, rader):
    """Skogforsk, samma som lib/g15.ts tuProcent."""
    avbr = sum((r['langd_sek'] or 0) for r in rader)
    korta = sum((r['langd_sek'] or 0) for r in rader if (r['langd_sek'] or 0) < G15_GRANS_SEK)
    n = pt + ow + avbr
    return round((pt + korta) / n * 100, 1) if n > 0 else None


def stopp(rader):
    """Avbrott-flikens 'Stopp': ≥ 15 min utan flytt."""
    return sum((r['langd_sek'] or 0) for r in rader if (r['langd_sek'] or 0) >= G15_GRANS_SEK and r.get('kategori_kod') != FLYTT)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fran', default='2026-08-01')
    ap.add_argument('--till', default=date.today().isoformat())
    ap.add_argument('--maskiner', default=','.join(TIMEXPORT), help='kommaseparerade maskin_id')
    ap.add_argument('--skriv', action='store_true', help='RADERA ögonblicksbilderna (annars torrkörning)')
    a = ap.parse_args()
    maskiner = [m.strip() for m in a.maskiner.split(',') if m.strip()]
    if not imp.init_supabase():
        print("Kunde inte ansluta till Supabase — avbryter.", file=sys.stderr)
        return 1
    imp.logger.setLevel('WARNING')

    print(f"{'SKRIVNING' if a.skriv else 'TORRKÖRNING'} fakt_avbrott {a.fran}..{a.till} · maskiner {', '.join(maskiner)}")
    print("Rör bara fakt_avbrott, och bara genom att RADERA ögonblicksbilder. Inte fakt_tid, produktion, lass, arbetsdag.\n")

    att_radera_alla = []
    for maskin in maskiner:
        vinnare, antal_filer = vinnare_ur_rafiler(maskin, a.fran, a.till)
        db = hamta_db(maskin, a.fran, a.till)
        tid = hamta_tid(maskin, a.fran, a.till)
        pt = sum((t['processing_sek'] or 0) + (t['terrain_sek'] or 0) for t in tid)
        ow = sum((t['other_work_sek'] or 0) for t in tid)
        bort = imp.avbrott_att_radera(db, vinnare)
        bort_ids = {r['id'] for r in bort}
        kvar = [r for r in db if r['id'] not in bort_ids]
        # slutversioner som är avbrott men saknar DB-rad (ska vara 0 — rapporteras, läggs aldrig till)
        kvar_nycklar = {(r['maskin_id'], str(r['datum']), str(r['klockslag'] or '')[:8], r.get('kategori_kod')) for r in kvar}
        saknas = [(k, kod) for k, kod in vinnare.items() if kod is not None and (k[0], k[1], k[2], kod) not in kvar_nycklar]

        print(f"{maskin}: {antal_filer} filer lästa, {len(vinnare)} segment i råfilerna, {len(db)} rader i fakt_avbrott")
        print(f"  {'dag':<11}{'kl':<9}{'kategori i DB':<30}{'min':>5}   slutlig version")
        per_dag = defaultdict(list)
        for r in bort:
            per_dag[str(r['datum'])].append(r)
        for dag in sorted(per_dag):
            for r in sorted(per_dag[dag], key=lambda x: str(x['klockslag'])):
                slut = vinnare.get((r['maskin_id'], str(r['datum']), str(r['klockslag'] or '')[:8]))
                print(f"  {dag:<11}{str(r['klockslag'])[:8]:<9}{str(r.get('kategori_kod')):<30}{round((r['langd_sek'] or 0) / 60):>5}   {slut if slut is not None else 'rast eller arbete (ingen avbrottsrad)'}")
        rast_bort = sum((r['langd_sek'] or 0) for r in bort if vinnare.get((r['maskin_id'], str(r['datum']), str(r['klockslag'] or '')[:8])) is None)
        print(f"  BORT: {len(bort)} rader, {h(sum((r['langd_sek'] or 0) for r in bort))} h — varav slutligt rast/arbete {h(rast_bort)} h")
        print(f"  Avbrott-fliken 'Stopp' (≥15 min utan flytt): {h(stopp(db))} h → {h(stopp(kvar))} h")
        print(f"  TU (Skogforsk): {tu(pt, ow, db)} → {tu(pt, ow, kvar)}")
        if saknas:
            print(f"  OBS: {len(saknas)} slutversion(er) saknar rad i fakt_avbrott (läggs INTE till här): "
                  + ', '.join(f"{k[1]} {k[2]} {kod}" for k, kod in saknas[:5]))
        print()
        att_radera_alla.extend(bort)

    print(f"SUMMA: {len(att_radera_alla)} rader att radera, {h(sum((r['langd_sek'] or 0) for r in att_radera_alla))} h")
    if not a.skriv:
        print("\nTorrkörning — inget skrivet. Kör med --skriv för att radera.")
        return 0
    if not att_radera_alla:
        print("\nInget att radera.")
        return 0
    n = imp.radera_avbrott_rader(att_radera_alla)
    # Verifiera på INNEHÅLL: inga av id:na får finnas kvar.
    ids = [r['id'] for r in att_radera_alla]
    kvar_n = 0
    for i in range(0, len(ids), 100):
        chunk = ','.join(str(x) for x in ids[i:i + 100])
        r = requests.get(f"{imp.SUPABASE_URL}/rest/v1/fakt_avbrott?id=in.({chunk})&select=id",
                         headers=imp.SUPABASE_HEADERS, timeout=60)
        r.raise_for_status()
        kvar_n += len(r.json())
    print(f"Raderade {n} rader · läs-tillbaka: {kvar_n} av dem finns kvar ({'OK' if kvar_n == 0 else 'FEL'})")
    return 1 if kvar_n else 0


if __name__ == '__main__':
    sys.exit(main())
