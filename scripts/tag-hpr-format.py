#!/usr/bin/env python3
"""
Tagga HPR-filer med format-information.

Forutsatter att migrationen 20260319_hpr_format_tags.sql har korts.
Analyserar varje HPR-fil fran disk for att bestamma:
  - stanford_version (3.5 / 3.6)
  - sender_app (Ponsse Opti / Forester H70)
  - has_coordinates (true/false)
  - stammar_count
  - stammar_med_koordinat

Kor: py scripts/tag-hpr-format.py
"""

import os
import sys
import re
import xml.etree.ElementTree as ET
import logging
from collections import defaultdict

try:
    import requests
except ImportError:
    print("Saknat bibliotek. Kor: py -m pip install requests")
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

def safe_float(val, default=0.0) -> float:
    try:
        return float(val) if val else default
    except:
        return default


# ============================================================
# ANALYSERA HPR-FIL
# ============================================================

def analyze_hpr_file(filepath: str) -> dict:
    """Analysera en HPR-fil och returnera format-metadata."""
    result = {
        'stanford_version': None,
        'sender_app': None,
        'has_coordinates': False,
        'stammar_count': 0,
        'stammar_med_koordinat': 0,
    }

    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        ns = get_namespace(root)

        # Version fran root-attribut
        result['stanford_version'] = root.get('version', '')

        # Sender application
        header = find_element(root, 'HarvestedProductionHeader', ns)
        if header is not None:
            result['sender_app'] = get_text(header, 'SenderApplication', ns)

        # Rakna stammar och koordinater
        machine = find_element(root, 'Machine', ns)
        if machine is None:
            return result

        stammar = 0
        med_koord = 0

        for stem in find_all_elements(machine, 'Stem', ns):
            single = find_element(stem, 'SingleTreeProcessedStem', ns)
            if single is None:
                continue

            stammar += 1

            # Kolla GPS
            has_gps = False
            for coords_tag in ['StemCoordinates', 'Coordinates']:
                coords = find_element(stem, coords_tag, ns)
                if coords is None:
                    coords = find_element(single, coords_tag, ns)
                if coords is not None:
                    lat = safe_float(get_text(coords, 'Latitude', ns))
                    lng = safe_float(get_text(coords, 'Longitude', ns))
                    if lat != 0.0 and lng != 0.0:
                        has_gps = True
                        break

            if has_gps:
                med_koord += 1

        result['stammar_count'] = stammar
        result['stammar_med_koordinat'] = med_koord
        result['has_coordinates'] = med_koord > 0

    except ET.ParseError as e:
        log.warning(f"  XML-parsfel: {e}")
    except Exception as e:
        log.warning(f"  Fel: {e}")

    return result


# ============================================================
# HUVUDPROGRAM
# ============================================================

def find_hpr_files() -> dict:
    """Hitta alla HPR-filer, returnera filnamn -> filepath."""
    files = {}
    for root, dirs, filenames in os.walk(BEHANDLADE):
        for f in filenames:
            if f.upper().endswith('.HPR'):
                files[f] = os.path.join(root, f)
    return files


def fetch_all_hpr_filer():
    """Hamta alla hpr_filer fran databasen."""
    all_rows = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?select=id,filnamn,stanford_version&order=filnamn&offset={offset}&limit=500",
            headers=HEADERS, timeout=30
        )
        if resp.status_code != 200:
            log.error(f"Fel vid hamtning: {resp.status_code} {resp.text[:200]}")
            break
        rows = resp.json()
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < 500:
            break
        offset += 500
    return all_rows


def main():
    log.info("=" * 60)
    log.info("HPR Format-taggning")
    log.info("=" * 60)

    # Hitta filer pa disk
    disk_files = find_hpr_files()
    log.info(f"HPR-filer pa disk: {len(disk_files)}")

    # Hamta DB-poster
    db_files = fetch_all_hpr_filer()
    log.info(f"HPR-filer i DB: {len(db_files)}")

    # Kolla om kolumnerna finns
    if db_files and 'stanford_version' not in db_files[0]:
        log.error("\nKolumnen 'stanford_version' saknas i hpr_filer!")
        log.error("Kor migrationen forst:")
        log.error("  supabase/migrations/20260319_hpr_format_tags.sql")
        log.error("Klistra in SQL:en i Supabase SQL Editor.")
        sys.exit(1)

    # Analysera och uppdatera
    updated = 0
    skipped = 0
    not_found = 0
    stats = defaultdict(int)

    for i, db_row in enumerate(db_files, 1):
        filnamn = db_row['filnamn']

        # Redan taggad?
        if db_row.get('stanford_version'):
            skipped += 1
            continue

        # Hitta fil pa disk
        filepath = disk_files.get(filnamn)
        if not filepath:
            not_found += 1
            continue

        # Analysera
        info = analyze_hpr_file(filepath)

        # Uppdatera DB
        patch = {
            'stanford_version': info['stanford_version'],
            'sender_app': info['sender_app'],
            'has_coordinates': info['has_coordinates'],
            'stammar_count': info['stammar_count'],
            'stammar_med_koordinat': info['stammar_med_koordinat'],
        }

        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?id=eq.{db_row['id']}",
            json=patch, headers=HEADERS, timeout=30
        )
        if resp.status_code in [200, 204]:
            updated += 1
            key = f"{info['stanford_version']} / {info['sender_app']}"
            stats[key] += 1
        else:
            log.error(f"  Uppdateringsfel for {filnamn}: {resp.status_code}")

        if i % 50 == 0:
            log.info(f"  {i}/{len(db_files)} filer bearbetade...")

    # Rapport
    log.info("\n" + "=" * 60)
    log.info("RESULTAT")
    log.info("=" * 60)
    log.info(f"  Totalt:        {len(db_files)}")
    log.info(f"  Uppdaterade:   {updated}")
    log.info(f"  Redan taggade: {skipped}")
    log.info(f"  Ej pa disk:    {not_found}")

    log.info(f"\nFormat-fordelning:")
    for key, cnt in sorted(stats.items()):
        log.info(f"  {key}: {cnt} filer")

    # Sammanstallning av koordinater
    log.info(f"\nKoordinat-sammanfattning:")
    log.info(f"  (Kors efter att filer ar taggade)")

    log.info("\nKlart!")


if __name__ == '__main__':
    main()
