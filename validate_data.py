#!/usr/bin/env python3
"""
Validera fakt_produktion vs fakt_tid och reimportera MOM-filer vid saknad tidsdata.

Hittar dagar där fakt_produktion har data men fakt_tid saknar processing_sek
(= 0 eller rad saknas). Reimporterar alla MOM-filer som täcker dessa datum.
"""
import sys, os, glob, requests, urllib.parse
from datetime import datetime, timedelta
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# ── Load env ──
env = {}
env_path = os.path.join(os.path.dirname(__file__), '.env.local')
for line in open(env_path, encoding='utf-8'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()

SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY', env['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
HEADERS = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
HEADERS_DEL = {**HEADERS, 'Prefer': 'return=minimal'}

MASKIN_IDS = ['PONS20SDJAA270231', 'R64101', 'R64428', 'A030353', 'A110148']
MOM_BASE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer\Behandlade"


def fetch_all(table, select, filters):
    """Fetch with pagination (Supabase max 1000 rows)."""
    rows = []
    offset = 0
    while True:
        params = f"select={select}&{filters}&limit=1000&offset={offset}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=HEADERS)
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


def find_missing_tid():
    """Find (maskin_id, datum) where prod exists but tid is missing/zero."""
    missing = []  # [(maskin_id, datum, prod_vol, tid_proc)]

    for mid in MASKIN_IDS:
        print(f"\n{'='*60}")
        print(f"Maskin: {mid}")
        print(f"{'='*60}")

        # Fetch prod grouped by datum
        prod_rows = fetch_all('fakt_produktion', 'datum,volym_m3sub', f'maskin_id=eq.{mid}&order=datum')
        prod_by_day = defaultdict(float)
        for r in prod_rows:
            if r['datum']:
                prod_by_day[r['datum']] += r['volym_m3sub'] or 0

        # Fetch tid
        tid_rows = fetch_all('fakt_tid', 'datum,processing_sek,terrain_sek,engine_time_sek',
                             f'maskin_id=eq.{mid}&order=datum')
        tid_by_day = defaultdict(lambda: {'proc': 0, 'terrain': 0, 'engine': 0})
        for r in tid_rows:
            if r['datum']:
                tid_by_day[r['datum']]['proc'] += r['processing_sek'] or 0
                tid_by_day[r['datum']]['terrain'] += r['terrain_sek'] or 0
                tid_by_day[r['datum']]['engine'] += r['engine_time_sek'] or 0

        prod_days = sorted(prod_by_day.keys())
        ok = 0
        bad = 0
        for d in prod_days:
            vol = prod_by_day[d]
            if vol < 1:
                continue
            t = tid_by_day.get(d)
            if not t or t['proc'] == 0:
                print(f"  ✗ {d}: prod={vol:.0f} m³  tid: proc={t['proc'] if t else 'SAKNAS'}, engine={t['engine'] if t else 'SAKNAS'}")
                missing.append((mid, d, vol, t['proc'] if t else 0))
                bad += 1
            else:
                ok += 1

        print(f"  Resultat: {ok} OK, {bad} saknar tidsdata")

    return missing


def find_mom_files_for_dates(maskin_id, dates):
    """Find MOM files in Behandlade that cover given dates."""
    mom_dir = os.path.join(MOM_BASE, maskin_id, 'MOM')
    if not os.path.isdir(mom_dir):
        print(f"  Varning: MOM-mapp saknas: {mom_dir}")
        return []

    all_moms = sorted(glob.glob(os.path.join(mom_dir, '*.mom')))
    # MOM filenames contain date as YYYYMMDD in the timestamp part
    # e.g. "Göljahult RP 2025_PONS20SDJAA270231_20260308065402.mom"
    # The file's MOM data may cover the day before the timestamp too.
    # We match files whose timestamp is on the target date OR the day after.
    matched = set()
    for d in dates:
        dt = datetime.strptime(d, '%Y-%m-%d')
        # Match files with timestamp on this date or next day (MOM files are created at end of session)
        for offset_days in [0, 1, 2]:
            check_date = (dt + timedelta(days=offset_days)).strftime('%Y%m%d')
            for f in all_moms:
                bn = os.path.basename(f)
                if check_date in bn:
                    matched.add(f)

    return sorted(matched)


def reimport_files(maskin_id, dates, files):
    """Clear meta + fakt_tid for affected dates and reimport MOM files."""
    print(f"\n  Rensar meta + fakt_tid för {maskin_id} datum {dates}...")

    # Delete meta entries for these files
    for f in files:
        fn = os.path.basename(f)
        enc = urllib.parse.quote(fn)
        requests.delete(f"{SUPABASE_URL}/rest/v1/meta_importerade_filer?filnamn=eq.{enc}", headers=HEADERS_DEL)

    # Delete fakt_tid for affected dates
    for d in dates:
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/fakt_tid?maskin_id=eq.{maskin_id}&datum=eq.{d}",
            headers=HEADERS_DEL
        )

    # Import files in order using the import engine
    import skogsmaskin_import_version_6 as imp
    if not hasattr(imp, '_supabase_initialized'):
        imp.init_supabase()
        imp._supabase_initialized = True
    imp._GLOBAL_TID_ENTRIES = {}
    imp._GLOBAL_TID_OPERATORS = {}

    success = 0
    for f in files:
        result = imp.process_file(f)
        if result:
            success += 1

    return success


def verify_fix(maskin_id, dates):
    """Check fakt_tid after reimport."""
    for d in dates:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/fakt_tid?maskin_id=eq.{maskin_id}&datum=eq.{d}"
            f"&select=datum,objekt_id,processing_sek,terrain_sek,engine_time_sek,bransle_liter",
            headers=HEADERS
        )
        rows = r.json()
        if not rows:
            print(f"  ⚠ {d}: Fortfarande ingen fakt_tid!")
        else:
            for row in rows:
                status = '✓' if row['processing_sek'] and row['processing_sek'] > 0 else '⚠'
                print(f"  {status} {d} obj={row['objekt_id']}: proc={row['processing_sek']} terrain={row['terrain_sek']} engine={row['engine_time_sek']} bränsle={row['bransle_liter']}")


def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║  VALIDERA fakt_produktion vs fakt_tid           ║")
    print("╚══════════════════════════════════════════════════╝")

    # Step 1: Find missing
    missing = find_missing_tid()

    if not missing:
        print("\n✓ Inga saknade tidsdata hittades!")
        return

    print(f"\n{'='*60}")
    print(f"TOTALT: {len(missing)} dagar med produktion men saknad tidsdata")
    print(f"{'='*60}")

    # Step 2: Group by maskin_id
    by_maskin = defaultdict(list)
    for mid, d, vol, proc in missing:
        by_maskin[mid].append(d)

    # Step 3: For each maskin, find MOM files and reimport
    for mid, dates in by_maskin.items():
        print(f"\n{'='*60}")
        print(f"REIMPORT: {mid} — {len(dates)} datum")
        print(f"{'='*60}")

        files = find_mom_files_for_dates(mid, dates)
        if not files:
            print(f"  Inga MOM-filer hittades för dessa datum!")
            continue

        print(f"  Hittade {len(files)} MOM-filer:")
        for f in files:
            print(f"    {os.path.basename(f)}")

        n = reimport_files(mid, dates, files)
        print(f"\n  Reimporterade: {n}/{len(files)} filer")

        # Step 4: Verify
        print(f"\n  Verifiering efter reimport:")
        verify_fix(mid, dates)

    # Final summary
    print(f"\n{'='*60}")
    print("KLAR!")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
