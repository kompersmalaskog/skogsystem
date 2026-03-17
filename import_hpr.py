#!/usr/bin/env python3
"""
HPR Import — Importerar HPR-filer (Harvester Production Report) till hpr_filer och hpr_stammar i Supabase.
Läser HPR-filer från Behandlade-mappen, samma struktur som MOM-importen.
"""

import os
import sys
import xml.etree.ElementTree as ET
import re
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

try:
    import requests
except ImportError:
    print("Saknat bibliotek. Kör: py -m pip install requests")
    sys.exit(1)

# ============================================================
# KONFIGURATION
# ============================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mxydghzfacbenbgpodex.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

ONEDRIVE_BASE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer"
BEHANDLADE = os.path.join(ONEDRIVE_BASE, "Behandlade")

LOG_FILE = os.path.join(ONEDRIVE_BASE, "hpr_import_logg.txt")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ============================================================
# XML HJÄLPFUNKTIONER (samma som i skogsmaskin_import_version_6.py)
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

def get_attr(elem, attr, default='') -> str:
    if elem is not None:
        return elem.get(attr, default)
    return default

def safe_float(val, default=0.0) -> float:
    try:
        return float(val) if val else default
    except:
        return default

def safe_int(val, default=0) -> int:
    try:
        return int(float(val)) if val else default
    except:
        return default

def normalize_maskin_id(maskin_id: str, tillverkare: str = '') -> str:
    if not maskin_id:
        return maskin_id
    if tillverkare and 'rottne' in tillverkare.lower():
        if maskin_id.isdigit():
            return f"R{maskin_id}"
    if maskin_id.isdigit() and len(maskin_id) == 5:
        return f"R{maskin_id}"
    return maskin_id

def make_objekt_id(vo_nummer: str, maskin_id: str, obj_key: str) -> str:
    if vo_nummer and vo_nummer.strip().isdigit():
        return vo_nummer.strip()
    return f"{maskin_id}_{obj_key}"

def parse_datetime(dt_str) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        dt_str = re.sub(r'[+-]\d{2}:\d{2}$', '', dt_str)
        return datetime.fromisoformat(dt_str)
    except:
        return None

# ============================================================
# HPR-PARSER
# ============================================================

def parse_hpr_for_import(filepath: str) -> Dict[str, Any]:
    """Parsa HPR-fil och returnera data för hpr_filer + hpr_stammar."""
    tree = ET.parse(filepath)
    root = tree.getroot()
    ns = get_namespace(root)
    filnamn = os.path.basename(filepath)

    result = {
        'filnamn': filnamn,
        'maskin_id': None,       # text maskin_id (t.ex. R64101)
        'vo_nummers': [],        # alla vo_nummer i filen
        'fil_datum': None,       # äldsta stam-tidpunkt
        'stammar': [],           # lista av stammar
    }

    machine = find_element(root, 'Machine', ns)
    if machine is None:
        logger.warning(f"  Inget Machine-element i {filnamn}")
        return result

    # Maskin-ID
    maskin_id = get_text(machine, 'BaseMachineManufacturerID', ns)
    if not maskin_id:
        maskin_id = get_text(machine, 'MachineKey', ns)
    tillverkare = get_text(machine, 'MachineBaseManufacturer', ns)
    maskin_id = normalize_maskin_id(maskin_id, tillverkare)
    result['maskin_id'] = maskin_id

    # Objekt — samla vo_nummer
    obj_key_map = {}
    for obj_def in find_all_elements(machine, 'ObjectDefinition', ns):
        obj_key = get_text(obj_def, 'ObjectKey', ns)
        contract_number = get_text(obj_def, 'ContractNumber', ns)
        vo_nummer = contract_number if contract_number else get_text(obj_def, 'ObjectUserID', ns)
        objekt_id = make_objekt_id(vo_nummer, maskin_id, obj_key)
        obj_key_map[obj_key] = objekt_id
        if vo_nummer and vo_nummer.strip().isdigit():
            result['vo_nummers'].append(vo_nummer.strip())

    # Trädslag-karta
    species_names = {}
    for sp_def in find_all_elements(machine, 'SpeciesGroupDefinition', ns):
        sp_key = get_text(sp_def, 'SpeciesGroupKey', ns)
        sp_name = get_text(sp_def, 'SpeciesGroupName', ns)
        species_names[sp_key] = sp_name

    # Sortiment/produkt-karta
    product_names = {}
    for prod_def in find_all_elements(machine, 'ProductDefinition', ns):
        prod_key = get_text(prod_def, 'ProductKey', ns)
        prod_name = get_text(prod_def, 'ProductName', ns)
        product_names[prod_key] = prod_name

    # Stammar
    stam_nummer = 0
    earliest_date = None

    for stem in find_all_elements(machine, 'Stem', ns):
        single_tree = find_element(stem, 'SingleTreeProcessedStem', ns)
        if single_tree is None:
            continue

        stam_nummer += 1

        # Trädslag
        sp_key = get_text(stem, 'SpeciesGroupKey', ns) or get_text(single_tree, 'SpeciesGroupKey', ns)
        tradslag = species_names.get(sp_key, sp_key or '')

        # DBH
        dbh = safe_int(get_text(single_tree, 'DBH', ns))

        # GPS
        stem_lat = None
        stem_lon = None
        stem_coords = find_element(stem, 'StemCoordinates', ns)
        if stem_coords is None:
            stem_coords = find_element(single_tree, 'Coordinates', ns)
        if stem_coords is None:
            stem_coords = find_element(single_tree, 'StemCoordinates', ns)
        if stem_coords is not None:
            stem_lat = safe_float(get_text(stem_coords, 'Latitude', ns)) or None
            stem_lon = safe_float(get_text(stem_coords, 'Longitude', ns)) or None

        # Tidpunkt
        processing_date = get_text(single_tree, 'ProcessingDate', ns) or get_text(stem, 'HarvestDate', ns)
        tidpunkt = parse_datetime(processing_date)
        if tidpunkt and (earliest_date is None or tidpunkt < earliest_date):
            earliest_date = tidpunkt

        # Stockar: räkna antal och summera volym
        antal_stockar = 0
        total_volym = 0.0
        sortiment_list = []

        for log in find_all_elements(single_tree, 'Log', ns):
            antal_stockar += 1
            prod_key = get_text(log, 'ProductKey', ns)
            if prod_key and prod_key in product_names:
                sortiment_list.append(product_names[prod_key])

            for vol_elem in find_all_elements(log, 'LogVolume', ns):
                cat = get_attr(vol_elem, 'logVolumeCategory')
                val = safe_float(vol_elem.text)
                if 'm3sob' in cat.lower():
                    total_volym += val

        result['stammar'].append({
            'stam_nummer': stam_nummer,
            'tradslag': tradslag,
            'dbh': dbh if dbh > 0 else None,
            'lat': stem_lat,
            'lng': stem_lon,
            'antal_stockar': antal_stockar,
            'total_volym': round(total_volym, 6) if total_volym > 0 else None,
        })

    # Fil-datum: använd äldsta stam eller filnamnets datum
    if earliest_date:
        result['fil_datum'] = earliest_date
    else:
        date_match = re.search(r'(\d{8})', filnamn)
        if date_match:
            try:
                ds = date_match.group(1)
                result['fil_datum'] = datetime(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
            except:
                pass

    return result

# ============================================================
# SUPABASE UPLOAD
# ============================================================

def fetch_objekt_uuid_map() -> Dict[str, str]:
    """Hämta mapping vo_nummer → objekt.id (uuid) från objekt-tabellen."""
    url = f"{SUPABASE_URL}/rest/v1/objekt?select=id,vo_nummer&vo_nummer=not.is.null"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        logger.warning(f"Kunde inte hämta objekt: {resp.status_code}")
        return {}
    rows = resp.json()
    return {r['vo_nummer']: r['id'] for r in rows if r.get('vo_nummer')}

def fetch_existing_filnamn() -> set:
    """Hämta redan importerade filnamn från hpr_filer."""
    url = f"{SUPABASE_URL}/rest/v1/hpr_filer?select=filnamn"
    all_names = set()
    offset = 0
    page_size = 1000
    while True:
        resp = requests.get(
            f"{url}&offset={offset}&limit={page_size}",
            headers=HEADERS, timeout=30
        )
        if resp.status_code != 200:
            break
        rows = resp.json()
        if not rows:
            break
        for r in rows:
            all_names.add(r['filnamn'])
        if len(rows) < page_size:
            break
        offset += page_size
    return all_names

def upload_hpr(parsed: Dict[str, Any], objekt_map: Dict[str, str]) -> bool:
    """Ladda upp en parsad HPR-fil till hpr_filer + hpr_stammar."""
    filnamn = parsed['filnamn']

    # Skapa hpr_filer-rad
    fil_row = {
        'filnamn': filnamn,
    }

    if parsed['fil_datum']:
        fil_row['fil_datum'] = parsed['fil_datum'].isoformat()

    # Matcha objekt_id via vo_nummer
    for vo in parsed['vo_nummers']:
        if vo in objekt_map:
            fil_row['objekt_id'] = objekt_map[vo]
            break

    # maskin_id FK pekar på maskiner-tabellen som är tom — lämna null

    # Insert hpr_filer
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/hpr_filer",
        json=fil_row,
        headers=HEADERS,
        timeout=30
    )
    if resp.status_code not in [200, 201]:
        logger.error(f"  Kunde inte skapa hpr_filer-rad för {filnamn}: {resp.status_code} {resp.text}")
        return False

    fil_data = resp.json()
    if isinstance(fil_data, list):
        fil_data = fil_data[0]
    hpr_fil_id = fil_data['id']

    # Insert stammar i batchar
    stammar = parsed['stammar']
    if not stammar:
        logger.info(f"  {filnamn}: 0 stammar (tom fil)")
        return True

    batch_size = 500
    for i in range(0, len(stammar), batch_size):
        batch = stammar[i:i + batch_size]
        rows = []
        for s in batch:
            row = {
                'hpr_fil_id': hpr_fil_id,
                'stam_nummer': s['stam_nummer'],
                'tradslag': s['tradslag'],
            }
            if s['dbh'] is not None:
                row['dbh'] = s['dbh']
            if s['lat'] is not None:
                row['lat'] = s['lat']
            if s['lng'] is not None:
                row['lng'] = s['lng']
            if s['antal_stockar']:
                row['antal_stockar'] = s['antal_stockar']
            if s['total_volym'] is not None:
                row['total_volym'] = s['total_volym']
            rows.append(row)

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/hpr_stammar",
            json=rows,
            headers=HEADERS,
            timeout=60
        )
        if resp.status_code not in [200, 201]:
            logger.error(f"  Fel vid insert av stammar batch {i}: {resp.status_code} {resp.text}")
            return False

    return True

# ============================================================
# HUVUDPROGRAM
# ============================================================

def find_hpr_files() -> List[str]:
    """Hitta alla HPR-filer i Behandlade-mappen."""
    files = []
    for root, dirs, filenames in os.walk(BEHANDLADE):
        for f in filenames:
            if f.upper().endswith('.HPR'):
                files.append(os.path.join(root, f))
    files.sort()
    return files

def main():
    logger.info("=" * 60)
    logger.info("HPR Import — Startar")
    logger.info("=" * 60)

    # Testa Supabase-anslutning
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?select=id&limit=1",
            headers=HEADERS, timeout=30
        )
        if resp.status_code not in [200, 406]:
            logger.error(f"Kunde inte ansluta till Supabase: {resp.status_code}")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Anslutningsfel: {e}")
        sys.exit(1)

    logger.info("✓ Ansluten till Supabase")

    # Hämta befintliga data
    objekt_map = fetch_objekt_uuid_map()
    logger.info(f"Hämtade {len(objekt_map)} objekt med vo_nummer")

    existing = fetch_existing_filnamn()
    logger.info(f"Redan importerade: {len(existing)} HPR-filer")

    # Hitta HPR-filer
    hpr_files = find_hpr_files()
    logger.info(f"Hittade {len(hpr_files)} HPR-filer i Behandlade")

    # Filtrera bort redan importerade
    to_import = [f for f in hpr_files if os.path.basename(f) not in existing]
    logger.info(f"Att importera: {len(to_import)} nya filer")

    if not to_import:
        logger.info("Inget att importera — klart!")
        return

    # Importera
    success = 0
    fail = 0
    total_stammar = 0

    for i, filepath in enumerate(to_import, 1):
        filnamn = os.path.basename(filepath)
        logger.info(f"[{i}/{len(to_import)}] {filnamn}")

        try:
            parsed = parse_hpr_for_import(filepath)
            n_stammar = len(parsed['stammar'])

            if upload_hpr(parsed, objekt_map):
                success += 1
                total_stammar += n_stammar
                logger.info(f"  ✓ {n_stammar} stammar importerade")
            else:
                fail += 1
        except Exception as e:
            logger.error(f"  ✗ Fel: {e}")
            fail += 1

    logger.info("=" * 60)
    logger.info(f"Klart! {success} filer importerade, {fail} fel, {total_stammar} stammar totalt")
    logger.info("=" * 60)

if __name__ == '__main__':
    main()
