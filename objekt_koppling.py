"""Koppla en HPR-fil till ett objekt när filens ordernummer inte matchar objekt.vo_nummer.

DELAS av båda HPR-skrivarna (skogsmaskin_import_version_6._save_hpr_tables och import_hpr.upload_hpr) —
en regel, en plats. Inga egna nätverksanrop gör sig själva: anroparen skickar in tabellerna (listor av
rader) och en funktion som skriver ett alias, så allt går att testa utan nät (scripts/test_objekt_koppling.py).

REGELN (i den här ordningen, första träff gäller):
  1. NUMMER:  filens nummer (kontraktsnr, annars 'k<ObjectKey>') == objekt.vo_nummer         → som förut, oförändrat.
  2. ALIAS:   numret finns som extra nummer på ett objekt (tabellen objekt_alt_nummer)       → det objektet.
  3. NAMN:    filens objektnamn mot objekt.namn — först EXAKT, sedan utan skillnad i mellanslag/versaler.
              Exakt EN träff → koppla och spara numret som alias (så nästa fil med samma nummer går på 2).
              Noll eller flera träffar → koppla INTE (hellre okopplad och synlig än fel kopplad).
  4. Annars: okopplad. Importen skriver filen som förut (nyckeln oförändrad) och loggar varför; filen syns i listan
              "Filer utan objekt" i /redigering (läst vid visning: nyckelns nummer finns varken som vo_nummer eller alias).

Numret ändrar ALDRIG nycklarna filen skrivs under (objekt_nyckel, detalj_stam.objekt_id, fakt_*.objekt_id) — det gör
att redan importerad data och nya filer fortsätter landa på samma rader (inga dubbelräknade dagar). Kopplingen
ligger i aliaset; de som läser per objekt (planeringsvyns högar och "kvar att köra") tar med objektets alias.
"""
import re
from typing import Callable, Dict, List, Optional, Tuple

# Samma suffixmönster som skogsmaskin_import_version_6._FILNAMN_SUFFIX (och namnhärledningen där). Hålls identiska av
# scripts/test_objekt_koppling.py, som kör båda mot samma filnamn.
_FILNAMN_SUFFIX = [
    re.compile(r'_20\d{6}_\d{6}$'),
    re.compile(r'_[A-Za-z0-9]+_20\d{12}$'),
    re.compile(r'[-_]\d{6}-\d{6}$'),
    re.compile(r'\s+\d{4}-\d{2}-\d{2}(\s+\d{4})?$'),
]


def _ar_tidsstampel(namn) -> bool:
    if namn is None:
        return True
    s = str(namn).strip()
    return not s or re.fullmatch(r'[\d\s\-_:.]+', s) is not None


def namn_ur_filnamn(filnamn: str, object_name_xml: str = '') -> Optional[str]:
    """Objektnamnet som maskinen lägger i FILNAMNET (samma härledning som harled_objektnamn i huvudimporten):
    filnamnet utan ändelse och suffix; är det bara en tidsstämpel används XML:ens ObjectName; annars None."""
    base = (filnamn or '').replace('\\', '/').rsplit('/', 1)[-1].rsplit('.', 1)[0]
    andrat = True
    while andrat:
        andrat = False
        for pat in _FILNAMN_SUFFIX:
            nytt = pat.sub('', base)
            if nytt != base:
                base = nytt
                andrat = True
    namn = ' '.join(base.replace('_', ' ').split())
    if not _ar_tidsstampel(namn):
        return namn
    if not _ar_tidsstampel(object_name_xml):
        return str(object_name_xml).strip()
    return None


def nummer_ident(vo_nummer, obj_key) -> Optional[str]:
    """Identiteten i objekt_nyckel efter ':' — kontraktsnumret om det är numeriskt, annars 'k<ObjectKey>'.
    (Samma som make_objekt_nyckel; vo-remap görs av anroparen före.)"""
    vo = (vo_nummer or '').strip()
    if vo.isdigit():
        return vo
    ok = (obj_key or '').strip()
    return f"k{ok}" if ok else None


def namn_exakt(s) -> str:
    return (s or '').strip()


def namn_lika(s) -> str:
    """Utan skillnad i mellanslag och versaler — och ingenting annat (skiljetecken räknas)."""
    return ''.join((s or '').split()).casefold()


def hitta_objekt_via_namn(namn: Optional[str], objekt_rader: List[Dict]) -> Tuple[Optional[Dict], str]:
    """(objektrad, orsak). Exakt EN träff → raden. Noll eller flera → (None, orsak).
    Först exakt namn; ger det flera träffar stannar det där (faller inte vidare till den lösare matchningen)."""
    n = namn_exakt(namn)
    if not n:
        return None, 'filen har inget objektnamn'
    exakta = [o for o in objekt_rader if namn_exakt(o.get('namn')) == n]
    if len(exakta) == 1:
        return exakta[0], 'exakt namn'
    if len(exakta) > 1:
        return None, f'{len(exakta)} objekt heter exakt "{n}"'
    nl = namn_lika(n)
    lika = [o for o in objekt_rader if namn_lika(o.get('namn')) == nl]
    if len(lika) == 1:
        return lika[0], 'namn utan skillnad i mellanslag/versaler'
    if len(lika) > 1:
        return None, f'{len(lika)} objekt har samma namn utan skillnad i mellanslag/versaler'
    return None, f'inget objekt heter "{n}"'


def hitta_alias(alias_rader: List[Dict], ident: Optional[str], maskin_id: Optional[str]) -> Optional[str]:
    """objekt.id (uuid) som numret är extra nummer på. Kontraktsnummer gäller globalt (maskin_id NULL); k-nummer
    bara för just den maskinen."""
    if not ident:
        return None
    for a in alias_rader:
        if a.get('nummer') != ident:
            continue
        if a.get('maskin_id') in (None, '') or a.get('maskin_id') == maskin_id:
            return a.get('objekt_id')
    return None


def koppla_hpr_objekt(
    *,
    vo_nummer,
    obj_key,
    maskin_id: str,
    namn: Optional[str],
    filnamn: str,
    objekt_rader: List[Dict],
    alias_rader: List[Dict],
    spara_alias: Callable[[str, str, Optional[str], str, str], bool],
) -> Dict:
    """Se modulens regel. Returnerar {'objekt_id': uuid|None, 'via': 'nummer'|'alias'|'namn'|None, 'orsak': str}.
    spara_alias(objekt_id, nummer, maskin_id_eller_None, kalla, filnamn) → True om sparat (anropas BARA vid namnträff)."""
    ident = nummer_ident(vo_nummer, obj_key)
    if not ident:
        return {'objekt_id': None, 'via': None, 'orsak': 'filen har varken kontraktsnummer eller ObjectKey'}

    if ident.isdigit():
        for o in objekt_rader:
            if (o.get('vo_nummer') or '').strip() == ident:
                return {'objekt_id': o.get('id'), 'via': 'nummer', 'orsak': f'vo_nummer {ident}'}

    alias_maskin = None if ident.isdigit() else maskin_id
    via_alias = hitta_alias(alias_rader, ident, maskin_id)
    if via_alias:
        return {'objekt_id': via_alias, 'via': 'alias', 'orsak': f'extra nummer {ident}'}

    traff, orsak = hitta_objekt_via_namn(namn, objekt_rader)
    if traff is None:
        return {'objekt_id': None, 'via': None, 'orsak': orsak}
    sparat = spara_alias(traff['id'], ident, alias_maskin, 'namn', filnamn)
    return {
        'objekt_id': traff['id'], 'via': 'namn',
        'orsak': f'{orsak}; nummer {ident} {"sparat" if sparat else "kunde INTE sparas"} som extra nummer',
    }


# ── Supabase-REST (tunn, injicerbar) ─────────────────────────────────────────────────────────────

def las_objekt(requests_mod, url: str, headers: dict) -> List[Dict]:
    """objekt: id, namn, vo_nummer. Tom lista vid fel (anroparen loggar) — kopplingen är då bara 'ingen träff'."""
    r = requests_mod.get(f"{url}/rest/v1/objekt", params={'select': 'id,namn,vo_nummer'}, headers=headers, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"kunde inte läsa objekt: {r.status_code}")
    return list(r.json() or [])


def las_alias(requests_mod, url: str, headers: dict) -> List[Dict]:
    """objekt_alt_nummer. Saknas tabellen (migrationen ej körd) → tom lista, ingen krasch."""
    r = requests_mod.get(f"{url}/rest/v1/objekt_alt_nummer", params={'select': 'nummer,maskin_id,objekt_id'},
                         headers=headers, timeout=30)
    if r.status_code != 200:
        return []
    return list(r.json() or [])


def skriv_alias(requests_mod, url: str, headers: dict, objekt_id: str, nummer: str,
                maskin_id: Optional[str], kalla: str, filnamn: str) -> bool:
    """Spara numret som extra nummer. Finns det redan (unik: nummer + maskin) är det inte ett fel."""
    rad = {'objekt_id': objekt_id, 'nummer': nummer, 'kalla': kalla, 'filnamn': filnamn}
    if maskin_id:
        rad['maskin_id'] = maskin_id
    r = requests_mod.post(f"{url}/rest/v1/objekt_alt_nummer", json=rad,
                          headers={**headers, 'Prefer': 'return=minimal'}, timeout=30)
    return r.status_code in (200, 201, 204, 409)


def koppla_fil(requests_mod, url: str, headers: dict, logger, *, filnamn: str, maskin_id: str,
               objekt_defs: List[Dict]) -> Optional[str]:
    """Hela vägen för EN HPR-fil: läs objekt + alias, prova varje objekt i filen, logga beslutet, returnera
    objekt.id (uuid) eller None. objekt_defs: [{'vo_nummer','object_key','object_name'}]. Kastar aldrig —
    ett fel här får inte stoppa importen (filen skrivs då som förut, okopplad)."""
    try:
        objekt_rader = las_objekt(requests_mod, url, headers)
        alias_rader = las_alias(requests_mod, url, headers)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"  Okopplad: {filnamn} — kunde inte läsa objekt/alias ({e})")
        return None
    sista_orsak = 'filen har inga objekt'
    for od in objekt_defs:
        try:
            res = koppla_hpr_objekt(
                vo_nummer=od.get('vo_nummer'), obj_key=od.get('object_key'), maskin_id=maskin_id,
                namn=od.get('object_name') or namn_ur_filnamn(filnamn),
                filnamn=filnamn, objekt_rader=objekt_rader, alias_rader=alias_rader,
                spara_alias=lambda oid, nr, mid, kalla, fn: skriv_alias(requests_mod, url, headers, oid, nr, mid, kalla, fn),
            )
        except Exception as e:  # noqa: BLE001
            logger.warning(f"  Okopplad: {filnamn} — koppling misslyckades ({e})")
            return None
        if res['objekt_id']:
            if res['via'] != 'nummer':
                logger.info(f"  Kopplade {filnamn} → objekt {res['objekt_id']} via {res['via']}: {res['orsak']}")
            return res['objekt_id']
        sista_orsak = res['orsak']
    logger.warning(f"  Okopplad: {filnamn} — {sista_orsak}. Filen syns i listan 'Filer utan objekt' (/redigering).")
    return None
