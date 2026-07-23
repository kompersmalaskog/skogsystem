#!/usr/bin/env python3
"""
backfill_fordelning_hpr.py — engångsimport av arkiverade .hpr-filer till
fördelningsuppföljningen (/api/hpr-import).

Importerar ALLA filer per objekt i kronologisk ordning — INTE senaste per
objekt. Skäl (verifierat mot Hushållningssällskapet-serien):
  - Scorpions export tar max 4000 stammar per fil. Vid taket rullar maskinen
    över till en fortsättningsfil (_1, _2 …) som BARA innehåller stammarna
    efter 4000. "Senaste filen" kan alltså vara enbart fortsättningen.
  - Unionen av alla filer via API:ets upsert på (object_key, stem_key,
    log_key) ger komplett stockdata; filhash-dedupen gör omkörning ofarlig.
  - distribution_snapshots stämplas av API:et med filens CreationDate, så
    kronologisk import av alla filer ger en SANN historik.

Körning:
  python backfill_fordelning_hpr.py --dry-run
  python backfill_fordelning_hpr.py                       # skarp, Scorpion
  python backfill_fordelning_hpr.py --maskin alla
  python backfill_fordelning_hpr.py --filter Brokamåla
  python backfill_fordelning_hpr.py --api-url https://skogsystem.vercel.app/api/hpr-import

Nycklar (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HPR_IMPORT_KEY)
läses ur miljön, med fallback till .env.local bredvid scriptet.
"""

import argparse
import hashlib
import os
import re
import sys
import time
from pathlib import Path

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BEHANDLADE = Path(r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer\Behandlade")
DEFAULT_MASKIN = "PONS20SDJAA270231"
DEFAULT_API = "http://localhost:3000/api/hpr-import"

# Filnamn slutar på _YYYYMMDDHHMMSS.hpr eller _YYYYMMDDHHMMSS_N.hpr (delfil
# efter 4000-stammarstaket). Sorteringsnyckel = (tidsstämpel, delnummer).
TS_RE = re.compile(r"_(\d{14})(?:_(\d+))?\.hpr$", re.IGNORECASE)


def env_local(name: str) -> str | None:
    if os.environ.get(name):
        return os.environ[name]
    try:
        with open(os.path.join(SCRIPT_DIR, ".env.local"), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


def sort_key(p: Path):
    m = TS_RE.search(p.name)
    if not m:
        return ("0", 0, p.stat().st_mtime)  # oparsbart namn: mtime, före allt daterat
    return (m.group(1), int(m.group(2) or 0), 0)


def collect(maskin: str, name_filter: str | None, fillista: str | None) -> list[Path]:
    if maskin == "alla":
        dirs = sorted(BEHANDLADE.glob("*/HPR"))
    else:
        dirs = [BEHANDLADE / maskin / "HPR"]
    files: list[Path] = []
    for d in dirs:
        if not d.is_dir():
            print(f"VARNING: {d} finns inte — hoppar över")
            continue
        files += [p for p in d.glob("*.hpr")] + [p for p in d.glob("*.HPR")]
    files = sorted(set(files), key=sort_key)
    if name_filter:
        files = [p for p in files if name_filter.lower() in p.name.lower()]
    if fillista:
        # Exakt namnlista (en per rad) — t.ex. filer som avvisades i en tidigare
        # körning. Saknade namn larmas, aldrig tyst tappade.
        onskade = [r.strip() for r in open(fillista, encoding="utf-8") if r.strip()]
        hittade = {p.name: p for p in files}
        saknas = [n for n in onskade if n not in hittade]
        if saknas:
            print(f"VARNING: {len(saknas)} namn i {fillista} hittades INTE bland filerna:")
            for n in saknas[:10]:
                print(f"    {n}")
        files = sorted({hittade[n] for n in onskade if n in hittade}, key=sort_key)
    return files


def post_file(p: Path, api_url: str, supabase_url: str, service_key: str, import_key: str) -> str:
    data = p.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    storage_path = f"incoming/{digest}.hpr"
    up = requests.post(
        f"{supabase_url}/storage/v1/object/raw-files/{storage_path}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/xml",
            "x-upsert": "true",
        },
        data=data,
        timeout=300,
    )
    if up.status_code not in (200, 201):
        return f"storage_fel {up.status_code}: {up.text[:150]}"
    # skip_raw_copy: originalen ligger kvar i OneDrive (Behandlade/) — en
    # permanent Storage-kopia av hela arkivet vore ~8 GB dubbellagring.
    # Staging-filen städas av API:et som vanligt. Löpande drift (watchdogen)
    # sätter INTE flaggan; där är Storage-kopian enda arkivet.
    resp = requests.post(
        api_url,
        params={"key": import_key},
        json={"storage_path": storage_path, "skip_raw_copy": True, "source_name": p.name},
        timeout=180,
    )
    if resp.status_code not in (200, 422):
        return f"api_fel {resp.status_code}: {resp.text[:150]}"
    body = resp.json()
    status = body.get("status", "?")
    if status == "imported":
        extra = f" [{body.get('objectKey')}{' COMPLETED' if body.get('objectStatus') == 'completed' else ''}]"
        return "imported" + extra
    if status == "validation_failed":
        errs = (body.get("validation") or {}).get("errors") or []
        return f"validation_failed: {'; '.join(errs)[:150]}"
    return status  # duplicate m.m.


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--maskin", default=DEFAULT_MASKIN,
                    help=f"maskin-id eller 'alla' (default {DEFAULT_MASKIN})")
    ap.add_argument("--filter", default=None, help="substräng i filnamnet")
    ap.add_argument("--fillista", default=None,
                    help="textfil med exakta filnamn, ett per rad (t.ex. tidigare avvisade)")
    ap.add_argument("--api-url", default=DEFAULT_API)
    args = ap.parse_args()

    files = collect(args.maskin, args.filter, args.fillista)
    total_mb = sum(p.stat().st_size for p in files) / 1e6

    # Objektöversikt: gruppera på filnamnets objekt-del (allt före _MASKINID)
    per_obj: dict[str, int] = {}
    for p in files:
        obj = re.split(r"_[A-Z]\w*\d{6,}_", p.name)[0]
        per_obj[obj] = per_obj.get(obj, 0) + 1

    print(f"{len(files)} filer ({total_mb:.0f} MB) i kronologisk ordning, "
          f"{len(per_obj)} objekt (per filnamn):")
    for obj, n in sorted(per_obj.items()):
        print(f"  {n:4d}  {obj}")

    if args.dry_run:
        print("\n--dry-run: inget importerat. Full fillista:")
        for p in files:
            print(f"  {p.name}")
        return

    supabase_url = env_local("NEXT_PUBLIC_SUPABASE_URL") or env_local("SUPABASE_URL")
    service_key = env_local("SUPABASE_SERVICE_ROLE_KEY")
    import_key = env_local("HPR_IMPORT_KEY")
    if not (supabase_url and service_key and import_key):
        print("FEL: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/HPR_IMPORT_KEY saknas.")
        sys.exit(1)

    counts: dict[str, int] = {}
    failures: list[str] = []
    completed: list[str] = []
    t0 = time.time()
    for i, p in enumerate(files, 1):
        try:
            res = post_file(p, args.api_url, supabase_url, service_key, import_key)
        except Exception as e:
            # requests-fel kan innehålla URL:en inkl ?key=... — läck aldrig nyckeln
            res = f"undantag: {re.sub(r'key=[^&\\s]+', 'key=***', str(e))}"
        kind = res.split(" ")[0].rstrip(":")
        counts[kind] = counts.get(kind, 0) + 1
        if kind not in ("imported", "duplicate"):
            failures.append(f"{p.name}: {res}")
        if "COMPLETED" in res:
            completed.append(f"{p.name}: {res}")
        print(f"[{i}/{len(files)}] {p.name}: {res}", flush=True)

    print(f"\nKLART på {(time.time() - t0) / 60:.1f} min. Utfall: {counts}")
    if completed:
        print(f"\nObjekt som fick EndDate/completed ({len(completed)}):")
        for c in completed:
            print(f"  {c}")
    else:
        print("\nInga filer bar EndDate — inga objekt auto-avslutades.")
    if failures:
        print(f"\nMISSLYCKADE ({len(failures)}):")
        for f in failures:
            print(f"  {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
