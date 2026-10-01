#!/usr/bin/env python3
"""
OMRÄKNING av fakt_tid efter rättningen av "delat segment" (#630, 2026-10-01).

Importen rättar bara dagar som får en NY fil. Gamla skördardagar sedan
augusti 2026 ligger kvar med dubbelräknade överlapp (+6–13 min/dag, 3,7 h
Scorpion / 4,2 h Rottne). Det här skriptet bygger om dem med EXAKT samma
regel som importen (fil_recency / samla_tid_variant / avgor_tid_vinnare /
bygg_fakt_tid_rader i skogsmaskin_import_version_6.py — importeras, kopieras
aldrig) ur råfilerna i Behandlade/<maskin>/MOM/.

TORRKÖRNING ÄR STANDARD — ingenting skrivs utan --skriv. Torrkörningen visar
per dag och objekt: G15 före (databasen) och efter (regeln), bränsle före och
efter, antal delade segment, och summerar hur många dagar och timmar som
ändras. Samma mönster som scripts/km-nattjobb-torrkorning.ts.

RÖR BARA fakt_tid. Inte fakt_produktion, fakt_lass, fakt_avbrott eller
arbetsdag (importens _create_arbetsdag anropas INTE). Skrivningen är samma
som importens dag-rebuild: delete (maskin, datum) + insert — och bara för
dagar där något faktiskt ändras.

  python scripts/omrakna_fakt_tid_delat_segment.py                 # torrkörning, skördarna sedan 2026-08-01
  python scripts/omrakna_fakt_tid_delat_segment.py --fran 2026-09-01
  python scripts/omrakna_fakt_tid_delat_segment.py --maskiner PONS20SDJAA270231
  python scripts/omrakna_fakt_tid_delat_segment.py --skriv          # skriver — efter att Martin tittat på torrkörningen

Körs från repo-roten (eller C:\\skogsystem-import). Läser .env.local där
skogsmaskin_import_version_6.py ligger (samma som importen).
"""
import argparse
import os
import sys
from collections import defaultdict
from datetime import date, datetime

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROT)

import requests  # noqa: E402

import skogsmaskin_import_version_6 as imp  # noqa: E402

SKORDARE = ['PONS20SDJAA270231', 'R64428']   # timvisa exporter — de drabbade. Skotarna (dagsexport) har 0.
TID_SEK = ('processing_sek', 'terrain_sek', 'other_work_sek', 'maintenance_sek',
           'disturbance_sek', 'rast_sek', 'avbrott_sek', 'kort_stopp_sek', 'engine_time_sek')


def h(sek) -> str:
    return f"{(sek or 0) / 3600:.2f}"


def hamta_db(maskin: str, fran: str, till: str):
    rader, off = [], 0
    while True:
        r = requests.get(
            f"{imp.SUPABASE_URL}/rest/v1/fakt_tid?maskin_id=eq.{maskin}&datum=gte.{fran}&datum=lte.{till}"
            f"&order=datum,objekt_id,operator_id&limit=1000&offset={off}",
            headers=imp.SUPABASE_HEADERS, timeout=60)
        r.raise_for_status()
        batch = r.json()
        rader.extend(batch)
        if len(batch) < 1000:
            return rader
        off += 1000


def hamta_objektnamn(ids):
    namn = {}
    ids = [i for i in ids if i]
    for i in range(0, len(ids), 100):
        chunk = ','.join(f'"{x}"' for x in ids[i:i + 100])
        r = requests.get(f"{imp.SUPABASE_URL}/rest/v1/dim_objekt?select=objekt_id,object_name&objekt_id=in.({chunk})",
                         headers=imp.SUPABASE_HEADERS, timeout=60)
        if r.status_code == 200:
            for row in r.json():
                namn[row['objekt_id']] = row.get('object_name') or row['objekt_id']
    return namn


def bygg_ur_rafiler(maskin: str, fran: str, till: str):
    """Alla MOM-filer i Behandlade/<maskin>/MOM vars maskinstämpel ligger inom
    [fran-1 dag, till+1 dag] (en export kan bära gårdagens segment) → vinnande
    segment → fakt_tid-rader för datum i [fran, till]. Returnerar (rader, delade)."""
    mom_dir = os.path.join(imp.BEHANDLADE, maskin, 'MOM')
    if not os.path.isdir(mom_dir):
        mom_dir = os.path.join(imp.BEHANDLADE, maskin, 'mom')
    if not os.path.isdir(mom_dir):
        print(f"  {maskin}: ingen MOM-mapp i Behandlade", file=sys.stderr)
        return [], 0
    fran_d = date.fromisoformat(fran).toordinal() - 1
    till_d = date.fromisoformat(till).toordinal() + 1
    varianter = {}
    filer = 0
    for f in sorted(os.listdir(mom_dir)):
        if not f.lower().endswith('.mom'):
            continue
        path = os.path.join(mom_dir, f)
        rec = imp.fil_recency(path)
        stampel = date.fromtimestamp(rec).toordinal() if rec else None
        if stampel is not None and (stampel < fran_d or stampel > till_d):
            continue
        try:
            data = imp.parse_mom_file(path)
        except Exception as e:  # noqa: BLE001
            print(f"  kunde inte parsa {f}: {e}", file=sys.stderr)
            continue
        filer += 1
        for ek, entry in data.get('tid_entries', {}).items():
            if len(ek) != 4 or ek[1] != maskin:
                continue
            d = str(entry.get('datum') or '')
            if fran <= d <= till:
                imp.samla_tid_variant(varianter, ek, entry, rec)
    merged_entries, merged_attr, delade = imp.avgor_tid_vinnare(varianter)
    rader = imp.bygg_fakt_tid_rader(merged_entries, merged_attr, f'omrakning_{date.today().isoformat()}')
    print(f"  {maskin}: {filer} filer lästa, {len(varianter)} segment, {delade} delade")
    return rader, delade


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fran', default='2026-08-01')
    ap.add_argument('--till', default=date.today().isoformat())
    ap.add_argument('--maskiner', default=','.join(SKORDARE), help='kommaseparerade maskin_id')
    ap.add_argument('--skriv', action='store_true', help='SKRIV till fakt_tid (annars torrkörning)')
    a = ap.parse_args()
    maskiner = [m.strip() for m in a.maskiner.split(',') if m.strip()]
    # Samma anslutning som importen (headers sätts av init_supabase — FÖRE parsningen,
    # operatörs-uppslagen i parse_mom_file går mot dim_operator).
    if not imp.init_supabase():
        print("Kunde inte ansluta till Supabase — avbryter.", file=sys.stderr)
        return 1
    # Tyst import-logg (parse_mom_file loggar INFO per fil) — bara våra rader på stdout.
    imp.logger.setLevel('WARNING')

    print(f"{'SKRIVNING' if a.skriv else 'TORRKÖRNING'} fakt_tid {a.fran}..{a.till} · maskiner {', '.join(maskiner)}")
    print("Rör bara fakt_tid. Inte produktion, lass, avbrott, arbetsdag.\n")

    tot_dagar = tot_dagar_andrade = 0
    tot_g15_fore = tot_g15_efter = 0
    tot_delade = 0
    att_skriva = {}  # (maskin, datum) -> nya rader

    for maskin in maskiner:
        nya, delade = bygg_ur_rafiler(maskin, a.fran, a.till)
        tot_delade += delade
        gamla = hamta_db(maskin, a.fran, a.till)
        namn = hamta_objektnamn({r['objekt_id'] for r in gamla} | {r['objekt_id'] for r in nya})

        def nyckel(r):
            return (str(r['datum']), r.get('objekt_id') or '', r.get('operator_id') or '')

        g_per = {nyckel(r): r for r in gamla}
        n_per = {nyckel(r): r for r in nya}
        dagar = sorted({k[0] for k in g_per} | {k[0] for k in n_per})
        print(f"\n{maskin}: {len(dagar)} dagar i databasen/råfilerna")
        print(f"  {'dag':<10} {'objekt':<32} {'G15 före':>9} {'G15 efter':>9} {'diff min':>8} {'bränsle före':>12} {'bränsle efter':>13}")
        for dag in dagar:
            nycklar = sorted({k for k in g_per if k[0] == dag} | {k for k in n_per if k[0] == dag})
            dag_andrad = False
            for k in nycklar:
                g, n = g_per.get(k), n_per.get(k)
                g15_f = sum((g or {}).get(f, 0) or 0 for f in ('processing_sek', 'terrain_sek', 'other_work_sek'))
                g15_e = sum((n or {}).get(f, 0) or 0 for f in ('processing_sek', 'terrain_sek', 'other_work_sek'))
                br_f = float((g or {}).get('bransle_liter') or 0)
                br_e = float((n or {}).get('bransle_liter') or 0)
                andrad = (g is None) != (n is None) or any((g or {}).get(f, 0) != (n or {}).get(f, 0) for f in TID_SEK) or abs(br_f - br_e) > 0.01
                tot_g15_fore += g15_f
                tot_g15_efter += g15_e
                if andrad:
                    dag_andrad = True
                    mark = '  ÄNDRAS' if g and n else ('  NY RAD' if n else '  TAS BORT')
                    print(f"  {dag:<10} {(namn.get(k[1], k[1]) or '')[:32]:<32} {h(g15_f):>9} {h(g15_e):>9} {round((g15_e - g15_f) / 60):>8} {br_f:>12.1f} {br_e:>13.1f}{mark}")
            tot_dagar += 1
            if dag_andrad:
                tot_dagar_andrade += 1
                att_skriva[(maskin, dag)] = [r for r in nya if str(r['datum']) == dag]

    print(f"\nSUMMA: {tot_dagar} dagar granskade · {tot_dagar_andrade} dagar ändras · {tot_delade} delade segment")
    print(f"G15 före {h(tot_g15_fore)} h → efter {h(tot_g15_efter)} h · försvinner {h(tot_g15_fore - tot_g15_efter)} h")

    if not a.skriv:
        print("\nTorrkörning — inget skrivet. Kör med --skriv för att skriva dagarna som ändras.")
        return 0
    if not att_skriva:
        print("\nInget att skriva.")
        return 0

    print(f"\nSKRIVER {len(att_skriva)} dagar (delete + insert per maskin-dag, som importens dag-rebuild)…")
    skrivna = 0
    for (maskin, dag), rader in sorted(att_skriva.items()):
        r = requests.delete(f"{imp.SUPABASE_URL}/rest/v1/fakt_tid?maskin_id=eq.{maskin}&datum=eq.{dag}",
                            headers=imp.SUPABASE_HEADERS, timeout=60)
        if r.status_code not in (200, 204):
            print(f"  FEL delete {maskin} {dag}: {r.status_code} {r.text[:200]}", file=sys.stderr)
            return 1
        if rader:
            n = imp.upsert_data('fakt_tid', [dict(x) for x in rader], ['datum', 'maskin_id', 'objekt_id', 'operator_id'])
            if n == 0:
                print(f"  FEL insert {maskin} {dag} — raden är RADERAD men inte återskapad; kör om med --fran {dag} --till {dag}", file=sys.stderr)
                return 1
        skrivna += 1
    # Verifiera på INNEHÅLL: läs tillbaka och jämför G15 per dag.
    fel = 0
    for (maskin, dag), rader in sorted(att_skriva.items()):
        db = hamta_db(maskin, dag, dag)
        vill = sum((x.get(f) or 0) for x in rader for f in ('processing_sek', 'terrain_sek', 'other_work_sek'))
        fick = sum((x.get(f) or 0) for x in db for f in ('processing_sek', 'terrain_sek', 'other_work_sek'))
        if vill != fick:
            fel += 1
            print(f"  VERIFIERING MISSLYCKADES {maskin} {dag}: ville {h(vill)} h, databasen har {h(fick)} h", file=sys.stderr)
    print(f"Skrev {skrivna} dagar · verifierade på innehåll: {skrivna - fel} OK, {fel} fel")
    return 1 if fel else 0


if __name__ == '__main__':
    sys.exit(main())
