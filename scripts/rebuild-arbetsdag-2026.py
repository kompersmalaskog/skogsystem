#!/usr/bin/env python3
"""
Rebuild arbetsdag-rader för 2026 från fakt_skift + fakt_tid.

Bakgrund: _create_arbetsdag hade en scope-bugg där bara den aktuella filens
skift aggregerades. Multi-skift-dagar kollapsade när UPSERT skrev över raden
vid varje fil-import. Detta är fixat i live-koden — men de redan-skapade
arbetsdag-raderna för 2026 är felaktiga och måste byggas om.

Skarp körning UPSERT:ar alla rebuilt rader och nollställer bekraftad=false +
bekraftad_tid=NULL för bekräftade rader, så förare granskar den korrekta
tiden på nytt. Det är medvetet — användaren har bekräftat detta val.

Skopa:
- Bara datum >= 2026-01-01 (pre-2026 = utvecklingsfas, ignoreras)
- Bara arbetsdag-tabellen — rör inte vilobrott eller arbetsdag_objekt

Användning:
  py scripts/rebuild-arbetsdag-2026.py --dry-run
  py scripts/rebuild-arbetsdag-2026.py
"""
import os
import sys
import requests
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import skogsmaskin_import_version_6 as imp
from skogsmaskin_import_version_6 import (
    SUPABASE_URL, init_supabase,
    parse_datetime, upsert_data,
)

# SUPABASE_HEADERS sätts av init_supabase(). Vi importerar modulen och
# refererar via imp.SUPABASE_HEADERS efter init så vi får den uppdaterade.
if not init_supabase():
    print("Kunde inte initiera Supabase-anslutning")
    sys.exit(1)
SUPABASE_HEADERS = imp.SUPABASE_HEADERS

DRY_RUN = '--dry-run' in sys.argv
START_DATE = '2026-01-01'

# Postgrest har server-side limit (1000 default) som Range-header inte
# överskrider. Vi paginerar via limit/offset tills vi får mindre än batch.
BATCH_SIZE = 1000


def fetch_all(url_base):
    """Hämta alla rader via pagination (offset/limit)."""
    all_data = []
    offset = 0
    while True:
        sep = '&' if '?' in url_base else '?'
        url = f"{url_base}{sep}limit={BATCH_SIZE}&offset={offset}"
        resp = requests.get(url, headers=SUPABASE_HEADERS, timeout=60)
        if resp.status_code != 200:
            print(f"  FEL {resp.status_code}: {resp.text[:200]}")
            break
        batch = resp.json()
        if not isinstance(batch, list):
            print(f"  Oväntat svar: {batch}")
            break
        all_data.extend(batch)
        if len(batch) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
    return all_data


def _tim(t1, t2):
    """Räkna timmar mellan två HH:MM-strängar. Returnerar None om någon saknas."""
    if not t1 or not t2:
        return None
    t1m = int(t1[:2]) * 60 + int(t1[3:5])
    t2m = int(t2[:2]) * 60 + int(t2[3:5])
    return (t2m - t1m) / 60


def main():
    if DRY_RUN:
        print("=" * 60)
        print("DRY RUN — inget skrivs till databasen")
        print("=" * 60)
        print()

    # 1. operator_id -> medarbetare_id
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/operator_medarbetare?select=operator_id,medarbetare_id",
        headers=SUPABASE_HEADERS, timeout=30
    )
    op_to_medarb = {}
    for row in resp.json():
        if row.get('operator_id') and row.get('medarbetare_id'):
            op_to_medarb[row['operator_id']] = row['medarbetare_id']

    # 2. medarbetare-namn (för output)
    namn_resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/medarbetare?select=id,namn",
        headers=SUPABASE_HEADERS, timeout=30
    )
    namn_map = {r['id']: (r.get('namn') or r['id'][:8]) for r in namn_resp.json()}

    # 3. Hämta alla fakt_skift för 2026 (paginerad)
    print(f"Hämtar fakt_skift för 2026...")
    alla_skift = fetch_all(
        f"{SUPABASE_URL}/rest/v1/fakt_skift?datum=gte.{START_DATE}"
        f"&select=operator_id,maskin_id,datum,inloggning_tid,utloggning_tid,langd_sek"
        f"&order=datum"
    )
    print(f"  {len(alla_skift)} fakt_skift-rader\n")

    # 4. Hämta alla fakt_tid för 2026 (för rast)
    print(f"Hämtar fakt_tid för 2026...")
    alla_tid = fetch_all(
        f"{SUPABASE_URL}/rest/v1/fakt_tid?datum=gte.{START_DATE}"
        f"&select=operator_id,datum,rast_sek,objekt_id"
    )
    print(f"  {len(alla_tid)} fakt_tid-rader\n")

    # 5. Bygg rast + objekt-lookup
    rast_lookup = defaultdict(int)
    objekt_lookup = {}
    for row in alla_tid:
        op_id = row.get('operator_id')
        datum = str(row.get('datum', ''))
        if op_id and datum:
            key = (op_id, datum)
            rast_lookup[key] += (row.get('rast_sek', 0) or 0)
            if not objekt_lookup.get(key) and row.get('objekt_id'):
                objekt_lookup[key] = row['objekt_id']

    # 6. Aggregera skift per (medarbetare, datum). Samma logik som live-fixet.
    dag_agg = {}
    skippade_skraep = 0
    okand_operator = 0
    for s in alla_skift:
        op_id = s.get('operator_id')
        maskin = s.get('maskin_id')
        datum = s.get('datum')
        inl = s.get('inloggning_tid')
        utl = s.get('utloggning_tid')
        if not op_id or not maskin or not datum or not inl:
            continue

        medarb_id = op_to_medarb.get(op_id)
        if not medarb_id:
            okand_operator += 1
            continue

        inl_dt = parse_datetime(str(inl)) if inl else None
        utl_dt = parse_datetime(str(utl)) if utl else None
        if not inl_dt:
            continue

        # Skräpfilter < 300 sek
        if utl_dt:
            sek = int((utl_dt - inl_dt).total_seconds())
            if sek < 300:
                skippade_skraep += 1
                continue
        else:
            sek = 0

        datum_str = str(datum)
        key = (medarb_id, datum_str)
        if key not in dag_agg:
            dag_agg[key] = {
                'start': inl_dt, 'end': utl_dt,
                'op_id': op_id, 'maskin_sek': defaultdict(int),
            }
        else:
            if not dag_agg[key]['start'] or inl_dt < dag_agg[key]['start']:
                dag_agg[key]['start'] = inl_dt
            if utl_dt and (not dag_agg[key]['end'] or utl_dt > dag_agg[key]['end']):
                dag_agg[key]['end'] = utl_dt
        dag_agg[key]['maskin_sek'][maskin] += sek

    # 7. Bygg arbetsdag-rader
    arbetsdag_rows = []
    for (medarb_id, datum_str), agg in dag_agg.items():
        if not agg['start']:
            continue
        start_tid = agg['start'].strftime('%H:%M')
        slut_tid = agg['end'].strftime('%H:%M') if agg['end'] else None
        maskin = max(agg['maskin_sek'], key=agg['maskin_sek'].get) if agg['maskin_sek'] else None
        rast_sek = rast_lookup.get((agg['op_id'], datum_str), 0)
        rast_min = int(rast_sek / 60)
        objekt_id = objekt_lookup.get((agg['op_id'], datum_str))
        arbetsdag_rows.append({
            'medarbetare_id': medarb_id,
            'datum': datum_str,
            'maskin_id': maskin,
            'dagtyp': 'Produktion',
            'start_tid': start_tid,
            'slut_tid': slut_tid,
            'rast_min': max(rast_min, 0),
            'bekraftad': False,
            'bekraftad_tid': None,
            'objekt_id': objekt_id,
        })

    # 8. Hämta befintlig arbetsdag-data för före/efter-jämförelse
    print(f"Hämtar befintlig arbetsdag-data för jämförelse...")
    befintliga_rader = fetch_all(
        f"{SUPABASE_URL}/rest/v1/arbetsdag?datum=gte.{START_DATE}"
        f"&select=medarbetare_id,datum,start_tid,slut_tid,bekraftad,rast_min"
    )
    befintliga = {(r['medarbetare_id'], r['datum']): r for r in befintliga_rader}
    print(f"  {len(befintliga)} befintliga arbetsdag-rader\n")

    # ──────────────────────────────────────────────────────────
    # DRY-RUN RAPPORT
    # ──────────────────────────────────────────────────────────

    # Hitta medarbetare-id för referensförarna
    def find_id(sok):
        for mid, n in namn_map.items():
            if sok.lower() in n.lower():
                return mid
        return None

    max_id = find_id('Max Karlsson')
    stefan_id = find_id('Stefan Karlsson')
    daniel_id = find_id('Daniel Johansson')

    # 1. TIDSZONSVERIFIERING — 1-skift-dagar (tiderna ska vara IDENTISKA)
    print("=" * 60)
    print("1. TIDSZONSVERIFIERING (1-skift-dagar — ska vara IDENTISKA)")
    print("=" * 60)
    test_dagar = [
        (max_id, 'Max Karlsson',    '2026-05-20', '07:18-17:10'),
        (max_id, 'Max Karlsson',    '2026-05-18', '07:00-17:19'),
        (max_id, 'Max Karlsson',    '2026-05-14', '06:07-20:35'),
        (stefan_id, 'Stefan Karlsson', '2026-05-19', None),
        (daniel_id, 'Daniel Johansson', '2026-05-19', None),
    ]
    for mid, namn, datum, forvantad in test_dagar:
        if not mid:
            print(f"  ? Hittade inte medarbetare-id för {namn}")
            continue
        befintlig = befintliga.get((mid, datum))
        ny = next(
            (r for r in arbetsdag_rows if r['medarbetare_id'] == mid and r['datum'] == datum),
            None,
        )
        if not befintlig and not ny:
            print(f"  - {namn} {datum}: ingen data")
            continue
        f_start = (befintlig.get('start_tid') or '')[:5] if befintlig else ''
        f_slut = (befintlig.get('slut_tid') or '')[:5] if befintlig else ''
        fore = f"{f_start}-{f_slut}" if f_start and f_slut else 'saknas'
        e_start = ny['start_tid'] if ny and ny['start_tid'] else ''
        e_slut = ny['slut_tid'] if ny and ny['slut_tid'] else ''
        efter = f"{e_start}-{e_slut}" if e_start and e_slut else 'saknas'
        match = 'OK' if fore == efter else 'DIFF !!!'
        forv = f" (förväntat {forvantad})" if forvantad else ""
        print(f"  {namn} {datum}{forv}:")
        print(f"    Före:  {fore}")
        print(f"    Efter: {efter}  [{match}]")

    # 2. MULTI-SKIFT-FÖRBÄTTRING
    print()
    print("=" * 60)
    print("2. MULTI-SKIFT-FÖRBÄTTRING (förväntat: kraftig ökning)")
    print("=" * 60)
    multi_dagar = [
        (max_id, 'Max Karlsson', '2026-05-05', 9.4),
        (max_id, 'Max Karlsson', '2026-05-04', 8.5),
    ]
    for mid, namn, datum, forv_h in multi_dagar:
        if not mid:
            continue
        befintlig = befintliga.get((mid, datum))
        ny = next(
            (r for r in arbetsdag_rows if r['medarbetare_id'] == mid and r['datum'] == datum),
            None,
        )
        f_start = (befintlig.get('start_tid') or '')[:5] if befintlig else ''
        f_slut = (befintlig.get('slut_tid') or '')[:5] if befintlig else ''
        fore_h = _tim(f_start, f_slut)
        e_start = ny['start_tid'] if ny and ny['start_tid'] else ''
        e_slut = ny['slut_tid'] if ny and ny['slut_tid'] else ''
        efter_h = _tim(e_start, e_slut)
        fore_str = f"{f_start}-{f_slut} ({fore_h:.1f}h)" if fore_h is not None else 'saknas'
        efter_str = f"{e_start}-{e_slut} ({efter_h:.1f}h)" if efter_h is not None else 'saknas'
        print(f"  {namn} {datum} (förväntat ~{forv_h}h):")
        print(f"    Före:  {fore_str}")
        print(f"    Efter: {efter_str}")

    # 3. SNITT ARBETSTID 2026 EFTER REBUILD
    print()
    print("=" * 60)
    print("3. SNITT ARBETSTID 2026 (efter rebuild, dagar med utloggning)")
    print("=" * 60)
    per_medarb_timmar = defaultdict(list)
    for r in arbetsdag_rows:
        if r['start_tid'] and r['slut_tid']:
            span_h = _tim(r['start_tid'], r['slut_tid'])
            if span_h and span_h > 0:
                # Dra av rast för korrekt arbetstid
                arb_h = span_h - (r['rast_min'] / 60)
                if arb_h > 0:
                    per_medarb_timmar[r['medarbetare_id']].append(arb_h)
    print("  Förväntat: Stefan 10.1, Daniel 9.5, Oskar 9.4, Max 9.3, Joacim 8.0, Martin 7.7")
    print()
    for mid, timmar_list in sorted(
        per_medarb_timmar.items(),
        key=lambda x: -(sum(x[1]) / len(x[1])) if x[1] else 0,
    ):
        snitt = sum(timmar_list) / len(timmar_list)
        namn = namn_map.get(mid, mid[:8])
        print(f"  {namn}: {snitt:.1f}h ({len(timmar_list)} dagar)")

    # 4. RAST-OMFATTNING
    print()
    print("=" * 60)
    print("4. RAST-OMFATTNING (Rottne saknar 'Meal break' — väntat 0)")
    print("=" * 60)
    rast_med = sum(1 for r in arbetsdag_rows if r['rast_min'] > 0)
    rast_utan = sum(1 for r in arbetsdag_rows if r['rast_min'] == 0)
    print(f"  Totalt: dagar med rast > 0: {rast_med},  rast = 0: {rast_utan}")
    print()
    for mid in sorted(per_medarb_timmar.keys()):
        med_rader = [r for r in arbetsdag_rows if r['medarbetare_id'] == mid]
        med_rast = sum(1 for r in med_rader if r['rast_min'] > 0)
        utan_rast = sum(1 for r in med_rader if r['rast_min'] == 0)
        namn = namn_map.get(mid, mid[:8])
        print(f"    {namn}: rast {med_rast}, utan rast {utan_rast}")

    # 5. BEKRÄFTADE RADER + SAKNAD UTLOGGNING
    print()
    print("=" * 60)
    print("5. BEKRÄFTADE + SAKNAD UTLOGGNING")
    print("=" * 60)
    bekraftade_som_nollas = sum(
        1 for r in arbetsdag_rows
        if befintliga.get((r['medarbetare_id'], r['datum']), {}).get('bekraftad')
    )
    saknad_utl = [r for r in arbetsdag_rows if r['slut_tid'] is None]
    print(f"  Bekräftade dagar som nollställs (bekraftad=true -> false): {bekraftade_som_nollas}")
    print(f"  Dagar med saknad utloggning (slut_tid = NULL): {len(saknad_utl)}")
    print(f"  Skräp-skift skippade (< 300 sek): {skippade_skraep}")
    print(f"  Skift med okänd operator (ej i operator_medarbetare): {okand_operator}")
    if saknad_utl:
        print(f"  Exempel på dagar utan utloggning:")
        for r in saknad_utl[:5]:
            namn = namn_map.get(r['medarbetare_id'], r['medarbetare_id'][:8])
            print(f"    {namn} {r['datum']}: start {r['start_tid']}, slut NULL")

    print()
    print("=" * 60)
    print(f"Totalt: {len(arbetsdag_rows)} arbetsdag-rader skulle UPSERT:as")
    print("=" * 60)

    if DRY_RUN:
        print()
        print("=" * 60)
        print("DRY RUN — inget skrevs till databasen")
        print("=" * 60)
        return

    # ─── Skarp körning ───
    print()
    print("Skarp körning — UPSERT:ar arbetsdag-rader i batchar...")
    batch_size = 100
    total = 0
    for i in range(0, len(arbetsdag_rows), batch_size):
        batch = arbetsdag_rows[i:i + batch_size]
        n = upsert_data('arbetsdag', batch, ['medarbetare_id', 'datum'])
        if n:
            total += n
        print(f"  Batch {i // batch_size + 1}: {n}/{len(batch)} sparade")
    print()
    print(f"Klart. {total} arbetsdag-rader uppdaterade.")
    print(f"Bekräftade dagar nollställdes ({bekraftade_som_nollas} st) — förare granskar om vid nästa app-öppning.")


if __name__ == '__main__':
    main()
