"""
HPR → arbetsdag-syntes.

Kör när MOM-filen för en dag saknas men HPR-filer finns. Skapar arbetsdag +
arbetsdag_objekt-rader baserat på HPR-tidsstämplar. Operator gissas från
föregående dags fakt_skift om inte specificerad.

Användning:
    py hpr_synth.py --maskin R64428 --datum 2026-04-25 \
        --operator R64428_9 --objekt 11124774 \
        [--start 08:08] [--slut 11:46]

Default: läser earliest/latest CoordinateDate ur HPR-filerna för datumet och
beräknar inloggning/utloggning.
"""

import argparse
import os
import re
import sys
from datetime import datetime, timedelta
from glob import glob
from xml.etree import ElementTree as ET

try:
    import requests
except ImportError:
    print("Saknade bibliotek. Kör: py -m pip install requests")
    sys.exit(1)


# Läs Supabase-credentials från .env.local (samma som skogsmaskin_import_v6)
def _load_env_local():
    env = {}
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local")
    if not os.path.exists(p):
        return env
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


_env = _load_env_local()
SUPABASE_URL = _env.get("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = _env.get("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("FEL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY krävs i .env.local")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

ONEDRIVE_BASE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer"
HPR_NS = "{urn:skogforsk:stanford2010}"


def hpr_filer(maskin: str, datum: str) -> list[str]:
    """Hitta HPR-filer för datum + maskin."""
    mapp = os.path.join(ONEDRIVE_BASE, "Behandlade", maskin, "HPR")
    if not os.path.isdir(mapp):
        return []
    return sorted(glob(os.path.join(mapp, f"*{datum}*.hpr")))


def coordinate_dates(hpr_path: str, datum: str) -> list[datetime]:
    """Plocka ut CoordinateDate-värden för datumet ur HPR-filen.

    HPR är stora — använd iterparse för minneshushållning.
    """
    träffar: list[datetime] = []
    target = datum  # "2026-04-25"
    try:
        for _, elem in ET.iterparse(hpr_path, events=("end",)):
            if elem.tag.endswith("}CoordinateDate") and elem.text and elem.text.startswith(target):
                try:
                    träffar.append(datetime.fromisoformat(elem.text))
                except Exception:
                    pass
            # Frigör minne — vi kan inte clear()a allt utan att bryta XML, men
            # CoordinateDate-element är safe to clear after read
            if elem.tag.endswith("}TrackCoordinates"):
                elem.clear()
    except ET.ParseError as e:
        print(f"  Parse-fel i {os.path.basename(hpr_path)}: {e}")
    return träffar


def supa_query(path: str, params: dict | None = None):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params or {}, timeout=30)
    r.raise_for_status()
    return r.json()


def supa_post(path: str, body: dict):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, json=body, timeout=30)
    if not r.ok:
        print(f"FEL POST {path}: {r.status_code} {r.text}")
        return None
    return r.json()


def supa_patch(path: str, params: dict, body: dict):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params, json=body, timeout=30)
    if not r.ok:
        print(f"FEL PATCH {path}: {r.status_code} {r.text}")
        return None
    return r.json()


def gissa_operator(maskin: str, datum: str) -> str | None:
    """Senaste föregående dags operator för maskinen i fakt_skift."""
    res = supa_query(
        "fakt_skift",
        {
            "maskin_id": f"eq.{maskin}",
            "datum": f"lt.{datum}",
            "select": "operator_id",
            "order": "datum.desc,utloggning_tid.desc",
            "limit": 1,
        },
    )
    return res[0]["operator_id"] if res else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--maskin", required=True)
    ap.add_argument("--datum", required=True, help="YYYY-MM-DD")
    ap.add_argument("--operator", help="ex R64428_9 (default: senaste föregående dags operator)")
    ap.add_argument("--objekt", required=True, help="objekt_id i dim_objekt")
    ap.add_argument("--start", help="HH:MM (default: tidigaste CoordinateDate ur HPR)")
    ap.add_argument("--slut", help="HH:MM (default: senaste CoordinateDate ur HPR)")
    ap.add_argument("--torrkor", action="store_true", help="dry-run, skriv inget")
    args = ap.parse_args()

    # 1) Hitta HPR-filer + plocka ut tidsstämplar för datumet
    filer = hpr_filer(args.maskin, args.datum)
    if not filer:
        print(f"Inga HPR-filer för {args.maskin} {args.datum} i {ONEDRIVE_BASE}")
        return
    print(f"Hittade {len(filer)} HPR-fil(er) för {args.datum}:")
    alla_dt: list[datetime] = []
    for f in filer:
        dt = coordinate_dates(f, args.datum)
        print(f"  {os.path.basename(f)}: {len(dt)} CoordinateDate")
        alla_dt.extend(dt)

    if not alla_dt:
        print("Hittade inga CoordinateDate för datumet i HPR-filerna.")
        return

    earliest = min(alla_dt)
    latest = max(alla_dt)
    start_str = args.start or earliest.strftime("%H:%M")
    slut_str = args.slut or latest.strftime("%H:%M")
    print(f"\nTidsspann från HPR: {earliest.strftime('%H:%M:%S')} – {latest.strftime('%H:%M:%S')}")
    print(f"Använder: {start_str} – {slut_str}")

    # 2) Operator
    operator = args.operator or gissa_operator(args.maskin, args.datum)
    if not operator:
        print("Kunde inte fastställa operator — ange via --operator")
        return
    print(f"Operator: {operator}")

    # 3) Mappa operator → medarbetare
    om = supa_query("operator_medarbetare", {"operator_id": f"eq.{operator}", "select": "medarbetare_id"})
    if not om:
        print(f"Operator {operator} saknar mappning i operator_medarbetare")
        return
    medarbetare_id = om[0]["medarbetare_id"]

    # 4) Hämta objekt-namn
    do = supa_query("dim_objekt", {"objekt_id": f"eq.{args.objekt}", "select": "object_name"})
    objekt_namn = do[0]["object_name"] if do else args.objekt

    # 5) Beräkna minuter
    sh, sm = (int(x) for x in start_str.split(":"))
    eh, em = (int(x) for x in slut_str.split(":"))
    arbetad_min = (eh * 60 + em) - (sh * 60 + sm)

    print(f"\nPlan:")
    print(f"  arbetsdag {args.datum} {start_str}–{slut_str} ({arbetad_min} min)")
    print(f"  objekt:   {objekt_namn} ({args.objekt})")
    print(f"  medarb:   {medarbetare_id}")

    if args.torrkor:
        print("\n--torrkor angiven — inget skrivs.")
        return

    # 6) Skapa eller uppdatera arbetsdag
    befintlig = supa_query(
        "arbetsdag",
        {
            "medarbetare_id": f"eq.{medarbetare_id}",
            "datum": f"eq.{args.datum}",
            "maskin_id": f"eq.{args.maskin}",
            "select": "id,start_tid,slut_tid,redigerad",
        },
    )
    if befintlig:
        ad = befintlig[0]
        print(f"\nArbetsdag finns ({ad['id']}) — uppdaterar start/slut.")
        # Förläng spannet om vår syntes är vidare
        ny_start = min(start_str, (ad["start_tid"] or "23:59")[:5])
        ny_slut = max(slut_str, (ad["slut_tid"] or "00:00")[:5])
        supa_patch(
            "arbetsdag",
            {"id": f"eq.{ad['id']}"},
            {
                "start_tid": ny_start + ":00",
                "slut_tid": ny_slut + ":00",
                "redigerad": True,
                "redigerad_anl": f"HPR-syntes: MOM saknas för {objekt_namn} {args.datum}",
                "redigerad_tid": datetime.utcnow().isoformat() + "Z",
            },
        )
        arbetsdag_id = ad["id"]
    else:
        ny = supa_post(
            "arbetsdag",
            {
                "medarbetare_id": medarbetare_id,
                "datum": args.datum,
                "dagtyp": "normal",
                "start_tid": start_str + ":00",
                "slut_tid": slut_str + ":00",
                "rast_min": 0,
                "maskin_id": args.maskin,
                "objekt_id": args.objekt,
                "bekraftad": False,
                "redigerad": True,
                "redigerad_anl": f"HPR-syntes: MOM saknas för {objekt_namn} {args.datum}",
                "redigerad_tid": datetime.utcnow().isoformat() + "Z",
            },
        )
        if not ny:
            return
        arbetsdag_id = ny[0]["id"]
        print(f"\nNy arbetsdag skapad: {arbetsdag_id}")

    # 7) Lägg till arbetsdag_objekt om den inte redan finns för (arbetsdag, objekt)
    finns = supa_query(
        "arbetsdag_objekt",
        {
            "arbetsdag_id": f"eq.{arbetsdag_id}",
            "objekt_id": f"eq.{args.objekt}",
            "select": "id",
        },
    )
    if finns:
        print(f"  arbetsdag_objekt finns redan för {args.objekt} — uppdaterar tider.")
        supa_patch(
            "arbetsdag_objekt",
            {"id": f"eq.{finns[0]['id']}"},
            {"start_tid": start_str + ":00", "slut_tid": slut_str + ":00", "arbetad_min": arbetad_min},
        )
    else:
        supa_post(
            "arbetsdag_objekt",
            {
                "arbetsdag_id": arbetsdag_id,
                "objekt_id": args.objekt,
                "objekt_namn": objekt_namn,
                "maskin_id": args.maskin,
                "start_tid": start_str + ":00",
                "slut_tid": slut_str + ":00",
                "arbetad_min": arbetad_min,
                "ordning": 1,
                "skapad_av": "hpr_synth",
            },
        )
    print("\nKlart.")


if __name__ == "__main__":
    main()
