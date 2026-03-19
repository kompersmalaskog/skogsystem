#!/usr/bin/env python3
"""
Backfill bio_energy_adaption for existing hpr_stammar.

Laeser Ponsse HPR-filer (StanForD 3.6), extraherar BioEnergyAdaption per stam,
och uppdaterar hpr_stammar via Supabase REST API.

Forutsaetter att migrationen 20260319_hpr_bio_energy.sql har koerts.
Koer: py scripts/backfill-grot.py
"""

import os
import sys
import xml.etree.ElementTree as ET
import logging

try:
    import requests
except ImportError:
    print("Saknat bibliotek. Koer: py -m pip install requests")
    sys.exit(1)

# ============================================================
# KONFIGURATION
# ============================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mxydghzfacbenbgpodex.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_KEY:
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
                    SUPABASE_KEY = line.split('=', 1)[1].strip()
                elif line.startswith('NEXT_PUBLIC_SUPABASE_ANON_KEY=') and not SUPABASE_KEY:
                    SUPABASE_KEY = line.split('=', 1)[1].strip()

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

ONEDRIVE_BASE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer"
BEHANDLADE = os.path.join(ONEDRIVE_BASE, "Behandlade")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger(__name__)


# ============================================================
# XML HELPERS
# ============================================================

def get_namespace(root) -> str:
    if root.tag.startswith('{'):
        return root.tag.split('}')[0] + '}'
    return ''

def find_element(parent, tag, ns=''):
    if ns:
        elem = parent.find(f'{ns}{tag}')
        if elem is not None:
            return elem
    return parent.find(tag)

def find_all_elements(parent, tag, ns=''):
    if ns:
        elems = parent.findall(f'{ns}{tag}')
        if elems:
            return elems
    return parent.findall(tag)

def get_text(parent, tag, ns='', default='') -> str:
    elem = find_element(parent, tag, ns)
    if elem is not None and elem.text:
        return elem.text.strip()
    return default


# ============================================================
# EXTRACT GROT PER STEM FROM HPR FILE
# ============================================================

def extract_grot_flags(filepath: str) -> dict:
    """Return {stam_nummer: bio_energy_adaption} for stems with BioEnergyAdaption."""
    result = {}
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        ns = get_namespace(root)

        machine = find_element(root, 'Machine', ns)
        if machine is None:
            return result

        stam_nummer = 0
        for stem in find_all_elements(machine, 'Stem', ns):
            single = find_element(stem, 'SingleTreeProcessedStem', ns)
            if single is None:
                continue
            stam_nummer += 1

            bio = get_text(stem, 'BioEnergyAdaption', ns)
            if bio:
                result[stam_nummer] = bio

    except Exception as e:
        log.warning(f"  Fel vid parsning: {e}")

    return result


# ============================================================
# MAIN
# ============================================================

def main():
    log.info("=" * 60)
    log.info("GROT Backfill -- Uppdaterar bio_energy_adaption")
    log.info("=" * 60)

    # Find HPR files on disk (Ponsse only = StanForD 3.6)
    disk_files = {}
    for root_dir, dirs, files in os.walk(BEHANDLADE):
        for f in files:
            if f.upper().endswith('.HPR'):
                disk_files[f] = os.path.join(root_dir, f)
    log.info(f"HPR-filer pa disk: {len(disk_files)}")

    # Fetch all hpr_filer from DB
    all_filer = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?select=id,filnamn,stanford_version&order=filnamn&offset={offset}&limit=500",
            headers=HEADERS, timeout=30
        )
        if resp.status_code != 200:
            log.error(f"Fel vid haemtning: {resp.status_code}")
            break
        rows = resp.json()
        if not rows:
            break
        all_filer.extend(rows)
        if len(rows) < 500:
            break
        offset += 500

    log.info(f"HPR-filer i DB: {len(all_filer)}")

    # Filter to StanForD 3.6 (Ponsse) files that have GROT
    ponsse_filer = [f for f in all_filer if f.get('stanford_version') == '3.6']
    log.info(f"Ponsse-filer (v3.6): {len(ponsse_filer)}")

    updated_total = 0
    grot_total = 0
    files_with_grot = 0

    for i, db_row in enumerate(ponsse_filer, 1):
        filnamn = db_row['filnamn']
        hpr_fil_id = db_row['id']

        filepath = disk_files.get(filnamn)
        if not filepath:
            continue

        # Extract GROT flags from XML
        grot_flags = extract_grot_flags(filepath)
        if not grot_flags:
            continue

        files_with_grot += 1
        grot_total += len(grot_flags)

        # Fetch existing stammar for this file
        stammar = []
        s_offset = 0
        while True:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/hpr_stammar?hpr_fil_id=eq.{hpr_fil_id}&select=id,stam_nummer&offset={s_offset}&limit=1000",
                headers=HEADERS, timeout=30
            )
            if resp.status_code != 200 or not resp.json():
                break
            rows = resp.json()
            stammar.extend(rows)
            if len(rows) < 1000:
                break
            s_offset += 1000

        # Update stems that have GROT
        updated_file = 0
        for stam in stammar:
            sn = stam['stam_nummer']
            if sn in grot_flags:
                resp = requests.patch(
                    f"{SUPABASE_URL}/rest/v1/hpr_stammar?id=eq.{stam['id']}",
                    json={'bio_energy_adaption': grot_flags[sn]},
                    headers=HEADERS, timeout=30
                )
                if resp.status_code in [200, 204]:
                    updated_file += 1
                else:
                    log.error(f"  Uppdateringsfel stam {sn}: {resp.status_code}")

        updated_total += updated_file

        if i % 10 == 0 or updated_file > 0:
            log.info(f"  [{i}/{len(ponsse_filer)}] {filnamn}: {updated_file} stammar uppdaterade")

    log.info("")
    log.info("=" * 60)
    log.info("RESULTAT")
    log.info("=" * 60)
    log.info(f"  Filer med GROT: {files_with_grot}")
    log.info(f"  Stammar med GROT i XML: {grot_total}")
    log.info(f"  Stammar uppdaterade i DB: {updated_total}")
    log.info("Klart!")


if __name__ == '__main__':
    main()
