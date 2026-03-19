#!/usr/bin/env python3
"""
Koppla HPR-data till ratt objekt och maskiner.

1. Skapar maskinposter i maskiner-tabellen (om de inte finns)
2. Skapar saknade objekt i objekt-tabellen fran dim_objekt-data
3. Uppdaterar alla hpr_filer-rader med maskin_id och objekt_id
4. Matchar via: exakt namn, kolon-strippat namn, dim_objekt vo_nummer, koordinater

Kor: py scripts/link-hpr-data.py
"""

import os
import sys
import re
import json
import math
import logging
from typing import Dict, Optional, List, Tuple

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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger(__name__)

# Maskindata
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
    """Skapa maskiner, returnera text_id -> uuid."""
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
            json=data, headers=HEADERS, timeout=30
        )
        if resp.status_code in [200, 201]:
            row = resp.json()
            if isinstance(row, list): row = row[0]
            existing[text_id] = row['id']
            log.info(f"  Skapade maskin {text_id}: {row['id'][:8]}...")
        else:
            log.error(f"  Kunde inte skapa maskin {text_id}: {resp.status_code} {resp.text}")
    return existing


# ============================================================
# STEG 2: Bygg mappningar och skapa saknade objekt
# ============================================================

def strip_colons(name: str) -> str:
    """Ta bort kolon fran fastighetsbeteckningar (4:17 -> 417)."""
    return name.replace(':', '')


def extract_objekt_name(filnamn: str) -> Optional[str]:
    """Extrahera objektnamn fran HPR-filnamn."""
    name = filnamn
    if name.lower().endswith('.hpr'):
        name = name[:-4]

    if '_PONS20SDJAA270231_' in name:
        return name.split('_PONS20SDJAA270231_')[0].strip()
    if name.startswith('PONS20SDJAA270231_'):
        return None
    if name.startswith('HPR-Onedrive'):
        return None
    if name.startswith('FlyttService'):
        return None

    date_match = re.search(r'\s+\d{4}-\d{2}-\d{2}$', name)
    if date_match:
        return name[:date_match.start()].strip()

    return name.strip() if name.strip() else None


def determine_maskin_from_filename(filnamn: str) -> Optional[str]:
    """Bestam maskin-ID (text) fran filnamnet."""
    if 'PONS20SDJAA270231' in filnamn:
        return 'PONS20SDJAA270231'
    return 'R64101'


def build_dim_objekt_map() -> Dict[str, dict]:
    """Hamta dim_objekt och bygg mappningar: namn -> data, stripped_namn -> data."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/dim_objekt?select=objekt_id,object_name,vo_nummer,maskin_id,latitude,longitude,huvudtyp,atgard,skogsagare,bolag,inkopare,areal_ha,certifiering,start_date,end_date&limit=200",
        headers=HEADERS, timeout=30
    )
    rows = resp.json() if resp.status_code == 200 else []

    # Bygg mappningar: exakt namn -> dim_data, och stripped namn -> dim_data
    by_name = {}
    by_stripped = {}
    for r in rows:
        name = r.get('object_name', '')
        if name:
            by_name[name.lower()] = r
            by_stripped[strip_colons(name).lower()] = r

    log.info(f"  dim_objekt: {len(rows)} rader, {len(by_name)} unika namn")
    return by_name, by_stripped


def find_dim_match(hpr_name: str, dim_by_name: dict, dim_by_stripped: dict) -> Optional[dict]:
    """Matcha HPR-filnamn mot dim_objekt."""
    norm = hpr_name.lower()
    stripped = strip_colons(norm)

    # 1. Exakt
    if norm in dim_by_name:
        return dim_by_name[norm]

    # 2. Kolon-strippat exakt
    if stripped in dim_by_stripped:
        return dim_by_stripped[stripped]

    # 3. Fuzzy: HPR-namn inkluderar dim-namn eller vice versa
    for dn, dd in dim_by_name.items():
        if norm in dn or dn in norm:
            return dd

    # 4. Fuzzy med kolon-strippat
    for dn, dd in dim_by_stripped.items():
        if stripped in dn or dn in stripped:
            return dd

    return None


def fetch_existing_objekt() -> Dict[str, dict]:
    """Hamta befintliga objekt, returnera vo_nummer -> {id, namn}."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/objekt?select=id,namn,vo_nummer&limit=500",
        headers=HEADERS, timeout=30
    )
    rows = resp.json() if resp.status_code == 200 else []
    result = {}
    for r in rows:
        if r.get('vo_nummer'):
            result[r['vo_nummer']] = r
        if r.get('namn'):
            result[r['namn'].lower()] = r
    return result


def create_objekt_from_dim(dim_data: dict, hpr_name: str) -> Optional[str]:
    """Skapa ett objekt i objekt-tabellen fran dim_objekt-data. Returnerar uuid."""
    vo = dim_data.get('vo_nummer', '')
    # Anvand HPR-namnet eller dim-namnet
    namn = dim_data.get('object_name', hpr_name)

    row = {
        'namn': namn,
    }

    # vo_nummer (bara om det ar ett riktigt nummer)
    if vo and not vo.startswith('_') and not vo.startswith('O41F97'):
        row['vo_nummer'] = vo

    # Koordinater
    lat = dim_data.get('latitude')
    lng = dim_data.get('longitude')
    if lat and lng:
        row['lat'] = lat
        row['lng'] = lng

    # Metadata
    if dim_data.get('skogsagare'):
        row['markagare'] = dim_data['skogsagare']
    if dim_data.get('bolag'):
        row['bolag'] = dim_data['bolag']
    if dim_data.get('inkopare'):
        row['inkopare'] = dim_data['inkopare']
    if dim_data.get('areal_ha'):
        row['areal'] = dim_data['areal_ha']
    if dim_data.get('certifiering') and dim_data['certifiering'] != 'None':
        row['cert'] = dim_data['certifiering']

    # Typ
    huvudtyp = (dim_data.get('huvudtyp') or '').lower()
    if 'gallring' in huvudtyp:
        row['typ'] = 'gallring'
    elif 'slut' in huvudtyp or 'au' in (dim_data.get('atgard') or '').lower():
        row['typ'] = 'slutavverkning'
    else:
        row['typ'] = 'slutavverkning'

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/objekt",
        json=row, headers=HEADERS, timeout=30
    )
    if resp.status_code in [200, 201]:
        result = resp.json()
        if isinstance(result, list): result = result[0]
        return result['id']
    else:
        log.error(f"  Kunde inte skapa objekt '{namn}': {resp.status_code} {resp.text[:200]}")
        return None


# ============================================================
# STEG 3: Koordinat-matchning
# ============================================================

def match_objekt_by_coords(fil_id: str, objekt_coords: list) -> Optional[str]:
    """Matcha namnlos HPR-fil mot narmaste objekt via stammarnas koordinater."""
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

    best_dist = 2.0  # km
    best_uuid = None
    for obj in objekt_coords:
        if not obj.get('lat') or not obj.get('lng'):
            continue
        dlat = stam_lat - obj['lat']
        dlng = stam_lng - obj['lng']
        dist_km = math.sqrt(dlat**2 + (dlng * 0.55)**2) * 111
        if dist_km < best_dist:
            best_dist = dist_km
            best_uuid = obj['id']

    return best_uuid


# ============================================================
# STEG 4: Uppdatera hpr_filer
# ============================================================

def fetch_all_hpr_filer():
    """Hamta alla hpr_filer-rader."""
    all_rows = []
    offset = 0
    page_size = 500
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?select=id,filnamn,maskin_id,objekt_id&order=filnamn&offset={offset}&limit={page_size}",
            headers=HEADERS, timeout=30
        )
        if resp.status_code != 200:
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
    """Uppdatera en hpr_filer-rad."""
    patch = {}
    if maskin_uuid:
        patch['maskin_id'] = maskin_uuid
    if objekt_uuid:
        patch['objekt_id'] = objekt_uuid
    if not patch:
        return True
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/hpr_filer?id=eq.{fil_id}",
        json=patch, headers=HEADERS, timeout=30
    )
    return resp.status_code in [200, 204]


# ============================================================
# HUVUDPROGRAM
# ============================================================

def main():
    log.info("=" * 60)
    log.info("HPR Koppling v2 - Komplett koppling med objekt-skapande")
    log.info("=" * 60)

    # Steg 1: Maskiner
    log.info("\nSteg 1: Skapa/hamta maskiner...")
    maskin_uuids = ensure_maskiner()
    if not maskin_uuids:
        log.error("Inga maskiner kunde skapas!")
        sys.exit(1)
    for text_id, uuid in maskin_uuids.items():
        log.info(f"  {text_id} -> {uuid[:12]}...")

    # Steg 2: Bygg mappningar
    log.info("\nSteg 2: Bygg mappningar...")
    dim_by_name, dim_by_stripped = build_dim_objekt_map()
    existing_objekt = fetch_existing_objekt()
    log.info(f"  Befintliga objekt: {len(set(r['id'] for r in existing_objekt.values() if 'id' in r))}")

    # Steg 3: Hamta HPR-filer och identifiera saknade objekt
    log.info("\nSteg 3: Identifiera saknade objekt...")
    hpr_files = fetch_all_hpr_filer()
    log.info(f"  {len(hpr_files)} HPR-filer i databasen")

    # Samla unika HPR-objektnamn
    hpr_names = set()
    for f in hpr_files:
        name = extract_objekt_name(f['filnamn'])
        if name:
            hpr_names.add(name)

    # For varje HPR-namn: kolla om objekt finns, annars skapa
    created = 0
    already_exists = 0
    create_failed = 0
    # namn -> objekt uuid (for linking)
    name_to_uuid = {}

    for hpr_name in sorted(hpr_names):
        norm = hpr_name.lower()
        stripped = strip_colons(norm)

        # Kolla om det redan finns i objekt
        match = None
        for key in [norm, stripped]:
            if key in existing_objekt:
                match = existing_objekt[key]
                break
        if not match:
            # Fuzzy mot existing
            for okey, odata in existing_objekt.items():
                ok_stripped = strip_colons(okey)
                if stripped in ok_stripped or ok_stripped in stripped:
                    match = odata
                    break

        if match:
            name_to_uuid[hpr_name] = match['id']
            already_exists += 1
            continue

        # Inget objekt hittades -> kolla dim_objekt for data att skapa fran
        dim_match = find_dim_match(hpr_name, dim_by_name, dim_by_stripped)
        if dim_match:
            log.info(f"  Skapar objekt: {hpr_name} (dim: {dim_match['object_name']}, vo={dim_match.get('vo_nummer','')})")
            uuid = create_objekt_from_dim(dim_match, hpr_name)
            if uuid:
                name_to_uuid[hpr_name] = uuid
                # Lagg till i existing sa vi inte skapar dubbletter
                existing_objekt[norm] = {'id': uuid, 'namn': hpr_name}
                created += 1
            else:
                create_failed += 1
        else:
            # Inget i dim_objekt heller -> skapa minimalt objekt
            log.info(f"  Skapar minimalt objekt: {hpr_name} (ingen dim_objekt-match)")
            row = {'namn': hpr_name, 'typ': 'slutavverkning'}
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/objekt",
                json=row, headers=HEADERS, timeout=30
            )
            if resp.status_code in [200, 201]:
                result = resp.json()
                if isinstance(result, list): result = result[0]
                name_to_uuid[hpr_name] = result['id']
                existing_objekt[norm] = {'id': result['id'], 'namn': hpr_name}
                created += 1
            else:
                log.error(f"  Misslyckades: {resp.status_code} {resp.text[:200]}")
                create_failed += 1

    log.info(f"\n  Redan existerande: {already_exists}")
    log.info(f"  Nyligen skapade:   {created}")
    log.info(f"  Misslyckade:       {create_failed}")

    # Steg 4: Hamta objekt med koordinater (for geo-matchning av namnlosa filer)
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/objekt?select=id,namn,lat,lng&lat=not.is.null&limit=200",
        headers=HEADERS, timeout=30
    )
    objekt_coords = resp.json() if resp.status_code == 200 else []
    log.info(f"\n  {len(objekt_coords)} objekt med koordinater for geo-matchning")

    # Steg 5: Uppdatera alla HPR-filer
    log.info("\nSteg 4: Uppdatera HPR-filer...")
    updated = 0
    skipped = 0
    failed = 0
    maskin_linked = 0
    objekt_linked = 0
    coord_linked = 0
    still_no_objekt = []

    for f in hpr_files:
        filnamn = f['filnamn']
        fil_id = f['id']

        # Maskin
        maskin_text = determine_maskin_from_filename(filnamn)
        maskin_uuid = maskin_uuids.get(maskin_text)

        # Objekt via filnamn
        hpr_name = extract_objekt_name(filnamn)
        objekt_uuid = name_to_uuid.get(hpr_name) if hpr_name else None

        # Namnlosa: koordinat-matchning
        if not objekt_uuid and not hpr_name and objekt_coords:
            objekt_uuid = match_objekt_by_coords(fil_id, objekt_coords)
            if objekt_uuid:
                coord_linked += 1

        needs_maskin = maskin_uuid and f['maskin_id'] != maskin_uuid
        needs_objekt = objekt_uuid and f['objekt_id'] != objekt_uuid

        if not needs_maskin and not needs_objekt:
            skipped += 1
            if not objekt_uuid and hpr_name:
                still_no_objekt.append(hpr_name)
            elif not objekt_uuid and not hpr_name:
                still_no_objekt.append('(namnlos)')
            continue

        if update_hpr_fil(fil_id, maskin_uuid if needs_maskin else None, objekt_uuid if needs_objekt else None):
            updated += 1
            if needs_maskin:
                maskin_linked += 1
            if needs_objekt:
                objekt_linked += 1
        else:
            failed += 1
            log.error(f"  Misslyckades: {filnamn}")

        if not objekt_uuid:
            still_no_objekt.append(hpr_name or '(namnlos)')

    # Rapport
    log.info("\n" + "=" * 60)
    log.info("RESULTAT")
    log.info("=" * 60)
    log.info(f"  Totalt HPR-filer:     {len(hpr_files)}")
    log.info(f"  Uppdaterade:          {updated}")
    log.info(f"  Redan kopplade:       {skipped}")
    log.info(f"  Misslyckade:          {failed}")
    log.info(f"  Maskin-kopplingar:    {maskin_linked}")
    log.info(f"  Objekt-kopplingar:    {objekt_linked}")
    log.info(f"  Koordinat-matchade:   {coord_linked}")
    log.info(f"  Objekt skapade:       {created}")

    unique_no = sorted(set(still_no_objekt))
    linked_total = len(hpr_files) - len([f for f in hpr_files if not name_to_uuid.get(extract_objekt_name(f['filnamn']))])
    nameless_count = sum(1 for n in still_no_objekt if n == '(namnlos)')

    if unique_no:
        log.info(f"\n  Fortfarande okopplade ({len(unique_no)} unika):")
        for name in unique_no:
            log.info(f"    - {name}")

    log.info("\nKlart!")


if __name__ == '__main__':
    main()
