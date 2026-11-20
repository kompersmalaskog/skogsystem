"""Steg 4b DEL 3: vad som tillkom, uppdaterad volym per år och maskin, kvarvarande luckor. Läser skift.csv/objekt.csv."""
import csv
import json
import re
import collections
from datetime import date
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
SKOTARE = {"Komatsu 840.4", "Komatsu 860.4", "Komatsu 830.3", "Komatsu 875", "Elephant King gammal", "Elephant King ny", "Ponsse Wisent"}


def fm(v):
    return f"{v:,.0f}".replace(",", " ")


def las():
    S = list(csv.DictReader(open(IMP / "skift.csv", encoding="utf-8-sig")))
    O = list(csv.DictReader(open(IMP / "objekt.csv", encoding="utf-8-sig")))
    return S, O


def volymer(S, O, bara_nya=False):
    V = collections.defaultdict(float)
    N = collections.Counter()
    if not bara_nya:
        for s in S:
            if s["format"] == "maxixplorer_drf" and s["volym_m3fub"] != "":
                V[(s["maskin_namn"], s["datum"][:4])] += float(s["volym_m3fub"])
    for o in O:
        if o["format"] == "maxixplorer_drf" or o["status"] != "ok" or o["senaste_for_nyckel"] != "ja" or o["volym_m3fub"] == "" or o["dubblett_av"] or o["volym_kvalitet"] == "laster_x_1m3":
            continue
        ny = o["kalla_typ"] in ("prt", "xps") or o["format"] in ("matbevis", "lastcertifikat")
        if bara_nya and not ny:
            continue
        if o["maskin_namn"].startswith(("okopplad", "Extern", "exkludera")):
            continue
        V[(o["maskin_namn"], o["rapportdatum"][:4])] += float(o["volym_m3fub"])
        N[(o["maskin_namn"], o["rapportdatum"][:4])] += 1
    return V, N


def tabell(V, titel, filt, N=None):
    ms = sorted({k[0] for k in V if filt(k[0])})
    ars = sorted({k[1] for k in V if k[0] in ms})
    ut = [f"### {titel}", "| År | " + " | ".join(ms) + " |", "|---|" + "---|" * len(ms)]
    for y in ars:
        ut.append(f"| {y} | " + " | ".join((fm(V[(m, y)]) + (f" ({N[(m, y)]})" if N is not None and N[(m, y)] else "")) if V[(m, y)] else "" for m in ms) + " |")
    ut.append("| **Totalt** | " + " | ".join(f"**{fm(sum(V[(m, y)] for y in ars))}**" for m in ms) + " |")
    return "\n".join(ut)


def main():
    S, O = las()
    Valla, _ = volymer(S, O)
    Vny, Nny = volymer(S, O, bara_nya=True)
    ut = ["## 10. Vad som tillkom i steg 4b (volym m3fub, antal rapporter i parentes)\n",
          "Nytt = AptMan ur .prt/.xps, Ponsse ur .xps, MÄTBEVIS och Lastcertifikat som inte är dubbletter av en Maskinspecifik-rapport.\n",
          tabell(Vny, "Skördare", lambda m: m not in SKOTARE, Nny), "", tabell(Vny, "Skotare (Lastcertifikat, volym ej angiven som fub)", lambda m: m in SKOTARE, Nny), ""]
    ut += ["## 11. Uppdaterad volym m3fub per år och maskin\n", tabell(Valla, "Skördare", lambda m: m not in SKOTARE), "", tabell(Valla, "Skotare", lambda m: m in SKOTARE), ""]
    # ---- luckor
    ut.append("## 12. Luckor som finns kvar\n")
    ut.append("Motortimmar utan rapport = skillnaden i maskinens livstidsräknare mellan två på varandra följande rapporter med mer än 45 dagars mellanrum.\n")
    liv = collections.defaultdict(list)
    for o in O:
        if o["format"] == "ponsse_maskinspecifik_summering" and o["livstid_h"] != "" and o["maskin_namn"] not in ("Extern: Magnus Gustafsson",):
            liv[o["maskin_namn"]].append((o["rapportdatum"], int(o["livstid_h"])))
    # Komatsu: andra talet på raden "Motortid" i MaxiXplorer-rapporterna
    T = {}
    for l in open(IMP / "texter.jsonl", encoding="utf-8"):
        d = json.loads(l)
        T[d["sha"]] = d["text"].replace("\xa0", " ")
    for o in O:
        if o["format"] == "maxixplorer_drf" and o["status"] == "ok":
            m = re.search(r"Motortid (\d+):(\d\d) (\d+):(\d\d)", T.get(o["sha256"], ""))
            if m:
                liv[o["maskin_namn"]].append((o["rapportdatum"], round(int(m.group(3)) + int(m.group(4)) / 60)))
    rader = []
    for mn, xs in sorted(liv.items()):
        xs = sorted(set(xs))
        # filtrera räknarnollställningar (Komatsu 2012): ta bara steg framåt
        for (d1, h1), (d2, h2) in zip(xs, xs[1:]):
            dd = (date.fromisoformat(d2) - date.fromisoformat(d1)).days
            if dd > 45 and h2 - h1 > 0:
                rader.append((mn, d1, h1, d2, h2, dd, h2 - h1))
    ut.append("| Maskin | Sista rapport före | h | Första rapport efter | h | Dagar | Motortimmar utan rapport |")
    ut.append("|---|---|---|---|---|---|---|")
    for r in sorted(rader, key=lambda r: -r[6]):
        ut.append(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | **{r[6]}** |")
    ut.append("")
    # månader utan någon rapport (maskiner utan livstidsräknare)
    ut.append("Maskiner utan livstidsräknare i rapporterna — månader utan rapport mellan första och sista rapport:\n")
    for mn in ("Komatsu 911.3", "Komatsu 941 AptMan", "Rottne H8B", "Rottne H8D", "Rottne H8E Logmax", "Rottne H8E 2026", "Scorpion King gammal"):
        mm = sorted({o["rapportdatum"][:7] for o in O if o["maskin_namn"] == mn and o["rapportdatum"] and o["status"] == "ok"})
        if not mm:
            continue
        ar0, ar1 = mm[0], mm[-1]
        alla, y, m = [], int(ar0[:4]), int(ar0[5:7])
        while f"{y}-{m:02d}" <= ar1:
            alla.append(f"{y}-{m:02d}")
            m += 1
            if m > 12:
                y, m = y + 1, 1
        tom = [x for x in alla if x not in mm]
        ut.append(f"- **{mn}** ({ar0} till {ar1}): {len(tom)} av {len(alla)} månader saknar rapport" + (": " + ", ".join(tom) if tom else ""))
    print("\n".join(ut))
    (IMP / "rapport_4b.md").write_text("\n".join(ut) + "\n", "utf-8")


if __name__ == "__main__":
    main()
