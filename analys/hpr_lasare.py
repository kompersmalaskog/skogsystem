"""Strömmande läsare för StanForD 2010-HPR — bara det kanteffektanalysen behöver.

VARFÖR EN EGEN LÄSARE
Filerna är kumulativa och upp till ~190 MB. ElementTree bygger ett träd av varje
diametertabell (hundratals <DiameterValue> per stam) och är i praktiken för
långsam att köra över 90 filer. Här delas strömmen på </Stem> och varje stam
läses med reguljära uttryck. Det är avsiktligt grovt: läsaren plockar sex
fält och inget annat, och den KONTROLLRÄKNAS mot antalet <Stem>-taggar (se
kontrollera_antal) så att en tyst missad stam syns.

LÄSER FILEN DIREKT. Kranvinkel och kranutlägg finns inte i databasen — importen
tar inte med BoomPositioning — så all positionsdata måste komma härifrån.

ENHETER (ur filhuvudet i de filer som undersökts): diameterUnit="mm",
lengthUnit="cm". BoomExtension är alltså centimeter, BoomAngle grader.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Iterator

# --- Fält i ett <Stem>-block. Rottnes filer är radbrutna, Ponsses inte: \s* överallt.
_R_STEMKEY = re.compile(rb"<StemKey>\s*(\d+)\s*</StemKey>")
_R_OBJKEY = re.compile(rb"<ObjectKey>\s*(\d+)\s*</ObjectKey>")
_R_HARVEST = re.compile(rb"<HarvestDate>\s*([^<\s]+)\s*</HarvestDate>")
_R_PROCCAT = re.compile(rb"<ProcessingCategory>\s*([^<\s]+)\s*</ProcessingCategory>")
_R_COORDBLK = re.compile(rb"<StemCoordinates([^>]*)>(.*?)</StemCoordinates>", re.S)
_R_LAT = re.compile(rb"<Latitude[^>]*>\s*(-?[\d.]+)\s*</Latitude>")
_R_LON = re.compile(rb"<Longitude[^>]*>\s*(-?[\d.]+)\s*</Longitude>")
_R_COORDDATE = re.compile(rb"<CoordinateDate>\s*([^<\s]+)\s*</CoordinateDate>")
_R_RECV = re.compile(rb'receiverPosition="([^"]*)"')
_R_BOOM = re.compile(
    rb'<BoomPositioning\s+boomPositioningCategory="([^"]*)"\s*>\s*'
    rb"<BoomAngle>\s*(-?[\d.]+)\s*</BoomAngle>\s*"
    rb"<BoomExtension>\s*(-?[\d.]+)\s*</BoomExtension>",
    re.S,
)
_R_DBH = re.compile(rb"<DBH>\s*(\d+)\s*</DBH>")

# --- Objekt i filhuvudet
_R_OBJDEF = re.compile(rb"<ObjectDefinition>(.*?)</ObjectDefinition>", re.S)


def _txt(rx: re.Pattern[bytes], blk: bytes) -> str | None:
    m = rx.search(blk)
    return m.group(1).decode("utf-8", "replace") if m else None


def objekt_i_huvud(path: str, max_bytes: int = 4_000_000) -> list[dict]:
    """ObjectDefinition-posterna (en fil kan bära flera objekt).

    ContractNumber är nyckeln mot objekt.vo_nummer; ObjectUserID är maskinens
    eget id och INTE samma sak. CuttingMethod finns bara i Ponsses extension.
    """
    with open(path, "rb") as fh:
        head = fh.read(max_bytes)
    ut = []
    for m in _R_OBJDEF.finditer(head):
        b = m.group(1)
        ut.append(
            {
                "object_key": _txt(_R_OBJKEY, b),
                "namn": _txt(re.compile(rb"<ObjectName>\s*([^<]*?)\s*</ObjectName>"), b),
                "contract": _txt(re.compile(rb"<ContractNumber>\s*([^<]*?)\s*</ContractNumber>"), b),
                "user_id": _txt(re.compile(rb"<ObjectUserID>\s*([^<]*?)\s*</ObjectUserID>"), b),
                "areal_ha": _txt(re.compile(rb"<ObjectArea>\s*([^<]*?)\s*</ObjectArea>"), b),
                "cutting_method": _txt(re.compile(rb"<CuttingMethod>\s*([^<]*?)\s*</CuttingMethod>"), b),
                "start": _txt(re.compile(rb"<StartDate>\s*([^<]*?)\s*</StartDate>"), b),
                "slut": _txt(re.compile(rb"<EndDate>\s*([^<]*?)\s*</EndDate>"), b),
            }
        )
    return ut


def las_stammar(path: str, chunk: int = 16 * 1024 * 1024) -> Iterator[dict]:
    """Ger en dict per <Stem>. Fält som saknas är None.

    boom: lista av (kategori, vinkel_grader, utlägg_cm). Tom lista om stammen
    saknar BoomPositioning — vilket är HELA skälet till att urvalet görs: det
    är en egenskap hos maskinen, inte hos stammen.
    """
    carry = b""
    with open(path, "rb") as fh:
        while True:
            data = fh.read(chunk)
            if not data:
                break
            buf = carry + data
            delar = buf.split(b"</Stem>")
            carry = delar.pop()  # sista biten är ofärdig
            for d in delar:
                i = d.rfind(b"<Stem>")
                if i < 0:
                    i = d.rfind(b"<Stem ")
                if i < 0:
                    continue
                yield _tolka(d[i:])
    # carry efter sista </Stem> är bara slutet av dokumentet


def _tolka(blk: bytes) -> dict:
    lat = lon = cdate = recv = None
    cb = _R_COORDBLK.search(blk)
    if cb:
        recv = _txt(_R_RECV, cb.group(1))
        a, o = _R_LAT.search(cb.group(2)), _R_LON.search(cb.group(2))
        if a and o:
            lat, lon = float(a.group(1)), float(o.group(1))
        cdate = _txt(_R_COORDDATE, cb.group(2))
    dbh = _R_DBH.search(blk)
    return {
        "stem_key": _txt(_R_STEMKEY, blk),
        "object_key": _txt(_R_OBJKEY, blk),
        "harvest": _txt(_R_HARVEST, blk),
        "kategori": _txt(_R_PROCCAT, blk),
        "lat": lat,
        "lon": lon,
        "coord_date": cdate,
        "receiver": recv,
        "boom": [(c.decode(), float(w), float(e)) for c, w, e in _R_BOOM.findall(blk)],
        "dbh_mm": int(dbh.group(1)) if dbh else None,
    }


def kontrollera_antal(path: str, chunk: int = 16 * 1024 * 1024) -> tuple[int, int]:
    """(antal <Stem>-taggar i filen, antal stammar läsaren gav).

    En skillnad betyder att läsaren tappar stammar. Körs på varje fil som
    används i en slutsats — samma princip som resten av projektet: ett verktyg
    som svarar utan att ha räknat rätt är värre än inget svar.
    """
    taggar = 0
    tail = b""
    with open(path, "rb") as fh:
        while True:
            d = fh.read(chunk)
            if not d:
                break
            b = tail + d
            taggar += b.count(b"<Stem>") + b.count(b"<Stem ")
            tail = b[-8:]
    lasta = sum(1 for _ in las_stammar(path))
    return taggar, lasta


def sammanfatta(path: str) -> dict:
    """Per ObjectKey: antal, boom-täckning, DBH, position, tid. Ett pass över filen."""
    per: dict[str, dict] = {}
    for s in las_stammar(path):
        k = s["object_key"] or "?"
        p = per.setdefault(
            k,
            {
                "stammar": 0, "med_boom": 0, "med_koord": 0, "dbh_sum": 0, "dbh_n": 0,
                "lat_min": 1e9, "lat_max": -1e9, "lon_min": 1e9, "lon_max": -1e9,
                "lat_sum": 0.0, "lon_sum": 0.0,
                "t_min": None, "t_max": None,
                "receiver": Counter(), "kategori": Counter(), "boom_kat": Counter(),
                "med_coorddate": 0,
            },
        )
        p["stammar"] += 1
        p["kategori"][s["kategori"]] += 1
        if s["boom"]:
            p["med_boom"] += 1
            for c, _, _ in s["boom"]:
                p["boom_kat"][c] += 1
        if s["lat"] is not None:
            p["med_koord"] += 1
            p["lat_min"] = min(p["lat_min"], s["lat"]); p["lat_max"] = max(p["lat_max"], s["lat"])
            p["lon_min"] = min(p["lon_min"], s["lon"]); p["lon_max"] = max(p["lon_max"], s["lon"])
            p["lat_sum"] += s["lat"]; p["lon_sum"] += s["lon"]
            p["receiver"][s["receiver"]] += 1
            if s["coord_date"]:
                p["med_coorddate"] += 1
        if s["dbh_mm"] is not None:
            p["dbh_sum"] += s["dbh_mm"]; p["dbh_n"] += 1
        h = s["harvest"]
        if h:
            if p["t_min"] is None or h < p["t_min"]:
                p["t_min"] = h
            if p["t_max"] is None or h > p["t_max"]:
                p["t_max"] = h
    return per
