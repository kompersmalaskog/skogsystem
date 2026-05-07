#!/usr/bin/env python3
"""
Per-objekt wipe + reimport av HPR-data.

Anvandning:
    py scripts/wipe-and-reimport-objekt.py <dim_objekt.objekt_id text>
    py scripts/wipe-and-reimport-objekt.py 11124938 --confirm 11124938

Wipear foljande for det angivna objektet:
- detalj_stock (rader med samma objekt_id)
- detalj_stam (rader med samma objekt_id)
- hpr_filer + hpr_stammar (kaskadar via FK)
- meta_importerade_filer (per-filnamn)

Ror INTE dim_sortiment_pris (delad mellan objekt pa samma maskin).

Reimporterar via parse_hpr_file + save_hpr_to_supabase fran huvudskriptet,
sorterat ASC pa filnamn (HPR-timestamp).

Anvand ENBART efter att:
1. Migration A (dim_sortiment_pris) ar applicerad
2. skogsmaskin_import_version_6.py ar patchad (Patch 1-4)
3. auto_import_watch.py ar stoppad

Migration B kors forst EFTER att detta skript verifierat dedupe-fixen.
Slangs efter att MVP-flodet ar genomkort.
"""

import argparse
import os
import sys
import time
import urllib.parse
from typing import List, Dict, Any, Optional

import requests

# Importera fran huvudskriptet (en katalog upp)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from skogsmaskin_import_version_6 import (
    SUPABASE_URL, SUPABASE_KEY, BEHANDLADE,
    parse_hpr_file, save_hpr_to_supabase,
    init_supabase, mark_file_imported,
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}
HEADERS_DELETE = {**HEADERS, "Prefer": "return=minimal"}
HEADERS_COUNT = {**HEADERS, "Prefer": "count=exact"}


def verify_service_role():
    """Avbryt tidigt om SUPABASE_KEY ar anon-key — DELETE blockas av RLS."""
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/dim_objekt?limit=1",
            headers=HEADERS, timeout=10
        )
    except Exception as e:
        sys.exit(f"FEL: kunde inte natna Supabase: {e}")
    if r.status_code in (401, 403):
        sys.exit(f"FEL: SUPABASE_KEY ar inte service-role (HTTP {r.status_code}). "
                 f"Sakerstall att SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY finns "
                 f"i .env.local och har full DML-access.")


def fetch_count(table: str, filter_q: str = "") -> Optional[int]:
    """Rakna rader i en tabell med eventuellt filter."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=*"
    if filter_q:
        url += f"&{filter_q}"
    try:
        resp = requests.head(url, headers=HEADERS_COUNT, timeout=60)
        cr = resp.headers.get('content-range', '0-0/0')
        return int(cr.split('/')[-1])
    except Exception as e:
        print(f"  [WARN] Kunde inte rakna {table}: {e}")
        return None


def fetch_objekt_info(objekt_id_text: str) -> Optional[Dict[str, Any]]:
    """Hamta dim_objekt + objekt-uuid via vo_nummer."""
    url = (f"{SUPABASE_URL}/rest/v1/dim_objekt?select=objekt_id,object_name,atgard,areal_ha"
           f"&objekt_id=eq.{urllib.parse.quote(objekt_id_text, safe='')}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200 or not resp.json():
        return None
    dim = resp.json()[0]

    url2 = (f"{SUPABASE_URL}/rest/v1/objekt?select=id,namn"
            f"&vo_nummer=eq.{urllib.parse.quote(objekt_id_text, safe='')}")
    resp2 = requests.get(url2, headers=HEADERS, timeout=30)
    objekt_uuid = None
    if resp2.status_code == 200 and resp2.json():
        objekt_uuid = resp2.json()[0]['id']
    return {**dim, 'objekt_uuid': objekt_uuid}


def fetch_hpr_filer(objekt_uuid: str) -> List[Dict[str, Any]]:
    """Hamta lista av hpr_filer for det objektet (uuid)."""
    if not objekt_uuid:
        return []
    url = (f"{SUPABASE_URL}/rest/v1/hpr_filer?select=id,filnamn,maskin_id"
           f"&objekt_id=eq.{objekt_uuid}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        return []
    return resp.json()


def find_local_hpr_files(filnamn_list: List[str]) -> List[str]:
    """Hitta motsvarande HPR-filer i Behandlade-mappen."""
    # Walka Behandlade en gang och bygg filnamn-karta
    file_map = {}
    for root, dirs, files in os.walk(BEHANDLADE):
        for f in files:
            if f.upper().endswith('.HPR'):
                file_map[f] = os.path.join(root, f)

    found = []
    missing = []
    for fn in filnamn_list:
        if fn in file_map:
            found.append(file_map[fn])
        else:
            missing.append(fn)

    if missing:
        print(f"  [WARN] Hittade inte {len(missing)} filer i {BEHANDLADE}:")
        for m in missing[:5]:
            print(f"    {m}")
        if len(missing) > 5:
            print(f"    ... och {len(missing)-5} till")

    return found


def wipe_per_objekt(objekt_id_text: str, objekt_uuid: Optional[str], filnamn_list: List[str]):
    """Wipe per-objekt enligt STEG A i flodesdokumentet."""
    print("\nWipe-fas:")

    # 3. detalj_stock
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/detalj_stock"
        f"?objekt_id=eq.{urllib.parse.quote(objekt_id_text, safe='')}",
        headers=HEADERS_DELETE, timeout=300
    )
    print(f"  detalj_stock: HTTP {resp.status_code}")

    # 4. detalj_stam
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/detalj_stam"
        f"?objekt_id=eq.{urllib.parse.quote(objekt_id_text, safe='')}",
        headers=HEADERS_DELETE, timeout=300
    )
    print(f"  detalj_stam: HTTP {resp.status_code}")

    # 5. meta_importerade_filer (per-fil)
    meta_ok = 0
    for fn in filnamn_list:
        fn_q = urllib.parse.quote(fn, safe='')
        resp = requests.delete(
            f"{SUPABASE_URL}/rest/v1/meta_importerade_filer?filnamn=eq.{fn_q}",
            headers=HEADERS_DELETE, timeout=30
        )
        if resp.status_code in (200, 204):
            meta_ok += 1
    print(f"  meta_importerade_filer: {meta_ok}/{len(filnamn_list)} rader rensade")

    # 6. hpr_filer (kaskadar hpr_stammar via FK ON DELETE CASCADE)
    if objekt_uuid:
        resp = requests.delete(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?objekt_id=eq.{objekt_uuid}",
            headers=HEADERS_DELETE, timeout=120
        )
        print(f"  hpr_filer (+kaskad hpr_stammar): HTTP {resp.status_code}")

    # 7. SKIP dim_sortiment_pris (delad mellan objekt pa samma maskin)


def reimport_files(filepaths: List[str]) -> Dict[str, int]:
    """Sortera ASC och kor parse + save for varje fil."""
    filepaths_sorted = sorted(filepaths, key=lambda p: os.path.basename(p))

    print(f"\nReimport-fas: {len(filepaths_sorted)} filer (sorterat ASC pa filnamn)")

    ok = 0
    fel = 0
    for i, filepath in enumerate(filepaths_sorted, 1):
        filnamn = os.path.basename(filepath)
        print(f"  [{i}/{len(filepaths_sorted)}] {filnamn}")
        try:
            data = parse_hpr_file(filepath)
            success = save_hpr_to_supabase(data)
            if success:
                ok += 1
                maskin_id = data.get('maskin', {}).get('maskin_id', 'Okand')
                try:
                    mark_file_imported(filnamn, 'HPR', maskin_id)
                except Exception as e:
                    print(f"    [WARN] kunde inte markera importerad: {e}")
            else:
                fel += 1
                print(f"    [FEL] save_hpr_to_supabase returnerade False")
        except Exception as e:
            fel += 1
            print(f"    [FEL] {e}")

    return {'ok': ok, 'fel': fel, 'total': len(filepaths_sorted)}


def post_verify(objekt_id_text: str, objekt_uuid: Optional[str]):
    """STEG C-verifieringspunkterna fran flodesdokumentet."""
    print("\nVerifiering (STEG C):")

    n_stam = fetch_count('detalj_stam', f"objekt_id=eq.{objekt_id_text}")
    n_stock = fetch_count('detalj_stock', f"objekt_id=eq.{objekt_id_text}")
    print(f"  [12] detalj_stam for {objekt_id_text}: {n_stam}")
    print(f"  [13] detalj_stock for {objekt_id_text}: {n_stock}")
    if n_stam and n_stock and n_stam > 0:
        ratio = n_stock / n_stam
        print(f"       ratio stock/stam: {ratio:.2f}x  (slutavverkning ~3-4x)")

    # 14. count(distinct stam_key) — kraver group-by, gor som spot-check via SQL Editor
    print(f"  [14] kor i SQL Editor: SELECT count(distinct stam_key) FROM detalj_stock"
          f" WHERE objekt_id = '{objekt_id_text}';")

    # 15. dim_sortiment_pris > 0 (totalt och for berorda sortiment)
    n_pris = fetch_count('dim_sortiment_pris')
    print(f"  [15] dim_sortiment_pris (totalt): {n_pris} rader")
    if n_pris == 0:
        print(f"       VARNING: ProductMatrix-lasningen verkar inte ha funkat!")

    if objekt_uuid:
        n_filer = fetch_count('hpr_filer', f"objekt_id=eq.{objekt_uuid}")
        print(f"  hpr_filer for objektet: {n_filer}")


def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument('objekt_id', help="dim_objekt.objekt_id (text), t.ex. 11124938")
    p.add_argument('--confirm',
                   help="Hoppa over interaktiv prompt om vardet matchar objekt_id")
    args = p.parse_args()

    objekt_id_text = args.objekt_id

    if not init_supabase():
        print("FEL: Kunde inte ansluta till Supabase")
        sys.exit(1)

    # Sakerstall att vi har service-role (DELETE blockas av RLS pa anon-key)
    verify_service_role()

    # 1. Objekt-info
    info = fetch_objekt_info(objekt_id_text)
    if not info:
        print(f"FEL: Hittade inte dim_objekt med objekt_id='{objekt_id_text}'")
        sys.exit(1)

    print("=" * 60)
    print(f"Objekt:     {info['objekt_id']}")
    print(f"Namn:       {info.get('object_name') or '-'}")
    print(f"Atgard:     {info.get('atgard') or '-'}")
    print(f"Areal (ha): {info.get('areal_ha') or '-'}")
    print(f"objekt.id:  {info.get('objekt_uuid') or '(saknas i objekt-tabellen)'}")
    print("=" * 60)

    # 2. Filnamns-listan FORE wipe
    hpr_filer = fetch_hpr_filer(info['objekt_uuid']) if info['objekt_uuid'] else []
    filnamn_list = [f['filnamn'] for f in hpr_filer]

    # 3. Pre-radering-statistik
    print("\nPre-radering-statistik:")
    n_stock = fetch_count('detalj_stock', f"objekt_id=eq.{objekt_id_text}")
    n_stam = fetch_count('detalj_stam', f"objekt_id=eq.{objekt_id_text}")
    print(f"  detalj_stock for {objekt_id_text}: {n_stock} rader")
    print(f"  detalj_stam for {objekt_id_text}: {n_stam} rader")
    print(f"  hpr_filer for objektet: {len(hpr_filer)} rader")
    if hpr_filer:
        sorted_filer = sorted(hpr_filer, key=lambda x: x['filnamn'])
        print(f"  forsta filnamn: {sorted_filer[0]['filnamn']}")
        print(f"  sista filnamn:  {sorted_filer[-1]['filnamn']}")

    # 4. Hitta lokala filer
    if not filnamn_list:
        print("\nFEL: Inga hpr_filer-rader for objektet — inget att reimporta.")
        sys.exit(1)

    local_files = find_local_hpr_files(filnamn_list)
    if len(local_files) == 0:
        print("FEL: Inga filer hittades i Behandlade — kan inte reimporta.")
        sys.exit(1)
    if len(local_files) != len(filnamn_list):
        print(f"  [WARN] {len(filnamn_list) - len(local_files)} filer saknas pa disk")

    # 5. Sakerhetsbekraftelse
    print("\n" + "!" * 60)
    print("Detta kommer:")
    print(f"  - radera {n_stock} detalj_stock-rader for objekt '{objekt_id_text}'")
    print(f"  - radera {n_stam} detalj_stam-rader for objekt '{objekt_id_text}'")
    print(f"  - radera {len(hpr_filer)} hpr_filer-rader (+kaskad hpr_stammar)")
    print(f"  - radera {len(filnamn_list)} meta_importerade_filer-rader")
    print(f"  - reimporta {len(local_files)} HPR-filer fran Behandlade")
    print("!" * 60)

    # Watchdog-bekraftelse — wipe + reimport far inte krocka med live-import
    if args.confirm != objekt_id_text:
        try:
            ack = input("Ar auto_import_watch.py stoppad? [y/N]: ").strip().lower()
        except KeyboardInterrupt:
            print("\nAvbruten.")
            sys.exit(0)
        if ack != 'y':
            sys.exit("Stoppa watchdog innan korning. Avbryter.")

    if args.confirm == objekt_id_text:
        print("--confirm matchar — kor utan prompt.")
    elif args.confirm is not None:
        print(f"FEL: --confirm '{args.confirm}' matchar inte objekt_id '{objekt_id_text}'")
        sys.exit(1)
    else:
        try:
            svar = input(f"\nWipe + reimport for '{objekt_id_text}'? [y/N]: ").strip().lower()
        except KeyboardInterrupt:
            print("\nAvbruten.")
            sys.exit(0)
        if svar != 'y':
            print("Avbruten.")
            sys.exit(0)

    # 6. Wipe
    wipe_per_objekt(objekt_id_text, info['objekt_uuid'], filnamn_list)

    # Liten paus sa DELETE hinner committa innan inserts
    time.sleep(2)

    # 7. Reimport
    result = reimport_files(local_files)
    print(f"\nReimport: {result['ok']} OK, {result['fel']} fel av {result['total']}")

    # 8. Verifiering
    post_verify(objekt_id_text, info['objekt_uuid'])

    print("\nKlart.")


if __name__ == '__main__':
    main()
