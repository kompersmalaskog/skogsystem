#!/usr/bin/env python3
"""
Koppla HPR-data till rätt objekt och maskiner.

1. Skapar maskinposter i `maskiner`-tabellen (om de inte finns)
2. Uppdaterar alla hpr_filer-rader med maskin_id och objekt_id
3. Matchar via dim_objekt (vo_nummer) → objekt (vo_nummer → uuid)
4. Använder filnamn + mappsökväg för att bestämma maskin

Kör: py scripts/link-hpr-data.py
"""

import os
import sys
import re
import json
import logging
from typing import Dict, Optional, Tuple

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
    # Läs från .env.local
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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger(__name__)

# Maskindata — text-ID → metadata
MACHINES = {
    'PONS20SDJAA270231': {
        'maskin_id': 'PONS20SDJAA270231',
        'namn': 'Ponsse Scorpion',
        'typ': 'skordare',
        'marke': 'Ponsse',
        'modell': 'Scorpion',
    },
    'R64101': {
        'maskin_id': 'R64101',
        'namn': 'Rottne H8',
        'typ': 'skordare',
        'marke': 'Rottne',
        'modell': 'H8',
    },
}

# ============================================================
# STEG 1: Skapa maskiner
# ============================================================

def ensure_maskiner() -> Dict[str, str]:
    """Skapa maskiner i maskiner-tabellen, returnera text_id → uuid."""
    # Hämta befintliga
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/maskiner?select=id,maskin_id",
        headers=HEADERS, timeout=30
    )
    existing = {}
    if resp.status_code == 200:
        for r in resp.json():
            existing[r['maskin_id']] = r['id']

    for text_id, data in MACHINES.items():
        if text_id in existing:
            log.info(f"  Maskin {text_id} finns redan: {existing[text_id][:8]}...")
            continue

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/maskiner",
            json=data,
            headers=HEADERS,
            timeout=30
        )
        if resp.status_code in [200, 201]:
            row = resp.json()
            if isinstance(row, list):
                row = row[0]
            existing[text_id] = row['id']
            log.info(f"  Skapade maskin {text_id}: {row['id'][:8]}...")
        else:
            log.error(f"  Kunde inte skapa maskin {text_id}: {resp.status_code} {resp.text}")

    return existing


# ============================================================
# STEG 2: Bygg objekt-mappning
# ============================================================

def build_objekt_mapping() -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Bygg två mappningar:
    1. dim_objekt object_name → vo_nummer
    2. objekt vo_nummer → uuid (objekt.id)

    Returnerar (name_to_vo, vo_to_uuid)
    """
    # Hämta dim_objekt
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/dim_objekt?select=objekt_id,object_name,vo_nummer,maskin_id&limit=200",
        headers=HEADERS, timeout=30
    )
    dim_rows = resp.json() if resp.status_code == 200 else []

    # Hämta objekt (UUID-tabellen)
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/objekt?select=id,namn,vo_nummer&limit=200",
        headers=HEADERS, timeout=30
    )
    objekt_rows = resp.json() if resp.status_code == 200 else []

    # Bygg vo_nummer → uuid
    vo_to_uuid = {}
    name_to_uuid = {}
    for r in objekt_rows:
        if r.get('vo_nummer'):
            vo_to_uuid[r['vo_nummer']] = r['id']
        if r.get('namn'):
            name_to_uuid[normalize_name(r['namn'])] = r['id']

    # Bygg name_to_vo från dim_objekt
    name_to_vo = {}
    for r in dim_rows:
        name = r.get('object_name', '')
        vo = r.get('vo_nummer', '')
        if name and vo:
            name_to_vo[normalize_name(name)] = vo

    log.info(f"  dim_objekt: {len(dim_rows)} rader")
    log.info(f"  objekt: {len(objekt_rows)} rader med UUID")
    log.info(f"  vo_to_uuid: {len(vo_to_uuid)} mappningar")

    return name_to_vo, vo_to_uuid, name_to_uuid


def normalize_name(name: str) -> str:
    """Normalisera objektnamn för matchning."""
    # Ta bort extra whitespace, lowercase
    name = re.sub(r'\s+', ' ', name.strip().lower())
    # Ta bort kolon som ibland skiljer (1:8 → 18)
    return name


# ============================================================
# STEG 3: Bestäm maskin och objekt per HPR-fil
# ============================================================

def determine_maskin_from_filename(filnamn: str) -> Optional[str]:
    """Bestäm maskin-ID (text) från filnamnet."""
    # Ponsse-format: ObjektNamn_PONS20SDJAA270231_timestamp.hpr
    if 'PONS20SDJAA270231' in filnamn:
        return 'PONS20SDJAA270231'
    # Alla andra (date-format, HPR-Onedrive) ligger i R64101-mappen
    return 'R64101'


def extract_objekt_name(filnamn: str) -> Optional[str]:
    """Extrahera objektnamn från HPR-filnamn."""
    name = filnamn

    # Ta bort .hpr
    if name.lower().endswith('.hpr'):
        name = name[:-4]

    # Ponsse-format: ObjektNamn_PONS20SDJAA270231_timestamp
    if '_PONS20SDJAA270231_' in name:
        name = name.split('_PONS20SDJAA270231_')[0]
        return name.strip()

    # Bara PONS-timestamp: PONS20SDJAA270231_timestamp
    if name.startswith('PONS20SDJAA270231_'):
        return None  # Inget objektnamn

    # HPR-Onedrive — speciella filer utan objektnamn
    if name.startswith('HPR-Onedrive'):
        return None

    # FlyttService — ingen riktig produktion
    if name.startswith('FlyttService'):
        return None

    # Rottne-format: ObjektNamn YYYY-MM-DD
    date_match = re.search(r'\s+\d{4}-\d{2}-\d{2}$', name)
    if date_match:
        name = name[:date_match.start()]
        return name.strip()

    return name.strip() if name.strip() else None


def match_objekt_uuid(obj_name: str, name_to_vo: Dict, vo_to_uuid: Dict, name_to_uuid: Dict) -> Optional[str]:
    """Matcha objektnamn mot objekt.id (uuid)."""
    if not obj_name:
        return None

    norm = normalize_name(obj_name)

    # 1. Direkt namnmatchning mot objekt-tabellen
    if norm in name_to_uuid:
        return name_to_uuid[norm]

    # 2. Via dim_objekt vo_nummer → objekt uuid
    if norm in name_to_vo:
        vo = name_to_vo[norm]
        if vo in vo_to_uuid:
            return vo_to_uuid[vo]

    # 3. Fuzzy: prova delsträngar
    for obj_norm, uuid in name_to_uuid.items():
        if norm in obj_norm or obj_norm in norm:
            return uuid

    return None


def match_objekt_by_coords(fil_id: str, objekt_coords: list) -> Optional[str]:
    """Matcha namnlös HPR-fil mot närmaste objekt via stammarnas koordinater."""
    import math

    # Hämta en stam med koordinater
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/hpr_stammar?select=lat,lng&hpr_fil_id=eq.{fil_id}&lat=not.is.null&limit=1",
        headers=HEADERS, timeout=15
    )
    if resp.status_code != 200:
        return None
    rows = resp.json()
    if not rows or not rows[0].get('lat'):
        return None

    stam_lat = rows[0]['lat']
    stam_lng = rows[0]['lng']

    # Hitta närmaste objekt (inom 2 km)
    best_dist = 2.0  # km
    best_uuid = None
    for obj in objekt_coords:
        dlat = stam_lat - obj['lat']
        dlng = stam_lng - obj['lng']
        dist_km = math.sqrt(dlat**2 + (dlng * 0.55)**2) * 111  # grov km-beräkning
        if dist_km < best_dist:
            best_dist = dist_km
            best_uuid = obj['id']

    return best_uuid


# ============================================================
# STEG 4: Uppdatera hpr_filer
# ============================================================

def fetch_all_hpr_filer():
    """Hämta alla hpr_filer-rader."""
    all_rows = []
    offset = 0
    page_size = 500
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?select=id,filnamn,maskin_id,objekt_id&order=filnamn&offset={offset}&limit={page_size}",
            headers=HEADERS, timeout=30
        )
        if resp.status_code != 200:
            log.error(f"Kunde inte hamta hpr_filer: {resp.status_code}")
            break
        rows = resp.json()
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def update_hpr_fil(fil_id: str, maskin_uuid: Optional[str], objekt_uuid: Optional[str]) -> bool:
    """Uppdatera en hpr_filer-rad med maskin_id och objekt_id."""
    patch = {}
    if maskin_uuid:
        patch['maskin_id'] = maskin_uuid
    if objekt_uuid:
        patch['objekt_id'] = objekt_uuid

    if not patch:
        return True

    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/hpr_filer?id=eq.{fil_id}",
        json=patch,
        headers=HEADERS,
        timeout=30
    )
    return resp.status_code in [200, 204]


# ============================================================
# HUVUDPROGRAM
# ============================================================

def main():
    log.info("=" * 60)
    log.info("HPR Koppling - Lankar HPR-filer till maskiner och objekt")
    log.info("=" * 60)

    # Steg 1: Maskiner
    log.info("\nSteg 1: Skapa/hamta maskiner...")
    maskin_uuids = ensure_maskiner()
    if not maskin_uuids:
        log.error("Inga maskiner kunde skapas!")
        sys.exit(1)
    for text_id, uuid in maskin_uuids.items():
        log.info(f"  {text_id} -> {uuid[:12]}...")

    # Steg 2: Objekt-mappning
    log.info("\nSteg 2: Bygg objekt-mappning...")
    name_to_vo, vo_to_uuid, name_to_uuid = build_objekt_mapping()

    # Hämta objekt med koordinater (for geo-matchning)
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/objekt?select=id,namn,lat,lng&lat=not.is.null&limit=50",
        headers=HEADERS, timeout=30
    )
    objekt_coords = resp.json() if resp.status_code == 200 else []
    log.info(f"  {len(objekt_coords)} objekt med koordinater for geo-matchning")

    # Steg 3: Hämta och uppdatera HPR-filer
    log.info("\nSteg 3: Hamta alla HPR-filer...")
    hpr_files = fetch_all_hpr_filer()
    log.info(f"  {len(hpr_files)} HPR-filer i databasen")

    # Räknare
    updated = 0
    skipped = 0
    failed = 0
    maskin_linked = 0
    objekt_linked = 0
    coord_linked = 0
    no_objekt = []

    for i, f in enumerate(hpr_files):
        filnamn = f['filnamn']
        fil_id = f['id']

        # Bestäm maskin
        maskin_text = determine_maskin_from_filename(filnamn)
        maskin_uuid = maskin_uuids.get(maskin_text)

        # Bestäm objekt via filnamn
        obj_name = extract_objekt_name(filnamn)
        objekt_uuid = match_objekt_uuid(obj_name, name_to_vo, vo_to_uuid, name_to_uuid) if obj_name else None

        # Namnlösa filer: försök matcha via koordinater
        if not objekt_uuid and not obj_name and objekt_coords:
            objekt_uuid = match_objekt_by_coords(fil_id, objekt_coords)
            if objekt_uuid:
                coord_linked += 1

        # Behöver vi uppdatera?
        needs_maskin = maskin_uuid and f['maskin_id'] != maskin_uuid
        needs_objekt = objekt_uuid and f['objekt_id'] != objekt_uuid

        if not needs_maskin and not needs_objekt:
            skipped += 1
            continue

        new_maskin = maskin_uuid if needs_maskin else None
        new_objekt = objekt_uuid if needs_objekt else None

        if update_hpr_fil(fil_id, new_maskin, new_objekt):
            updated += 1
            if needs_maskin:
                maskin_linked += 1
            if needs_objekt:
                objekt_linked += 1
        else:
            failed += 1
            log.error(f"  Misslyckades: {filnamn}")

        if obj_name and not objekt_uuid:
            no_objekt.append(obj_name)

    # Rapport
    log.info("\n" + "=" * 60)
    log.info("RESULTAT")
    log.info("=" * 60)
    log.info(f"  Totalt HPR-filer:    {len(hpr_files)}")
    log.info(f"  Uppdaterade:         {updated}")
    log.info(f"  Redan kopplade:      {skipped}")
    log.info(f"  Misslyckade:         {failed}")
    log.info(f"  Maskin-kopplingar:   {maskin_linked}")
    log.info(f"  Objekt-kopplingar:   {objekt_linked}")
    log.info(f"  Koordinat-matchade:  {coord_linked}")

    if no_objekt:
        unique_no = sorted(set(no_objekt))
        log.info(f"\n  Objekt utan match i objekt-tabellen ({len(unique_no)} st):")
        for name in unique_no:
            log.info(f"    - {name}")

    log.info("\nKlart!")


if __name__ == '__main__':
    main()
