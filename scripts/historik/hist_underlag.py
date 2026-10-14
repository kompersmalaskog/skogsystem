"""Steg 8 DEL A punkt 1: vilka produktionsrapporter finns (pdf/prt/xps), hur många och hur stora. Skriver hist_rapporter_underlag.csv i
importmappen (sha256, format, maskin, filtyp, MB, tolkad, exkluderad). Ingen databas, ingen uppladdning."""
import csv
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
EGNA_EJ = ("exkludera", "Extern", "okopplad")


def las(fn):
    with open(IMP / fn, encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def fil_av(sha, bil, pdf):
    if sha in bil:
        return IMP / "bilagor" / bil[sha], os.path.splitext(bil[sha])[1].lower().lstrip(".")
    if sha + ".pdf" in pdf:
        return IMP / "pdf" / (sha + ".pdf"), "pdf"
    return None, ""


def main():
    inv = {r["sha256"]: r for r in las("inventering.csv")}
    bil = {os.path.splitext(f)[0]: f for f in os.listdir(IMP / "bilagor")}
    pdf = set(os.listdir(IMP / "pdf"))
    uni = {}   # sha -> dict(maskin_namn, format, orsak, exk, filnamn)
    for r in las("rapport_maskin.csv"):
        n = r["maskin_namn"]
        exk = n == "exkludera" or n.startswith("Extern")
        uni[r["sha256"]] = dict(maskin_namn="" if exk else n, format=r["format"], exk=exk,
                                orsak=(("extern entreprenör: " + n) if n.startswith("Extern") else "exkluderad: " + r["orsak"]) if exk else "", filnamn=r["filnamn"])
    for r in las("rapport_maskin_tillagg.csv"):
        uni.setdefault(r["sha256"], dict(maskin_namn=r["maskin_namn"], format=r["format"], exk=False, orsak="", filnamn=r["filnamn"]))
    O = las("objekt.csv")
    tolkad, status = set(), {}
    for o in O:
        if o["format"] == "ponsse_skift_objekt":
            continue
        tolkad.add(o["sha256"])
        if o["sha256"] not in uni:
            uni[o["sha256"]] = dict(maskin_namn=o["maskin_namn"], format=o["format"], exk=False, orsak="", filnamn=o["filnamn"])
        if o["status"] == "exkludera":
            u = uni[o["sha256"]]
            u["exk"], u["orsak"] = True, "exkluderad: tidsavgränsad rapport (dubbelräknar volym)"
            u["maskin_namn"] = u["maskin_namn"] or o["maskin_namn"]
        elif uni[o["sha256"]]["maskin_namn"] == "":
            uni[o["sha256"]]["maskin_namn"] = o["maskin_namn"]
    S = {r["sha256"] for r in las("skift.csv")}
    rader = []
    for sha, u in uni.items():
        sokv, typ = fil_av(sha, bil, pdf)
        mb = round(sokv.stat().st_size / 1e6, 4) if sokv else 0
        rader.append(dict(sha256=sha, format=u["format"], maskin_namn=u["maskin_namn"], filtyp=typ, mb=mb, tolkad="ja" if sha in tolkad or sha in S else "nej",
                          exkluderad="ja" if u["exk"] else "nej", exkluderad_orsak=u["orsak"], filnamn=inv.get(sha, {}).get("filnamn", u["filnamn"])))
    with open(IMP / "hist_rapporter_underlag.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rader[0]))
        w.writeheader()
        w.writerows(sorted(rader, key=lambda x: (x["maskin_namn"], x["sha256"])))
    ik = [r for r in rader if r["exkluderad"] == "nej"]
    ex = [r for r in rader if r["exkluderad"] == "ja"]
    print(f"alla produktionsrapporter: {len(rader)} st, {sum(r['mb'] for r in rader):.1f} MB")
    print(f"  exkluderade: {len(ex)} st, {sum(r['mb'] for r in ex):.1f} MB   ej exkluderade: {len(ik)} st, {sum(r['mb'] for r in ik):.1f} MB")
    print("  exkluderade per orsak:", Counter(r["exkluderad_orsak"] for r in ex).most_common(8))
    for k in ("filtyp", "format", "maskin_namn", "tolkad"):
        c, m = Counter(), Counter()
        for r in ik:
            c[r[k]] += 1
            m[r[k]] += r["mb"]
        print(f"{chr(10)}ej exkluderade per {k}:")
        for v, n in c.most_common():
            print(f"  {v or '-':40s} {n:6d}  {m[v]:8.1f} MB")
    print(chr(10) + "saknar fil på disk:", sum(1 for r in rader if not r["filtyp"]))


if __name__ == "__main__":
    main()
