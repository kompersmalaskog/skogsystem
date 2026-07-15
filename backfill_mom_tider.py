#!/usr/bin/env python3
"""
backfill_mom_tider.py
=====================
Fyller mom_tider med timvisa tidssegment fran befintliga MOM-filer i Behandlade/.

ISOLERAT: Ror ENBART mom_tider. Inga andra tabeller berors.
IDEMPOTENT: DAG-REBUILD (delete + insert) per (maskin_id, timme) - safe att kora om.

MOM-filer ar kumulativa (varje ny fil innehaller all tidigare data + nytt).
Deduplikering sker pa segmentniva: (maskin_id, op_id, start_time, typ) - sista fil vinner.
Identisk logik som importkodens raw_tid_entries-dict.

Anvandning:
    # Test: EN maskin, EN manad
    python backfill_mom_tider.py --maskin PONS20SDJAA270231 --fran 2026-03-01 --till 2026-03-31

    # Visa timvis rapport for ett specifikt dygn (ingen andring i DB)
    python backfill_mom_tider.py --maskin PONS20SDJAA270231 --fran 2026-03-10 --till 2026-03-10 --datum 2026-03-10

    # Full backfill - kor efter att testdygnet ar godkant
    python backfill_mom_tider.py
"""

import os
import sys
import json
import logging
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, date as date_t, timedelta
from pathlib import Path
from collections import defaultdict
import requests

# -- Konfiguration -----------------------------------------------------------

BEHANDLADE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer\Behandlade"

def _load_env():
    env_path = Path(__file__).parent / '.env.local'
    env = {}
    if env_path.exists():
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

_env = _load_env()
SUPABASE_URL = _env.get('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = _env.get('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("FEL: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY saknas i .env.local")
    sys.exit(1)

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

TYP_FIELDS = [
    ('processing_sek',  'processing'),
    ('terrain_sek',     'terrain'),
    ('kort_stopp_sek',  'kort_stopp'),
    ('other_work_sek',  'other'),
    ('disturbance_sek', 'disturbance'),
]
TYP_MAP = {f: t for f, t in TYP_FIELDS}

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('backfill_mom_tider')


# -- XML-helpers (samma logik som importkoden) --------------------------------

def _ns(root):
    return root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''

def _el(parent, tag, ns=''):
    if ns:
        el = parent.find(f'{ns}{tag}')
        if el is not None:
            return el
    return parent.find(tag)

def _all(parent, tag, ns=''):
    if ns:
        els = parent.findall(f'{ns}{tag}')
        if els:
            return els
    return parent.findall(tag)

def _txt(parent, tag, ns=''):
    el = _el(parent, tag, ns)
    return el.text.strip() if el is not None and el.text else ''

def _int(val):
    try:
        return int(float(val)) if val else 0
    except Exception:
        return 0


# -- Parsning av en MOM-fil --------------------------------------------------

def parse_file_to_segs(filepath: Path, maskin_filter):
    """
    Returnerar rasegment: (maskin_id, op_id, start_time_str, typ) -> sekunder.
    INGEN datumfiltrering har - sker i bucket_segs().

    MOM-filer ar kumulativa. Deduplikering sker i main via dict.update()
    sa att sista fil vinner - identisk logik som importkoden (raw_tid_entries).
    """
    try:
        tree = ET.parse(filepath)
    except ET.ParseError as e:
        log.warning(f"  XML-fel i {filepath.name}: {e}")
        return {}

    root = tree.getroot()
    ns = _ns(root)

    machine = _el(root, 'Machine', ns)
    if machine is None:
        return {}

    maskin_id = _txt(machine, 'BaseMachineManufacturerID', ns) or _txt(machine, 'MachineKey', ns)
    if not maskin_id:
        return {}

    # Normalisera Rottne-ID: siffror utan prefix -> R{siffror}
    # Identisk logik som normalize_maskin_id() i importkoden.
    tillverkare = _txt(machine, 'MachineBaseManufacturer', ns)
    if (tillverkare and 'rottne' in tillverkare.lower() and maskin_id.isdigit()) \
            or (maskin_id.isdigit() and len(maskin_id) == 5):
        maskin_id = f'R{maskin_id}'

    if maskin_filter and maskin_id != maskin_filter:
        return {}

    segs = {}  # (maskin_id, op_id, start_time_str, typ) -> sekunder

    def _add(start_str, op_key, field, sek):
        if sek <= 0 or not start_str:
            return
        op_id = f"{maskin_id}_{op_key}" if op_key else None
        k = (maskin_id, op_id, start_str, TYP_MAP[field])
        segs[k] = sek  # Overwrite - sista fil vinner (kumulativ-dedup)

    # IndividualMachineWorkTime
    for wt in _all(machine, 'IndividualMachineWorkTime', ns):
        op_key  = _txt(wt, 'OperatorKey', ns)
        start   = _txt(wt, 'MonitoringStartTime', ns)
        dur     = _int(_txt(wt, 'MonitoringTimeLength', ns))
        run_cat = _el(wt, 'IndividualMachineRunTimeCategory', ns)
        down    = _el(wt, 'IndividualMachineDownTime', ns)

        if run_cat is not None and run_cat.text:
            cat = run_cat.text.strip()
            if cat == 'Processing':
                _add(start, op_key, 'processing_sek', dur)
            elif cat == 'Terrain travel':
                _add(start, op_key, 'terrain_sek', dur)
            else:
                _add(start, op_key, 'other_work_sek', dur)
        elif down is not None:
            if _el(down, 'Disturbance', ns) is not None:
                _add(start, op_key, 'disturbance_sek', dur)
            # Maintenance/Repair - ej i Alternativ A

    # IndividualShortDownTime
    for sd in _all(machine, 'IndividualShortDownTime', ns):
        op_key = _txt(sd, 'OperatorKey', ns)
        start  = _txt(sd, 'MonitoringStartTime', ns)
        dur    = _int(_txt(sd, 'MonitoringTimeLength', ns))
        _add(start, op_key, 'kort_stopp_sek', dur)

    return segs


def bucket_segs(all_segs: dict, fran, till) -> dict:
    """
    Konverterar deduplicerade rasegment -> timvisa buckets MED TIMDELNING.
    Nyckeln: (maskin_id, op_id, timme_utc, typ) -> sekunder.

    Segment som korsar timgranser delas proportionellt efter faktisk tid i varje hink:
      06:52+01:00 start, 99 min => kl 6: 7 min, kl 7: 60 min, kl 8: 32 min.

    Datumfiltret appliceras pa varje chunks lokala datum (inte bara starttiden).
    datetime.fromisoformat() bevarar UTC-offset - parse_datetime() i importkoden
    STRIPPAR den, anvand INTE den.
    """
    agg = {}
    for (maskin_id, op_id, start_str, typ), sek in all_segs.items():
        try:
            dt_start = datetime.fromisoformat(start_str)
        except Exception:
            continue

        # Pre-filter: startdatum langt utanfor intervallet (+ 1 dags marginal)
        start_date = dt_start.date()
        if fran and start_date < fran - timedelta(days=1):
            continue
        if till and start_date > till + timedelta(days=1):
            continue

        dt_end = dt_start + timedelta(seconds=sek)

        # Dela upp segmentet per lokal heltimme
        current = dt_start
        while current < dt_end:
            # Nasta heltimme i lokal tid (offset foljder med replace)
            next_hour = (current.replace(minute=0, second=0, microsecond=0)
                         + timedelta(hours=1))
            chunk_end = min(next_hour, dt_end)
            chunk_sek = (chunk_end - current).total_seconds()

            if chunk_sek <= 0:
                current = next_hour
                continue

            # Hinkens lokal-heltimme -> UTC
            hour_local = current.replace(minute=0, second=0, microsecond=0)
            hour_utc = hour_local.astimezone(timezone.utc)

            # Datumfilter pa chunkets lokala datum
            chunk_date = hour_local.date()
            if fran and chunk_date < fran:
                current = next_hour
                continue
            if till and chunk_date > till:
                break  # Tid gar framat, ingen mening att fortsatta

            timme_utc = hour_utc.strftime('%Y-%m-%dT%H:%M:%SZ')
            k = (maskin_id, op_id, timme_utc, typ)
            agg[k] = agg.get(k, 0) + chunk_sek

            current = next_hour
    return agg


# -- Hitta MOM-filer ---------------------------------------------------------

def find_mom_files(maskin_filter):
    """Returnerar sorterad lista med MOM-filer under Behandlade/{maskin}/MOM/."""
    behandlade = Path(BEHANDLADE)
    if not behandlade.exists():
        log.error(f"Behandlade-mapp saknas: {behandlade}")
        return []

    files = []
    if maskin_filter:
        # Prova bade 'mom' och 'MOM' (Windows case-insensitive men glob kan variera)
        for sub in ['mom', 'MOM', 'Mom']:
            mom_dir = behandlade / maskin_filter / sub
            if mom_dir.exists():
                files = sorted(mom_dir.glob('*.mom')) + sorted(mom_dir.glob('*.MOM'))
                break
    else:
        for maskin_dir in sorted(behandlade.iterdir()):
            if not maskin_dir.is_dir():
                continue
            for sub in ['mom', 'MOM', 'Mom']:
                mom_dir = maskin_dir / sub
                if mom_dir.exists():
                    files.extend(sorted(mom_dir.glob('*.mom')) + sorted(mom_dir.glob('*.MOM')))
                    break

    return files


# -- Supabase-skrivning ------------------------------------------------------

def write_to_db(rows: list) -> bool:
    """DAG-REBUILD: delete per (maskin_id, timme), sedan insert i batchar."""
    if not rows:
        return True

    to_delete = defaultdict(set)
    for r in rows:
        to_delete[r['maskin_id']].add(r['timme'])

    for del_maskin, timme_set in to_delete.items():
        timme_list = sorted(timme_set)
        for i in range(0, len(timme_list), 20):
            chunk = ','.join(timme_list[i:i + 20])
            try:
                requests.delete(
                    f"{SUPABASE_URL}/rest/v1/mom_tider"
                    f"?maskin_id=eq.{del_maskin}&timme=in.({chunk})",
                    headers=HEADERS, timeout=60,
                )
            except Exception as e:
                log.warning(f"  Delete-fel {del_maskin}: {e}")

    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/mom_tider",
            headers=HEADERS,
            data=json.dumps(batch),
            timeout=60,
        )
        if resp.status_code not in (200, 201):
            log.error(f"  Insert-fel: {resp.status_code} {resp.text[:300]}")
            return False

    return True


# -- Rapport -----------------------------------------------------------------

def print_dag_rapport(agg: dict, datum_str: str):
    """Timvis breakdown for ett specifikt datum (YYYY-MM-DD), lokal tid."""
    datum = date_t.fromisoformat(datum_str)

    dag_rader = defaultdict(int)  # (local_h, typ) -> min
    for (maskin_id, op_id, timme_utc, typ), sek in agg.items():
        try:
            dt_utc = datetime.fromisoformat(timme_utc.replace('Z', '+00:00'))
        except Exception:
            continue
        utc_h = dt_utc.hour
        # CET = +01 (nov-mars), CEST = +02 (apr-okt).
        # DST borjar sista sondagen i mars, slutar sista sondagen i okt.
        # Approximation: mars = CET (+1), april-oktober = CEST (+2).
        m = dt_utc.month
        utc_offset = 2 if (4 <= m <= 10) else 1
        local_h = (utc_h + utc_offset) % 24
        local_date = dt_utc.date()
        if local_h < utc_h:  # midnatt-overgangen
            local_date = local_date + timedelta(days=1)
        if local_date != datum:
            continue
        dag_rader[(local_h, typ)] += round(sek / 60)

    if not dag_rader:
        print(f"  (inga rader for {datum_str})")
        return

    print(f"\n  Dygn {datum_str} (lokal tid):")
    print(f"  {'kl':>4}  {'processing':>10}  {'terrain':>7}  {'kort_stopp':>10}  {'other':>5}  {'disturbance':>11}")
    for h in range(24):
        proc  = dag_rader.get((h, 'processing'),  0)
        terr  = dag_rader.get((h, 'terrain'),      0)
        kort  = dag_rader.get((h, 'kort_stopp'),   0)
        other = dag_rader.get((h, 'other'),        0)
        dist  = dag_rader.get((h, 'disturbance'),  0)
        if proc + terr + kort + other + dist == 0:
            continue
        print(f"  {h:>4}  {proc:>10}  {terr:>7}  {kort:>10}  {other:>5}  {dist:>11}  min")


# -- Huvudflode --------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description='Backfill mom_tider fran Behandlade MOM-filer')
    ap.add_argument('--maskin', help='Filtrera pa maskin_id (t.ex. PONS20SDJAA270231)')
    ap.add_argument('--fran',   help='Startdatum YYYY-MM-DD')
    ap.add_argument('--till',   help='Slutdatum YYYY-MM-DD')
    ap.add_argument('--datum',  help='Visa timvis rapport for ett datum (dry-run)')
    ap.add_argument('--dry-run', action='store_true', help='Rakna rader, skriv ej till DB')
    args = ap.parse_args()

    maskin_filter = args.maskin
    fran = date_t.fromisoformat(args.fran) if args.fran else None
    till = date_t.fromisoformat(args.till) if args.till else None
    dry_run = args.dry_run or bool(args.datum)

    log.info(f"Backfill mom_tider - maskin={maskin_filter or 'alla'} "
             f"fran={fran or 'alla'} till={till or 'alla'} "
             f"{'DRY-RUN' if dry_run else 'SKRIVER TILL DB'}")

    files = find_mom_files(maskin_filter)
    if not files:
        log.error("Inga MOM-filer hittades.")
        sys.exit(1)

    log.info(f"Hittade {len(files)} MOM-fil(er)")

    # Bygg global segmentdict - sista fil vinner (kumulativ-dedup)
    all_segs: dict = {}
    for i, filepath in enumerate(files, 1):
        file_segs = parse_file_to_segs(filepath, maskin_filter)
        all_segs.update(file_segs)  # Overwrite - sista fil vinner
        if i % 100 == 0:
            log.info(f"  Parsade {i}/{len(files)} filer ({len(all_segs)} unika segment hittills)...")

    log.info(f"Deduplicerade segment: {len(all_segs)} unika (maskin, op, start_time, typ)")

    # Bucket efter datumfilter
    global_agg = bucket_segs(all_segs, fran, till)

    # Summering per maskin + dag (UTC-datum)
    per_dag = defaultdict(lambda: defaultdict(int))
    for (maskin, op, timme_utc, typ), sek in global_agg.items():
        dag = timme_utc[:10]
        per_dag[maskin][dag] += round(sek / 60)

    log.info(f"\n{'--'*30}")
    log.info(f"SUMMERING per maskin/dag (minuter totalt, UTC-datum):")
    for maskin in sorted(per_dag):
        log.info(f"  {maskin}:")
        for dag in sorted(per_dag[maskin]):
            log.info(f"    {dag}: {per_dag[maskin][dag]} min")
    log.info(f"  Timrader totalt: {len(global_agg)}")

    if args.datum:
        print_dag_rapport(global_agg, args.datum)

    if dry_run:
        log.info("DRY-RUN klar - inget skrevs till DB")
        return

    rows = [
        {
            'maskin_id':   k[0],
            'operator_id': k[1],
            'timme':       k[2],
            'typ':         k[3],
            'minuter':     round(v / 60),
        }
        for k, v in global_agg.items()
        if round(v / 60) > 0
    ]

    log.info(f"Skriver {len(rows)} rader till mom_tider ...")
    if write_to_db(rows):
        log.info(f"OK - {len(rows)} rader sparade")
    else:
        log.error("Misslyckades - se ovan")
        sys.exit(1)


if __name__ == '__main__':
    main()
