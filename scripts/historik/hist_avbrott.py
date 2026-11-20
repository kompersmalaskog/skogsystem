"""Steg 8 DEL A punkt 2: avbrott per grupp ur alla format som har dem. Ingen databas.

Skriver i importmappen:
  hist_avbrott.csv  en rad per rapport: sha256, format, avbrott_{reparation,service,storning,flytt,trailer,varmkorning,ovrigt,totalt}_min, kalla
  hist_stopp.csv    Komatsu MaxiXplorer: varje stopp med felkod (datum, tid, forare, felkod, beskrivning, minuter)

Grupper (tom = formatet redovisar inte gruppen; 0 = redovisat som noll):
  reparation  Komatsu: Reparation(10)+Väntan reparation(11). Rottne: Reparation+Väntan på reparation. Ponsse: Reparation+Väntetid reparation.
              AptMan: Reparationstid totalt (10-14).
  service     Komatsu Skötsel(12). Rottne Skötsel. Ponsse Service. AptMan Underhåll totalt (20-22).
  storning    Störning (Komatsu 14, Rottne, Ponsse, AptMan 30-32) = ingår i TU.
  flytt       AptMan 40.Flyttning (ej TU). Övriga format räknar flytt mellan objekt som arbetstid i G15 och redovisar inte avbrott.
  trailer     Komatsu Trailertransport(13), Rottne Trailertransport, Ponsse Transport, AptMan 41.Trailer.
  varmkorning AptMan 42.Varmkörning.
  ovrigt      Komatsu Ospecifierat. AptMan 43.Övrigt(ej TU)+44.Eget(ej TU). Ingår inte i TU.
  totalt      rapportens egen totalsiffra för avbrott (Komatsu Avbrottstid G(t), Rottne Total avbrottstid, Ponsse Total avbrottstid, AptMan Avbrott totalt (TU)).
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
import parse_optiwin as PW  # noqa: E402

IMP = Path("C:/Users/lindq/skogsystem-import")
GRUPPER = ["reparation", "service", "storning", "flytt", "trailer", "varmkorning", "ovrigt", "totalt"]
HM = re.compile(r"^(\d+):(\d\d)$")


def mn(s):
    m = HM.match((s or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def tom():
    return {g: None for g in GRUPPER}


def las(fn):
    with open(IMP / fn, encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


# ------------------------------------------------------------------------------------------------ Komatsu MaxiXplorer
KOD = re.compile(r"^(Reparation|V.ntan reparation|Sk.tsel|Trailertransport|St.rning|Ospecifierat)\s+(?:\d+\s+)?(\d+:\d\d)\s")
STOPP = re.compile(r"^(\d{4}-\d\d-\d\d) (\d\d:\d\d) (\d+:\d\d) ([A-Za-zÅÄÖåäö][^\d,]*?) (\d{1,2}), (\d{1,5}) ([A-Za-zÅÄÖåäö].*?)\s*$")
FIX = {"Reparat ion": "Reparation", "Störnin g": "Störning", "u nderhåll": "underhåll", "Sk ötsel": "Skötsel", "Hydra ulik": "Hydraulik", "S kötsel": "Skötsel"}


def komatsu(pages):
    t = "\n".join(pages)
    r = tom()
    n = {"reparation": 0, "service": 0, "storning": 0, "trailer": 0, "ovrigt": 0}
    funnet = 0
    for s in t.splitlines():
        m = KOD.match(s)
        if not m:
            continue
        funnet += 1
        k = m.group(1)
        v = mn(m.group(2)) or 0
        key = "reparation" if k.startswith(("Reparation", "V")) else "service" if k.startswith("Sk") else "storning" if k.startswith("St") else "trailer" if k.startswith("Trailer") else "ovrigt"
        n[key] += v
    if funnet < 6:
        return None, []
    r.update({k: v for k, v in n.items()})
    m = re.search(r"Avbrottstid G\(t\) (\d+:\d\d)", t)
    r["totalt"] = mn(m.group(1)) if m else None
    stopp = []
    for s in t.splitlines():
        m = STOPP.match(s.replace("\xa0", " "))
        if m and m.group(5) != "1" and 10 <= int(m.group(5)) <= 19:  # kod 1 = Rast; 10-14 reparation/skötsel/störning/trailer
            besk = m.group(7)
            for a, b in FIX.items():
                besk = besk.replace(a, b)
            stopp.append(dict(datum=m.group(1), tid=m.group(2), minuter=mn(m.group(3)), forare=m.group(4).strip(), felkod=f"{m.group(5)}-{m.group(6)}", beskrivning=" ".join(besk.split())))
    return r, stopp


# ------------------------------------------------------------------------------------------------ AptMan DRIFT-INFO
def aptman(text):
    t = text.replace("\xa0", " ").replace("\x00", "")
    g = lambda pat: (lambda m: mn(m.group(1)) if m else None)(re.search(pat, t))
    r = tom()
    r["reparation"] = g(r"Reparationstid totalt:\s*(\d+:\d\d)")
    r["service"] = g(r"Underh.ll totalt:\s*(\d+:\d\d)")
    r["storning"] = g(r"St.rning totalt:\s*(\d+:\d\d)")
    r["flytt"] = g(r"40\.Flyttning:\s*(\d+:\d\d)")
    r["trailer"] = g(r"41\.Trailer:\s*(\d+:\d\d)")
    r["varmkorning"] = g(r"42\.Varmk.rning:\s*(\d+:\d\d)")
    o1, o2 = g(r"43\.\S*vrigt \(ej TU\):\s*(\d+:\d\d)"), g(r"44\.Eget \(ej TU\):\s*(\d+:\d\d)")
    r["ovrigt"] = (o1 or 0) + (o2 or 0) if (o1 is not None or o2 is not None) else None
    r["totalt"] = g(r"Avbrott totalt \(TU\):\s*(\d+:\d\d)")
    if r["reparation"] is None and r["service"] is None and r["totalt"] is None:
        return None
    return r


# ------------------------------------------------------------------------------------------------ rader ur PDF-ord (Rottne, Ponsse)
def pdf_rader(path, sida=0):
    d = pymupdf.open(path)
    ws = d[sida].get_text("words")
    rows = []
    for w in sorted(ws, key=lambda w: (w[1], w[0])):
        if rows and abs(rows[-1][0] - w[1]) <= 3.5:
            rows[-1][1].append(w)
        else:
            rows.append([w[1], [w]])
    return [(y, sorted(r, key=lambda w: w[0])) for y, r in rows]


ROTTNE = {"Reparation": "reparation", "Väntan på reparation": "reparation", "Skötsel": "service", "Trailertransport": "trailer", "Störning": "storning"}


def rottne(path):
    rows = pdf_rader(path)
    r = tom()
    n = {"reparation": 0, "service": 0, "storning": 0, "trailer": 0}
    start = next((y for y, ws in rows if ws[0][4] == "Tid" and len(ws) > 1 and ws[1][4].startswith("(tt")), None)
    slut = next((y for y, ws in rows if y > (start or 0) and ws[0][4] == "Maskindata"), None)
    if start is None or slut is None:
        return None
    n_funna = 0
    tot = None
    for y, ws in rows:
        if not (start < y < slut):
            continue
        hogra = [w for w in ws if w[0] >= 300]
        txt = " ".join(w[4] for w in hogra).replace("\xa0", " ")
        txt = re.sub(r"\s+", " ", txt.replace("\u00ad", ""))
        m = re.match(r"^(Reparation|Väntan på reparation|Skötsel|Trailertransport|Störning)\b.*?(\d+:\d\d)$", txt)
        if m:
            n[ROTTNE[m.group(1)]] += mn(m.group(2)) or 0
            n_funna += 1
        vans = " ".join(w[4] for w in ws if w[0] < 300)
        m2 = re.match(r"^Total avbrottstid (\d+:\d\d)", vans.replace("\xa0", " "))
        if m2:
            tot = mn(m2.group(1))
    if n_funna < 4:
        return None
    r.update(n)
    r["totalt"] = tot
    return r


PONSSE = {"Reparation": "reparation", "Väntetid, reparation": "reparation", "Service": "service", "Transport": "trailer", "Störning": "storning"}


def ponsse_pdf(path):
    rows = pdf_rader(path)
    etiketter = []
    varden = []
    for y, ws in rows:
        v = [w for w in ws if w[0] < 200]
        if v and 335 < y < 520:
            etiketter.append((y, " ".join(w[4] for w in v)))
        for w in ws:
            if 195 <= w[0] <= 235 and HM.match(w[4]) and 335 < y < 520:
                varden.append((y, w[4]))
    et = [(y, t) for y, t in etiketter if t != "Arbetstyp"]
    # etiketter kan ha flera rader (Körning på väg = en rad, men "Väntetid, reparation" delas) -> slå ihop rader <= 4 px isär
    sl = []
    for y, t in et:
        if sl and abs(sl[-1][0] - y) <= 4:
            sl[-1] = (sl[-1][0], sl[-1][1] + " " + t)
        else:
            sl.append((y, t))
    r = tom()
    n = {"reparation": 0, "service": 0, "storning": 0, "trailer": 0}
    ant = 0
    for yv, v in varden:
        if not sl:
            break
        yl, tl = min(sl, key=lambda e: abs(e[0] - yv))
        if abs(yl - yv) > 4:
            continue
        tl = re.sub(r"\s+", " ", tl)
        for k, grp in PONSSE.items():
            if tl == k:
                n[grp] += mn(v) or 0
                ant += 1
    if ant < 3:
        return None
    r.update(n)
    full = " ".join(w[4] for y, ws in rows for w in ws)
    m = re.search(r"Total avbrottstid (\d+:\d\d)", full)
    r["totalt"] = mn(m.group(1)) if m else None
    return r


def ponsse_xps(pages):
    t = pages[0].replace(chr(160), " ")
    r = tom()
    n = {"reparation": 0, "service": 0, "storning": 0, "trailer": 0}
    ant = 0
    for s in t.split(chr(10)):
        m = re.match(r"^\s*(Reparation|Väntetid, reparation|Service|Transport|Störning) (\d+:\d\d)", s)
        if m:
            n[PONSSE[m.group(1)]] += mn(m.group(2)) or 0
            ant += 1
    if ant < 3:
        return None
    r.update(n)
    m = re.search(r"Total avbrottstid (\d+:\d\d)", t)
    r["totalt"] = mn(m.group(1)) if m else None
    return r


# ------------------------------------------------------------------------------------------------ huvud
def main():
    inv = {r["sha256"]: r for r in las("inventering.csv")}
    O = las("objekt.csv")
    kalla = {}
    for o in O:
        if o["format"] != "ponsse_skift_objekt":
            kalla.setdefault(o["sha256"], o)
    bil = {os.path.splitext(f)[0]: f for f in os.listdir(IMP / "bilagor")}
    ut, stopp = {}, []
    fel = Counter()
    # Komatsu
    for l in open(IMP / "maxi_full.jsonl", encoding="utf-8"):
        x = json.loads(l)
        if x["sha"] not in kalla:
            continue
        r, st = komatsu(x["pages"])
        if r is None:
            fel["maxixplorer_drf"] += 1
            continue
        ut[x["sha"]] = ("maxixplorer_drf", r)
        for s in st:
            stopp.append({**s, "sha256": x["sha"], "maskin_namn": kalla[x["sha"]]["maskin_namn"]})
    # AptMan: PDF-text i ponsse_aptman_full, prt/xps ur bilagor
    for l in open(IMP / "ponsse_aptman_full.jsonl", encoding="utf-8"):
        x = json.loads(l)
        o = kalla.get(x["sha"])
        if o and o["format"] == "aptman_drf":
            r = aptman("\n".join(x["pages"]))
            if r:
                ut[x["sha"]] = ("aptman_drf", r)
            else:
                fel["aptman_drf"] += 1
    for sha, o in kalla.items():
        if o["format"] == "aptman_drf" and sha not in ut and sha in bil:
            f = IMP / "bilagor" / bil[sha]
            try:
                if f.suffix == ".xps":
                    text = "\n".join(PW.xps_text(f))
                else:
                    raw = f.read_bytes()
                    try:
                        text = raw.decode("cp1252")
                    except Exception:
                        text = raw.decode("latin-1")
                text = re.sub(r"^\s*(\d\d-\d\d-\d\d)\s*\n\s*(DRIFT-INFO|PRODUKTIONSNOTA)\s*\n", r"\2 \1\n", text.replace("\x00", ""))
                r = aptman(text)
            except Exception:
                r = None
            if r:
                ut[sha] = ("aptman_drf", r)
            else:
                fel["aptman_drf"] += 1
    # Rottne och Ponsse PDF
    for sha, o in kalla.items():
        if sha in ut or (IMP / "pdf" / f"{sha}.pdf").exists() is False:
            continue
        if o["format"] == "forester_driftuppfoljningsrapport":
            r = rottne(IMP / "pdf" / f"{sha}.pdf")
            if r:
                ut[sha] = ("forester_driftuppfoljningsrapport", r)
            else:
                fel["forester"] += 1
        elif o["format"] == "ponsse_maskinspecifik_summering" and o["kalla_typ"] == "pdf":
            r = ponsse_pdf(IMP / "pdf" / f"{sha}.pdf")
            if r:
                ut[sha] = ("ponsse_maskinspecifik_summering", r)
            else:
                fel["ponsse_pdf"] += 1
    for sha, o in kalla.items():
        if o["format"] == "ponsse_maskinspecifik_summering" and o["kalla_typ"] == "xps" and sha in bil:
            try:
                r = ponsse_xps(PW.xps_text(IMP / "bilagor" / bil[sha]))
            except Exception:
                r = None
            if r:
                ut[sha] = ("ponsse_maskinspecifik_summering", r)
            else:
                fel["ponsse_xps"] += 1
    with open(IMP / "hist_avbrott.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "format"] + [f"avbrott_{g}_min" for g in GRUPPER])
        for sha, (f, r) in sorted(ut.items()):
            w.writerow([sha, f] + ["" if r[g] is None else r[g] for g in GRUPPER])
    with open(IMP / "hist_stopp.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["sha256", "maskin_namn", "datum", "tid", "forare", "felkod", "beskrivning", "minuter"])
        w.writeheader()
        w.writerows(stopp)
    print("avbrott utlästa per format:", Counter(f for f, _ in ut.values()))
    print("ej utläst:", dict(fel))
    ej = Counter(o["format"] + "/" + (o["kalla_typ"] or "-") for sha, o in kalla.items() if sha not in ut and o["status"] == "ok")
    print("rapporter utan avbrottsrad per format/källa:", ej.most_common(14))
    print("stopp:", len(stopp), Counter(s["felkod"].split("-")[0] for s in stopp))


if __name__ == "__main__":
    main()
