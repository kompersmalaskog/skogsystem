#!/usr/bin/env python3
"""
SKOGSMASKIN IMPORT v1.0
=======================
Importerar Stanford2010-filer (MOM, HPR, HQC, FPR) till Supabase.
Stödjer Ponsse och Rottne maskiner.

Funktioner:
- Automatisk övervakning av Inkommande-mapp
- Parsar alla filtyper: MOM, HPR, HQC, FPR
- Sparar till Supabase
- Sorterar behandlade filer per maskin och filtyp
- Loggar all aktivitet

Författare: Skogsystem
Version: 1.0
"""

import os
import sys
import shutil
import time
import json
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
from urllib.parse import quote
from collections import defaultdict, Counter

# UUID pattern — Rottne machines sometimes put UUIDs instead of operator names
_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
from typing import Dict, List, Optional, Any
import hashlib
import uuid

# Tredjepartsbibliotek
try:
    import requests
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    print("Saknade bibliotek. Kör: py -m pip install requests watchdog")
    sys.exit(1)

# UUID-namespace för deterministisk mom_event_id (uuid5).
# Får ALDRIG ändras — gör vi det krockar inte uppslag, men varje
# omimporterat repair-event blir en NY rad istället för en dedup.
NS_SKOGSYSTEM_MOM = uuid.UUID('5e08e95e-4b6a-5e8b-9e07-d0e7e0e7e0e7')

def _strip_ns(tag: str) -> str:
    """Strippa '{namespace}'-prefix från ett ElementTree-taggnamn."""
    if tag and tag.startswith('{'):
        return tag.split('}', 1)[1]
    return tag

def _compute_mom_event_id(maskin_id: str, monitoring_start_iso: str) -> str:
    """Deterministisk uuid5 för ett repair-event. Samma input = samma uuid."""
    return str(uuid.uuid5(NS_SKOGSYSTEM_MOM, f"{maskin_id}|{monitoring_start_iso}"))

def _map_repair_to_kategori(delsystem: str, underorsak: Optional[str]) -> str:
    """Mappa Stanford repair-orsakskategori till maskin_service.kategori
    (CHECK: service|hydraulik|slang|punktering|motor|kran|aggregat|elektrisk|ovrigt)."""
    if delsystem == 'LoaderLinkage' and underorsak == 'Hydraulics':
        return 'hydraulik'
    if delsystem == 'LoaderLinkage':
        return 'kran'
    if delsystem == 'Engine':
        return 'motor'
    if delsystem == 'Electrical':
        return 'elektrisk'
    if delsystem in ('Assortment', 'Sawing', 'Measuring', 'Feeding', 'Cutting'):
        return 'aggregat'
    return 'ovrigt'

# ============================================================
# KONFIGURATION
# ============================================================

# Läs Supabase-credentials från .env.local
def _load_env_local():
    env = {}
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env.local')
    if not os.path.exists(env_path):
        return env
    with open(env_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env

_env = _load_env_local()
SUPABASE_URL = _env.get('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = _env.get('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
if not SUPABASE_URL or not SUPABASE_KEY:
    print("FEL: SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste finnas i .env.local")
    sys.exit(1)

# OneDrive-mappar
ONEDRIVE_BASE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer"
INKOMMANDE = os.path.join(ONEDRIVE_BASE, "Inkommande")
BEHANDLADE = os.path.join(ONEDRIVE_BASE, "Behandlade")

# Loggning
LOG_FILE = os.path.join(ONEDRIVE_BASE, "import_logg.txt")

# ============================================================
# LOGGNING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def _git_commit_short():
    """Kort git-hash för katalogen skriptet ligger i. 'unknown' om ej git-repo
    (t.ex. en lös kopia utanför repot — avslöjar att fel skript kört)."""
    try:
        import subprocess
        here = os.path.dirname(os.path.abspath(__file__))
        out = subprocess.run(['git', '-C', here, 'rev-parse', '--short', 'HEAD'],
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or 'unknown'
    except Exception:
        return 'unknown'


# ============================================================
# SUPABASE-ANSLUTNING (via REST API)
# ============================================================

SUPABASE_HEADERS = {}

# Global entry-level registry för korrekt deduplicering av fakt_tid
# över filer. Nyckel: (start_time_str, maskin_id, objekt_id) → entry dict.
# Operator-mappning: (datum, maskin_id, objekt_id) → operator_id.
_GLOBAL_TID_ENTRIES = {}
_GLOBAL_TID_OPERATORS = {}

# ── Operator email-cache ─────────────────────────────────────────────────────
# Nyckel: (maskin_id, email_lowercase) → kanoniskt operator_id.
# Laddas lättjefullt från dim_operator första gången resolve anropas.
# Uppdateras in-session när ett nytt id skapas, så FPR-filer som
# kommer efter MOM i samma körning redan hittar rätt id.
_op_email_cache: Dict[tuple, str] = {}
_op_cache_loaded: bool = False

def _ensure_op_cache() -> None:
    """Ladda dim_operator-emailar från Supabase en gång per skriptkörning."""
    global _op_cache_loaded
    if _op_cache_loaded:
        return
    _op_cache_loaded = True
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/dim_operator"
            "?select=operator_id,maskin_id,email&email=not.is.null",
            headers=SUPABASE_HEADERS, timeout=15
        )
        if resp.status_code == 200:
            for row in resp.json():
                mid = row.get('maskin_id') or ''
                em  = (row.get('email') or '').strip().lower()
                oid = row.get('operator_id') or ''
                if mid and em and oid:
                    _op_email_cache[(mid, em)] = oid
            logger.debug(f"Operator-cache laddad: {len(_op_email_cache)} poster")
    except Exception as e:
        logger.warning(f"Kunde inte ladda operator email-cache: {e}")


def resolve_operator_id(maskin_id: str, op_key: str, email: str, namn: str = '') -> str:
    """
    Returnera kanoniskt operator_id.

    Fallback-ordning:
      1. email finns + träff i dim_operator → återanvänd befintligt id
      2. annars → f"{maskin_id}_{op_key}"  (= nuvarande beteende, säker separat rad)

    Loggar WARNING om föraren har ett riktigt namn men saknar e-post —
    det är ett maskin-konfigurationsproblem. Rottne (inget namn, inget e-post)
    loggas bara på DEBUG-nivå.
    """
    if email:
        _ensure_op_cache()
        em_key = (maskin_id, email.strip().lower())
        if em_key in _op_email_cache:
            logger.debug(
                f"  Operator normaliserad: {maskin_id}_{op_key} -> "
                f"{_op_email_cache[em_key]} (email: {email})"
            )
            return _op_email_cache[em_key]
    else:
        har_riktigt_namn = namn and not namn.startswith('Operator ')
        if har_riktigt_namn:
            logger.warning(
                f"  OPERATOR SAKNAR E-POST: '{namn}' pa {maskin_id} "
                f"(key={op_key}) -- skapar {maskin_id}_{op_key}. "
                f"Lagg in e-post i maskinen for automatisk normalisering."
            )
        else:
            logger.debug(
                f"  Operator {maskin_id}_{op_key} har inget namn/e-post "
                f"(forvanta for Rottne)"
            )

    op_id = f"{maskin_id}_{op_key}"
    if email:
        # Registrera i session-cache: efterföljande filer i samma körning
        # normaliserar direkt mot detta id utan att behöva träffa DB.
        _op_email_cache[(maskin_id, email.strip().lower())] = op_id
    return op_id

# ─────────────────────────────────────────────────────────────────────────────

def init_supabase():
    """Initierar headers för Supabase REST API"""
    global SUPABASE_HEADERS
    try:
        SUPABASE_HEADERS = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        # Testa anslutning
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/dim_maskin?select=maskin_id&limit=1",
            headers=SUPABASE_HEADERS,
            timeout=30
        )
        if response.status_code in [200, 406]:  # 406 = tom tabell, OK
            logger.info("✓ Ansluten till Supabase")
            return True
        else:
            logger.error(f"✗ Supabase svarade med: {response.status_code}")
            return False
    except Exception as e:
        logger.error(f"✗ Kunde inte ansluta till Supabase: {e}")
        return False

# ============================================================
# HJÄLPFUNKTIONER
# ============================================================

def get_namespace(root) -> str:
    """Extrahera namespace från root-elementet"""
    if root.tag.startswith('{'):
        return root.tag.split('}')[0] + '}'
    return ''

def find_element(parent, tag, ns=''):
    """Hitta element med eller utan namespace"""
    if ns:
        elem = parent.find(f'{ns}{tag}')
        if elem is not None:
            return elem
    return parent.find(tag)

def find_all_elements(parent, tag, ns=''):
    """Hitta alla element med eller utan namespace"""
    if ns:
        elems = parent.findall(f'{ns}{tag}')
        if elems:
            return elems
    return parent.findall(tag)

def get_text(parent, tag, ns='', default='') -> str:
    """Hämta text från ett child-element"""
    elem = find_element(parent, tag, ns)
    if elem is not None and elem.text:
        return elem.text.strip()
    return default

def get_attr(elem, attr, default='') -> str:
    """Hämta attribut från element"""
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

def nullif_empty(s):
    """Konvertera tom eller whitespace-sträng till None. Behåller andra värden oförändrade."""
    if s is None:
        return None
    if isinstance(s, str) and s.strip() == '':
        return None
    return s

def make_objekt_id(vo_nummer: str, maskin_id: str, obj_key: str) -> str:
    """Bygg objekt_id: använd vo_nummer om det är numeriskt, annars maskin_id_obj_key"""
    if vo_nummer and vo_nummer.strip().isdigit():
        return vo_nummer.strip()
    return f"{maskin_id}_{obj_key}"

def ar_tidsstampelnamn(namn) -> bool:
    """True om 'namnet' bara är siffror/datumskiljetecken — ett autogenererat
    klockslag ('260325091142', '20250731', '2026-04-30 0753') eller tomt.
    Sådana värden är ALDRIG riktiga objektnamn."""
    if namn is None:
        return True
    s = str(namn).strip()
    if not s:
        return True
    return re.fullmatch(r'[\d\s\-_:.]+', s) is not None

# Suffixmönster i maskinernas filnamn, strippas iterativt bakifrån:
#   _YYYYMMDD_HHMMSS        ominläst kopia (kan vara staplade)
#   _MASKINID_YYYYMMDDHHMMSS  Ponsse skördare (HPR/MOM)
#   -DDMMYY-HHMMSS          Ponsse skotare (FPR/MOM), även _DDMMYY-HHMMSS
#   " YYYY-MM-DD[ HHMM]"    Rottne (MOM/HPR)
_FILNAMN_SUFFIX = [
    re.compile(r'_20\d{6}_\d{6}$'),
    re.compile(r'_[A-Za-z0-9]+_20\d{12}$'),
    re.compile(r'[-_]\d{6}-\d{6}$'),
    re.compile(r'\s+\d{4}-\d{2}-\d{2}(\s+\d{4})?$'),
]

def harled_objektnamn(filnamn: str, object_name_xml: str = '') -> Optional[str]:
    """ENDA namnhärledningen för dim_objekt — används av alla parsrar.

    Maskinen stoppar förarens objektnamn i FILNAMNET vid export, medan
    XML:ens <ObjectName> för självstartade objekt bara är en tidsstämpel
    (verifierat: 'Rödby_2_6_S_P_RP__25-250326-091255.fpr' har
    ObjectName=260325091142). Därför:
      1) filnamnet utan ändelse och suffixmönster
      2) tidsstämpel/tomt -> ObjectName om det inte också är tidsstämpel
      3) annars None — hellre ärligt namnlöst än ett datum som låtsas
         vara ett namn (vyer får visa 'namnlöst', aldrig ett klockslag).
    """
    base = os.path.basename(filnamn or '').rsplit('.', 1)[0]
    andrat = True
    while andrat:
        andrat = False
        for pat in _FILNAMN_SUFFIX:
            nytt = pat.sub('', base)
            if nytt != base:
                base = nytt
                andrat = True
    namn = ' '.join(base.replace('_', ' ').split())
    if not ar_tidsstampelnamn(namn):
        return namn
    if not ar_tidsstampelnamn(object_name_xml):
        return str(object_name_xml).strip()
    return None

def normalize_maskin_id(maskin_id: str, tillverkare: str = '') -> str:
    """Normalisera maskin-ID för konsekvent format"""
    if not maskin_id:
        return maskin_id
    
    # Om Rottne och ID är bara siffror, lägg till R
    if tillverkare and 'rottne' in tillverkare.lower():
        if maskin_id.isdigit():
            return f"R{maskin_id}"
    
    # Om ID är bara siffror och 5 tecken (Rottne-format), lägg till R
    if maskin_id.isdigit() and len(maskin_id) == 5:
        return f"R{maskin_id}"
    
    return maskin_id

def parse_datetime(dt_str) -> Optional[datetime]:
    """Parsa datetime-sträng"""
    if not dt_str:
        return None
    try:
        dt_str = re.sub(r'[+-]\d{2}:\d{2}$', '', dt_str)
        return datetime.fromisoformat(dt_str)
    except:
        return None

def get_file_hash(filepath: str) -> str:
    """Beräkna MD5-hash för fil"""
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


# ============================================================
# INNEHÅLLS-HASH för kalibreringskontroller
# ------------------------------------------------------------
# Samma HQC-mätning exporteras som flera filer med olika tidsstämpel i
# namnet. Unikhet får därför avgöras på INNEHÅLL, inte filnamn. Hashen
# beräknas över maskin- OCH operatörsvärden per stock (så en omklavning av
# samma maskinmätta stam räknas som en ny kontroll).
#
# Måste bli IDENTISK oavsett om den räknas ur parserns dict (naiv datetime,
# heltal) eller ur DB-rader (aware ISO-sträng, JSON-tal). Därför normaliseras:
#   • datum → UTC-epoch-sekunder (parsern strippar tz → naiv = UTC).
#   • tal   → kanonisk form ("442" == "442.0").
def _hash_epoch(v):
    """Datum/tidsvärde → UTC-epoch-sekunder som str (eller '' för tomt)."""
    if v is None or v == '':
        return ''
    if isinstance(v, str):
        try:
            v = datetime.fromisoformat(v)
        except Exception:
            return v
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)  # naiv (parsern) tolkas som UTC
        return str(int(v.astimezone(timezone.utc).timestamp()))
    return str(v)


def _hash_num(v):
    """Tal → kanonisk sträng (heltal utan decimal, '' för None)."""
    if v is None:
        return ''
    try:
        f = float(v)
        return str(int(f)) if f == int(f) else repr(f)
    except (TypeError, ValueError):
        return str(v)


def kontroll_innehalls_hash(stockar):
    """sha1 över sorterade per-stock-tuplar. None om inga stockar (tom kontroll)."""
    rows = sorted(
        '|'.join([
            _hash_num(s.get('stam_nummer')), _hash_num(s.get('stock_nummer')),
            _hash_epoch(s.get('machine_measurement_date')),
            _hash_epoch(s.get('operator_measurement_date')),
            _hash_num(s.get('maskin_langd_cm')), _hash_num(s.get('maskin_toppdia_mm')),
            _hash_num(s.get('operator_langd_cm')), _hash_num(s.get('operator_toppdia_mm')),
            _hash_num(s.get('stem_dbh_mm')),
        ])
        for s in stockar
    )
    if not rows:
        return None
    return hashlib.sha1('\n'.join(rows).encode()).hexdigest()

# ============================================================
# MOM-PARSER
# ============================================================

def parse_mom_file(filepath: str) -> Dict[str, Any]:
    """Parsa MOM-fil (Machine Operational Monitoring)"""
    
    tree = ET.parse(filepath)
    root = tree.getroot()
    ns = get_namespace(root)
    filnamn = os.path.basename(filepath)
    
    data = {
        'maskin': {},
        'operatorer': [],
        'objekt': [],
        'tradslag': [],
        'tid': [],
        'produktion': [],
        'skift': [],
        'avbrott': [],
        'maskin_service': [],
        'gps_spar': [],
        'filnamn': filnamn,
        'filtyp': 'MOM'
    }
    obj_key_map = {}  # {obj_key: objekt_id} för uppslaging i WorkTime-sektioner
    
    machine = find_element(root, 'Machine', ns)
    if machine is None:
        logger.warning(f"  Kunde inte hitta Machine-element i {filnamn}")
        return data
    
    # === MASKINDATA ===
    maskin_id = get_text(machine, 'BaseMachineManufacturerID', ns)
    if not maskin_id:
        maskin_id = get_text(machine, 'MachineKey', ns)
    
    model_elem = find_element(machine, 'MachineBaseModel', ns)
    head_elem = find_element(machine, 'MachineHeadModel', ns)
    
    # Ägare
    owner = find_element(machine, 'MachineOwner', ns)
    agare = ''
    if owner is not None:
        agare = get_text(owner, 'BusinessName', ns)
    
    # maskin_typ för MOM: läs från XML-metadata (machineCategory-attribut)
    mom_maskin_typ = get_attr(machine, 'machineCategory')
    if not mom_maskin_typ:
        mom_maskin_typ = 'Okänd'
        logger.warning(f"  ⚠ Kunde inte avgöra maskin_typ för {maskin_id} — sätts till 'Okänd', uppdatera manuellt i dim_maskin")
    data['maskin'] = {
        'maskin_id': maskin_id,
        'tillverkare': get_text(machine, 'MachineBaseManufacturer', ns),
        'modell': get_text(machine, 'MachineBaseModel', ns),
        'modell_ar': get_attr(model_elem, 'baseModelYear'),
        'aggregat_tillverkare': get_text(machine, 'MachineHeadManufacturer', ns),
        'aggregat': get_text(machine, 'MachineHeadModel', ns),
        'aggregat_ar': get_attr(head_elem, 'headModelYear'),
        'maskin_typ': mom_maskin_typ,
        'chassi': maskin_id,
        'agare': agare
    }
    
    # Normalisera maskin-ID (Rottne får R framför)
    maskin_id = normalize_maskin_id(maskin_id, data['maskin']['tillverkare'])
    data['maskin']['maskin_id'] = maskin_id
    data['maskin']['chassi'] = maskin_id
    
    logger.info(f"  Maskin: {maskin_id} ({data['maskin']['tillverkare']} {data['maskin']['modell']})")
    
    # === OPERATÖRER ===
    for op_def in find_all_elements(machine, 'OperatorDefinition', ns):
        op_key = get_text(op_def, 'OperatorKey', ns)
        contact = find_element(op_def, 'ContactInformation', ns)

        namn = ''
        email = ''
        if contact is not None:
            fname = get_text(contact, 'FirstName', ns)
            lname = get_text(contact, 'LastName', ns)
            candidate = f"{fname} {lname}".strip()
            # Skip UUID-like names (Rottne sometimes puts UUIDs instead of real names)
            if candidate and not _UUID_RE.match(candidate):
                namn = candidate
            email = (get_text(contact, 'Email', ns) or '').strip()
        if not namn:
            candidate = get_text(op_def, 'OperatorUserID', ns)
            if candidate and not _UUID_RE.match(candidate):
                namn = candidate
        if not namn:
            namn = f"Operatör {op_key}"

        if op_key:
            op_id = resolve_operator_id(maskin_id, op_key, email, namn)
            entry = {
                'operator_id': op_id,
                'operator_key': op_key,
                'operator_namn': namn,
                'maskin_id': maskin_id,
            }
            if email:
                entry['email'] = email
            data['operatorer'].append(entry)

    # === PER-FIL OPERATORKEY-KARTA ===
    # OperatorKey är FIL-LOKAL: maskinen skapar ny MOM-fil vid objektbyte och
    # numrerar om — första föraren i den nya filen får key 1, oavsett vem det är.
    # Identiteten ligger i ContactInformation (e-post) som resolve_operator_id
    # normaliserar till kanoniskt operator_id. ALLA radtyper måste gå via denna
    # karta — rå f"{maskin_id}_{op_key}" som identitet var rotorsaken till att
    # ~92h attribuerades på fel förare (jun/jul 2026).
    op_id_by_key = {o['operator_key']: o['operator_id'] for o in data['operatorer']}

    def op_id_for_key(op_key: str, kontext: str):
        """Kanoniskt operator_id för en fil-lokal OperatorKey.

        INGEN tyst rå-fallback: saknas OperatorDefinition för nyckeln loggas
        VARNING och raden lämnas oattribuerad (None) — hellre oattribuerad än
        bokförd på fel förare. Tyst gissning var det som skapade felet.
        """
        if not op_key:
            return None
        oid = op_id_by_key.get(op_key)
        if oid is None:
            logger.warning(
                f"  OPERATORKEY {op_key} SAKNAR OperatorDefinition i {filnamn} "
                f"({kontext}) -- raden lamnas oattribuerad (operator_id=None)"
            )
        return oid

    # === OBJEKT ===
    for obj_def in find_all_elements(machine, 'ObjectDefinition', ns):
        obj_key = get_text(obj_def, 'ObjectKey', ns)
        contract_number = get_text(obj_def, 'ContractNumber', ns)
        vo_nummer = contract_number if contract_number else get_text(obj_def, 'ObjectUserID', ns)
        # Namn: gemensam härledning (filnamn primärt — XML:ens ObjectName är
        # en tidsstämpel för självstartade objekt). Kan bli None = namnlöst.
        obj_name = harled_objektnamn(filnamn, get_text(obj_def, 'ObjectName', ns))

        # Skogsägare
        forest_owner = find_element(obj_def, 'ForestOwner', ns)
        skogsagare = ''
        if forest_owner is not None:
            skogsagare = get_text(forest_owner, 'LastName', ns)

        # Bolag fran LoggingOrganisation
        logging_org = find_element(obj_def, 'LoggingOrganisation', ns)
        bolag = ''
        if logging_org is not None:
            contact = find_element(logging_org, 'ContactInformation', ns)
            if contact is not None:
                bolag = get_text(contact, 'BusinessName', ns)
        
        # Avverkningsform
        logging_form = find_element(obj_def, 'LoggingForm', ns)
        avverkningsform = ''
        avverkningsform_kod = ''
        if logging_form is not None:
            avverkningsform_kod = get_text(logging_form, 'LoggingFormCode', ns)
            avverkningsform = get_text(logging_form, 'LoggingFormDescription', ns)
        
        # Certifiering
        certifiering = get_text(obj_def, 'ForestCertification', ns)
        
        # Avverkningsmetod (Ponsse-extension)
        cutting_method = ''
        ext = find_element(obj_def, 'Extension', ns)
        if ext is not None:
            ponsse = find_element(ext, 'Ponsse', ns)
            if ponsse is None:
                # Testa utan namespace
                for child in ext:
                    if 'Ponsse' in child.tag:
                        ponsse = child
                        break
            if ponsse is not None:
                cutting_method = get_text(ponsse, 'CuttingMethod', ns) or ponsse.findtext('.//{http://www.ponsse.com}CuttingMethod') or ''
        
        # Start- och slutdatum for objektet
        start_date = parse_datetime(get_text(obj_def, 'StartDate', ns))
        end_date = parse_datetime(get_text(obj_def, 'EndDate', ns))
        
        objekt_id = make_objekt_id(vo_nummer, maskin_id, obj_key)
        obj_key_map[obj_key] = objekt_id
        objektnr = get_text(obj_def, 'ObjectUserID', ns)

        data['objekt'].append({
            'objekt_id': objekt_id,
            'object_key': obj_key,
            'object_name': obj_name,
            'vo_nummer': vo_nummer,
            'objektnr': objektnr,
            'bolag': bolag,
            'areal_ha': safe_float(get_text(obj_def, 'ObjectArea', ns)),
            'maskin_id': maskin_id,
            'skogsagare': skogsagare,
            'avverkningsform': avverkningsform,
            'certifiering': certifiering,
            'cutting_method': cutting_method,
            'start_date': start_date,
            'end_date': end_date
        })
    
    # === TRÄDSLAG ===
    for sp_def in find_all_elements(machine, 'SpeciesGroupDefinition', ns):
        sp_key = get_text(sp_def, 'SpeciesGroupKey', ns)
        if sp_key:
            data['tradslag'].append({
                'tradslag_id': f"{maskin_id}_{sp_key}",
                'species_key': sp_key,
                'namn': get_text(sp_def, 'SpeciesGroupName', ns),
                'maskin_id': maskin_id
            })
    
    # === GPS-SPÅR (alla positioner) ===
    for track in find_all_elements(machine, 'Tracking', ns):
        for coords in find_all_elements(track, 'TrackCoordinates', ns):
            lat = safe_float(get_text(coords, 'Latitude', ns))
            lon = safe_float(get_text(coords, 'Longitude', ns))
            
            if lat and lon:
                coord_date = get_text(coords, 'CoordinateDate', ns)
                obj_key = get_text(coords, 'ObjectKey', ns)
                
                data['gps_spar'].append({
                    'maskin_id': maskin_id,
                    'objekt_id': obj_key_map.get(obj_key, f"{maskin_id}_{obj_key}") if obj_key else None,
                    'tidpunkt': parse_datetime(coord_date),
                    'latitude': lat,
                    'longitude': lon,
                    'altitude': safe_float(get_text(coords, 'Altitude', ns)),
                    'tracking_key': get_text(coords, 'TrackingKey', ns),
                    'filnamn': filnamn
                })
    
    logger.info(f"  GPS-punkter: {len(data['gps_spar'])}")
    
    # === SKIFT (inloggning + utloggning) ===
    for shift_def in find_all_elements(machine, 'OperatorShiftDefinition', ns):
        op_key = get_text(shift_def, 'OperatorKey', ns)
        start_time = get_text(shift_def, 'ShiftStartTime', ns)
        end_time = get_text(shift_def, 'ShiftEndTime', ns)
        # ShifKey (StanForD:s stavning) = maskinens EGET skift-id, stabilt
        # genom skiftets hela livscykel. Timvisa MOM-filer rapporterar samma
        # skift som växande ögonblicksbilder där BÅDE start och slut glider
        # (07:00 -> 07:57 -> 13:18 -> 06:00 för samma skift observerat) —
        # ShifKey är enda stabila identiteten. Verifierat 2026-07-21 över
        # 1031 keys/3 maskiner: en key = ett skift = ett startdatum, alltid.
        shift_key = get_text(shift_def, 'ShifKey', ns)
        
        start_dt = parse_datetime(start_time)
        end_dt = parse_datetime(end_time)
        
        langd_sek = 0
        if start_dt and end_dt:
            langd_sek = int((end_dt - start_dt).total_seconds())
        
        # GPS vid inloggning
        login_lat = None
        login_lon = None
        login_coords = find_element(shift_def, 'OperatorLogInCoordinates', ns)
        if login_coords is not None:
            login_lat = safe_float(get_text(login_coords, 'Latitude', ns))
            login_lon = safe_float(get_text(login_coords, 'Longitude', ns))
        
        # GPS vid utloggning
        logout_lat = None
        logout_lon = None
        logout_coords = find_element(shift_def, 'OperatorLogOutCoordinates', ns)
        if logout_coords is not None:
            logout_lat = safe_float(get_text(logout_coords, 'Latitude', ns))
            logout_lon = safe_float(get_text(logout_coords, 'Longitude', ns))
        
        # Fallback: första GPS-punkt om login-coords saknas
        if not login_lat and data['gps_spar']:
            login_lat = data['gps_spar'][0]['latitude']
            login_lon = data['gps_spar'][0]['longitude']
        
        skift_op_id = op_id_for_key(op_key, 'skift')
        data['skift'].append({
            'datum': start_dt.date() if start_dt else None,
            'maskin_id': maskin_id,
            'operator_id': skift_op_id,
            'inloggning_tid': start_dt,
            'utloggning_tid': end_dt,
            'langd_sek': langd_sek,
            'gps_lat': login_lat,
            'gps_long': login_lon,
            'logout_lat': logout_lat,
            'logout_lon': logout_lon,
            'filnamn': filnamn,
            # Fallback om ShifKey mot förmodan saknas: deterministisk nyckel
            # per (dag, operator) — samma som Rottnes syntetiska skift
            'shift_key': shift_key if shift_key else f"SYN_{start_dt.date() if start_dt else 'okand'}_{skift_op_id or op_key or 'okand'}"
        })
    
    # === ARBETSTID & PRODUKTION ===
    # Nyckla per individuell entry (MonitoringStartTime) så att överlappande entries
    # mellan sessioner/filer dedupliceras korrekt. Entries som förekommer i flera
    # filer (med uppdaterad duration) skrivs över med senaste filens värde.
    raw_tid_entries = {}  # (start_time_str, maskin_id, objekt_id) -> {category_field: duration, ...}
    tid_operator = {}  # (datum, maskin_id, objekt_id) -> senaste operator_id
    
    raw_produktion = defaultdict(lambda: {
        'stammar': 0, 'volym_m3sob': 0, 'volym_m3sub': 0
    })
    
    for work_time in find_all_elements(machine, 'IndividualMachineWorkTime', ns):
        op_key = get_text(work_time, 'OperatorKey', ns)
        obj_key = get_text(work_time, 'ObjectKey', ns)
        start_time = get_text(work_time, 'MonitoringStartTime', ns)
        duration = safe_int(get_text(work_time, 'MonitoringTimeLength', ns))

        start_dt = parse_datetime(start_time)
        datum = start_dt.date() if start_dt else None

        objekt_id_wt = obj_key_map.get(obj_key, f"{maskin_id}_{obj_key}")
        dag_key = (datum, maskin_id, objekt_id_wt)

        # Nyckla per unik entry (MonitoringStartTime + operator) för dedup.
        # Om samma entry (t.ex. en pågående arbetsperiod) förekommer i
        # flera filer, SKRIVS den över med senaste filens värde.
        # Operator-ID i nyckeln krävs för att per-förare rast/tid ska
        # bevaras när samma maskin körs av två förare samma dag/objekt.
        entry_operator = op_id_for_key(op_key, 'arbetstid')
        if entry_operator:
            tid_operator[dag_key] = entry_operator
        entry_key = (start_time, maskin_id, objekt_id_wt, entry_operator)
        entry = {
            'datum': datum,
            'operator_id': entry_operator,
            'processing_sek': 0, 'terrain_sek': 0, 'other_work_sek': 0,
            'maintenance_sek': 0, 'disturbance_sek': 0, 'rast_sek': 0,
            'avbrott_sek': 0, 'kort_stopp_sek': 0, 'bransle_liter': 0,
            'engine_time_sek': 0, 'korstracka_m': 0,
            'terrain_korstracka_m': 0, 'terrain_bransle_liter': 0.0
        }

        other_data = find_element(work_time, 'OtherMachineData', ns)

        if other_data is not None:
            fuel = safe_float(get_text(other_data, 'FuelConsumption', ns))
            if fuel < 10000:  # Rimlighetskontroll
                entry['bransle_liter'] = fuel

            engine_time = safe_int(get_text(other_data, 'EngineTime', ns))
            entry['engine_time_sek'] = engine_time

            distance = safe_int(get_text(other_data, 'DrivenDistance', ns))
            entry['korstracka_m'] = distance

            # Produktionsdata (skördare)
            for harvester_data in find_all_elements(other_data, 'HarvesterData', ns):
                sp_key = get_text(harvester_data, 'SpeciesGroupKey', ns)
                stems = safe_int(get_text(harvester_data, 'NumberOfHarvestedStems', ns))
                proc_cat = get_text(harvester_data, 'ProcessingCategory', ns)

                # Normalisera processtyp
                processtyp = 'Single'
                if proc_cat and 'Multi' in proc_cat:
                    processtyp = 'MTH'

                volym_sob = 0.0
                volym_sub = 0.0

                for vol_elem in find_all_elements(harvester_data, 'TotalVolumeOfHarvestedLogs', ns):
                    cat = get_attr(vol_elem, 'harvestedLogsVolumeCategory')
                    val = safe_float(vol_elem.text)

                    # MTH rapporterar uppskattad volym - ta med den, hoppa bara over estimated for Single
                    if 'estimated' in cat.lower() and processtyp == 'Single':
                        continue
                    if 'sob' in cat.lower():
                        if volym_sob == 0.0:  # Ta forsta sob-volymen, inte skriv over
                            volym_sob = val
                    elif 'sub' in cat.lower():
                        if volym_sub == 0.0:
                            volym_sub = val

                if stems > 0 or volym_sub > 0:
                    prod_key = (start_dt, maskin_id, entry_operator,
                               objekt_id_wt, f"{maskin_id}_{sp_key}", processtyp)
                    raw_produktion[prod_key]['stammar'] += stems
                    raw_produktion[prod_key]['volym_m3sob'] += volym_sob
                    raw_produktion[prod_key]['volym_m3sub'] += volym_sub

        # Tidskategorier
        run_cat = find_element(work_time, 'IndividualMachineRunTimeCategory', ns)
        down_time = find_element(work_time, 'IndividualMachineDownTime', ns)
        unutilized = find_element(work_time, 'IndividualUnutilizedTimeCategory', ns)

        if run_cat is not None and run_cat.text:
            cat = run_cat.text
            if cat == 'Processing':
                entry['processing_sek'] = duration
            elif cat == 'Terrain travel':
                entry['terrain_sek'] = duration
                # Körsträcka och bränsle specifikt för terrängkörning
                if other_data is not None:
                    t_dist = safe_int(get_text(other_data, 'DrivenDistance', ns))
                    t_fuel = safe_float(get_text(other_data, 'FuelConsumption', ns))
                    entry['terrain_korstracka_m'] = t_dist
                    if t_fuel < 10000:
                        entry['terrain_bransle_liter'] = t_fuel
            else:
                entry['other_work_sek'] = duration
        elif down_time is not None:
            maint = find_element(down_time, 'Maintenance', ns)
            dist = find_element(down_time, 'Disturbance', ns)
            repair = find_element(down_time, 'Repair', ns)
            other = find_element(down_time, 'OtherMachineDownTimeCategory', ns)

            if maint is not None:
                entry['maintenance_sek'] = duration
                maint_code = get_text(maint, 'MaintenanceStandardCode', ns)
                data['avbrott'].append({
                    'datum': datum,
                    'klockslag': start_dt.time() if start_dt else None,
                    'maskin_id': maskin_id,
                    'operator_id': entry_operator,
                    'objekt_id': objekt_id_wt,
                    'typ': 'Underhåll',
                    'kategori_kod': maint_code,
                    'langd_sek': duration,
                    'filnamn': filnamn
                })
            elif dist is not None:
                entry['disturbance_sek'] = duration
                dist_code = get_text(dist, 'DisturbanceStandardCode', ns)
                data['avbrott'].append({
                    'datum': datum,
                    'klockslag': start_dt.time() if start_dt else None,
                    'maskin_id': maskin_id,
                    'operator_id': entry_operator,
                    'objekt_id': objekt_id_wt,
                    'typ': 'Störning',
                    'kategori_kod': dist_code,
                    'langd_sek': duration,
                    'filnamn': filnamn
                })
            elif other is not None:
                # Stanford v3.6 enum: "Waiting for repair", "Trailer transportation",
                # "Unproductive terrain work", "Waiting for other machine production",
                # "Other", "Default". Tid bokförs i avbrott_sek (regel A — konsekvent
                # med Repair). Ingen maskin_service-rad — operativt avbrott, ej service.
                entry['avbrott_sek'] = duration
                other_code = get_text(other, 'OtherMachineDownTimeStandardCode', ns) or None
                mfg = find_element(other, 'OtherMachineDownTimeManufacturerCode', ns)
                mfg_desc = get_text(mfg, 'CodeDescription', ns) if mfg is not None else None
                data['avbrott'].append({
                    'datum': datum,
                    'klockslag': start_dt.time() if start_dt else None,
                    'maskin_id': maskin_id,
                    'operator_id': entry_operator,
                    'objekt_id': objekt_id_wt,
                    'typ': 'Övrigt',
                    'kategori_kod': other_code,
                    'delsystem': None,
                    'underorsak': None,
                    'detalj': mfg_desc or None,
                    'langd_sek': duration,
                    'filnamn': filnamn
                })
            else:
                # Tid landar i avbrott_sek oavsett om Repair-element finns.
                # Uppföljningsvyns "Avbrott Xh" räknas från fakt_tid.avbrott_sek
                # (regel A) — strukturerade rader till fakt_avbrott + maskin_service
                # är ADDITION, inte ERSÄTTNING.
                entry['avbrott_sek'] = duration

                if repair is not None:
                    repair_children = list(repair)
                    if repair_children:
                        # <Repair> har exakt ett barn = orsakskategori (LoaderLinkageRepairReason etc).
                        orsakskategori_elem = repair_children[0]
                        kat_tag = _strip_ns(orsakskategori_elem.tag)
                        delsystem = kat_tag[:-len('RepairReason')] if kat_tag.endswith('RepairReason') else kat_tag

                        # Underorsak = första barn till orsakskategorin (taggnamnet),
                        # detalj = textinnehållet.
                        underorsak = None
                        detalj = None
                        underorsak_children = list(orsakskategori_elem)
                        if underorsak_children:
                            uo_elem = underorsak_children[0]
                            underorsak = _strip_ns(uo_elem.tag)
                            detalj = (uo_elem.text or '').strip() or None

                        # SpareParts kan finnas i 0..N block (alt c: konkatenera + summera).
                        sp_namn_list, sp_beskr_list, sp_antal_total = [], [], 0
                        for sp in find_all_elements(down_time, 'SpareParts', ns):
                            sp_id = get_text(sp, 'SparePartIdentity', ns)
                            sp_desc = get_text(sp, 'SparePartDescription', ns)
                            sp_n = safe_int(get_text(sp, 'SparePartsNoOfItems', ns))
                            if sp_id: sp_namn_list.append(sp_id)
                            if sp_desc: sp_beskr_list.append(sp_desc)
                            if sp_n: sp_antal_total += sp_n
                        reservdel_namn = '; '.join(sp_namn_list) or None
                        reservdel_beskrivning = '; '.join(sp_beskr_list) or None
                        reservdel_antal = sp_antal_total or None

                        mom_event_id = _compute_mom_event_id(maskin_id, start_time)

                        kategori_kod_parts = ['REPAIR', delsystem.upper()]
                        if underorsak:
                            kategori_kod_parts.append(underorsak.upper())
                        kategori_kod = '_'.join(kategori_kod_parts)

                        ms_kategori = _map_repair_to_kategori(delsystem, underorsak)
                        ms_del = reservdel_namn or ms_kategori
                        if reservdel_beskrivning:
                            ms_beskrivning = reservdel_beskrivning
                        elif delsystem and detalj:
                            ms_beskrivning = f"{delsystem}: {detalj}"
                        else:
                            ms_beskrivning = None

                        data['avbrott'].append({
                            'datum': datum,
                            'klockslag': start_dt.time() if start_dt else None,
                            'maskin_id': maskin_id,
                            'operator_id': entry_operator,
                            'objekt_id': objekt_id_wt,
                            'typ': 'Reparation',
                            'kategori_kod': kategori_kod,
                            'langd_sek': duration,
                            'mom_event_id': mom_event_id,
                            'delsystem': delsystem,
                            'underorsak': underorsak,
                            'detalj': detalj,
                            'filnamn': filnamn
                        })

                        data['maskin_service'].append({
                            'mom_event_id': mom_event_id,
                            'maskin_stanford_id': maskin_id,
                            'operator_key': op_key,
                            'kategori': ms_kategori,
                            'del': ms_del,
                            'beskrivning': ms_beskrivning,
                            'datum': datum,
                            'kalla': 'mom',
                            'delsystem': delsystem,
                            'underorsak': underorsak,
                            'detalj': detalj,
                            'reservdel_namn': reservdel_namn,
                            'reservdel_beskrivning': reservdel_beskrivning,
                            'reservdel_antal': reservdel_antal,
                            'langd_sek': duration,
                        })
        elif unutilized is not None:
            entry['rast_sek'] = duration

        # Spara/skriv över entryn — senaste filens version vinner
        raw_tid_entries[entry_key] = entry

    # Korta stopp (IndividualShortDownTime) – nyckling per entry (MonitoringStartTime + operator).
    # SEMANTIK: dessa är annoteringar av pauser INUTI G15-runtime (processing/terrain/other work)
    # — INTE additiva segment; kort_stopp_sek får aldrig summeras med P/T/OW som "total tid".
    # G15-gränsen (15 min = 900 s) tillämpas av MASKINEN när MOM skrivs. DownTime-segment
    # UNDER gränsen (hamnar i fakt_avbrott) är maskingenererade övergångsglapp — appen räknar
    # dem till "Korta pauser" ihop med kort_stopp_sek via lib/g15.ts (G15_GRANS_SEK = 900);
    # väggklocke-separata mot ShortDownTime → adderbara. Ändras gränsen: uppdatera båda ställena.
    for short_down in find_all_elements(machine, 'IndividualShortDownTime', ns):
        duration = safe_int(get_text(short_down, 'MonitoringTimeLength', ns))
        start_time = get_text(short_down, 'MonitoringStartTime', ns)
        start_dt = parse_datetime(start_time)
        op_key = get_text(short_down, 'OperatorKey', ns)
        obj_key = get_text(short_down, 'ObjectKey', ns)

        datum = start_dt.date() if start_dt else None
        short_objekt_id = obj_key_map.get(obj_key, f"{maskin_id}_{obj_key}")
        dag_key = (datum, maskin_id, short_objekt_id)

        short_operator = op_id_for_key(op_key, 'kort stopp')
        if short_operator:
            tid_operator[dag_key] = short_operator
        entry_key = (start_time, maskin_id, short_objekt_id, short_operator)
        entry = raw_tid_entries.get(entry_key, {
            'datum': datum,
            'operator_id': short_operator,
            'processing_sek': 0, 'terrain_sek': 0, 'other_work_sek': 0,
            'maintenance_sek': 0, 'disturbance_sek': 0, 'rast_sek': 0,
            'avbrott_sek': 0, 'kort_stopp_sek': 0, 'bransle_liter': 0,
            'engine_time_sek': 0, 'korstracka_m': 0,
            'terrain_korstracka_m': 0, 'terrain_bransle_liter': 0.0
        })
        entry['kort_stopp_sek'] = duration
        raw_tid_entries[entry_key] = entry

    # Aggregera dedupade entries per (datum, maskin_id, objekt_id, operator_id)
    # — operator i nyckeln så att rast/tid stannar per förare när samma maskin
    # delas av flera. Tidigare slogs allt ihop och "senaste operator" fick hela
    # summan.
    raw_tid_agg = defaultdict(lambda: {
        'processing_sek': 0, 'terrain_sek': 0, 'other_work_sek': 0,
        'maintenance_sek': 0, 'disturbance_sek': 0, 'rast_sek': 0,
        'avbrott_sek': 0, 'kort_stopp_sek': 0, 'bransle_liter': 0,
        'engine_time_sek': 0, 'korstracka_m': 0,
        'terrain_korstracka_m': 0, 'terrain_bransle_liter': 0.0
    })
    for entry_key, entry in raw_tid_entries.items():
        # entry_key kan vara (start_time, maskin, objekt, operator) eller
        # gammal form (start_time, maskin, objekt) — tolerant mot båda.
        if len(entry_key) == 4:
            start_time_str, maskin, objekt, operator = entry_key
        else:
            start_time_str, maskin, objekt = entry_key
            operator = entry.get('operator_id') or tid_operator.get((entry['datum'], maskin, objekt))
        datum = entry['datum']
        dag_key = (datum, maskin, objekt, operator)
        for field in raw_tid_agg[dag_key]:
            raw_tid_agg[dag_key][field] += entry.get(field, 0) or 0

    # Konvertera till listor
    for key, values in raw_tid_agg.items():
        datum, maskin, objekt, operator = key

        # Beräkna tomgång: G0 = runtime - kort_stopp (MOM runtime är G15-inklusiv)
        runtime = values['processing_sek'] + values['terrain_sek'] + values['other_work_sek']
        g0 = runtime - values['kort_stopp_sek']
        tomgang = max(0, values['engine_time_sek'] - g0)

        data['tid'].append({
            'datum': datum,
            'maskin_id': maskin,
            'operator_id': operator,
            'objekt_id': objekt,
            **values,
            'tomgang_sek': tomgang,
            'filnamn': filnamn
        })
    
    # Spara entry-level data för korrekt deduplicering över filer
    data['tid_entries'] = raw_tid_entries
    data['tid_operator'] = tid_operator

    for key, values in raw_produktion.items():
        start_dt_key, maskin, operator, objekt, tradslag, processtyp = key
        datum_key = start_dt_key.date() if start_dt_key else None
        data['produktion'].append({
            'datum': datum_key,
            'maskin_id': maskin,
            'operator_id': operator,
            'objekt_id': objekt,
            'tradslag_id': tradslag,
            'processtyp': processtyp,
            'monitoring_start': start_dt_key,
            **values,
            'filnamn': filnamn
        })
    
    # === MASKINSTATISTIK (totaler per fil) ===
    op_mon = find_element(machine, 'OperationalMonitoring', ns)
    if op_mon is not None:
        total_engine = safe_int(get_text(op_mon, 'MachineEngineTime', ns))
        total_fuel = safe_float(get_text(op_mon, 'MachineFuelConsumption', ns))
        total_distance = safe_float(get_text(op_mon, 'MachineDrivenDistance', ns))
        if total_engine or total_fuel or total_distance:
            data['maskin_statistik'] = {
                'maskin_id': maskin_id,
                'filnamn': filnamn,
                'total_engine_time_sek': total_engine,
                'total_bransle_liter': total_fuel if total_fuel < 100000 else 0,
                'total_korstracka_m': total_distance
            }

    logger.info(f"  Tid: {len(data['tid'])} poster, Produktion: {len(data['produktion'])} poster")
    ovrigt_count = sum(1 for a in data['avbrott'] if a.get('typ') == 'Övrigt')
    logger.info(f"  Avbrott: {len(data['avbrott'])}, Skift: {len(data['skift'])}, Repair-events: {len(data['maskin_service'])}, Övrigt: {ovrigt_count}")

    # === SYNTETISKA SKIFT för maskiner utan OperatorShiftDefinition (t.ex. Rottne) ===
    # Beräkna min/max MonitoringStartTime per (operator, datum) från WorkTime-entries
    if not data['skift'] and raw_tid_entries:
        op_dag_times = defaultdict(list)  # (operator_id, datum) -> [datetime, ...]
        for ek, entry in raw_tid_entries.items():
            if len(ek) == 4:
                start_time_str, mid, oid, op_from_key = ek
            else:
                start_time_str, mid, oid = ek
                op_from_key = None
            dt = parse_datetime(start_time_str)
            if not dt:
                continue
            op_id = op_from_key or entry.get('operator_id') or tid_operator.get((dt.date(), mid, oid))
            if op_id:
                duration_sek = 0
                for f in ['processing_sek', 'terrain_sek', 'other_work_sek',
                           'maintenance_sek', 'disturbance_sek', 'rast_sek', 'avbrott_sek']:
                    duration_sek += entry.get(f, 0)
                op_dag_times[(op_id, dt.date())].append((dt, duration_sek))

        for (op_id, datum), entries in op_dag_times.items():
            if not entries:
                continue
            earliest = min(e[0] for e in entries)
            # Sluttid = senaste start + dess duration
            latest_entry = max(entries, key=lambda e: e[0])
            latest_end = latest_entry[0] + __import__('datetime').timedelta(seconds=latest_entry[1])
            total_sek = sum(e[1] for e in entries)

            data['skift'].append({
                'datum': datum,
                'maskin_id': maskin_id,
                'operator_id': op_id,
                'inloggning_tid': earliest,
                'utloggning_tid': latest_end,
                'langd_sek': total_sek,
                'gps_lat': None,
                'gps_long': None,
                'logout_lat': None,
                'logout_lon': None,
                'filnamn': filnamn,
                # Rottne saknar ShifKey — deterministisk nyckel per (dag,
                # operator) så timvisa snapshot-filer upsert:ar samma rad
                # i stället för att stapla dubbletter
                'shift_key': f"SYN_{datum}_{op_id}"
            })

        if data['skift']:
            logger.info(f"  Syntetiska skift: {len(data['skift'])} (från WorkTime)")

    return data

# ============================================================
# HPR-PARSER
# ============================================================

def parse_hpr_file(filepath: str) -> Dict[str, Any]:
    """Parsa HPR-fil (Harvested Production Report)"""
    
    tree = ET.parse(filepath)
    root = tree.getroot()
    ns = get_namespace(root)
    filnamn = os.path.basename(filepath)
    
    data = {
        'maskin': {},
        'objekt': [],
        'sortiment': [],
        'sortiment_pris': [],
        'tradslag': [],
        'stammar': [],
        'stockar': [],
        'sortiment_summering': [],
        'gps_spar': [],
        'objekt_cert_updates': [],   # [(objekt_id, cert)]
        'filnamn': filnamn,
        'filtyp': 'HPR'
    }
    obj_key_map = {}  # {obj_key: objekt_id}
    
    machine = find_element(root, 'Machine', ns)
    if machine is None:
        logger.warning(f"  Kunde inte hitta Machine-element i {filnamn}")
        return data
    
    # === MASKINDATA ===
    maskin_id = get_text(machine, 'BaseMachineManufacturerID', ns)
    if not maskin_id:
        maskin_id = get_text(machine, 'MachineKey', ns)
    
    tillverkare = get_text(machine, 'MachineBaseManufacturer', ns)
    maskin_id = normalize_maskin_id(maskin_id, tillverkare)
    
    # HPR = Harvester
    data['maskin'] = {
        'maskin_id': maskin_id,
        'tillverkare': tillverkare,
        'modell': get_text(machine, 'MachineBaseModel', ns),
        'maskin_typ': 'Harvester',
    }

    logger.info(f"  Maskin: {maskin_id}")
    
    # === OBJEKT ===
    for obj_def in find_all_elements(machine, 'ObjectDefinition', ns):
        obj_key = get_text(obj_def, 'ObjectKey', ns)
        contract_number = get_text(obj_def, 'ContractNumber', ns)
        vo_nummer = contract_number if contract_number else get_text(obj_def, 'ObjectUserID', ns)
        
        # Avverkningsform
        logging_form = find_element(obj_def, 'LoggingForm', ns)
        avverkningsform = ''
        avverkningsform_kod = ''
        if logging_form is not None:
            avverkningsform_kod = get_text(logging_form, 'LoggingFormCode', ns)
            avverkningsform = get_text(logging_form, 'LoggingFormDescription', ns)
        
        certifiering = get_text(obj_def, 'ForestCertification', ns)
        
        # Skogsagare
        forest_owner = find_element(obj_def, 'ForestOwner', ns)
        skogsagare = ''
        if forest_owner is not None:
            skogsagare = get_text(forest_owner, 'LastName', ns)
        
        # Bolag
        logging_org = find_element(obj_def, 'LoggingOrganisation', ns)
        bolag = ''
        if logging_org is not None:
            contact = find_element(logging_org, 'ContactInformation', ns)
            if contact is not None:
                bolag = get_text(contact, 'BusinessName', ns)
        
        # Fastighetsnummer
        # fastighet_id kolumn finns ej i dim_objekt – utelämnad
        
        # Start- och slutdatum för objektet
        start_date = parse_datetime(get_text(obj_def, 'StartDate', ns))
        end_date = parse_datetime(get_text(obj_def, 'EndDate', ns))
        
        objekt_id = make_objekt_id(vo_nummer, maskin_id, obj_key)
        obj_key_map[obj_key] = objekt_id

        data['objekt'].append({
            'objekt_id': objekt_id,
            'object_key': obj_key,
            # Gemensam härledning — HPR-filnamn bär namnet ("Göljahult RP
            # 2025_PONS..._20260310150612.hpr"), rå ObjectName gjorde det inte.
            'object_name': harled_objektnamn(filnamn, get_text(obj_def, 'ObjectName', ns)),
            'vo_nummer': vo_nummer,
            'maskin_id': maskin_id,
            'skogsagare': skogsagare,
            'bolag': bolag,
            'avverkningsform': avverkningsform,
            'certifiering': certifiering,
            'start_date': start_date,
            'end_date': end_date
        })

        # För UPDATE objekt SET cert = ... WHERE dim_objekt_id = obj_key
        if certifiering:
            data['objekt_cert_updates'].append((objekt_id, certifiering))
    
    # === SORTIMENT/PRODUKTER ===
    product_names = {}
    for prod_def in find_all_elements(machine, 'ProductDefinition', ns):
        prod_key = get_text(prod_def, 'ProductKey', ns)
        prod_name = get_text(prod_def, 'ProductName', ns)
        # Rottne/Ponsse: ProductName kan ligga i ClassifiedProductDefinition
        if not prod_name:
            for sub_tag in ['ClassifiedProductDefinition', 'UnclassifiedProductDefinition']:
                sub = find_element(prod_def, sub_tag, ns)
                if sub is not None:
                    prod_name = get_text(sub, 'ProductName', ns)
                    prod_group = get_text(sub, 'ProductGroupName', ns)
                    if prod_name and prod_group and prod_group not in prod_name:
                        prod_name = f"{prod_group}: {prod_name}"
                    break
        product_names[prod_key] = prod_name

        # Color1 (färgmärkning) från ClassifiedProductDefinition.
        # Pris hanteras separat per dimensionsklass via ProductMatrixItem nedan.
        fargmarkning = None
        for sub_tag in ['ClassifiedProductDefinition', 'UnclassifiedProductDefinition']:
            sub = find_element(prod_def, sub_tag, ns)
            if sub is not None:
                color_txt = (get_text(sub, 'Color1', ns) or '').strip().lower()
                if color_txt in ('true', 'false'):
                    fargmarkning = color_txt == 'true'
                break

        sort_row = {
            'sortiment_id': f"{maskin_id}_{prod_key}",
            'product_key': prod_key,
            'namn': prod_name,
            'maskin_id': maskin_id,
        }
        if fargmarkning is not None:
            sort_row['fargmarkning'] = fargmarkning
        data['sortiment'].append(sort_row)

        # === PRIS-MATRIS (ProductMatrixItem) ===
        # Verifierat StanForD-2010-nesting:
        #   ClassifiedProductDefinition
        #     └── ProductMatrixes (container)
        #          └── ProductMatrixItem (en per [lengthClass, diameterClass]-tröskel)
        #               @lengthClassLowerLimit, @diameterClassLowerLimit (attribut)
        #               <Price>...</Price> (sub-element)
        # Inga upper-limits — övre gränser är implicita (nästa rads lower-limit).
        # Lookup görs som "find largest threshold not exceeding stockens dim".
        classified = find_element(prod_def, 'ClassifiedProductDefinition', ns) \
                     or find_element(prod_def, 'UnclassifiedProductDefinition', ns)
        if classified is not None:
            sortiment_id = f"{maskin_id}_{prod_key}"
            matrixes = find_element(classified, 'ProductMatrixes', ns)
            if matrixes is not None:
                for matrix_item in find_all_elements(matrixes, 'ProductMatrixItem', ns):
                    lc_lower = safe_int(matrix_item.get('lengthClassLowerLimit'))
                    dc_lower = safe_int(matrix_item.get('diameterClassLowerLimit'))
                    pris_txt = get_text(matrix_item, 'Price', ns)
                    pris = safe_float(pris_txt) if pris_txt else None
                    # pris > 0 — många matrix-items har Price=0 för otillåtna kombinationer
                    if pris is not None and pris > 0 and lc_lower and dc_lower:
                        data['sortiment_pris'].append({
                            'sortiment_id': sortiment_id,
                            'langd_min_cm': lc_lower,
                            'dia_min_mm': dc_lower,
                            'pris_per_m3': pris,
                        })
    
    # === TRÄDSLAG ===
    species_names = {}
    for sp_def in find_all_elements(machine, 'SpeciesGroupDefinition', ns):
        sp_key = get_text(sp_def, 'SpeciesGroupKey', ns)
        sp_name = get_text(sp_def, 'SpeciesGroupName', ns)
        species_names[sp_key] = sp_name
        
        data['tradslag'].append({
            'tradslag_id': f"{maskin_id}_{sp_key}",
            'species_key': sp_key,
            'namn': sp_name,
            'maskin_id': maskin_id
        })
    
    # === KÖRSPÅR (TrackCoordinates) ===
    for track in find_all_elements(machine, 'Tracking', ns):
        for coords in find_all_elements(track, 'TrackCoordinates', ns):
            lat = safe_float(get_text(coords, 'Latitude', ns))
            lon = safe_float(get_text(coords, 'Longitude', ns))
            if lat and lon:
                coord_date = get_text(coords, 'CoordinateDate', ns)
                obj_key = get_text(coords, 'ObjectKey', ns)
                data['gps_spar'].append({
                    'maskin_id': maskin_id,
                    'objekt_id': obj_key_map.get(obj_key, f"{maskin_id}_{obj_key}") if obj_key else None,
                    'tidpunkt': parse_datetime(coord_date),
                    'latitude': lat,
                    'longitude': lon,
                    'altitude': safe_float(get_text(coords, 'Altitude', ns)),
                    'tracking_key': get_text(coords, 'TrackingKey', ns),
                    'filnamn': filnamn,
                })

    # === STAMMAR OCH STOCKAR ===
    sortiment_volymer = defaultdict(lambda: {'stockar': 0, 'volym_m3sob': 0, 'volym_m3sub': 0,
                                              'total_langd': 0, 'total_dia': 0})
    hpr_stam_nummer = 0

    for stem in find_all_elements(machine, 'Stem', ns):
        single_tree = find_element(stem, 'SingleTreeProcessedStem', ns)
        if single_tree is None:
            continue

        hpr_stam_nummer += 1

        # BioEnergyAdaption (GROT)
        bio_energy = get_text(stem, 'BioEnergyAdaption', ns)

        # StemKey och ObjectKey ligger på Stem-nivå i Ponsse-filer
        stem_key = get_text(stem, 'StemKey', ns)
        if not stem_key:
            stem_key = get_text(single_tree, 'StemKey', ns)
        sp_key = get_text(stem, 'SpeciesGroupKey', ns) or get_text(single_tree, 'SpeciesGroupKey', ns)
        obj_key = get_text(stem, 'ObjectKey', ns) or get_text(single_tree, 'ObjectKey', ns)
        
        # Generera stam-nyckel om StemKey saknas
        if not stem_key:
            stem_key = f"auto_{len(data['stammar'])+1}"  
        
        # DBH
        dbh = safe_int(get_text(single_tree, 'DBH', ns))
        
        # GPS för stam - Rottne: StemCoordinates på Stem-nivå, Ponsse: Coordinates i SingleTree
        stem_lat = None
        stem_lon = None
        stem_alt = None
        stem_coords = find_element(stem, 'StemCoordinates', ns)
        if stem_coords is None:
            stem_coords = find_element(single_tree, 'Coordinates', ns)
        if stem_coords is None:
            stem_coords = find_element(single_tree, 'StemCoordinates', ns)
        if stem_coords is not None:
            stem_lat = safe_float(get_text(stem_coords, 'Latitude', ns))
            stem_lon = safe_float(get_text(stem_coords, 'Longitude', ns))
            stem_alt = safe_float(get_text(stem_coords, 'Altitude', ns))

        # StemGrade (1-4)
        stem_grade = None
        grade_elem = find_element(stem, 'StemGrade', ns) or find_element(single_tree, 'StemGrade', ns)
        if grade_elem is not None:
            stem_grade = safe_int(get_text(grade_elem, 'GradeValue', ns))

        # StumpTreatment (boolean)
        stump_treat_txt = (get_text(stem, 'StumpTreatment', ns) or
                           get_text(single_tree, 'StumpTreatment', ns) or '').strip().lower()
        stubbbehandling = True if stump_treat_txt == 'true' else (False if stump_treat_txt == 'false' else None)

        # ManualFreeBuck (boolean) — manuell frikap
        free_buck_txt = (get_text(stem, 'ManualFreeBuck', ns) or
                         get_text(single_tree, 'ManualFreeBuck', ns) or '').strip().lower()
        manuell_frikap = True if free_buck_txt == 'true' else (False if free_buck_txt == 'false' else None)
        
        # Tidpunkt - Rottne: HarvestDate på Stem-nivå, Ponsse: ProcessingDate i SingleTree
        processing_date = get_text(single_tree, 'ProcessingDate', ns) or get_text(stem, 'HarvestDate', ns)
        tidpunkt = parse_datetime(processing_date)
        datum = tidpunkt.date() if tidpunkt else None
        if datum is None:
            # Försök hämta datum från filnamnet (format YYYYMMDD)
            import re
            date_match = re.search(r'(\d{8})', filnamn)
            if date_match:
                try:
                    from datetime import date
                    ds = date_match.group(1)
                    datum = date(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
                except:
                    pass
        
        stam_data = {
            'stam_key': stem_key,
            'maskin_id': maskin_id,
            'objekt_id': obj_key_map.get(obj_key, f"{maskin_id}_{obj_key}") if obj_key else None,
            'tradslag_id': f"{maskin_id}_{sp_key}" if sp_key else None,
            'dbh_mm': dbh,
            'latitude': stem_lat,
            'longitude': stem_lon,
            'altitude': stem_alt,
            'stem_grade': stem_grade,
            'stubbbehandling': stubbbehandling,
            'manuell_frikap': manuell_frikap,
            'tidpunkt': tidpunkt,
            'filnamn': filnamn
        }
        data['stammar'].append(stam_data)

        # Per-stam aggregat för hpr_stammar
        hpr_antal_stockar = 0
        hpr_total_volym = 0.0
        hpr_sortiment_list = []

        # Stockar från denna stam
        for log in find_all_elements(single_tree, 'Log', ns):
            log_key = get_text(log, 'LogKey', ns)
            prod_key = get_text(log, 'ProductKey', ns)
            
            # Längd och diameter (ob = on bark, ub = under bark)
            log_meas = find_element(log, 'LogMeasurement', ns)
            langd = 0
            toppdia_ob = 0
            toppdia_ub = 0
            if log_meas is not None:
                langd = safe_int(get_text(log_meas, 'LogLength', ns))
                for dia_elem in find_all_elements(log_meas, 'LogDiameter', ns):
                    cat = get_attr(dia_elem, 'logDiameterCategory').lower()
                    val = safe_int(dia_elem.text) if dia_elem.text else 0
                    if 'top ob' in cat or cat == 'top':
                        toppdia_ob = val
                    elif 'top ub' in cat:
                        toppdia_ub = val
                # Fallback: if only one value exists, use it as ob
                if toppdia_ob == 0 and toppdia_ub > 0:
                    toppdia_ob = toppdia_ub
            toppdia = toppdia_ob  # used below for sortiment_volymer summary
            
            # Volymer
            volym_sob = 0
            volym_sub = 0
            volym_price = 0
            for vol_elem in find_all_elements(log, 'LogVolume', ns):
                cat = get_attr(vol_elem, 'logVolumeCategory')
                val = safe_float(vol_elem.text)
                if 'm3sob' in cat.lower():
                    volym_sob = val
                elif 'm3sub' in cat.lower():
                    volym_sub = val
                elif 'm3' in cat.lower() and 'price' in cat.lower():
                    volym_price = val  # m3 (price) = prisvolym, används som m3sub-fallback
            # Fallback: om m3sub saknas, använd prisvolym
            if volym_sub == 0 and volym_price > 0:
                volym_sub = volym_price
            
            # Kaporsak
            cutting_cat = find_element(log, 'CuttingCategory', ns)
            kaporsak = ''
            if cutting_cat is not None:
                kaporsak = get_text(cutting_cat, 'CuttingReason', ns)
            
            _stock_objekt_id = obj_key_map.get(obj_key) if obj_key else None
            stock_data = {
                # Filnamn borta — HPR är kumulativa, dedupe sker på (maskin_id, stem_key, log_key)
                'stock_key': f"{stem_key}_{log_key}",
                'stem_key': stem_key,
                'log_key': safe_int(log_key),
                'maskin_id': maskin_id,
                'objekt_id': _stock_objekt_id,
                'sortiment_id': f"{maskin_id}_{prod_key}" if prod_key else None,
                'sortiment_namn': product_names.get(prod_key, ''),
                'langd_cm': langd,
                'toppdia_ob_mm': toppdia_ob,
                'toppdia_ub_mm': toppdia_ub,
                'volym_m3sob': volym_sob,
                'volym_m3sub': volym_sub,
                'kaporsak': kaporsak,
                'latitude': stem_lat,
                'longitude': stem_lon,
                'filnamn': filnamn,
            }
            data['stockar'].append(stock_data)

            # Aggregera för hpr_stammar
            hpr_antal_stockar += 1
            hpr_total_volym += volym_sub
            prod_namn = product_names.get(prod_key, '')
            if prod_namn:
                hpr_sortiment_list.append(prod_namn)

            # Summera per sortiment - hoppa om obj_key saknas i kartan
            _objekt_id = obj_key_map.get(obj_key) if obj_key else None
            if not _objekt_id:
                continue
            sort_key = (datum, maskin_id, _objekt_id, f"{maskin_id}_{prod_key}")
            sortiment_volymer[sort_key]['stockar'] += 1
            sortiment_volymer[sort_key]['volym_m3sob'] += volym_sob
            sortiment_volymer[sort_key]['volym_m3sub'] += volym_sub
            sortiment_volymer[sort_key]['total_langd'] += langd
            sortiment_volymer[sort_key]['total_dia'] += toppdia

        # Lägg till hpr_stammar-fält i stam_data (efter log-loopen)
        tradslag_namn = species_names.get(sp_key, sp_key or '')
        hpr_sortiment = None
        if hpr_sortiment_list:
            dominant_group = Counter(hpr_sortiment_list).most_common(1)[0][0]
            if dominant_group:
                ts_cap = tradslag_namn.capitalize() if tradslag_namn else ''
                hpr_sortiment = f"{ts_cap} {dominant_group}".strip() or None
        stam_data['hpr_stam_nummer'] = hpr_stam_nummer
        stam_data['hpr_tradslag_namn'] = tradslag_namn
        stam_data['hpr_antal_stockar'] = hpr_antal_stockar
        stam_data['hpr_total_volym'] = round(hpr_total_volym, 6) if hpr_total_volym > 0 else None
        stam_data['hpr_bio_energy_adaption'] = bio_energy if bio_energy else None
        stam_data['hpr_sortiment'] = hpr_sortiment

    # Konvertera sortiment-summering - hoppa over rader med null objekt_id
    for key, values in sortiment_volymer.items():
        datum, maskin, objekt, sortiment = key
        if not objekt or objekt.endswith('_'):
            continue  # Hoppa over rader utan giltig objekt_id
        medel_langd = values['total_langd'] / values['stockar'] if values['stockar'] > 0 else 0
        medel_dia = values['total_dia'] / values['stockar'] if values['stockar'] > 0 else 0
        
        data['sortiment_summering'].append({
            'datum': datum,
            'maskin_id': maskin,
            'objekt_id': objekt,
            'sortiment_id': sortiment,
            'stockar': values['stockar'],
            'volym_m3sob': values['volym_m3sob'],
            'volym_m3sub': values['volym_m3sub'],
            'medel_langd_cm': medel_langd,
            'medel_toppdia_mm': medel_dia,
            'filnamn': filnamn
        })
    
    logger.info(f"  Stammar: {len(data['stammar'])}, Stockar: {len(data['stockar'])}")
    logger.info(f"  Sortiment: {len(data['sortiment_summering'])} olika")
    
    return data

# ============================================================
# HQC-PARSER
# ============================================================

def parse_hqc_file(filepath: str) -> Dict[str, Any]:
    """Parsa HQC-fil (Harvesting Quality Control)"""
    
    tree = ET.parse(filepath)
    root = tree.getroot()
    ns = get_namespace(root)
    filnamn = os.path.basename(filepath)
    
    data = {
        'maskin': {},
        'kalibrering': [],
        'kalibrering_historik': [],
        'kontroll_stockar': [],
        'kontroll_stammar': [],
        'kontroll_matpunkter': [],
        'filnamn': filnamn,
        'filtyp': 'HQC'
    }
    
    machine = find_element(root, 'Machine', ns)
    if machine is None:
        logger.warning(f"  Kunde inte hitta Machine-element i {filnamn}")
        return data
    
    # === MASKINDATA ===
    maskin_id = get_text(machine, 'BaseMachineManufacturerID', ns)
    if not maskin_id:
        maskin_id = get_text(machine, 'MachineKey', ns)
    
    tillverkare = get_text(machine, 'MachineBaseManufacturer', ns)
    maskin_id = normalize_maskin_id(maskin_id, tillverkare)
    
    # HQC = Harvester
    data['maskin'] = {'maskin_id': maskin_id, 'maskin_typ': 'Harvester'}
    
    # Hämta datum från header
    header = find_element(root, 'HarvestingQualityControlHeader', ns)
    creation_date = None
    if header is not None:
        creation_date = parse_datetime(get_text(header, 'CreationDate', ns))
    
    logger.info(f"  Maskin: {maskin_id}")

    # === KONTROLLSTAMMAR ===
    control_values = find_element(machine, 'ControlValues', ns)

    # === PER-FIL-DATA (Stanford 2010) ===
    application_version = get_text(header, 'ApplicationVersionCreated', ns) if header is not None else None

    butt_log_length_adjustment_mm = None
    calib_values_early = find_element(machine, 'CalibrationValues', ns)
    if calib_values_early is not None:
        butt_log_length_adjustment_mm = safe_int(get_text(calib_values_early, 'LengthCalibrationAdjustmentButtLog', ns))

    object_name = None
    object_area_ha = None
    cutting_method = None
    forest_certification = None
    contract_number = None
    first_obj = None
    if control_values is not None:
        first_obj = find_element(control_values, 'ObjectDefinition', ns)
    if first_obj is None:
        first_obj = find_element(machine, 'ObjectDefinition', ns)
    if first_obj is not None:
        object_name = get_text(first_obj, 'ObjectName', ns)
        object_area_ha = safe_float(get_text(first_obj, 'ObjectArea', ns))
        cutting_method = get_text(first_obj, 'CuttingMethod', ns)
        forest_certification = get_text(first_obj, 'ForestCertification', ns)
        contract_number = get_text(first_obj, 'ContractNumber', ns)

    # === PRODUCT-DEFINITION LOOKUP ===
    # ProductDefinition är nästlat djupt (under ObjectDefinition), så använd
    # rekursiv search. ProductName/ProductGroupName/ProductUserID ligger inuti
    # ClassifiedProductDefinition-subelementet.
    product_lookup = {}
    pd_path = (f'.//{ns}ProductDefinition' if ns else './/ProductDefinition')
    for prod in root.findall(pd_path):
        product_key = get_text(prod, 'ProductKey', ns)
        if not product_key:
            continue
        classified = find_element(prod, 'ClassifiedProductDefinition', ns) or prod
        product_lookup[product_key] = {
            'sortiment_namn': get_text(classified, 'ProductName', ns) or None,
            'sortiment_grupp': get_text(classified, 'ProductGroupName', ns) or None,
            'sortiment_kod': get_text(classified, 'ProductUserID', ns) or None,
        }

    langd_avvikelser = []
    dia_avvikelser = []
    antal_stammar = 0
    antal_stockar = 0
    tradslag = ''
    
    if control_values is not None:
        # Bygg obj_key_map från ObjectDefinition
        obj_key_map_hqc = {}
        for obj_def in find_all_elements(control_values, 'ObjectDefinition', ns):
            ok = get_text(obj_def, 'ObjectKey', ns)
            vo = get_text(obj_def, 'ContractNumber', ns)
            if ok:
                obj_key_map_hqc[ok] = make_objekt_id(vo, maskin_id, ok)
        # Fallback till maskin-nivå ObjectDefinition
        for obj_def in find_all_elements(machine, 'ObjectDefinition', ns):
            ok = get_text(obj_def, 'ObjectKey', ns)
            vo = get_text(obj_def, 'ContractNumber', ns)
            if ok and ok not in obj_key_map_hqc:
                obj_key_map_hqc[ok] = make_objekt_id(vo, maskin_id, ok)

        for stem in find_all_elements(control_values, 'Stem', ns):
            antal_stammar += 1
            single_tree = find_element(stem, 'SingleTreeProcessedStem', ns)
            if single_tree is None:
                continue
            
            # ObjectKey och SpeciesGroupKey sitter på Stem-nivå i Ponsse
            obj_key_hqc = get_text(stem, 'ObjectKey', ns)
            sp_key = get_text(stem, 'SpeciesGroupKey', ns) or get_text(single_tree, 'SpeciesGroupKey', ns)
            stam_nummer = antal_stammar

            # === PER-STAM-FÄLT (Stanford 2010) ===
            ctrl_stem_info = find_element(stem, 'ControlStemInfo', ns)
            stem_selection = None
            measurement_mode = None
            rejected_reason = None
            if ctrl_stem_info is not None:
                stem_selection = get_text(ctrl_stem_info, 'RandomControlStemSelection', ns)
                measurement_mode = get_text(ctrl_stem_info, 'RandomControlStemMeasurementMode', ns)
                rejected_reason = get_text(ctrl_stem_info, 'RandomControlStemRejectedReason', ns)

            ctrl_meas_def = find_element(stem, 'ControlMeasurementDefinition', ns)
            measurer_name = None
            caliper_id = None
            if ctrl_meas_def is not None:
                measurer = find_element(ctrl_meas_def, 'Measurer', ns)
                if measurer is not None:
                    measurer_name = get_text(measurer, 'FirstName', ns)
                caliper_id = get_text(ctrl_meas_def, 'CaliperID', ns)

            stem_sc = find_element(stem, 'StemCoordinates', ns)
            if stem_sc is None:
                stem_sc = find_element(single_tree, 'StemCoordinates', ns)
            stem_lat = None
            stem_lon = None
            stem_alt = None
            if stem_sc is not None:
                stem_lat = safe_float(get_text(stem_sc, 'Latitude', ns))
                stem_lon = safe_float(get_text(stem_sc, 'Longitude', ns))
                stem_alt = safe_float(get_text(stem_sc, 'Altitude', ns))

            harvest_date = parse_datetime(get_text(stem, 'HarvestDate', ns)) or \
                           parse_datetime(get_text(single_tree, 'HarvestDate', ns))

            processing_category = get_text(stem, 'ProcessingCategory', ns) or \
                                  get_text(single_tree, 'ProcessingCategory', ns)

            stem_dbh_mm = safe_int(get_text(single_tree, 'DBH', ns))

            # StemDiameters → JSONB-profil (positioner i cm, diameter i mm)
            # Stöder två format:
            #   Ponsse: <DiameterValue diameterPosition="0">306</DiameterValue> (positioner i cm)
            #   Spec:   <Diameter>306</Diameter> + DiameterStartHeight + DiameterMeasurementGap (mm)
            stem_diameter_profile = []
            sd = find_element(single_tree, 'StemDiameters', ns)
            if sd is not None:
                dvs = find_all_elements(sd, 'DiameterValue', ns)
                if dvs:
                    for d_elem in dvs:
                        pos_attr = get_attr(d_elem, 'diameterPosition')
                        pos_cm = safe_int(pos_attr) if pos_attr else None
                        d_mm = safe_int(d_elem.text) if d_elem.text else None
                        if pos_cm is None or d_mm is None:
                            continue
                        stem_diameter_profile.append({
                            'position_cm': pos_cm,
                            'diameter_mm': d_mm,
                        })
                else:
                    d_start = safe_int(get_text(sd, 'DiameterStartHeight', ns)) or 0
                    d_gap = safe_int(get_text(sd, 'DiameterMeasurementGap', ns)) or 100
                    for i, d_elem in enumerate(find_all_elements(sd, 'Diameter', ns)):
                        d_mm = safe_int(d_elem.text) if d_elem.text else None
                        if d_mm is None:
                            continue
                        pos_mm = d_start + i * d_gap
                        stem_diameter_profile.append({
                            'position_cm': pos_mm // 10,
                            'diameter_mm': d_mm,
                        })

            data['kontroll_stammar'].append({
                'filnamn': filnamn,
                'stam_nummer': stam_nummer,
                'maskin_id': maskin_id,
                'kontroll_datum': creation_date.date() if creation_date else None,
                'stem_diameter_profile': stem_diameter_profile or None,
            })

            for log in find_all_elements(single_tree, 'Log', ns):
                antal_stockar += 1
                log_key = get_text(log, 'LogKey', ns)
                
                # Maskinmätning
                maskin_langd = 0
                maskin_dia = 0
                maskin_volym = 0

                # Operatörsmätning
                operator_langd = 0
                operator_dia = 0
                operator_volym = 0

                # Per-stock extra fält (Stanford 2010)
                mid_ob_mm = None
                butt_ob_mm = None
                machine_measurement_date = None
                operator_measurement_date = None
                cutting_reason = get_text(log, 'CuttingReason', ns)
                product_key_log = get_text(log, 'ProductKey', ns)
                sortiment_log = product_lookup.get(product_key_log, {
                    'sortiment_namn': None,
                    'sortiment_grupp': None,
                    'sortiment_kod': None,
                })

                for log_meas in find_all_elements(log, 'LogMeasurement', ns):
                    cat = get_attr(log_meas, 'logMeasurementCategory')

                    langd = safe_int(get_text(log_meas, 'LogLength', ns))

                    # Iterera alla LogDiameter-element (Top/Mid/Butt) — Ponsse-format har
                    # kategori "Top ob"/"Mid ob"/"Butt ob" med värdet i .text, äldre format
                    # kan ha kategori "Top" med LogDiameterOb-child. Hoppa över UB och HKS.
                    dia = 0
                    for ld in find_all_elements(log_meas, 'LogDiameter', ns):
                        ld_cat_raw = (get_attr(ld, 'logDiameterCategory') or '').strip()
                        ld_cat_low = ld_cat_raw.lower()
                        if 'ub' in ld_cat_low or 'hks' in ld_cat_low:
                            continue
                        ob_text = get_text(ld, 'LogDiameterOb', ns)
                        ob_val = safe_int(ob_text) if ob_text else None
                        if ob_val is None and ld.text and ld.text.strip().lstrip('-').isdigit():
                            ob_val = safe_int(ld.text)
                        if ob_val is None or ob_val == 0:
                            continue
                        if ld_cat_low.startswith('top') or not ld_cat_raw:
                            if not dia:
                                dia = ob_val
                        elif ld_cat_low.startswith('mid') and mid_ob_mm is None:
                            mid_ob_mm = ob_val
                        elif ld_cat_low.startswith('butt') and butt_ob_mm is None:
                            butt_ob_mm = ob_val

                    mdate = parse_datetime(get_text(log_meas, 'MeasurementDate', ns))

                    if cat == 'Machine':
                        maskin_langd = langd
                        maskin_dia = dia
                        machine_measurement_date = mdate
                    elif cat == 'Operator':
                        operator_langd = langd
                        # Toppdia läses bara från LogDiameter-Top. Toppstockar där
                        # operatören bara har ControlLogDiameter (ingen LogDiameter)
                        # → dia=0 → NULL (inte falsk 0). Matpunkterna bär den
                        # riktiga per-position-jämförelsen.
                        operator_dia = dia if dia else None
                        operator_measurement_date = mdate
                
                # Beräkna avvikelser
                if maskin_langd and operator_langd:
                    langd_avvikelse = maskin_langd - operator_langd
                    langd_avvikelser.append(langd_avvikelse)
                
                if maskin_dia and operator_dia:
                    dia_avvikelse = maskin_dia - operator_dia
                    dia_avvikelser.append(dia_avvikelse)
                
                # Volymer
                maskin_volym_sub = 0.0
                operator_volym_sub = 0.0
                vols = list(find_all_elements(log, 'LogVolume', ns))
                # Maskin = forsta sub, Operator = andra (kontrollmatt)
                sub_vols = [v for v in vols if 'sub' in get_attr(v, 'logVolumeCategory').lower() or 'price' in get_attr(v, 'logVolumeCategory').lower()]
                if len(sub_vols) >= 1:
                    maskin_volym_sub = safe_float(sub_vols[0].text)
                if len(sub_vols) >= 2:
                    operator_volym_sub = safe_float(sub_vols[1].text)
                
                # GPS for kontrollstam - Ponsse: StemCoordinates på Stem-nivå
                ctrl_lat = None
                ctrl_lon = None
                sc = find_element(stem, 'StemCoordinates', ns)
                if sc is None:
                    sc = find_element(single_tree, 'StemCoordinates', ns)
                if sc is None:
                    sc = find_element(single_tree, 'Coordinates', ns)
                if sc is not None:
                    ctrl_lat = safe_float(get_text(sc, 'Latitude', ns))
                    ctrl_lon = safe_float(get_text(sc, 'Longitude', ns))
                
                # === PER-MÄTPUNKT-DATA (Stanford 2010 ControlLogDiameter) ===
                stock_nummer = safe_int(log_key)
                matpunkter_per_position = {}
                for log_meas2 in find_all_elements(log, 'LogMeasurement', ns):
                    category = get_attr(log_meas2, 'logMeasurementCategory')
                    for cld in find_all_elements(log_meas2, 'ControlLogDiameter', ns):
                        # Hoppa över UB-mätpunkter (vi sparar bara OB)
                        cld_cat_low = (get_attr(cld, 'controlLogDiameterCategory') or '').strip().lower()
                        if cld_cat_low == 'ub':
                            continue
                        pos_attr = get_attr(cld, 'diameterPosition')
                        pos_cm = safe_int(pos_attr) if pos_attr else None
                        if pos_cm is None:
                            continue
                        # diameterPosition är redan i cm (verifierat 2026-05-21
                        # mot Ponsse + Rottne: 100/200/300/400 = jämna meter,
                        # 130 = brösthöjd). Ingen division.

                        # Värdet ligger antingen i LogDiameterOb-child eller cld.text direkt
                        ob_text = get_text(cld, 'LogDiameterOb', ns)
                        ob = safe_int(ob_text) if ob_text else None
                        if ob is None and cld.text and cld.text.strip().lstrip('-').isdigit():
                            ob = safe_int(cld.text)

                        first_mm = None
                        second_mm = None
                        for ld in find_all_elements(cld, 'LogDiameter', ns):
                            vc = get_attr(ld, 'diameterMeasurementCategory')
                            v = safe_int(ld.text) if ld.text else None
                            if vc == 'First':
                                first_mm = v
                            elif vc == 'Second':
                                second_mm = v

                        if pos_cm not in matpunkter_per_position:
                            matpunkter_per_position[pos_cm] = {
                                'filnamn': filnamn,
                                'stam_nummer': stam_nummer,
                                'stock_nummer': stock_nummer,
                                'position_cm': pos_cm,
                                'diameter_maskin_mm': None,
                                'diameter_operator_mm': None,
                                'klave_first_mm': None,
                                'klave_second_mm': None,
                            }
                        rec = matpunkter_per_position[pos_cm]
                        if category == 'Machine':
                            rec['diameter_maskin_mm'] = ob
                        elif category == 'Operator':
                            rec['diameter_operator_mm'] = ob
                            if first_mm is not None:
                                rec['klave_first_mm'] = first_mm
                            if second_mm is not None:
                                rec['klave_second_mm'] = second_mm

                for pos_cm in sorted(matpunkter_per_position):
                    data['kontroll_matpunkter'].append(matpunkter_per_position[pos_cm])

                data['kontroll_stockar'].append({
                    'maskin_id': maskin_id,
                    'objekt_id': obj_key_map_hqc.get(obj_key_hqc, f"{maskin_id}_{obj_key_hqc}") if obj_key_hqc else None,
                    'kontroll_datum': creation_date.date() if creation_date else None,
                    'stam_nummer': stam_nummer,
                    'stock_nummer': stock_nummer,
                    'maskin_langd_cm': maskin_langd,
                    'maskin_toppdia_mm': maskin_dia,
                    'maskin_volym_sub': maskin_volym_sub,
                    'operator_langd_cm': operator_langd,
                    'operator_toppdia_mm': operator_dia,
                    'operator_volym_sub': operator_volym_sub,
                    'langd_avvikelse_cm': maskin_langd - operator_langd if maskin_langd and operator_langd else None,
                    'dia_avvikelse_mm': maskin_dia - operator_dia if maskin_dia and operator_dia else None,
                    'volym_avvikelse': round(maskin_volym_sub - operator_volym_sub, 4) if maskin_volym_sub and operator_volym_sub else None,
                    'latitude': ctrl_lat,
                    'longitude': ctrl_lon,
                    'filnamn': filnamn,
                    # Per-stam-metadata (redundant på varje stock)
                    'stem_lat': stem_lat,
                    'stem_lon': stem_lon,
                    'stem_alt': stem_alt,
                    'harvest_date': harvest_date,
                    'stem_dbh_mm': stem_dbh_mm,
                    'stem_selection': nullif_empty(stem_selection),
                    'measurement_mode': nullif_empty(measurement_mode),
                    'rejected_reason': nullif_empty(rejected_reason),
                    'measurer_name': nullif_empty(measurer_name),
                    'caliper_id': nullif_empty(caliper_id),
                    'processing_category': nullif_empty(processing_category),
                    # Per-stock-egna
                    'sortiment_namn': nullif_empty(sortiment_log['sortiment_namn']),
                    'sortiment_grupp': nullif_empty(sortiment_log['sortiment_grupp']),
                    'sortiment_kod': nullif_empty(sortiment_log['sortiment_kod']),
                    'cutting_reason': nullif_empty(cutting_reason),
                    'log_diameter_mid_ob_mm': mid_ob_mm,
                    'log_diameter_butt_ob_mm': butt_ob_mm,
                    'machine_measurement_date': machine_measurement_date,
                    'operator_measurement_date': operator_measurement_date,
                })
    
    # Beräkna statistik
    if langd_avvikelser:
        langd_snitt = sum(langd_avvikelser) / len(langd_avvikelser)
        langd_min = min(langd_avvikelser)
        langd_max = max(langd_avvikelser)
    else:
        langd_snitt = langd_min = langd_max = 0
    
    if dia_avvikelser:
        dia_snitt = sum(dia_avvikelser) / len(dia_avvikelser)
        dia_min = min(dia_avvikelser)
        dia_max = max(dia_avvikelser)
    else:
        dia_snitt = dia_min = dia_max = 0
    
    # Status baserat på avvikelser
    status = 'OK'
    if abs(langd_snitt) > 2 or abs(dia_snitt) > 4:
        status = 'VARNING'
    if abs(langd_snitt) > 4 or abs(dia_snitt) > 6:
        status = 'FEL'
    
    # Hämta trädslag från första SpeciesGroupDefinition
    sp_def = find_element(machine, 'SpeciesGroupDefinition', ns)
    if sp_def is not None:
        tradslag = get_text(sp_def, 'SpeciesGroupName', ns)
    
    data['kalibrering'].append({
        'datum': creation_date.date() if creation_date else None,
        'maskin_id': maskin_id,
        'tradslag': tradslag,
        'antal_kontrollstammar': antal_stammar,
        'antal_kontrollstockar': antal_stockar,
        'langd_avvikelse_snitt_cm': langd_snitt,
        'langd_avvikelse_min_cm': langd_min,
        'langd_avvikelse_max_cm': langd_max,
        'dia_avvikelse_snitt_mm': dia_snitt,
        'dia_avvikelse_min_mm': dia_min,
        'dia_avvikelse_max_mm': dia_max,
        'status': status,
        'filnamn': filnamn,
        # Per-fil-fält (Stanford 2010)
        'application_version': nullif_empty(application_version),
        'object_name': nullif_empty(object_name),
        'object_area_ha': object_area_ha,
        'cutting_method': nullif_empty(cutting_method),
        'forest_certification': nullif_empty(forest_certification),
        'contract_number': nullif_empty(contract_number),
        'butt_log_length_adjustment_mm': butt_log_length_adjustment_mm,
        # Innehålls-hash för dedup (samma mätning, olika exportfilnamn)
        'innehalls_hash': kontroll_innehalls_hash(data['kontroll_stockar']),
    })

    logger.info(f"  Kontrollstammar: {antal_stammar}, Stockar: {antal_stockar}")
    logger.info(f"  Längdavvikelse: {langd_snitt:.1f} cm, Diameteravvikelse: {dia_snitt:.1f} mm")
    logger.info(f"  Status: {status}")
    
    # === KALIBRERINGSHISTORIK ===
    calib_values = find_element(machine, 'CalibrationValues', ns)
    if calib_values is not None:
        # Längdkalibreringar
        for length_cal in find_all_elements(calib_values, 'LengthCalibration', ns):
            sp_id = get_text(length_cal, 'SpeciesGroupUserID', ns)
            cal_date = parse_datetime(get_text(length_cal, 'CalibrationDate', ns))
            reason = get_text(length_cal, 'LengthCalibrationReason', ns)
            desc = get_text(length_cal, 'LengthCalibrationDescription', ns)
            
            adj_elem = find_element(length_cal, 'LengthCalibrationAdjustment', ns)
            adjustment = safe_int(adj_elem.text) if adj_elem is not None else 0
            position = safe_int(get_attr(adj_elem, 'lengthCalibrationPosition')) if adj_elem is not None else 0
            
            data['kalibrering_historik'].append({
                'datum': cal_date,
                'maskin_id': maskin_id,
                'typ': 'langd',
                'tradslag': sp_id.replace('SE1_', '') if sp_id else '',
                'orsak': reason,
                'beskrivning': desc,
                'langd_justering_mm': adjustment,
                'dia_justering_mm': None,
                'position_cm': position,
                'filnamn': filnamn
            })
        
        # Diameterkalibreringar
        for dia_cal in find_all_elements(calib_values, 'DiameterCalibration', ns):
            sp_id = get_text(dia_cal, 'SpeciesGroupUserID', ns)
            cal_date = parse_datetime(get_text(dia_cal, 'CalibrationDate', ns))
            reason = get_text(dia_cal, 'DiameterCalibrationReason', ns)
            
            adj_elem = find_element(dia_cal, 'DiameterCalibrationAdjustment', ns)
            adjustment = safe_int(adj_elem.text) if adj_elem is not None else 0
            position = safe_int(get_attr(adj_elem, 'diameterCalibrationPosition')) if adj_elem is not None else 0
            
            data['kalibrering_historik'].append({
                'datum': cal_date,
                'maskin_id': maskin_id,
                'typ': 'diameter',
                'tradslag': sp_id.replace('SE1_', '') if sp_id else '',
                'orsak': reason,
                'beskrivning': None,
                'langd_justering_mm': None,
                'dia_justering_mm': adjustment,
                'position_cm': position,
                'filnamn': filnamn
            })
    
    logger.info(f"  Kalibreringshistorik: {len(data['kalibrering_historik'])} poster")
    
    return data

# ============================================================
# FPR-PARSER
# ============================================================

def parse_fpr_file(filepath: str) -> Dict[str, Any]:
    """Parsa FPR-fil (Forwarded Production Report)"""
    
    tree = ET.parse(filepath)
    root = tree.getroot()
    ns = get_namespace(root)
    filnamn = os.path.basename(filepath)
    
    data = {
        'maskin': {},
        'operatorer': [],
        'objekt': [],
        'sortiment': [],
        'destinationer': [],
        'lass': [],
        'lass_sortiment': [],
        'skotning_status': [],
        'filnamn': filnamn,
        'filtyp': 'FPR'
    }
    obj_key_map = {}  # {obj_key: objekt_id}
    
    machine = find_element(root, 'Machine', ns)
    if machine is None:
        logger.warning(f"  Kunde inte hitta Machine-element i {filnamn}")
        return data
    
    # === MASKINDATA ===
    maskin_id = get_text(machine, 'BaseMachineManufacturerID', ns)
    if not maskin_id:
        maskin_id = get_text(machine, 'MachineOwnerID', ns)
    if not maskin_id:
        maskin_id = get_text(machine, 'MachineKey', ns)
    
    tillverkare = get_text(machine, 'MachineBaseManufacturer', ns)
    maskin_id = normalize_maskin_id(maskin_id, tillverkare)
    
    # FPR = Forwarder
    data['maskin'] = {
        'maskin_id': maskin_id,
        'tillverkare': tillverkare,
        'modell': get_text(machine, 'MachineBaseModel', ns),
        'maskin_typ': 'Forwarder'
    }

    logger.info(f"  Maskin: {maskin_id} (Skotare)")
    
    # === OPERATÖRER ===
    for op_def in find_all_elements(machine, 'OperatorDefinition', ns):
        op_key = get_text(op_def, 'OperatorKey', ns)
        contact = find_element(op_def, 'ContactInformation', ns)

        namn = ''
        email = ''
        if contact is not None:
            fname = get_text(contact, 'FirstName', ns)
            lname = get_text(contact, 'LastName', ns)
            candidate = f"{fname} {lname}".strip()
            if candidate and not _UUID_RE.match(candidate):
                namn = candidate
            email = (get_text(contact, 'Email', ns) or '').strip()
        if not namn:
            namn = f"Operatör {op_key}"

        if op_key:
            op_id = resolve_operator_id(maskin_id, op_key, email, namn)
            entry = {
                'operator_id': op_id,
                'operator_key': op_key,
                'operator_namn': namn,
                'maskin_id': maskin_id,
            }
            if email:
                entry['email'] = email
            data['operatorer'].append(entry)

    # Per-fil OperatorKey-karta — samma princip som MOM-parsen: OperatorKey är
    # fil-lokal, identiteten normaliseras via e-post. Ingen tyst rå-fallback.
    op_id_by_key = {o['operator_key']: o['operator_id'] for o in data['operatorer']}

    def op_id_for_key(op_key: str, kontext: str):
        if not op_key:
            return None
        oid = op_id_by_key.get(op_key)
        if oid is None:
            logger.warning(
                f"  OPERATORKEY {op_key} SAKNAR OperatorDefinition i {filnamn} "
                f"({kontext}) -- raden lamnas oattribuerad (operator_id=None)"
            )
        return oid

    # Bygg location_coords_map tidigt så det är tillgängligt för objekt-parsning
    location_coords_map = {}
    for loc_def_pre in find_all_elements(machine, 'LocationDefinition', ns):
        obj_key_pre = get_text(loc_def_pre, 'ObjectKey', ns)
        loc_coords_pre = find_element(loc_def_pre, 'LocationCoordinates', ns)
        if loc_coords_pre is not None and obj_key_pre:
            lat_pre = safe_float(get_text(loc_coords_pre, 'Latitude', ns))
            lon_pre = safe_float(get_text(loc_coords_pre, 'Longitude', ns))
            if lat_pre and lon_pre:
                location_coords_map[obj_key_pre] = (lat_pre, lon_pre)

    # === OBJEKT ===
    for obj_def in find_all_elements(machine, 'ObjectDefinition', ns):
        obj_key = get_text(obj_def, 'ObjectKey', ns)
        contract_number = get_text(obj_def, 'ContractNumber', ns)
        vo_nummer = contract_number if contract_number else get_text(obj_def, 'ObjectUserID', ns)
        
        forest_owner = find_element(obj_def, 'ForestOwner', ns)
        # Namn: gemensam härledning (filnamn primärt, hanterar även ominlästa
        # kopiors _YYYYMMDD_HHMMSS-suffix som gamla regexen missade)
        object_name = harled_objektnamn(filnamn, get_text(obj_def, 'ObjectName', ns))
        
        # Bolag från LoggingOrganisation
        logging_org = find_element(obj_def, 'LoggingOrganisation', ns)
        bolag = ''
        if logging_org is not None:
            contact = find_element(logging_org, 'ContactInformation', ns)
            if contact is not None:
                bolag = get_text(contact, 'BusinessName', ns)
                if not bolag:
                    bolag = get_text(contact, 'LastName', ns)
        
        # GPS
        lat = None
        lon = None
        coords = find_element(obj_def, 'Coordinates', ns)
        if coords is not None:
            lat = safe_float(get_text(coords, 'Latitude', ns))
            lon = safe_float(get_text(coords, 'Longitude', ns))
        
        # Start- och slutdatum för objektet
        start_date = parse_datetime(get_text(obj_def, 'StartDate', ns))
        end_date = parse_datetime(get_text(obj_def, 'EndDate', ns))
        
        # Avverkningsform
        logging_form = find_element(obj_def, 'LoggingForm', ns)
        avverkningsform = ''
        avverkningsform_kod = ''
        if logging_form is not None:
            avverkningsform_kod = get_text(logging_form, 'LoggingFormCode', ns)
            avverkningsform = get_text(logging_form, 'LoggingFormDescription', ns)
        
        certifiering = get_text(obj_def, 'ForestCertification', ns)
        fastighetsnummer = get_text(obj_def, 'RealEstateIDObject', ns)
        
        # Skogsagare/säljare (ForestOwner)
        skogsagare = ''
        saljare = ''
        if forest_owner is not None:
            skogsagare = get_text(forest_owner, 'LastName', ns) or get_text(forest_owner, 'BusinessName', ns)
            saljare = get_text(forest_owner, 'FirstName', ns) or ''
        
        # CuttingMethod
        cutting_method = ''
        ext = find_element(obj_def, 'Extension', ns)
        if ext is not None:
            for child in ext:
                if 'Ponsse' in child.tag:
                    cm = child.find('{http://www.ponsse.com}CuttingMethod')
                    if cm is not None:
                        cutting_method = cm.text or ''
                    break
        
        objekt_id = make_objekt_id(vo_nummer, maskin_id, obj_key)
        obj_key_map[obj_key] = objekt_id

        # Koordinater: försök från ObjectDefinition, annars från LocationCoordinates
        if not lat or not lon:
            loc_coord = location_coords_map.get(obj_key)
            if loc_coord:
                lat, lon = loc_coord

        objektnr = get_text(obj_def, 'ObjectUserID', ns)
        data['objekt'].append({
            'objekt_id': objekt_id,
            'object_key': obj_key,
            'object_name': object_name,
            'vo_nummer': vo_nummer,
            'objektnr': objektnr,
            'bolag': bolag,
            'maskin_id': maskin_id,
            'skogsagare': skogsagare,
            'saljare': saljare,
            'fastighetsnummer': fastighetsnummer,
            'latitude': lat,
            'longitude': lon,
            'avverkningsform': avverkningsform,
            'certifiering': certifiering,
            'cutting_method': cutting_method,
            'start_date': start_date,
            'end_date': end_date
        })
    
    # === SORTIMENT/PRODUKTER ===
    fpr_product_names = {}
    for prod_def in find_all_elements(machine, 'ProductDefinition', ns):
        prod_key = get_text(prod_def, 'ProductKey', ns)
        # ProductName sitter inne i ClassifiedProductDefinition i FPR
        classified = find_element(prod_def, 'ClassifiedProductDefinition', ns)
        prod_name = ''
        if classified is not None:
            prod_name = get_text(classified, 'ProductName', ns)
        if not prod_name:
            prod_name = get_text(prod_def, 'ProductName', ns)
        if prod_key and prod_name:
            fpr_product_names[prod_key] = prod_name
            data['sortiment'].append({
                'sortiment_id': f"{maskin_id}_{prod_key}",
                'product_key': prod_key,
                'namn': prod_name,
                'maskin_id': maskin_id
            })

    # Bygg location -> obj_key lookup + avlägg-destinationer från LocationDefinition
    location_obj_map = {}
    for loc_def in find_all_elements(machine, 'LocationDefinition', ns):
        loc_key = get_text(loc_def, 'LocationKey', ns)
        obj_key_loc = get_text(loc_def, 'ObjectKey', ns)
        if loc_key and obj_key_loc:
            location_obj_map[loc_key] = obj_key_loc
        # Avlägg-koordinater till dim_destination
        if loc_key:
            loc_name = get_text(loc_def, 'LocationName', ns) or ''
            loc_lat = None
            loc_lon = None
            loc_coords = find_element(loc_def, 'LocationCoordinates', ns)
            if loc_coords is not None:
                loc_lat = safe_float(get_text(loc_coords, 'Latitude', ns))
                loc_lon = safe_float(get_text(loc_coords, 'Longitude', ns))
            # fallback: direkt under LocationDefinition
            if loc_lat is None:
                loc_lat = safe_float(get_text(loc_def, 'Latitude', ns))
            if loc_lon is None:
                loc_lon = safe_float(get_text(loc_def, 'Longitude', ns))
            data['destinationer'].append({
                'destination_id': loc_key,
                'namn': loc_name,
                'latitude': loc_lat,
                'longitude': loc_lon,
            })

    # Bygg DeliveryKey -> ProductKey lookup
    delivery_product_map = {}
    for del_def in find_all_elements(machine, 'DeliveryDefinition', ns):
        del_key = get_text(del_def, 'DeliveryKey', ns)
        prod_key_del = get_text(del_def, 'ProductKey', ns)
        if del_key and prod_key_del:
            delivery_product_map[del_key] = prod_key_del

    # === DESTINATIONER ===
    # FPR-filer har destinationer inuti DeliveryDefinition/DeliveryDestination,
    # inte som separata DestinationDefinition-element.
    seen_dest_keys = set()
    for del_def in find_all_elements(machine, 'DeliveryDefinition', ns):
        del_dest = find_element(del_def, 'DeliveryDestination', ns)
        if del_dest is not None:
            dest_key = get_text(del_dest, 'DestinationKey', ns)
            if dest_key and dest_key not in seen_dest_keys:
                seen_dest_keys.add(dest_key)
                data['destinationer'].append({
                    'destination_id': f"{maskin_id}_{dest_key}",
                    'namn': get_text(del_dest, 'DestinationName', ns) or '',
                    'mottagningsnummer': get_text(del_dest, 'DestinationUserID', ns) or ''
                })

    # Fallback: sök även DestinationDefinition (äldre format)
    for dest_def in find_all_elements(machine, 'DestinationDefinition', ns):
        dest_key = get_text(dest_def, 'DestinationKey', ns)
        if dest_key and dest_key not in seen_dest_keys:
            seen_dest_keys.add(dest_key)
            data['destinationer'].append({
                'destination_id': f"{maskin_id}_{dest_key}",
                'namn': get_text(dest_def, 'DestinationName', ns) or '',
                'mottagningsnummer': get_text(dest_def, 'DestinationUserID', ns) or ''
            })

    # Skapa lookup för dest_key -> namn (utan maskin_id-prefix)
    dest_names = {}
    for d in data['destinationer']:
        # destination_id = "maskin_id_dest_key", plocka ut sista delen
        parts = d['destination_id'].split('_')
        dk = parts[-1] if parts else ''
        dest_names[dk] = d['namn']
    
    # === LASS ===
    for load in find_all_elements(machine, 'Load', ns):
        load_num = safe_int(get_text(load, 'LoadNumber', ns))
        op_key = get_text(load, 'OperatorKey', ns)
        distance = safe_int(get_text(load, 'DistanceFromLastUnloading', ns))
        
        # Tider
        loading_time_str = get_text(load, 'LoadingTime', ns)
        unloading_time_str = get_text(load, 'UnloadingTime', ns)
        loading_dt = parse_datetime(loading_time_str)
        unloading_dt = parse_datetime(unloading_time_str)
        
        # Hämta volym och objekt från PartialLoad
        total_volym = 0.0
        obj_key = None
        dest_key = None
        
        lass_sortiment = []
        
        for partial in find_all_elements(load, 'PartialLoad', ns):
            location_key = get_text(partial, 'LocationKey', ns)
            delivery_key_partial = get_text(partial, 'DeliveryKey', ns)
            # ProductKey via DeliveryKey -> ProductKey mapping (Ponsse FPR)
            product_key = get_text(partial, 'ProductKey', ns)
            if not product_key and delivery_key_partial:
                product_key = delivery_product_map.get(delivery_key_partial)
            product_name = fpr_product_names.get(product_key, get_text(partial, 'ProductName', ns))
            # Hämta obj_key via LocationKey -> ObjectKey
            if not obj_key and location_key:
                obj_key = location_obj_map.get(location_key)
            
            # Destination
            dest_key_temp = get_text(partial, 'DestinationKey', ns) or delivery_key_partial
            if dest_key_temp:
                dest_key = dest_key_temp
            
            # Volym - Ponsse FPR har 3 LoadVolume utan kategori (sob, sub, pris)
            # Ta första som sob, andra som sub
            load_volumes = [safe_float(v.text) for v in find_all_elements(partial, 'LoadVolume', ns)]
            volym_sob = 0.0
            volym_sub = 0.0
            if load_volumes:
                # Kolla om kategori finns
                has_category = any(get_attr(v, 'loadVolumeCategory') 
                                   for v in find_all_elements(partial, 'LoadVolume', ns))
                if has_category:
                    for vol_elem in find_all_elements(partial, 'LoadVolume', ns):
                        cat = get_attr(vol_elem, 'loadVolumeCategory').lower()
                        val = safe_float(vol_elem.text)
                        if 'm3sob' in cat:
                            volym_sob = val
                        elif 'm3sub' in cat:
                            volym_sub = val
                else:
                    # Ingen kategori: anta sob=index0, sub=index1
                    volym_sob = load_volumes[0] if len(load_volumes) > 0 else 0.0
                    volym_sub = load_volumes[1] if len(load_volumes) > 1 else volym_sob
                total_volym += volym_sob
            
            if (volym_sob > 0 or volym_sub > 0) and product_key:
                lass_sortiment.append({
                    'sortiment_id': f"{maskin_id}_{product_key}",
                    'sortiment_namn': product_name,
                    'volym_m3sob': volym_sob,
                    'volym_m3sub': volym_sub
                })
        
        # Hitta ObjectKey via LocationDefinition
        if not obj_key:
            for loc_def in find_all_elements(machine, 'LocationDefinition', ns):
                obj_key_from_loc = get_text(loc_def, 'ObjectKey', ns)
                if obj_key_from_loc:
                    obj_key = obj_key_from_loc
                    break
        
        datum = unloading_dt.date() if unloading_dt else (loading_dt.date() if loading_dt else None)
        
        total_volym_sub = sum(s['volym_m3sub'] for s in lass_sortiment if s.get('volym_m3sub'))
        objekt_id_lass = obj_key_map.get(obj_key) if obj_key else None

        lass_data = {
            'datum': datum,
            'maskin_id': maskin_id,
            'operator_id': op_id_for_key(op_key, 'lass'),
            'objekt_id': objekt_id_lass,
            'lass_nummer': load_num,
            'volym_m3sob': total_volym,
            'volym_m3sub': total_volym_sub,
            'korstracka_m': distance,
            'lastnings_tid': loading_dt,
            'lossnings_tid': unloading_dt,
            'destination_id': f"{maskin_id}_{dest_key}" if dest_key else None,
            'destination_namn': dest_names.get(dest_key, ''),
            'filnamn': filnamn,
            'sortiment': lass_sortiment
        }
        data['lass'].append(lass_data)
    
    total_volym = sum(l['volym_m3sob'] for l in data['lass'])
    logger.info(f"  Lass: {len(data['lass'])} st, Total volym: {total_volym:.1f} m³")

    # === FORWARDING STATUS (total skotnings tid per sortiment) ===
    for fs in find_all_elements(machine, 'ForwardingStatus', ns):
        loc_key_fs = get_text(fs, 'LocationKey', ns)
        del_key_fs = get_text(fs, 'DeliveryKey', ns)
        start_str = get_text(fs, 'ForwardStartDate', ns)
        end_str = get_text(fs, 'ForwardEndDate', ns)
        
        obj_key_fs = location_obj_map.get(loc_key_fs) if loc_key_fs else None
        objekt_id_fs = obj_key_map.get(obj_key_fs) if obj_key_fs else None
        prod_key_fs = delivery_product_map.get(del_key_fs) if del_key_fs else None
        sortiment_namn_fs = fpr_product_names.get(prod_key_fs, '') if prod_key_fs else ''
        
        if objekt_id_fs and start_str:
            data['skotning_status'].append({
                'maskin_id': maskin_id,
                'objekt_id': objekt_id_fs,
                'sortiment_id': f"{maskin_id}_{prod_key_fs}" if prod_key_fs else None,
                'sortiment_namn': sortiment_namn_fs,
                'start_tid': parse_datetime(start_str),
                'slut_tid': parse_datetime(end_str) if end_str else None,
                'filnamn': filnamn
            })

    return data

# ============================================================
# SPARA TILL SUPABASE
# ============================================================

def insert_if_not_exists(table: str, data: List[Dict], filnamn_key: str = 'filnamn'):
    """Insert rader om filnamnet inte redan finns i tabellen"""
    if not data:
        return 0
    
    try:
        # Hämta filnamn från första raden
        filnamn = data[0].get(filnamn_key)
        if not filnamn:
            return upsert_data(table, data)
        
        # Kolla om filnamnet redan finns
        check_response = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?{filnamn_key}=eq.{filnamn}&select={filnamn_key}&limit=1",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        if check_response.status_code == 200 and check_response.json():
            logger.info(f"  {table}: filnamn redan finns, hoppar över")
            return len(data)  # Räknas som OK
        
        # Gör vanlig insert utan on_conflict
        return upsert_data(table, data)
    except Exception as e:
        logger.error(f"  Fel vid insert_if_not_exists för {table}: {e}")
        return 0


def upsert_data(table: str, data: List[Dict], unique_columns: List[str] = None, on_conflict: str = 'merge'):
    """Upsert data till Supabase via REST API. on_conflict: 'merge' or 'ignore'"""
    if not data:
        return 0
    
    try:
        # Konvertera datetime till ISO-format och ersätt None med null-kompatibelt
        for row in data:
            for key, value in list(row.items()):
                if isinstance(value, datetime):
                    row[key] = value.isoformat()
                elif hasattr(value, 'isoformat'):
                    row[key] = str(value)

        # Normalisera alla rader till samma kolumner (Supabase kräver detta)
        # Samla alla unika nycklar från alla rader
        all_keys = set()
        for row in data:
            all_keys.update(row.keys())
        
        # Se till att alla rader har samma nycklar, sätt None för saknade
        normalized = []
        for row in data:
            normalized_row = {k: row.get(k, None) for k in all_keys}
            # Behåll alla nycklar - ta INTE bort None, Supabase kräver identiska nycklar per batch
            normalized.append(normalized_row)
        
        # Kontrollera att alla rader nu har samma nycklar
        if normalized:
            first_keys = set(normalized[0].keys())
            for i, row in enumerate(normalized):
                if set(row.keys()) != first_keys:
                    # Fyll på med None för saknade nycklar
                    for k in first_keys:
                        if k not in row:
                            row[k] = None

        headers = dict(SUPABASE_HEADERS)
        
        if unique_columns:
            url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={','.join(unique_columns)}"
            headers["Prefer"] = f"resolution={'ignore-duplicates' if on_conflict == 'ignore' else 'merge-duplicates'}"
        else:
            url = f"{SUPABASE_URL}/rest/v1/{table}"
        
        response = requests.post(
            url,
            json=normalized,
            headers=headers,
            timeout=30
        )
        
        if response.status_code in [200, 201, 204]:
            return len(normalized)
        else:
            logger.error(f"  Fel vid sparande till {table}: {response.status_code} - {response.text[:200]}")
            return 0
    except Exception as e:
        logger.error(f"  Fel vid sparande till {table}: {e}")
        return 0

# ── dim_objekt-skrivpolicy ────────────────────────────────────────────────
# GRUNDREGEL: maskindata FYLLER LUCKOR — den skriver aldrig över mänsklig
# kunskap. Martin rättade namn manuellt och nästa kumulativa fil skrev över
# dem, om och om igen. Aldrig mer.
#
# Skyddade fält (import får bara fylla tomma):
#   bolag, skogsagare, saljare, vo_nummer
# vo_nummer: Martin sätter egna VO (t.ex. "P-1013") som limmar ihop
# skördare+skotare på privata objekt — de får aldrig skrivas över av
# maskinens ContractNumber/ObjectUserID. OBS: vo ingår i objekt_id-BYGGET
# för NYA rader, men en befintlig rads objekt_id muteras aldrig — skyddet
# bryter inga kopplingar (fakta pekar på objekt_id, inte vo).
# object_name har en extra regel: ett befintligt TIDSSTÄMPEL-namn får
# ersättas av ett riktigt namn (uppgradering), men ett riktigt namn rörs
# aldrig. (huvudtyp/inkopare/atgard/exkludera skickas aldrig av importen —
# de är redan helt manuella.)
# Fält importen äger fritt: start_date, end_date, areal_ha, avverkningsform,
# certifiering, cutting_method, koordinater, objektnr m.fl.
SKYDDADE_OBJEKTFALT = ('bolag', 'skogsagare', 'saljare', 'vo_nummer')

def upsert_dim_objekt(objekt_rows: List[Dict]) -> int:
    """ALL skrivning till dim_objekt går genom denna (MOM/HPR/FPR).
    Upsertar per rad (aldrig batch — batch-normalisering fyller None som
    skulle nolla kolumner). Returnerar antal sparade rader."""
    if not objekt_rows:
        return 0

    # Hämta befintliga rader för skydds-jämförelsen
    ids = sorted({o['objekt_id'] for o in objekt_rows if o.get('objekt_id')})
    befintliga = {}
    hamtning_ok = True
    try:
        id_list = ','.join(f'"{i}"' for i in ids)
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/dim_objekt",
            params={'objekt_id': f'in.({id_list})',
                    'select': 'objekt_id,object_name,bolag,skogsagare,saljare'},
            headers=SUPABASE_HEADERS, timeout=30)
        if resp.status_code == 200:
            for rad in resp.json():
                befintliga[rad['objekt_id']] = rad
        else:
            hamtning_ok = False
    except Exception:
        hamtning_ok = False
    if not hamtning_ok:
        # Kan vi inte läsa befintligt kan vi inte veta vad som är mänskligt
        # underhållet -> skicka INGA skyddade fält alls (fail-safe: hellre
        # missad uppdatering än överskriven rättning). Larm i loggen.
        logger.warning("  dim_objekt: kunde inte läsa befintliga rader — "
                       "skyddade fält (namn/bolag/skogsägare) hoppas över denna körning")

    sparade = 0
    for obj in objekt_rows:
        # Nulla aldrig: skicka bara fält med värde
        clean = {k: v for k, v in obj.items() if v not in (None, '')}
        clean['objekt_id'] = obj['objekt_id']
        clean['maskin_id'] = obj.get('maskin_id', '')

        ex = befintliga.get(obj.get('objekt_id'))
        if ex is not None:
            for falt in SKYDDADE_OBJEKTFALT:
                if falt in clean and ex.get(falt) not in (None, ''):
                    clean.pop(falt)  # fyll bara luckor
            if 'object_name' in clean:
                if not ar_tidsstampelnamn(ex.get('object_name')):
                    clean.pop('object_name')  # riktigt namn — rörs aldrig
                elif ar_tidsstampelnamn(clean['object_name']):
                    clean.pop('object_name')  # nytt är inte bättre
        elif not hamtning_ok:
            for falt in SKYDDADE_OBJEKTFALT + ('object_name',):
                clean.pop(falt, None)

        if upsert_data('dim_objekt', [clean], ['objekt_id']) > 0:
            sparade += 1
    return sparade

def _create_arbetsdag(tid_rows: List[Dict], skift: List[Dict]):
    """Skapa arbetsdag-rader från fakt_skift (start/slut) + fakt_tid (rast).

    BUGGFIX 2026-05-21: tidigare aggregerades bara den AKTUELLA FILENS skift,
    vilket gjorde att multi-skift-dagar kollapsade vid varje fil-import (UPSERT
    skrev över raden, senaste filen vann). Nu hämtas ALLA fakt_skift och fakt_tid
    från DB för berörda datum, så aggregeringen ser hela dagen oavsett hur många
    filer den är fördelad på.

    Parameter `skift`/`tid_rows` används bara för att identifiera vilka
    (medarbetare, datum) som påverkas av denna import — själva aggregeringen
    läser från DB.

    Skift under 300 sek (5 min) filtreras som artefakter.
    slut_tid = NULL om utloggning saknas (tidigare default '16:00' gav negativa
    pass när skiftet började efter 16:00).

    Skriver inte över rader där bekraftad = true — separat rebuild-skript
    hanterar bekräftade rader selektivt vid behov.
    Aggregerar per (medarbetare_id, datum) — en person som kör flera maskiner
    samma dag får en rad med huvudmaskinen (den med mest tid)."""
    try:
        # 1. Hämta operator_id → medarbetare_id
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/operator_medarbetare?select=operator_id,medarbetare_id",
            headers=SUPABASE_HEADERS, timeout=30
        )
        if resp.status_code != 200:
            return
        op_to_medarb = {}
        for row in resp.json():
            if row.get('operator_id') and row.get('medarbetare_id'):
                op_to_medarb[row['operator_id']] = row['medarbetare_id']

        # 2. Hämta operatörsnamn från dim_operator (för loggning)
        op_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/dim_operator?select=operator_id,operator_namn",
            headers=SUPABASE_HEADERS, timeout=30
        )
        op_namn = {}
        if op_resp.status_code == 200:
            for row in op_resp.json():
                if row.get('operator_id') and row.get('operator_namn'):
                    op_namn[row['operator_id']] = row['operator_namn']

        # 3. Identifiera berörda datum från filens skift + tid_rows.
        # Vi aggregerar bara för dessa dagar, inte hela DB:n.
        beforda_datum = set()
        for s in skift:
            datum = s.get('datum')
            op_id = s.get('operator_id')
            if datum and op_id and op_to_medarb.get(op_id):
                beforda_datum.add(str(datum))
        for row in tid_rows:
            datum = str(row.get('datum', ''))
            op_id = row.get('operator_id')
            if datum and op_id and op_to_medarb.get(op_id):
                beforda_datum.add(datum)

        if not beforda_datum:
            return

        datum_in = ','.join(beforda_datum)

        # 4. Hämta ALLA fakt_skift för berörda datum (inte bara filens egna).
        # Detta är scope-fixen — multi-fil-dagar aggregeras nu korrekt.
        skift_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/fakt_skift?datum=in.({datum_in})"
            f"&select=operator_id,maskin_id,datum,inloggning_tid,utloggning_tid,langd_sek",
            headers=SUPABASE_HEADERS, timeout=30
        )
        if skift_resp.status_code != 200:
            logger.warning(f"  Arbetsdag: kunde inte hämta fakt_skift ({skift_resp.status_code})")
            return
        alla_skift = skift_resp.json()

        # 5. Hämta ALLA fakt_tid för rast-summering över hela dagen.
        tid_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/fakt_tid?datum=in.({datum_in})"
            f"&select=operator_id,datum,rast_sek,objekt_id",
            headers=SUPABASE_HEADERS, timeout=30
        )
        if tid_resp.status_code != 200:
            logger.warning(f"  Arbetsdag: kunde inte hämta fakt_tid ({tid_resp.status_code})")
            return
        alla_tid = tid_resp.json()

        # 6. Bygg rast-lookup + objekt-lookup från DB-datat.
        rast_lookup = {}
        objekt_lookup = {}
        for row in alla_tid:
            op_id = row.get('operator_id')
            datum = str(row.get('datum', ''))
            if op_id and datum:
                key = (op_id, datum)
                rast_lookup[key] = rast_lookup.get(key, 0) + (row.get('rast_sek', 0) or 0)
                if not objekt_lookup.get(key) and row.get('objekt_id'):
                    objekt_lookup[key] = row['objekt_id']

        # 7. Aggregera skift per (medarbetare_id, datum) — MIN(start), MAX(slut)
        # över ALLA dagens skift. Skräpfilter < 300 sek.
        dag_agg = {}
        logged_unknown = set()
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
                if op_id not in logged_unknown:
                    namn = op_namn.get(op_id, '?')
                    logger.info(f"  Ny operatör: {op_id} {namn} på {maskin} — behöver kopplas")
                    logged_unknown.add(op_id)
                continue

            datum_str = str(datum)
            inl_dt = parse_datetime(str(inl)) if inl else None
            utl_dt = parse_datetime(str(utl)) if utl else None
            if not inl_dt:
                continue

            # Skräpfilter: skift under 5 min är artefakter (motorn startad
            # men inget riktigt pass). Hoppa över denna skift-rad — andra
            # skift för samma dag aggregeras fortfarande.
            if utl_dt:
                sek = int((utl_dt - inl_dt).total_seconds())
                if sek < 300:
                    continue
            else:
                sek = 0

            key = (medarb_id, datum_str)
            if key not in dag_agg:
                dag_agg[key] = {'start': inl_dt, 'end': utl_dt, 'op_id': op_id, 'maskin_sek': {}}
            else:
                if inl_dt and (not dag_agg[key]['start'] or inl_dt < dag_agg[key]['start']):
                    dag_agg[key]['start'] = inl_dt
                if utl_dt and (not dag_agg[key]['end'] or utl_dt > dag_agg[key]['end']):
                    dag_agg[key]['end'] = utl_dt
            dag_agg[key]['maskin_sek'][maskin] = dag_agg[key]['maskin_sek'].get(maskin, 0) + sek

        # 8. Bygg arbetsdag-rader (en per medarbetare+datum)
        arbetsdag_rows = []
        for (medarb_id, datum_str), agg in dag_agg.items():
            if not agg['start']:
                continue

            start_tid = agg['start'].strftime('%H:%M')
            # NULL om utloggning saknas — tidigare default '16:00' gav negativa
            # pass och dolde att data var ofullständig.
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
                'objekt_id': objekt_id,
            })

        if not arbetsdag_rows:
            return

        # 9. Filtrera bort bekräftade rader — live-import får inte rasera
        # förares bekräftelser. Rebuild-skriptet hanterar det separat.
        medarb_list = list(set(r['medarbetare_id'] for r in arbetsdag_rows))
        bekraftade = set()
        for mid in medarb_list:
            check = requests.get(
                f"{SUPABASE_URL}/rest/v1/arbetsdag?medarbetare_id=eq.{mid}&bekraftad=eq.true&select=medarbetare_id,datum",
                headers=SUPABASE_HEADERS, timeout=30
            )
            if check.status_code == 200:
                for row in check.json():
                    bekraftade.add((row['medarbetare_id'], row['datum']))

        to_upsert = [r for r in arbetsdag_rows if (r['medarbetare_id'], r['datum']) not in bekraftade]

        if to_upsert:
            n = upsert_data('arbetsdag', to_upsert, ['medarbetare_id', 'datum'])
            if n > 0:
                logger.info(f"  Arbetsdag: {n} dagar skapade/uppdaterade")
    except Exception as e:
        logger.warning(f"  Arbetsdag: kunde inte skapa ({e})")

def save_mom_to_supabase(data: Dict) -> bool:
    """Spara MOM-data till Supabase"""
    try:
        fel = []

        # Maskin
        if data.get('maskin'):
            log_if_new_maskin(data['maskin'].get('maskin_id', ''), data['maskin'].get('maskin_typ', 'Okänd'))
            if upsert_data('dim_maskin', [data['maskin']], ['maskin_id']) == 0:
                fel.append('dim_maskin')

        # Operatörer
        if data.get('operatorer'):
            if upsert_data('dim_operator', data['operatorer'], ['operator_id']) == 0:
                fel.append('dim_operator')

        # Objekt — gemensam skrivpolicy (fyller luckor, skriver aldrig över
        # mänskligt underhållna fält)
        if data.get('objekt'):
            upsert_dim_objekt(data['objekt'])

        # Trädslag
        if data.get('tradslag'):
            if upsert_data('dim_tradslag', data['tradslag'], ['tradslag_id']) == 0:
                fel.append('dim_tradslag')

        # GPS-spår (ej kritiskt – logga bara fel)
        if data.get('gps_spar'):
            batch_size = 500
            for i in range(0, len(data['gps_spar']), batch_size):
                batch = data['gps_spar'][i:i+batch_size]
                upsert_data('detalj_gps_spar', batch)

        # Skift — nyckel (maskin_id, datum, shift_key), INTE filnamn/inloggning_tid:
        # timvisa MOM-filer gav en NY rad per fil (filnamn i gamla nyckeln) och
        # starttiden glider mellan ögonblicksbilder. ShifKey är skiftets äkta
        # identitet; senare fil UPPDATERAR raden (senaste = mest kompletta).
        # datum i nyckeln = billig försäkring mot framtida ShifKey-reset
        # (maskindatorbyte); startdatum är verifierat stabilt per skift.
        if data.get('skift'):
            if upsert_data('fakt_skift', data['skift'], ['maskin_id', 'datum', 'shift_key']) == 0:
                logger.warning(f"  Skift-data kunde inte sparas (ej kritiskt)")

        # Tid — re-aggregera från ALLA filer i Behandlade/<maskin>/mom/ för
        # berörda (datum, maskin). Segment-IDENTITET är (start_time, maskin);
        # objekt/operator är ATTRIBUT som senaste exportversionen äger. Berörda
        # dagar raderas och byggs om i sin helhet (delete + insert) — se _keep.
        #
        # Bakgrund: auto_import_watch.py kör skogsmaskin_import_version_6.py via
        # subprocess.run() per filevent → ny Python-process varje gång, så
        # _GLOBAL_TID_ENTRIES (modulvariabel) var ALLTID tom vid start. Det
        # gjorde att en liten "morgon-export" (1 entry, 5 min) som kom efter
        # en stor "kvällsexport" (12h) aggregerade till bara 5 min, sedan
        # UPSERT-överskrev tidigare rad → upp till 99 % förlust på dagar med
        # flera filer. Vi läser nu samtliga filer i Behandlade vid varje import
        # så summan är oberoende av filordning.
        #
        # OBS: 'runtime = P + T + OW' i tomgang-härledningen är KORREKT och
        # avsiktlig — motorn arbetar under other work, så OW ska dras av från
        # motortiden precis som P+T (annars felklassas OW-tid som tomgång).
        # Blanda inte ihop med G15h-VISNINGEN i appen, som är P + T utan OW
        # (transform.ts) — det är två olika mått. (Tidigare kommentar här
        # kallade OW-inkluderingen "en separat bugg" — det var fel.)
        rows = []
        if data.get('tid_entries'):
            global _GLOBAL_TID_ENTRIES, _GLOBAL_TID_OPERATORS
            # _GLOBAL_TID_OPERATORS används som fallback för legacy 3-tuple-keys
            # där operator inte ingår direkt i entry_key.
            _GLOBAL_TID_OPERATORS.update(data.get('tid_operator', {}))

            # Steg 1: identifiera vilka (maskin, datum) som påverkas av NUVARANDE
            # fil. Dessa dagar byggs om i sin HELHET (alla objekt/operatörer) från
            # samtliga Behandlade-filer + nuvarande fil.
            affected = set()        # set of (maskin, datum_str)
            for entry_key, entry in data['tid_entries'].items():
                if len(entry_key) == 4:
                    _, maskin, _, _ = entry_key
                else:
                    _, maskin, _ = entry_key
                datum_str = str(entry.get('datum') or '')
                if not datum_str:
                    continue
                affected.add((maskin, datum_str))

            if affected:
                # Steg 2: scanna ALLA MOM-filer i Behandlade/<maskin>/mom/ för
                # de berörda datumen.
                #
                # IDENTITET = (start_time, maskin). Objekt och operatör är ATTRIBUT
                # — kumulativa exportversioner kan OM-ATTRIBUERA samma segment
                # (bevisat A110148 maj–juni 2026: första versionen satte
                # OperatorKey 1 på dagens alla segment, alla senare versioner
                # satte 2 → med attribution i identiteten fick BÅDA generationerna
                # egna rader och hela dagar dubblades: 26,6 h motortid på en dag).
                #
                # TVÅ SEPARATA VINNARE per identitet (steg 4-sweepens läxa 2026-07-11):
                #   BELOPP     = varianten med STÖRST vikt (segmentets totala duration
                #                över alla tidshinkar; tie → högst recency). Ponsse
                #                exporterar ibland samma starttid med OLIKA durationer
                #                (segment skrivs om mellan/inom exportversioner —
                #                bevisat PONS 2026-03-17 06:32:46: fem varianter
                #                4987–13015 s). En senare version med KORTARE variant
                #                får aldrig klubba den mest kompletta (#40-skyddet).
                #   ATTRIBUTION = versionen med HÖGST recency (suffix/mtime; tie →
                #                störst vikt) äger (objekt, operator) — senaste
                #                exportversionens bokföring gäller (op-flip-fixen).
                merged_entries = {}   # (start_time, maskin) -> värde-vinnande entry
                merged_attr = {}      # (start_time, maskin) -> (recency, objekt, operator, vikt)
                _varde_meta = {}      # (start_time, maskin) -> (vikt, recency) för värde-vinnaren
                files_scanned = 0

                def _fil_recency(namn_eller_path):
                    """Exportversionens ålder: sista _YYYYMMDD_HHMMSS-suffixet i
                    filnamnet (sätts av vår Behandlade-flytt vid namnkrock, rad
                    ~3450), annars filens mtime, annars 0. OBS: suffix och mtime
                    är olika klockor — en suffixlös basfil vars mtime bumpas i
                    efterhand (t.ex. OneDrive-omsynk) kan tillfälligt rankas
                    före senare suffixade versioner; byten loggas alltid (INFO)
                    och nästa nyare export rättar attributionen."""
                    bas = os.path.basename(namn_eller_path)
                    # Maskin-genererade filnamn: 14 sammanhängande siffror (_YYYYMMDDHHMMSS)
                    m14 = re.search(r'_(\d{14})(?=\.|_|$)', bas)
                    if m14:
                        try:
                            return datetime.strptime(m14.group(1), '%Y%m%d%H%M%S').timestamp()
                        except ValueError:
                            pass
                    # Behandlade-suffix: _YYYYMMDD_HHMMSS (sätts vid namnkrock)
                    m = re.findall(r'_(\d{8})_(\d{6})', bas)
                    if m:
                        try:
                            return datetime.strptime(m[-1][0] + m[-1][1], '%Y%m%d%H%M%S').timestamp()
                        except ValueError:
                            pass
                    try:
                        return os.path.getmtime(namn_eller_path)
                    except OSError:
                        return 0.0

                def _keep(ek, entry, recency):
                    ident = (ek[0], ek[1])
                    objekt, operator = ek[2], ek[3]
                    # vikt = segmentets hela duration oavsett klass (RUN/DOWN/UNUT) —
                    # P+T räcker inte: DOWN-/rast-varianter har P+T = 0.
                    vikt = sum((entry.get(f) or 0) for f in (
                        'processing_sek', 'terrain_sek', 'other_work_sek',
                        'maintenance_sek', 'disturbance_sek', 'rast_sek', 'avbrott_sek'))
                    # 1) VÄRDE-vinnaren: störst vikt (tie → högst recency)
                    v = _varde_meta.get(ident)
                    if v is None or vikt > v[0] or (vikt == v[0] and recency > v[1]):
                        merged_entries[ident] = entry
                        _varde_meta[ident] = (vikt, recency)
                    # 2) ATTRIBUTIONS-vinnaren: högst recency (tie → störst vikt)
                    a = merged_attr.get(ident)
                    if a is None or recency > a[0] or (recency == a[0] and vikt > a[3]):
                        if a is not None and (a[1], a[2]) != (objekt, operator):
                            logger.info(f"  Attribution bytt för segment {ek[0]} ({ek[1]}): "
                                        f"({a[1]}, {a[2]}) -> ({objekt}, {operator}) — senaste exportversion vinner")
                        merged_attr[ident] = (recency, objekt, operator, vikt)
                affected_maskins = sorted({m for m, _ in affected})
                affected_dates_all = sorted({d for _, d in affected})
                logger.info(f"  Re-aggregerar tid för maskin={affected_maskins} datum={affected_dates_all[0]}->{affected_dates_all[-1]}")

                for maskin_id in affected_maskins:
                    dates_for_maskin = {d for m, d in affected if m == maskin_id}
                    mom_dir = os.path.join(BEHANDLADE, maskin_id, 'mom')
                    if not os.path.isdir(mom_dir):
                        continue
                    # Pre-filter: MOM-filnamn innehåller maskintidsstämpeln (_YYYYMMDDHHMMSS).
                    # Hoppa filer vars datum-prefix (8 siffror) INTE finns bland berörda datum
                    # — minskar parse-anrop drastiskt vid timrapportering med 10+ filer/dag.
                    dates_ren_set = {d.replace('-', '') for d in dates_for_maskin}

                    def _datum_i_filnamn(fname):
                        m = re.search(r'_(\d{8})\d{6}(?=\.|_|$)', fname)
                        if m:
                            return m.group(1) in dates_ren_set
                        return True  # inget datummönster → inkludera för säkerhets skull

                    mom_files = sorted(
                        os.path.join(mom_dir, f)
                        for f in os.listdir(mom_dir)
                        if f.lower().endswith('.mom') and _datum_i_filnamn(f)
                    )
                    for f in mom_files:
                        try:
                            file_data = parse_mom_file(f)
                        except Exception as e:
                            logger.warning(f"  Kunde inte re-parsa {os.path.basename(f)}: {e}")
                            continue
                        files_scanned += 1
                        f_recency = _fil_recency(f)
                        for ek, entry in file_data.get('tid_entries', {}).items():
                            if len(ek) != 4:
                                continue
                            _, ek_maskin, _, _ = ek
                            if ek_maskin != maskin_id:
                                continue
                            if str(entry.get('datum') or '') in dates_for_maskin:
                                _keep(ek, entry, f_recency)

                # Steg 3: lägg explicit in nuvarande filens entries — filen kan
                # ännu inte ha flyttats till Behandlade av import-pipelinen.
                # Recency ur inkommande filnamnets suffix om det finns; annars
                # "nu" (nyss anländ = senaste kända export). OBS: en gammal
                # export som återlevereras under basnamn kan därmed tillfälligt
                # vinna attributionen — nästa import av en nyare version rättar,
                # och attribution-byten loggas alltid (INFO) för spårbarhet.
                bas_namn = data.get('filnamn', '') or ''
                if re.search(r'_\d{14}(?=\.|_|$)|_\d{8}_\d{6}', bas_namn):
                    aktuell_recency = _fil_recency(bas_namn)
                else:
                    aktuell_recency = datetime.now().timestamp()
                for ek, entry in data['tid_entries'].items():
                    if len(ek) == 4:
                        _keep(ek, entry, aktuell_recency)

                logger.info(f"  Scannade {files_scanned} filer, {len(merged_entries)} unika entries efter dedup")

                tid_fields = ['processing_sek', 'terrain_sek', 'other_work_sek',
                              'maintenance_sek', 'disturbance_sek', 'rast_sek',
                              'avbrott_sek', 'kort_stopp_sek', 'bransle_liter',
                              'engine_time_sek', 'korstracka_m',
                              'terrain_korstracka_m', 'terrain_bransle_liter']

                # Steg 4: aggregera per (datum, maskin, objekt, operator) för ALLA
                # segment på berörda (maskin, datum) — attributionen kommer från
                # den vinnande (senaste) exportversionen. Dagen byggs om komplett;
                # äkta fleroperatörs-/flerobjektsdagar behåller sin uppdelning
                # eftersom olika segment (olika start_time) behåller var sin
                # attribution.
                dates_by_maskin = {m: {d for m2, d in affected if m2 == m}
                                   for m in affected_maskins}
                agg = defaultdict(lambda: {f: 0 for f in tid_fields})
                for ident, entry in merged_entries.items():
                    _, maskin = ident
                    _, objekt, operator, _ = merged_attr[ident]
                    datum = str(entry.get('datum') or '')
                    if not datum or datum not in dates_by_maskin.get(maskin, ()):
                        continue
                    dag_key = (datum, maskin, objekt, operator)
                    for f in tid_fields:
                        agg[dag_key][f] += (entry.get(f) or 0)

                for dag_key, values in agg.items():
                    datum, maskin, objekt, operator = dag_key
                    runtime = values['processing_sek'] + values['terrain_sek'] + values['other_work_sek']
                    g0 = runtime - values['kort_stopp_sek']
                    tomgang = max(0, values['engine_time_sek'] - g0)
                    rows.append({
                        'datum': datum,
                        'maskin_id': maskin,
                        'operator_id': operator,
                        'objekt_id': objekt,
                        **values,
                        'tomgang_sek': tomgang,
                        'filnamn': data.get('filnamn', ''),
                    })

            # Fallback: om WorkCategory saknas i MOM-filen → processing_sek = 0 och terrain_sek = 0
            # men engine_time_sek > 0. Sätt processing_sek = 88% av engine_time_sek som uppskattning.
            for row in rows:
                if row.get('processing_sek', 0) == 0 and row.get('terrain_sek', 0) == 0 and row.get('engine_time_sek', 0) > 0:
                    fallback_sek = int(row['engine_time_sek'] * 0.88)
                    row['processing_sek'] = fallback_sek
                    # Håll raden konsistent: tomgang_sek beräknades i Steg 4 med
                    # proc = 0 (≈ hela motortiden blev tomgång) — räkna om med
                    # fallback-procen. Fallbacken påstår 88 % arbete ⇒ tomgången
                    # är resterande ~12 % + ev. kort_stopp. Utan detta bokförs
                    # motortiden DUBBELT i raden (som proc OCH tomgång) — bevisat
                    # 41 rader / +7,3 h fejk-tomgång 2026-07-10.
                    g0_fb = (fallback_sek + row.get('terrain_sek', 0)
                             + row.get('other_work_sek', 0) - row.get('kort_stopp_sek', 0))
                    row['tomgang_sek'] = max(0, row['engine_time_sek'] - g0_fb)
                    logger.warning(f"  VARNING: Fallback G15h från EngineTime för {row.get('maskin_id')} {row.get('datum')} — WorkCategory saknas i MOM-fil (engine={row['engine_time_sek']}s → processing={fallback_sek}s, tomgang={row['tomgang_sek']}s)")

            if rows:
                # DAG-REBUILD: raderna är en KOMPLETT omaggregering av berörda
                # (maskin, datum) från samtliga Behandlade-filer + nuvarande fil.
                # Radera dagens gamla rader först — om-attribuerade objekt/
                # operatörer lämnar annars kvar dubblettrader för evigt, eftersom
                # upsert-nyckeln (datum, maskin, objekt, operator) aldrig träffar
                # den gamla attributionens rad (A110148-dubbleringen maj–juni-26).
                # Ej atomärt (delete + insert är två anrop): kraschar importen
                # mittemellan är meta ej satt → filen omimporteras → självläker.
                for del_maskin in affected_maskins:
                    del_datum = sorted({d for m, d in affected if m == del_maskin})
                    for i in range(0, len(del_datum), 50):
                        chunk = ','.join(del_datum[i:i+50])
                        try:
                            requests.delete(
                                f"{SUPABASE_URL}/rest/v1/fakt_tid"
                                f"?maskin_id=eq.{del_maskin}&datum=in.({chunk})",
                                headers=SUPABASE_HEADERS, timeout=60)
                        except Exception as e:
                            logger.warning(f"  Kunde inte städa fakt_tid före insert ({del_maskin}): {e}")
                if upsert_data('fakt_tid', rows, ['datum', 'maskin_id', 'objekt_id', 'operator_id']) == 0:
                    fel.append('fakt_tid')

        # Arbetsdag — skapa automatiskt från fakt_tid + skift
        if rows:
            _create_arbetsdag(rows, data.get('skift', []))

        # Produktion - upsert pa monitoring_start, samma period i flera filer blockeras
        if data.get('produktion'):
            if upsert_data('fakt_produktion', data['produktion'],
                           ['maskin_id', 'operator_id', 'objekt_id', 'tradslag_id', 'processtyp', 'monitoring_start']) == 0:
                fel.append('fakt_produktion')

        # Avbrott — deduplicate in Python, then upsert with ON CONFLICT DO NOTHING
        if data.get('avbrott'):
            seen = set()
            deduped = []
            for a in data['avbrott']:
                key = (a.get('maskin_id'), a.get('datum'), str(a.get('klockslag', '')), a.get('langd_sek'), a.get('kategori_kod'))
                if key not in seen:
                    seen.add(key)
                    deduped.append(a)
            if len(deduped) < len(data['avbrott']):
                logger.info(f"  Avbrott dedup: {len(data['avbrott'])} → {len(deduped)} (tog bort {len(data['avbrott']) - len(deduped)} dubletter i batch)")
            if upsert_data('fakt_avbrott', deduped,
                           ['maskin_id', 'datum', 'klockslag', 'kategori_kod'],
                           on_conflict='ignore') == 0:
                fel.append('fakt_avbrott')

        # mom_tider — timvisa tidssegment per maskin/operator (Alternativ A: 5 typer).
        # Källa: raw_tid_entries (individuella MOM-segment, ej dagsaggregat).
        # DAG-REBUILD: radera gamla rader per (maskin_id, timme) innan insert —
        # samma mönster som fakt_tid, hanterar reimporten av uppdaterade MOM-filer.
        tid_entries = data.get('tid_entries', {})
        if tid_entries:
            TYP_FIELDS = [
                ('processing_sek',  'processing'),
                ('terrain_sek',     'terrain'),
                ('kort_stopp_sek',  'kort_stopp'),
                ('other_work_sek',  'other'),
                ('disturbance_sek', 'disturbance'),
            ]

            # Dedup segment-nivå: samma (maskin, start_str, fält) från flera operatörer
            # = re-attribution, ej extra tid (se A110148-buggen). Sista entry vinner —
            # identisk logik som backfill_mom_tider.py.
            TYP_MAP = {f: t for f, t in TYP_FIELDS}
            dedup_segs: dict = {}  # (e_maskin, start_str, field) -> (e_op, sek)
            for entry_key, entry in tid_entries.items():
                if len(entry_key) == 4:
                    start_str, e_maskin, _, e_op = entry_key
                else:
                    start_str, e_maskin, _ = entry_key
                    e_op = entry.get('operator_id')
                for field in TYP_MAP:
                    sek = entry.get(field) or 0
                    if sek > 0 and start_str:
                        dedup_segs[(e_maskin, start_str, field)] = (e_op, sek)

            # Ackumulera sekunder per (maskin_id, operator_id, timme_utc, typ).
            # Segment delas proportionellt per timme (timdelning) — ett segment som
            # startar 06:52 och pågår 99 min genererar kl 6: 7 min, kl 7: 60 min, kl 8: 31 min.
            # UTC-offset bevaras via datetime.fromisoformat() (parse_datetime() i importkoden
            # strippar den — använd INTE den här).
            tider_agg: dict = {}
            for (e_maskin, start_str, field), (e_op, sek) in dedup_segs.items():
                typ = TYP_MAP[field]
                try:
                    dt_start = datetime.fromisoformat(start_str)
                except Exception:
                    continue
                # Dela upp segmentet per lokal heltimme
                dt_end = dt_start + timedelta(seconds=sek)
                current = dt_start
                while current < dt_end:
                    next_hour = (current.replace(minute=0, second=0, microsecond=0)
                                 + timedelta(hours=1))
                    chunk_end = min(next_hour, dt_end)
                    chunk_sek = (chunk_end - current).total_seconds()
                    if chunk_sek > 0:
                        hour_utc = (current.replace(minute=0, second=0, microsecond=0)
                                    .astimezone(timezone.utc))
                        timme_utc = hour_utc.strftime('%Y-%m-%dT%H:%M:%SZ')
                        agg_key = (e_maskin, e_op, timme_utc, typ)
                        tider_agg[agg_key] = tider_agg.get(agg_key, 0) + chunk_sek
                    current = next_hour

            # mom_tider-skydd: om Behandlade redan har en nyare MOM-fil för
            # maskinen+datumet hoppar vi mom_tider-skrivningen för den maskinen —
            # annars skriver en sent importerad gammal fil över en nyare fils
            # tim-data och G15h-kurvan sjunker (samma grundbugg som recency-fixen
            # i _fil_recency / aktuell_recency ovan).
            skip_maskiner: set = set()
            maskin_datum_sett: set = set()
            for (e_maskin, _, timme_utc, _) in list(tider_agg.keys()):
                maskin_datum_sett.add((e_maskin, timme_utc[:10].replace('-', '')))
            for (e_maskin, datum_prefix) in maskin_datum_sett:
                behandlad_mapp = os.path.join(BEHANDLADE, e_maskin, 'mom')
                if not os.path.isdir(behandlad_mapp):
                    continue
                for bfil in os.listdir(behandlad_mapp):
                    if not bfil.lower().endswith('.mom'):
                        continue
                    if datum_prefix not in bfil:
                        continue
                    if _fil_recency(os.path.join(behandlad_mapp, bfil)) > aktuell_recency:
                        skip_maskiner.add(e_maskin)
                        logger.info(
                            f"  mom_tider: hoppar {e_maskin} ({datum_prefix})"
                            f" – nyare fil finns i Behandlade ({bfil})")
                        break
            if skip_maskiner:
                tider_agg = {k: v for k, v in tider_agg.items()
                             if k[0] not in skip_maskiner}

            if tider_agg:
                # Radera gamla rader för berörda (maskin_id, timme) innan insert
                to_delete: dict = {}
                for e_maskin, _, timme_utc, _ in tider_agg:
                    to_delete.setdefault(e_maskin, set()).add(timme_utc)
                for del_maskin, timme_set in to_delete.items():
                    timme_list = sorted(timme_set)
                    for i in range(0, len(timme_list), 20):
                        chunk = ','.join(timme_list[i:i+20])
                        try:
                            requests.delete(
                                f"{SUPABASE_URL}/rest/v1/mom_tider"
                                f"?maskin_id=eq.{del_maskin}&timme=in.({chunk})",
                                headers=SUPABASE_HEADERS, timeout=60)
                        except Exception as e_del:
                            logger.warning(f"  Kunde inte städa mom_tider för {del_maskin}: {e_del}")

                mom_rows = [
                    {
                        'maskin_id': k[0],
                        'operator_id': k[1],
                        'timme': k[2],
                        'typ': k[3],
                        'minuter': round(v / 60),
                    }
                    for k, v in tider_agg.items()
                ]
                if upsert_data('mom_tider', mom_rows) == 0:  # plain INSERT — DELETE körs alltid precis innan; ON CONFLICT matchar ej COALESCE-index
                    fel.append('mom_tider')
                else:
                    logger.info(f"  mom_tider: {len(mom_rows)} timrader sparade")

        # MOM-genererade maskin_service-rader (en per Repair-event, dedup på mom_event_id).
        # Stanford-id (text) konverteras till maskiner.id (uuid) här. Saknas mappningen
        # skipp:as raden — fakt_avbrott-raden är redan källa-of-truth med text-id.
        if data.get('maskin_service'):
            maskin_uuid_map = _fetch_maskin_uuid_map()
            op_namn_map = {op['operator_id']: op['operator_namn'] for op in data.get('operatorer', [])}
            ms_rows = []
            for r in data['maskin_service']:
                stanford_id = r.pop('maskin_stanford_id', None)
                op_key = r.pop('operator_key', None)
                uuid_id = maskin_uuid_map.get(stanford_id)
                if not uuid_id:
                    logger.warning(f"  ⚠ maskin_service-rad skippas: ingen maskiner.id-mappning för Stanford-id={stanford_id} (mom_event_id={r.get('mom_event_id')})")
                    continue
                r['maskin_id'] = uuid_id
                if op_key:
                    r['utford_av'] = op_namn_map.get(f"{stanford_id}_{op_key}")
                ms_rows.append(r)

            if ms_rows:
                if upsert_data('maskin_service', ms_rows,
                               ['mom_event_id'],
                               on_conflict='ignore') == 0:
                    fel.append('maskin_service')

        # Maskinstatistik
        if data.get('maskin_statistik'):
            if upsert_data('fakt_maskin_statistik', [data['maskin_statistik']], ['maskin_id', 'filnamn']) == 0:
                fel.append('fakt_maskin_statistik')

        if fel:
            logger.error(f"  ✗ Misslyckades spara till: {', '.join(fel)}")
            return False

        return True
    except Exception as e:
        logger.error(f"  Fel vid sparande av MOM: {e}")
        return False

def _fetch_objekt_uuid_map() -> Dict[str, str]:
    """Hämta mapping vo_nummer → objekt.id (uuid) från objekt-tabellen."""
    url = f"{SUPABASE_URL}/rest/v1/objekt?select=id,vo_nummer&vo_nummer=not.is.null"
    headers = {**SUPABASE_HEADERS, 'Prefer': 'return=representation'}
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code != 200:
        return {}
    return {r['vo_nummer']: r['id'] for r in resp.json() if r.get('vo_nummer')}


def _fetch_maskin_uuid_map() -> Dict[str, str]:
    """Hämta mapping maskiner.maskin_id (Stanford-id, text) → maskiner.id (uuid)."""
    url = f"{SUPABASE_URL}/rest/v1/maskiner?select=id,maskin_id"
    resp = requests.get(url, headers=SUPABASE_HEADERS, timeout=30)
    if resp.status_code != 200:
        return {}
    return {r['maskin_id']: r['id'] for r in resp.json() if r.get('maskin_id')}


def make_objekt_nyckel(maskin_id: str, vo_nummer: str, obj_key: str) -> Optional[str]:
    """Stabil kompositnyckel per objekt för snapshot-dedup (oberoende av objekt-tabellen).
    Format: '<maskin_id>:<numeriskt vo_nummer>'  annars  '<maskin_id>:k<ObjectKey>'.
    Kompositen (maskin_id:) undviker krock mellan maskiner/objekt på korta vo-nummer.
    Identisk med import_hpr.make_objekt_nyckel — BÅDA skrivarna måste ge samma nyckel."""
    vo = (vo_nummer or '').strip()
    ok = (obj_key or '').strip()
    ident = vo if vo.isdigit() else (f"k{ok}" if ok else None)
    if not maskin_id or ident is None:
        return None
    return f"{maskin_id}:{ident}"


def _delete_existing_hpr_by_nyckel(objekt_nyckel: str) -> int:
    """Radera hpr_filer + hpr_stammar för ALLA filer med samma objekt_nyckel (stammar först,
    förlitar sig EJ på FK-cascade). Körs oavsett objekt_id — stoppar snapshot-ackumulering
    även för objekt som saknar rad i objekt-tabellen. Returnerar antal raderade filer."""
    q = quote(str(objekt_nyckel), safe='')
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/hpr_filer?select=id&objekt_nyckel=eq.{q}",
                        headers=SUPABASE_HEADERS, timeout=30)
    if resp.status_code != 200 or not resp.json():
        return 0
    fil_ids = [r['id'] for r in resp.json()]
    for fid in fil_ids:
        requests.delete(f"{SUPABASE_URL}/rest/v1/hpr_stammar?hpr_fil_id=eq.{fid}",
                        headers=SUPABASE_HEADERS, timeout=60)
    requests.delete(f"{SUPABASE_URL}/rest/v1/hpr_filer?objekt_nyckel=eq.{q}",
                    headers=SUPABASE_HEADERS, timeout=30)
    return len(fil_ids)


def _save_hpr_tables(data: Dict):
    """Spara HPR-data till hpr_filer och hpr_stammar tabellerna."""
    filnamn = data.get('filnamn', '')
    maskin_id = data.get('maskin', {}).get('maskin_id', '')
    stammar = data.get('stammar', [])
    if not stammar or not filnamn:
        return

    # Hämta objekt UUID-mapping
    objekt_map = _fetch_objekt_uuid_map()

    # Bestäm objekt_id (uuid) via vo_nummer från objekt-listan
    objekt_uuid = None
    for obj in data.get('objekt', []):
        vo = obj.get('vo_nummer', '')
        if vo and vo in objekt_map:
            objekt_uuid = objekt_map[vo]
            break

    # Beräkna stammar med koordinater
    stammar_med_koordinat = sum(1 for s in stammar if s.get('latitude') and s.get('longitude'))

    # Upsert hpr_filer
    fil_row = {
        'filnamn': filnamn,
        'stammar_count': len(stammar),
        'has_coordinates': stammar_med_koordinat > 0,
        'stammar_med_koordinat': stammar_med_koordinat,
    }
    if objekt_uuid:
        fil_row['objekt_id'] = objekt_uuid

    # Fil-datum från äldsta stam-tidpunkt
    earliest = None
    for s in stammar:
        t = s.get('tidpunkt')
        if t and (earliest is None or t < earliest):
            earliest = t
    if earliest:
        fil_row['fil_datum'] = earliest.isoformat() if hasattr(earliest, 'isoformat') else str(earliest)

    # Snapshot-dedup per objekt_nyckel (frikopplad från objekt-tabellen). Utan detta blir
    # varje kumulativt snapshot en ny rad (on_conflict=filnamn) -> ackumulering + dubbel-
    # räknade stammar. Ersätt BARA om nya snapshotet är >= största befintliga keyed-snapshot
    # (subset-säkert + ordningsoberoende — samma princip som MOM _keep). Legacy-rader med
    # objekt_nyckel NULL matchas EJ -> rörs ej här; de städas i lager c med delmängds-bevis.
    objekt_nyckel = None
    for obj in data.get('objekt', []):
        objekt_nyckel = make_objekt_nyckel(maskin_id, obj.get('vo_nummer', ''), obj.get('object_key', ''))
        if objekt_nyckel:
            break
    if objekt_nyckel:
        fil_row['objekt_nyckel'] = objekt_nyckel
        q = quote(str(objekt_nyckel), safe='')
        ex = requests.get(
            f"{SUPABASE_URL}/rest/v1/hpr_filer?select=stammar_count&objekt_nyckel=eq.{q}",
            headers=SUPABASE_HEADERS, timeout=30)
        existing_counts = [(r.get('stammar_count') or 0) for r in ex.json()] if ex.status_code == 200 else []
        existing_max = max(existing_counts) if existing_counts else 0
        if existing_counts and len(stammar) < existing_max:
            logger.info(f"  hpr_filer: hoppar {filnamn} — {len(stammar)} stammar < befintlig "
                        f"komplett snapshot ({existing_max}) för {objekt_nyckel} (ingen nedgradering)")
            return
        deleted = _delete_existing_hpr_by_nyckel(objekt_nyckel)
        if deleted:
            logger.info(f"  Ersätter: raderade {deleted} tidigare snapshot(s) för objekt {objekt_nyckel}")
    else:
        logger.warning(f"  {filnamn}: ingen objekt_nyckel kunde härledas — upsert per filnamn (kan ackumulera)")

    headers_repr = {**SUPABASE_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation'}
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/hpr_filer?on_conflict=filnamn",
        json=fil_row,
        headers=headers_repr,
        timeout=30
    )
    if resp.status_code not in [200, 201]:
        logger.warning(f"  hpr_filer upsert misslyckades: {resp.status_code} {resp.text}")
        return

    fil_data = resp.json()
    if isinstance(fil_data, list):
        fil_data = fil_data[0]
    hpr_fil_id = fil_data['id']

    # Insert hpr_stammar med ON CONFLICT DO NOTHING
    batch_size = 500
    for i in range(0, len(stammar), batch_size):
        batch = stammar[i:i + batch_size]
        rows = []
        for s in batch:
            row = {
                'hpr_fil_id': hpr_fil_id,
                'stam_nummer': s.get('hpr_stam_nummer'),
                'tradslag': s.get('hpr_tradslag_namn'),
            }
            if s.get('dbh_mm') is not None:
                row['dbh'] = s['dbh_mm']
            if s.get('latitude'):
                row['lat'] = s['latitude']
            if s.get('longitude'):
                row['lng'] = s['longitude']
            if s.get('hpr_antal_stockar'):
                row['antal_stockar'] = s['hpr_antal_stockar']
            if s.get('hpr_total_volym') is not None:
                row['total_volym'] = s['hpr_total_volym']
            row['bio_energy_adaption'] = s.get('hpr_bio_energy_adaption')
            row['sortiment'] = s.get('hpr_sortiment')
            rows.append(row)

        headers_ignore = {**SUPABASE_HEADERS, 'Prefer': 'resolution=ignore-duplicates'}
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/hpr_stammar?on_conflict=hpr_fil_id,stam_nummer",
            json=rows,
            headers=headers_ignore,
            timeout=60
        )
        if resp.status_code not in [200, 201]:
            logger.warning(f"  hpr_stammar insert batch {i} misslyckades: {resp.status_code} {resp.text}")

    logger.info(f"  hpr_filer + hpr_stammar: {len(stammar)} stammar sparade")


def save_hpr_to_supabase(data: Dict) -> bool:
    """Spara HPR-data till Supabase"""
    try:
        fel = []

        if data.get('maskin'):
            log_if_new_maskin(data['maskin'].get('maskin_id', ''), data['maskin'].get('maskin_typ', 'Okänd'))
            if upsert_data('dim_maskin', [data['maskin']], ['maskin_id']) == 0:
                fel.append('dim_maskin')

        if data.get('objekt'):
            # Gemensam skrivpolicy — tidigare skrevs ALLA kolumner över vid
            # varje kumulativ fil (inkl. None), vilket raderade manuella namn
            if upsert_dim_objekt(data['objekt']) == 0:
                fel.append('dim_objekt')

        if data.get('sortiment'):
            # Filtrera bort sortiment utan namn - behåll FPR-importerade namn
            sortiment_med_namn = [s for s in data['sortiment'] if s.get('namn')]
            sortiment_utan_namn = [s for s in data['sortiment'] if not s.get('namn')]
            if sortiment_med_namn:
                if upsert_data('dim_sortiment', sortiment_med_namn, ['sortiment_id']) == 0:
                    fel.append('dim_sortiment')
            if sortiment_utan_namn:
                # Bara insert om sortiment saknas, skriv inte över befintliga namn
                upsert_data('dim_sortiment', sortiment_utan_namn, ['sortiment_id'])

        # Pris-matris från ProductMatrixItem (en rad per lower-threshold-kombination)
        if data.get('sortiment_pris'):
            batch_size = 500
            for i in range(0, len(data['sortiment_pris']), batch_size):
                batch = data['sortiment_pris'][i:i+batch_size]
                upsert_data('dim_sortiment_pris', batch,
                            ['sortiment_id', 'langd_min_cm', 'dia_min_mm'])

        if data.get('tradslag'):
            if upsert_data('dim_tradslag', data['tradslag'], ['tradslag_id']) == 0:
                fel.append('dim_tradslag')

        # Stammar (batcha, ej kritiskt att stoppa vid fel)
        if data.get('stammar'):
            # Filtrera bort hpr_*-fält som inte finns i detalj_stam
            hpr_keys = {'hpr_stam_nummer', 'hpr_tradslag_namn', 'hpr_antal_stockar',
                        'hpr_total_volym', 'hpr_bio_energy_adaption', 'hpr_sortiment'}
            clean_stammar = [{k: v for k, v in s.items() if k not in hpr_keys} for s in data['stammar']]
            batch_size = 500
            for i in range(0, len(clean_stammar), batch_size):
                batch = clean_stammar[i:i+batch_size]
                upsert_data('detalj_stam', batch, ['maskin_id', 'stam_key'])

        # Körspår till detalj_gps_spar (batcha, ej kritiskt)
        if data.get('gps_spar'):
            batch_size = 500
            for i in range(0, len(data['gps_spar']), batch_size):
                batch = data['gps_spar'][i:i+batch_size]
                upsert_data('detalj_gps_spar', batch, ['tracking_key', 'filnamn'])

        # Stockar till detalj_stock (batcha, ej kritiskt)
        if data.get('stockar'):
            batch_size = 500
            for i in range(0, len(data['stockar']), batch_size):
                batch = data['stockar'][i:i+batch_size]
                # Composite-dedupe — HPR är kumulativa, filnamn ingår inte i logisk identitet
                upsert_data('detalj_stock', batch, ['maskin_id', 'stem_key', 'log_key'])

        # UPDATE objekt SET cert via PATCH (bara om cert finns)
        if data.get('objekt_cert_updates'):
            for objekt_id, cert in data['objekt_cert_updates']:
                try:
                    import urllib.parse
                    enc = urllib.parse.quote(str(objekt_id))
                    requests.patch(
                        f"{SUPABASE_URL}/rest/v1/objekt?dim_objekt_id=eq.{enc}",
                        headers={**SUPABASE_HEADERS, 'Prefer': 'return=minimal'},
                        json={'cert': cert}, timeout=10
                    )
                except Exception as e:
                    logger.warning(f"  Kunde inte uppdatera cert för {objekt_id}: {e}")

        # Sortiment-summering – KRITISK
        if data.get('sortiment_summering'):
            if upsert_data('fakt_sortiment', data['sortiment_summering'],
                          ['datum', 'maskin_id', 'objekt_id', 'sortiment_id']) == 0:
                fel.append('fakt_sortiment')

        # === HPR-filer och HPR-stammar ===
        if data.get('stammar'):
            _save_hpr_tables(data)

        if fel:
            logger.error(f"  ✗ Misslyckades spara till: {', '.join(fel)}")
            return False

        return True
    except Exception as e:
        logger.error(f"  Fel vid sparande av HPR: {e}")
        return False

def save_hqc_to_supabase(data: Dict) -> bool:
    """Spara HQC-data till Supabase"""
    try:
        fel = []

        # === Innehålls-grind: hoppa över om samma mätning redan importerats
        #     under ett ANNAT filnamn (samma innehalls_hash). Fil-checken på
        #     filnamn (i process_file) fångar samma-filnamn-omkörning. ===
        kal = (data.get('kalibrering') or [{}])[0]
        h = kal.get('innehalls_hash')
        maskin_id = kal.get('maskin_id')
        filnamn = data.get('filnamn')
        if h and maskin_id:
            url = (
                f"{SUPABASE_URL}/rest/v1/fakt_kalibrering"
                f"?maskin_id=eq.{quote(str(maskin_id), safe='')}"
                f"&innehalls_hash=eq.{h}&select=filnamn&limit=1"
            )
            try:
                r = requests.get(url, headers=SUPABASE_HEADERS, timeout=30)
                if r.status_code == 200 and r.json():
                    befintlig = r.json()[0].get('filnamn')
                    if befintlig != filnamn:
                        logger.info(
                            f"  ↷ Innehåll redan importerat som '{befintlig}' "
                            f"— hoppar över dubblett"
                        )
                        return True  # filen hanteras (markeras/flyttas), inga nya rader
            except Exception as e:
                logger.warning(f"  ⚠ Kunde inte kontrollera innehålls-hash: {e}")

        # Kontroll-raden skapas BARA om filen har kontrollstockar. Tom fil
        # (0 stockar) → ingen kontroll-rad/hash — men historiken nedan körs ändå
        # (36 av 67 kalibreringshändelser kommer från 0-stock-filer).
        if data.get('kalibrering') and data.get('kontroll_stockar'):
            if upsert_data(
                'fakt_kalibrering',
                data['kalibrering'],
                unique_columns=['filnamn']
            ) == 0:
                fel.append('fakt_kalibrering')
        elif not data.get('kontroll_stockar'):
            logger.info("  ↷ Tom fil (0 kontrollstockar) — ingen kontroll-rad (behåller ev. kalibreringshistorik)")

        if data.get('kalibrering_historik'):
            if upsert_data(
                'fakt_kalibrering_historik',
                data['kalibrering_historik'],
                unique_columns=['datum', 'maskin_id', 'tradslag', 'typ']
            ) == 0:
                fel.append('fakt_kalibrering_historik')

        if data.get('kontroll_stockar'):
            if upsert_data(
                'detalj_kontroll_stock',
                data['kontroll_stockar'],
                unique_columns=['filnamn', 'stam_nummer', 'stock_nummer']
            ) == 0:
                fel.append('detalj_kontroll_stock')

        if data.get('kontroll_stammar'):
            if upsert_data(
                'detalj_kontroll_stam',
                data['kontroll_stammar'],
                unique_columns=['filnamn', 'stam_nummer']
            ) == 0:
                fel.append('detalj_kontroll_stam')

        # Matpunkter behöver detalj_kontroll_stock.id (FK), som genereras
        # av databasen vid INSERT. Slå upp id per (stam_nummer, stock_nummer)
        # via REST efter stock-upserten.
        if data.get('kontroll_matpunkter'):
            import urllib.parse
            filnamn = data.get('filnamn')
            stock_id_lookup = {}
            if filnamn:
                enc = urllib.parse.quote(filnamn, safe='')
                url = (
                    f"{SUPABASE_URL}/rest/v1/detalj_kontroll_stock"
                    f"?filnamn=eq.{enc}"
                    f"&select=id,stam_nummer,stock_nummer"
                )
                try:
                    resp = requests.get(url, headers=SUPABASE_HEADERS, timeout=30)
                    if resp.status_code == 200:
                        for row in resp.json():
                            stock_id_lookup[(row['stam_nummer'], row['stock_nummer'])] = row['id']
                    else:
                        logger.warning(
                            f"  ⚠ Kunde inte slå upp detalj_kontroll_stock.id: "
                            f"{resp.status_code} {resp.text[:200]}"
                        )
                except Exception as e:
                    logger.warning(f"  ⚠ Fel vid stock-id-lookup: {e}")

            matpunkter_med_id = []
            for mp in data['kontroll_matpunkter']:
                stock_id = stock_id_lookup.get((mp['stam_nummer'], mp['stock_nummer']))
                if stock_id is None:
                    continue
                matpunkter_med_id.append({
                    'detalj_kontroll_stock_id': stock_id,
                    'position_cm': mp['position_cm'],
                    'diameter_maskin_mm': mp['diameter_maskin_mm'],
                    'diameter_operator_mm': mp['diameter_operator_mm'],
                    'klave_first_mm': mp['klave_first_mm'],
                    'klave_second_mm': mp['klave_second_mm'],
                })

            saknade = len(data['kontroll_matpunkter']) - len(matpunkter_med_id)
            if saknade > 0:
                logger.warning(
                    f"  ⚠ {saknade} matpunkter saknade detalj_kontroll_stock_id, ej sparade"
                )

            if matpunkter_med_id:
                if upsert_data(
                    'detalj_kontroll_stock_matpunkt',
                    matpunkter_med_id,
                    unique_columns=['detalj_kontroll_stock_id', 'position_cm']
                ) == 0:
                    fel.append('detalj_kontroll_stock_matpunkt')

        if fel:
            logger.error(f"  ✗ Misslyckades spara till: {', '.join(fel)}")
            return False

        return True
    except Exception as e:
        logger.error(f"  Fel vid sparande av HQC: {e}")
        return False

def save_fpr_to_supabase(data: Dict) -> bool:
    """Spara FPR-data till Supabase"""
    try:
        fel = []

        if data.get('maskin'):
            log_if_new_maskin(data['maskin'].get('maskin_id', ''), data['maskin'].get('maskin_typ', 'Okänd'))
            if upsert_data('dim_maskin', [data['maskin']], ['maskin_id']) == 0:
                fel.append('dim_maskin')

        if data.get('operatorer'):
            if upsert_data('dim_operator', data['operatorer'], ['operator_id']) == 0:
                fel.append('dim_operator')

        if data.get('objekt'):
            # Gemensam skrivpolicy — fyller luckor, skriver aldrig över
            # mänskligt underhållna fält
            if upsert_dim_objekt(data['objekt']) == 0:
                fel.append('dim_objekt')

        if data.get('destinationer'):
            if upsert_data('dim_destination', data['destinationer'], ['destination_id']) == 0:
                fel.append('dim_destination')

        if data.get('sortiment'):
            sortiment_med_namn = [s for s in data['sortiment'] if s.get('namn')]
            if sortiment_med_namn:
                upsert_data('dim_sortiment', sortiment_med_namn, ['sortiment_id'])

        # Lass – KRITISK
        if data.get('lass'):
            lass_data = []
            lass_sortiment_data = []
            for l in data['lass']:
                sortiment_list = l.get('sortiment', [])
                lass_copy = {k: v for k, v in l.items() if k != 'sortiment'}
                # Hoppa lass utan objekt_id
                if not lass_copy.get('objekt_id'):
                    continue
                lass_data.append(lass_copy)
                # Bygg sortiment per lass
                for s in sortiment_list:
                    if s.get('sortiment_id') and (s.get('volym_m3sob', 0) > 0 or s.get('volym_m3sub', 0) > 0):
                        lass_sortiment_data.append({
                            'maskin_id': lass_copy['maskin_id'],
                            'objekt_id': lass_copy['objekt_id'],
                            'datum': lass_copy['datum'],
                            'lass_nummer': lass_copy['lass_nummer'],
                            'sortiment_id': s['sortiment_id'],
                            'sortiment_namn': s.get('sortiment_namn', ''),
                            'volym_m3sob': s.get('volym_m3sob', 0),
                            'volym_m3sub': s.get('volym_m3sub', 0),
                            'filnamn': lass_copy['filnamn']
                        })
            if lass_data:
                if upsert_data('fakt_lass', lass_data, ['maskin_id', 'objekt_id', 'lass_nummer', 'datum']) == 0:
                    fel.append('fakt_lass')
            if lass_sortiment_data:
                upsert_data('fakt_lass_sortiment', lass_sortiment_data, 
                           ['maskin_id', 'objekt_id', 'datum', 'lass_nummer', 'sortiment_id'])

        if data.get('skotning_status'):
            upsert_data('fakt_skotning_status', data['skotning_status'],
                       ['maskin_id', 'objekt_id', 'sortiment_id', 'start_tid'])

        if fel:
            logger.error(f"  ✗ Misslyckades spara till: {', '.join(fel)}")
            return False

        return True
    except Exception as e:
        logger.error(f"  Fel vid sparande av FPR: {e}")
        return False

# ============================================================
# FILHANTERING
# ============================================================

def move_to_behandlade(filepath: str, maskin_id: str, filtyp: str) -> bool:
    """Flytta fil till Behandlade/MaskinID/Filtyp/. Returnerar True om lyckad.
    3 försök med exponentiell backoff (3s, 9s) för OneDrive-lås."""
    try:
        maskin_mapp = os.path.join(BEHANDLADE, maskin_id)
        filtyp_mapp = os.path.join(maskin_mapp, filtyp)
        os.makedirs(filtyp_mapp, exist_ok=True)

        filnamn = os.path.basename(filepath)
        dest_path = os.path.join(filtyp_mapp, filnamn)

        if os.path.exists(dest_path):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base, ext = os.path.splitext(filnamn)
            dest_path = os.path.join(filtyp_mapp, f"{base}_{timestamp}{ext}")

        for attempt in range(1, 4):
            try:
                shutil.move(filepath, dest_path)
                logger.info(f"  ✓ Flyttad till {os.path.relpath(dest_path, ONEDRIVE_BASE)}")
                return True
            except (PermissionError, OSError) as e:
                if attempt < 3:
                    vantetid = 3 ** attempt  # 3s, 9s
                    logger.warning(f"  ⚠ Flytt misslyckades (försök {attempt}/3), väntar {vantetid}s: {e}")
                    time.sleep(vantetid)
                else:
                    logger.error(f"  ✗ Flytt misslyckades slutgiltigt efter 3 försök: {e}")
    except Exception as e:
        logger.error(f"  Fel vid flytt av fil: {e}")
    return False

def log_if_new_maskin(maskin_id: str, maskin_typ: str):
    """Loggar om maskinen är ny i dim_maskin."""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/dim_maskin?maskin_id=eq.{maskin_id}&select=maskin_id",
            headers=SUPABASE_HEADERS, timeout=10
        )
        if response.status_code == 200 and len(response.json()) == 0:
            logger.info(f"  ✓ Ny maskin registrerad automatiskt: {maskin_id} ({maskin_typ})")
    except Exception:
        pass

def is_file_already_imported(filnamn: str) -> bool:
    """Kolla om fil redan är importerad med status OK. FEL-filer tillåts omimporteras."""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/meta_importerade_filer?filnamn=eq.{filnamn}&status=eq.OK&select=id",
            headers=SUPABASE_HEADERS,
            timeout=30
        )
        if response.status_code == 200:
            return len(response.json()) > 0
        return False
    except:
        return False

def get_import_time(filnamn: str) -> Optional[float]:
    """Hämta importerad_tid som UNIX timestamp för en fil. Returnerar None om ej hittad."""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/meta_importerade_filer?filnamn=eq.{filnamn}&status=eq.OK&select=importerad_tid",
            headers=SUPABASE_HEADERS,
            timeout=30
        )
        if response.status_code == 200:
            rows = response.json()
            if rows and rows[0].get('importerad_tid'):
                from datetime import timezone
                dt = datetime.fromisoformat(rows[0]['importerad_tid'].replace('Z', '+00:00'))
                return dt.timestamp()
        return None
    except:
        return None

def delete_meta_entry(filnamn: str):
    """Ta bort alla meta-poster (OK och FEL) för en fil."""
    try:
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/meta_importerade_filer?filnamn=eq.{filnamn}",
            headers=SUPABASE_HEADERS,
            timeout=30
        )
    except:
        pass

def mark_file_imported(filnamn: str, filtyp: str, maskin_id: str, status: str = 'OK', felmeddelande: str = None):
    """Markera fil som importerad. Tar bort gamla FEL-rader vid omimport."""
    try:
        # Ta bort alla gamla rader (OK + FEL) för denna fil så vi inte får dubletter
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/meta_importerade_filer?filnamn=eq.{filnamn}",
            headers=SUPABASE_HEADERS,
            timeout=30
        )

        data = {
            'filnamn': filnamn,
            'filtyp': filtyp,
            'maskin_id': maskin_id,
            'status': status
        }
        if felmeddelande:
            data['felmeddelande'] = felmeddelande

        requests.post(
            f"{SUPABASE_URL}/rest/v1/meta_importerade_filer",
            json=data,
            headers=SUPABASE_HEADERS,
            timeout=30
        )
    except Exception as e:
        logger.error(f"  Kunde inte logga import: {e}")

# ============================================================
# PROCESSERA FIL
# ============================================================

def process_file(filepath: str) -> bool:
    """Processera en fil baserat på filtyp"""
    filnamn = os.path.basename(filepath)
    ext = os.path.splitext(filnamn)[1].lower()
    
    logger.info(f"\n{'='*50}")
    logger.info(f"Processar: {filnamn}")
    logger.info(f"{'='*50}")
    
    # Startup-scan: om filen är markerad OK i meta men saknas i Behandlade har
    # flytten misslyckats (t.ex. OneDrive-lås). Rensa meta så att importen körs om.
    if is_file_already_imported(filnamn):
        maskin_id_i_namn = None
        m_maskin = re.search(r'_((?:PONS|R|A)\d+)_', filnamn)
        if m_maskin:
            maskin_id_i_namn = m_maskin.group(1)
        if maskin_id_i_namn:
            for sub in ('MOM', 'mom', 'HPR', 'hpr', 'HQC', 'hqc', 'FPR', 'fpr'):
                dest_kand = os.path.join(BEHANDLADE, maskin_id_i_namn, sub, filnamn)
                if os.path.exists(dest_kand):
                    break
            else:
                logger.warning(
                    f"  ⚠ {filnamn}: meta=OK men saknas i Behandlade"
                    f" — trolig flytt-miss. Rensar meta och re-importerar.")
                delete_meta_entry(filnamn)

    # Kolla om redan importerad
    if is_file_already_imported(filnamn):
        # Kumulativa filer (MOM/FPR) kan ha uppdaterats sedan import.
        # Jämför filens mtime med importerad_tid — omimportera om nyare.
        if ext in ('.mom', '.fpr'):
            try:
                file_mtime = os.path.getmtime(filepath)
                import_time = get_import_time(filnamn)
                if import_time and file_mtime > import_time + 60:  # 60s marginal
                    logger.info(f"  Fil uppdaterad sedan import — omimporterar")
                    delete_meta_entry(filnamn)
                else:
                    logger.info(f"  Redan importerad, hoppar över")
                    return False
            except:
                logger.info(f"  Redan importerad, hoppar över")
                return False
        else:
            logger.info(f"  Redan importerad, hoppar över")
            return False

    # Vänta lite så filen hinner skrivas klart
    time.sleep(1)
    
    try:
        if ext == '.mom':
            data = parse_mom_file(filepath)
            success = save_mom_to_supabase(data)
        elif ext == '.hpr':
            data = parse_hpr_file(filepath)
            success = save_hpr_to_supabase(data)
        elif ext == '.hqc':
            data = parse_hqc_file(filepath)
            success = save_hqc_to_supabase(data)
        elif ext == '.fpr':
            data = parse_fpr_file(filepath)
            success = save_fpr_to_supabase(data)
        else:
            logger.warning(f"  Okänd filtyp: {ext}")
            return False
        
        if success:
            maskin_id = data.get('maskin', {}).get('maskin_id', 'Okand')
            filtyp = data.get('filtyp', ext[1:].upper())

            moved = move_to_behandlade(filepath, maskin_id, filtyp)
            if moved:
                mark_file_imported(filnamn, filtyp, maskin_id)
                logger.info(f"  ✓ KLAR!")
            else:
                mark_file_imported(filnamn, filtyp, maskin_id, 'FEL',
                                   'Fil sparad till DB men flytt till Behandlade misslyckades')
                logger.error(f"  ✗ Sparad till DB men kunde ej flytta — markerad FEL för omimport")
            return moved
        else:
            mark_file_imported(filnamn, ext[1:].upper(), '', 'FEL', 'Kunde inte spara till databas')
            return False
            
    except Exception as e:
        logger.error(f"  ✗ FEL: {e}")
        mark_file_imported(filnamn, ext[1:].upper(), '', 'FEL', str(e))
        return False

# ============================================================
# FILÖVERVAKNING (WATCHDOG)
# ============================================================

class FileHandler(FileSystemEventHandler):
    """Hanterar nya filer i Inkommande-mappen.
    Lyssnar på on_created, on_modified och on_moved — OneDrive-sync triggar
    inte alltid on_created vid SMB-style synk, så on_modified+on_moved är
    skyddsnät. Dedupering sker via self.processed_files."""

    def __init__(self):
        self.processed_files = set()

    def on_created(self, event):
        self._dispatch(event, 'created')

    def on_modified(self, event):
        self._dispatch(event, 'modified')

    def on_moved(self, event):
        # on_moved har dest_path (var filen hamnade), inte src_path
        if event.is_directory:
            return
        self._process(event.dest_path, 'moved')

    def _dispatch(self, event, event_type: str):
        if event.is_directory:
            return
        self._process(event.src_path, event_type)

    def _process(self, filepath: str, event_type: str):
        ext = os.path.splitext(filepath)[1].lower()

        # Endast Stanford2010-filer
        if ext not in ['.mom', '.hpr', '.hqc', '.fpr']:
            return

        # Undvik dubbel-processing
        if filepath in self.processed_files:
            return

        self.processed_files.add(filepath)

        logger.info(f"Watchdog [{event_type}]: {os.path.basename(filepath)}")

        # Vänta så filen hinner kopieras klart
        time.sleep(2)

        # Processa filen
        process_file(filepath)

        # Rensa processed_files efter ett tag
        if len(self.processed_files) > 100:
            self.processed_files.clear()

def start_watching():
    """Starta övervakning av Inkommande-mappen"""
    logger.info(f"\n{'='*60}")
    logger.info("SKOGSMASKIN IMPORT - ÖVERVAKNING STARTAD")
    logger.info(f"{'='*60}")
    logger.info(f"Övervakar: {INKOMMANDE}")
    logger.info(f"Behandlade: {BEHANDLADE}")
    logger.info("Tryck Ctrl+C för att avsluta")
    logger.info(f"{'='*60}\n")
    
    event_handler = FileHandler()
    observer = Observer()
    observer.schedule(event_handler, INKOMMANDE, recursive=False)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        logger.info("\nÖvervakning avslutad.")
    
    observer.join()

# ============================================================
# HUVUDPROGRAM
# ============================================================

def process_existing_files():
    """Processa alla befintliga filer i Inkommande"""
    logger.info(f"\nLetar efter befintliga filer i {INKOMMANDE}...")
    
    files = []
    for ext in ['*.mom', '*.hpr', '*.hqc', '*.fpr']:
        files.extend(Path(INKOMMANDE).glob(ext))
    
    if not files:
        logger.info("Inga filer hittades.")
        return
    
    logger.info(f"Hittade {len(files)} filer")
    
    processed = 0
    errors = 0
    
    for filepath in sorted(files):
        if process_file(str(filepath)):
            processed += 1
        else:
            errors += 1
    
    logger.info(f"\n{'='*50}")
    logger.info(f"SAMMANFATTNING")
    logger.info(f"{'='*50}")
    logger.info(f"Processade: {processed}")
    logger.info(f"Fel/hoppade: {errors}")
    logger.info(f"{'='*50}")

def cleanup_avbrott_duplicates():
    """Rensa dubletter i fakt_avbrott och skapa UNIQUE constraint"""
    logger.info("Rensar dubletter i fakt_avbrott och skapar UNIQUE constraint...")
    cleanup_sql = """
    DELETE FROM fakt_avbrott a
    USING fakt_avbrott b
    WHERE a.id > b.id
      AND a.maskin_id = b.maskin_id
      AND a.datum = b.datum
      AND COALESCE(a.kategori_kod, '') = COALESCE(b.kategori_kod, '')
      AND COALESCE(a.klockslag::text, '') = COALESCE(b.klockslag::text, '');
    """
    constraint_sql = """
    ALTER TABLE fakt_avbrott
    ADD CONSTRAINT unique_avbrott
    UNIQUE (maskin_id, datum, klockslag, kategori_kod);
    """
    full_sql = cleanup_sql + constraint_sql
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
            json={"query": full_sql},
            headers=SUPABASE_HEADERS,
            timeout=30
        )
        if resp.status_code in [200, 204]:
            logger.info("  Dubletter rensade och UNIQUE constraint skapad.")
        else:
            logger.warning(f"  Kunde inte köra via RPC: {resp.status_code}")
            logger.info("  Kör följande SQL manuellt i Supabase SQL Editor:")
            logger.info(cleanup_sql.strip())
            logger.info(constraint_sql.strip())
    except Exception as e:
        logger.warning(f"  Kunde inte rensa dubletter: {e}")

def main():
    """Huvudprogram"""
    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║         SKOGSMASKIN IMPORT v1.0                           ║
    ║         Stanford2010 → Supabase                           ║
    ╠═══════════════════════════════════════════════════════════╣
    ║  Stödjer: MOM, HPR, HQC, FPR                             ║
    ║  Maskiner: Ponsse, Rottne                                 ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    
    logger.info(f"=== START skogsmaskin_import | git={_git_commit_short()} "
                f"| script={os.path.abspath(__file__)} | py={sys.version.split()[0]} ===")

    # Skapa mappar om de inte finns
    os.makedirs(INKOMMANDE, exist_ok=True)
    os.makedirs(BEHANDLADE, exist_ok=True)
    
    # Anslut till Supabase
    if not init_supabase():
        input("\nTryck Enter för att avsluta...")
        return

    # Rensa eventuella dubletter i fakt_avbrott
    cleanup_avbrott_duplicates()

    # Processa befintliga filer först
    process_existing_files()
    
    # Starta övervakning
    print("\n" + "="*50)
    print("Vill du starta automatisk övervakning?")
    print("(Nya filer i Inkommande processas automatiskt)")
    print("="*50)
    
    svar = input("\nStarta övervakning? (j/n): ").strip().lower()
    
    if svar == 'j':
        start_watching()
    else:
        print("\nAvslutar. Kör programmet igen för att processa nya filer.")

if __name__ == "__main__":
    main()
