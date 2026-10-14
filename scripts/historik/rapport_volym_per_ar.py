"""Volym m3fub per år och maskin för alla maskiner (skördare och skotare i skilda tabeller). Läser skift.csv/objekt.csv."""
import csv
import collections
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
SKOTARE = {"Komatsu 840.4", "Komatsu 860.4", "Komatsu 830.3", "Komatsu 875", "Elephant King gammal", "Elephant King ny", "Ponsse Wisent"}


def main():
    S = list(csv.DictReader(open(IMP / "skift.csv", encoding="utf-8-sig")))
    O = list(csv.DictReader(open(IMP / "objekt.csv", encoding="utf-8-sig")))
    V = collections.defaultdict(float)
    kalla = {}
    for s in S:
        if s["format"] == "maxixplorer_drf" and s["volym_m3fub"] != "":
            V[(s["maskin_namn"], s["datum"][:4])] += float(s["volym_m3fub"])
            kalla[s["maskin_namn"]] = "skiftrader (Komatsu)"
    antal = collections.Counter()
    for o in O:
        if o["format"] == "maxixplorer_drf" or o["status"] != "ok" or o["senaste_for_nyckel"] != "ja" or o["volym_m3fub"] == "":
            continue
        V[(o["maskin_namn"], o["rapportdatum"][:4])] += float(o["volym_m3fub"])
        antal[o["maskin_namn"]] += 1
        kalla.setdefault(o["maskin_namn"], "objekttotaler, senaste rapport per objekt")
    ars = sorted({k[1] for k in V})
    ut = []
    for titel, filt in (("Skördare", lambda m: m not in SKOTARE), ("Skotare", lambda m: m in SKOTARE)):
        ms = sorted({k[0] for k in V if filt(k[0])})
        ut.append(f"### {titel} — volym m3fub per år")
        ut.append("| År | " + " | ".join(ms) + " |")
        ut.append("|---|" + "---|" * len(ms))
        for y in ars:
            if any(V[(m, y)] for m in ms):
                ut.append(f"| {y} | " + " | ".join(f"{V[(m, y)]:,.0f}".replace(",", " ") if V[(m, y)] else "" for m in ms) + " |")
        ut.append("| **Totalt** | " + " | ".join(f"**{sum(V[(m, y)] for y in ars):,.0f}**".replace(",", " ") for m in ms) + " |")
        ut.append("")
    ut.append("Källa per maskin: " + "; ".join(f"{m}: {k}" for m, k in sorted(kalla.items())))
    print("\n".join(ut))


if __name__ == "__main__":
    main()
