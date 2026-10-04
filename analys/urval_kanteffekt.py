"""STEG 1 — urval för kanteffektpiloten. Ingen skrivning någonstans.

Fråga: vilka slutavverkningar har (a) HPR kvar på disk och (b) en skördare som
skriver BoomPositioning? Lantmäteriets skanningsdatum (c) kontrolleras separat.

KÄLLOR OCH VAD DE KAN OCH INTE KAN
- HPR på disk: Behandlade/{maskin}/hpr/. Läses direkt.
- objekt (Supabase, publik nyckel): typ, vo_nummer, namn. Det ÄR läsbart.
- hpr_filer, dim_objekt, fakt_produktion m.fl.: RLS släpper inte igenom den
  publika nyckeln — de svarar HTTP 200 med noll rader, vilket ser ut som
  "tomt" men inte är det. Service-nyckeln används INTE (regel: gena aldrig
  förbi auth). Skriptet frågar därför inga andra tabeller.

KOPPLING FIL -> OBJEKT: ContractNumber i filhuvudet == objekt.vo_nummer.
Filnamn används bara för att gruppera filer och för att välja den STÖRSTA
filen per grupp (filerna är kumulativa; CLAUDE.md: använd filen med flest
stammar). Namnlösa filer grupperas på huvudets ContractNumber.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
import time
import urllib.request
from collections import defaultdict
from math import cos, radians

from hpr_lasare import kontrollera_antal, objekt_i_huvud, sammanfatta

B = "C:/Users/lindq/Kompersmåla Skog/Maskindata - Dokument/MOM-filer/Behandlade"
MASKINER = {
    "PONS20SDJAA270231": "Ponsse Scorpion Giant 8W",
    "R64428": "Rottne H8E",
    "R64101": "Rottne H8E",
}
HERE = os.path.dirname(os.path.abspath(__file__))
UT = os.path.join(HERE, "ut")


def _env(namn: str) -> str:
    """Läser en variabel ur ../.env.local utan att någonsin skriva ut den."""
    with open(os.path.join(HERE, "..", ".env.local"), encoding="utf-8") as fh:
        for rad in fh:
            if rad.startswith(namn + "="):
                return rad.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{namn} saknas i .env.local")


def hamta_objekt() -> list[dict]:
    url = _env("NEXT_PUBLIC_SUPABASE_URL") + (
        "/rest/v1/objekt?select=id,namn,typ,status,vo_nummer,areal,lat,lng,skordare_maskin_id&limit=1000"
    )
    key = _env("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def objnamn(maskin: str, fn: str) -> str:
    """Gruppnamn ur filnamnet. Tom sträng = namnlös (grupperas på huvudet)."""
    b = fn[:-4]
    if maskin.startswith("PONS"):
        m = re.match(r"^(.*?)_?PONS\d\dSDJAA\d{6}_\d{14}(?:_.*)?$", b)
        return (m.group(1) if m else b).strip()
    m = re.match(r"^(.*?)\s+\d{4}-\d{2}-\d{2}(?:\s+\d{4})?(?:_.*)?$", b)
    return (m.group(1) if m else b).strip()


def grupper() -> dict[tuple[str, str], list[str]]:
    g: dict[tuple[str, str], list[str]] = defaultdict(list)
    for maskin in MASKINER:
        for f in glob.glob(f"{B}/{maskin}/hpr/*.hpr"):
            g[(maskin, objnamn(maskin, os.path.basename(f)))].append(f)
    return g


def norm(s: str | None) -> str:
    return re.sub(r"[^0-9a-zåäö]", "", (s or "").lower())


def extent_m(p: dict) -> tuple[float, float]:
    lat0 = (p["lat_min"] + p["lat_max"]) / 2
    return (
        (p["lat_max"] - p["lat_min"]) * 111_320,
        (p["lon_max"] - p["lon_min"]) * 111_320 * cos(radians(lat0)),
    )


def main() -> None:
    os.makedirs(UT, exist_ok=True)
    t0 = time.time()
    objekt = hamta_objekt()
    per_vo = {str(o["vo_nummer"]): o for o in objekt if o.get("vo_nummer")}
    per_namn = {norm(o["namn"]): o for o in objekt if o.get("namn")}
    print(f"objekt lästa: {len(objekt)}  (publik nyckel; övriga tabeller RLS-låsta)")

    rader: list[dict] = []
    g = grupper()

    # Namnlösa filer: gruppera på huvudets ContractNumber. De är för många för att
    # läsa i helhet, så bara huvudet läses och den största filen per kontrakt tas.
    namnlosa = {k: v for k, v in g.items() if k[1] == ""}
    namngivna = {k: v for k, v in g.items() if k[1] != ""}
    for (maskin, _), filer in namnlosa.items():
        per_kontrakt: dict[str, list[str]] = defaultdict(list)
        for f in filer:
            ob = objekt_i_huvud(f)
            per_kontrakt[(ob[0]["contract"] if ob else None) or "?"].append(f)
        for kontrakt, fl in per_kontrakt.items():
            namngivna[(maskin, f"(namnlös, kontrakt {kontrakt})")] = fl
    print(f"grupper: {len(namngivna)}  (filer totalt {sum(len(v) for v in namngivna.values())})")

    for i, ((maskin, namn), filer) in enumerate(sorted(namngivna.items()), 1):
        storst = max(filer, key=os.path.getsize)
        try:
            tag, last = kontrollera_antal(storst)
        except Exception as e:  # en trasig fil får inte stoppa hela urvalet
            print(f"  !! {namn[:30]}: {e}")
            continue
        huvud = objekt_i_huvud(storst)
        per = sammanfatta(storst)
        for ok, p in per.items():
            h = next((x for x in huvud if x["object_key"] == ok), {})
            o = per_vo.get(str(h.get("contract"))) or per_namn.get(norm(h.get("namn") or namn))
            n = p["stammar"]
            ew = extent_m(p) if p["med_koord"] else (None, None)
            rader.append(
                {
                    "maskin": maskin, "modell": MASKINER[maskin], "grupp": namn,
                    "filer": len(filer), "fil": os.path.basename(storst), "mb": round(os.path.getsize(storst) / 1e6, 1),
                    "kontroll_taggar": tag, "kontroll_lasta": last,
                    "object_key": ok, "hpr_namn": h.get("namn"), "contract": h.get("contract"),
                    "cutting_method": h.get("cutting_method"), "areal_hpr_ha": h.get("areal_ha"),
                    "objekt_namn": o["namn"] if o else None, "objekt_typ": o["typ"] if o else None,
                    "objekt_vo": o.get("vo_nummer") if o else None,
                    "stammar": n, "andel_boom": round(p["med_boom"] / n, 3) if n else 0,
                    "andel_koord": round(p["med_koord"] / n, 3) if n else 0,
                    "andel_coorddate": round(p["med_coorddate"] / n, 3) if n else 0,
                    "dbh_medel_mm": round(p["dbh_sum"] / p["dbh_n"]) if p["dbh_n"] else None,
                    "t_min": (p["t_min"] or "")[:10], "t_max": (p["t_max"] or "")[:10],
                    "lat": round(p["lat_sum"] / p["med_koord"], 5) if p["med_koord"] else None,
                    "lon": round(p["lon_sum"] / p["med_koord"], 5) if p["med_koord"] else None,
                    "utstrackning_ns_m": round(ew[0]) if ew[0] is not None else None,
                    "utstrackning_ew_m": round(ew[1]) if ew[1] is not None else None,
                    "receiver": dict(p["receiver"]), "boom_kat": dict(p["boom_kat"]),
                    "kategorier": dict(p["kategori"]),
                }
            )
        if i % 10 == 0:
            print(f"  {i}/{len(namngivna)} grupper  ({time.time() - t0:.0f}s)")

    with open(os.path.join(UT, "urval_steg1.json"), "w", encoding="utf-8") as fh:
        json.dump(rader, fh, ensure_ascii=False, indent=1)
    avvikande = [r for r in rader if r["kontroll_taggar"] != r["kontroll_lasta"]]
    print(f"\nklart på {time.time() - t0:.0f}s: {len(rader)} objektposter, "
          f"{len(avvikande)} filer där läsaren tappade stammar")
    for r in avvikande:
        print("  !! AVVIKER:", r["fil"], r["kontroll_taggar"], r["kontroll_lasta"])


if __name__ == "__main__":
    sys.exit(main())
