"""Steg 14, R3: lastcertifikat (LC) som delutskrift av en maskinspecifik summering (SUM). Ingen databas. Skriver hist_csv/hist_r3_forslag.csv.
Villkor (alla): delat nummer (objektnr_alla), LC:s period slutar högst 3 dagar efter SUM:s datum (SUM saknar startdatum i rapporten, så start kan inte prövas),
LC:s G15 < SUM:s G15, och summan av G15 för alla LC som hör till samma SUM <= SUM:s G15 (annars rörs de inte, listas separat).
Åtgärd (föreslagen): G15, bränsle och avbrott från LC räknas inte; lass och volym behålls. Lagras som hist_korrigering falt='delutskrift_inom_summering'."""
import csv
import datetime as dt
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hist_objektnr_text import las_text  # noqa: E402
from hist_rimlighet import OUT  # noqa: E402


def lc_period(text, rapportdatum):
    dat = re.findall(r"\d{4}-\d\d-\d\d", text or "")
    dat = dat[1:] if dat else []   # första datumet är utskriftsdatum
    dat = [x for x in dat if "2010" <= x[:4] <= "2027"]
    if not dat:
        return rapportdatum, rapportdatum
    return min(dat), max(dat)


def berakna(maskin="Ponsse Wisent"):
    T = las_text()
    rap = {r["sha256"]: r for r in csv.DictReader(open(OUT / "hist_rapport.csv", encoding="utf-8"))}
    nr = {r["sha256"]: set(x for x in r["objektnr_alla"].split(";") if x) for r in csv.DictReader(open(OUT / "hist_objektnr.csv", encoding="utf-8"))}
    obj = [o for o in csv.DictReader(open(OUT / "hist_objekt.csv", encoding="utf-8")) if o["maskin_namn"] == maskin and o["raknas"] == "true"]
    f = lambda x: float(x) if x not in ("", None) else 0.0
    d = lambda s: dt.date.fromisoformat(s[:10])
    sums = [o for o in obj if rap[o["sha256"]]["format"] == "ponsse_maskinspecifik_summering"]
    lcs = [o for o in obj if rap[o["sha256"]]["format"] == "lastcertifikat" and not (not o["objekt"] and re.match(r"^\s*[A-Za-z]+\s*\d\d", rap[o["sha256"]]["filnamn"]))]
    kand = defaultdict(list)
    stoppade = []
    for l in lcs:
        st, sl = lc_period(T.get(l["sha256"], ""), l["rapportdatum"])
        delat = [s for s in sums if nr[l["sha256"]] & nr[s["sha256"]] and abs((d(s["rapportdatum"]) - d(l["rapportdatum"])).days) <= 120]
        if not delat:
            continue
        ok = [s for s in delat if d(sl) <= d(s["rapportdatum"]) + dt.timedelta(days=3)]
        if not ok:
            stoppade.append((l, delat[0], "period: LC slutar " + sl + " > SUM " + delat[0]["rapportdatum"] + " + 3 d", st, sl))
            continue
        ok2 = [s for s in ok if f(l["g15_h"]) < f(s["g15_h"])]
        if not ok2:
            stoppade.append((l, ok[0], "G15: LC " + l["g15_h"] + " >= SUM " + ok[0]["g15_h"], st, sl))
            continue
        s = min(ok2, key=lambda s: abs((d(s["rapportdatum"]) - d(sl)).days))
        kand[s["sha256"]].append((l, st, sl))
    R3 = []
    sumobj = {s["sha256"]: s for s in sums}
    for sha, lst in kand.items():
        s = sumobj[sha]
        tot = sum(f(l["g15_h"]) for l, _, _ in lst)
        if tot > f(s["g15_h"]):
            for l, st, sl in lst:
                stoppade.append((l, s, f"grupp: {len(lst)} LC, summa {tot:.2f} h > SUM {s['g15_h']}", st, sl))
        else:
            for l, st, sl in lst:
                R3.append((l, s, st, sl))
    return R3, stoppade, rap


if __name__ == "__main__":
    R3, stoppade, rap = berakna()
    f = lambda x: float(x) if x not in ("", None) else 0.0
    ar = lambda o: (o["startdatum"] or o["rapportdatum"])[:4]
    print("R3 tar (Wisent):")
    per = defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])
    for l, s, st, sl in R3:
        v = per[ar(l)]
        v[0] += 1
        v[1] += f(l["g15_h"])
        v[2] += f(l["bransle_l"])
        v[3] += f(l["avbrott_totalt_min"]) / 60
        v[4] += f(l["antal_lass"])
    for y, v in sorted(per.items()):
        print(f"  {y}: {v[0]:3} lastcertifikat, G15 {v[1]:7.1f} h, bränsle {v[2]:7.0f} l, avbrott {v[3]:5.1f} h  (lass {v[4]:.0f} behålls)")
    with open(OUT / "hist_r3_forslag.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "summering_sha256", "lc_start", "lc_slut", "g15", "bransle_l", "avbrott_h"])
        for l, s, st, sl in R3:
            w.writerow([l["sha256"], s["sha256"], st, sl, l["g15_h"], l["bransle_l"], round(f(l["avbrott_totalt_min"]) / 60, 2)])
    print("\nStoppade (delat nummer men villkor ej uppfyllt):", len(stoppade))
    for l, s, why, st, sl in sorted(stoppade, key=lambda x: x[0]["rapportdatum"]):
        print(f'  LC {l["objekt"][:22]:23}{l["rapportdatum"]} ({st}..{sl}) G15 {f(l["g15_h"]):7.2f} | SUM {s["objekt"][:14]:15}{s["rapportdatum"]} {f(s["g15_h"]):7.2f}  [{why}]')
