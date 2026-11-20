"""Steg 6: läser de avkodade vektortext-PDF:erna, klassar (ponsse_skift / ponsse_matbevis_ny), avgör maskin, tolkar fält och
skriver ponsse_skift.json (rådata för vidare steg). Ingen databas."""
import csv
import difflib
import glob
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import parse_skift as P  # noqa: E402

IMP = Path("C:/Users/lindq/skogsystem-import")


def lik(a, b):
    na = P.normtext(re.sub(r"[^\w ]", " ", a or "")).split()
    nb = P.normtext(re.sub(r"[^\w ]", " ", b or "")).split()
    if not na or not nb:
        return 0.0
    if set(na) == set(nb):
        return 1.0
    r = difflib.SequenceMatcher(None, " ".join(na), " ".join(nb)).ratio()
    s, l = (set(na), set(nb)) if len(na) <= len(nb) else (set(nb), set(na))
    if len(s) >= 2 and s <= l:
        r = max(r, 0.95)
    return r


def d(s):
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


def las_alla():
    inv = {r["sha256"]: r for r in csv.DictReader(open(IMP / "inventering.csv", encoding="utf-8-sig"))}
    occ = {}
    for l in open(IMP / "occurrences.jsonl", encoding="utf-8"):
        o = json.loads(l)
        if o["sha"] not in occ or o["datum"] < occ[o["sha"]]["datum"]:
            occ[o["sha"]] = o
    skift, mb = [], []
    for f in sorted(glob.glob(str(IMP / "vektortext_v2" / "*.json"))):
        dd = json.load(open(f, encoding="utf-8"))
        sha = dd["sha"]
        sid = [s["rader"] for s in dd["sidor"]]
        t0 = sid[0][0].strip() if sid and sid[0] else ""
        o = occ.get(sha, {})
        meta = {"sha": sha, "fil": inv[sha]["filnamn"], "mejldatum": o.get("datum", ""), "avsandare": o.get("fran", ""), "amne": o.get("amne", ""),
                "okanda": sum(s["okanda"] for s in dd["sidor"]), "glyfer": sum(s["glyfer"] for s in dd["sidor"]), "sidor": len(sid)}
        if t0 == "Skift":
            r = P.parse_skift(sid)
            r.update(meta)
            skift.append(r)
        elif t0.startswith(("Matbevis", "Mätbevis")):
            r = P.parse_matbevis_ny(sid)
            r.update(meta)
            r["maskin"], r["maskin_traff"] = P.maskin_ur_text(r["maskin_text"])
            mb.append(r)
    return skift, mb


def obj_av_filnamn(fil):
    n = re.sub(r"\.pdf$", "", fil, flags=re.I)
    n = re.sub(r"\b(g15|prd|drf|skift)\b", " ", n, flags=re.I)
    return " ".join(n.replace("_", " ").split())


def skift_period(s):
    ds = [d(x["datum"]) for x in s["dagrader"] if d(x["datum"])]
    a = d(s["fran"]) or (min(ds) if ds else None) or d(s["mejldatum"])
    b = d(s["till"]) or (max(ds) if ds else None) or d(s["mejldatum"])
    return a, b


def bestam_maskin(skift, mb):
    """Sätter s['maskin'], s['maskin_kalla'] på varje Skift. Ordning: (1) mätbevis med samma objekt och datum, (2) dagrader som sammanfaller
    med redan bestämd Skift-rapport, (3) gissning (filnamn 'gigant', avsändare, datum) -> maskin_kalla='gissad'."""
    for s in skift:
        s["maskin"], s["maskin_kalla"] = "", ""
        if s["typ"] == "manad":
            continue
        nm = s["arbetsomrade"] or obj_av_filnamn(s["fil"])
        a, b = skift_period(s)
        kand = []
        for m in mb:
            sc = lik(nm, m["objekt"])
            if sc < 0.8:
                continue
            ms = d(m["start"]) or d(m["utskriven"])
            me = max(x for x in (d(m["slut"]), d(m["andring"]), d(m["utskriven"]), ms) if x)
            if a and b and ms and a <= me + timedelta(days=45) and b >= ms - timedelta(days=45):
                kand.append((sc, m))
        if kand:
            c = Counter(m["maskin"] for _, m in kand)
            s["maskin"] = c.most_common(1)[0][0]
            s["maskin_kalla"] = "mätbevis (objekt+datum)" + ("" if len(c) == 1 else " [flera maskiner, vald närmast]")
    # (2) dagrader -> maskin via nyckel (förare, datum, tin)
    nyckel = {}
    for s in skift:
        if s["maskin"]:
            for x in s["dagrader"]:
                nyckel[(x["forare"], x["datum"], x["tin"])] = s["maskin"]
    for s in skift:
        if not s["maskin"]:
            c = Counter(nyckel[(x["forare"], x["datum"], x["tin"])] for x in s["dagrader"] if (x["forare"], x["datum"], x["tin"]) in nyckel)
            if c:
                s["maskin"] = c.most_common(1)[0][0]
                s["maskin_kalla"] = "dagrader sammanfaller med annan rapport"
    return skift


def main():
    skift, mb = las_alla()
    print(len(skift), "Skift,", len(mb), "Mätbevis (ny)")
    print("maskin i mätbevis:", Counter(m["maskin"] for m in mb))
    print("skift typ:", Counter(s["typ"] for s in skift))
    bestam_maskin(skift, mb)
    print("maskin Skift:", Counter((s["maskin"] or "-", s["maskin_kalla"][:28]) for s in skift))
    return skift, mb


if __name__ == "__main__":
    main()
