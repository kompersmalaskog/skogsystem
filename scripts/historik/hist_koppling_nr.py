"""Steg 14 DEL C: koppla skotarobjekt till skördarobjekt med samma objektnummer (hist_objektnr.csv: 6- och 8-siffriga nummer). Ingen databas.
Kontroll där skotaren har riktig volym: Komatsu-skotare, Elephant King, Wisent före 2024-09. En grupp = sammanhängande skotare/skördare som delar nummer.
Skriver hist_csv/hist_skotare_koppling_nr.csv (skotare_sha256, skordare_sha256, nummer, nummerslag)."""
import csv
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hist_objektnr import OUT  # noqa: E402

RIKTIG = ("Komatsu 830.3", "Komatsu 840.4", "Komatsu 860.4", "Komatsu 875", "Elephant King gammal", "Elephant King ny", "Ponsse Wisent")


def main():
    mt = {m["namn"]: m["typ"] for m in csv.DictReader(open(OUT / "hist_maskin.csv", encoding="utf-8"))}
    obj = {o["sha256"]: o for o in csv.DictReader(open(OUT / "hist_objekt.csv", encoding="utf-8")) if o["maskin_namn"] and o["raknas"] in ("true", "True")}
    nr = {r["sha256"]: [x for x in r["objektnr_alla"].split(";") if x] for r in csv.DictReader(open(OUT / "hist_objektnr.csv", encoding="utf-8"))}
    harv = {s for s, o in obj.items() if mt[o["maskin_namn"]] == "skördare" and o["volym_m3fub"] not in ("", "0")}
    skot = {s for s, o in obj.items() if mt[o["maskin_namn"]] == "skotare"}
    idx_h, idx_s = defaultdict(set), defaultdict(set)
    for s in harv:
        for n in nr.get(s, []):
            idx_h[n].add(s)
    for s in skot:
        for n in nr.get(s, []):
            idx_s[n].add(s)
    # nummer som delas av väldigt många rapporter på samma sida är inte unika objekt
    fan = sorted((len(idx_h[n]) + len(idx_s[n]), n) for n in set(idx_h) & set(idx_s))
    print("delade nummer:", len(fan), "; största fan-out:", fan[-5:])
    stor = {n for c, n in fan if c > 12}
    par = {}
    for n in set(idx_h) & set(idx_s) - stor:
        for s in idx_s[n]:
            for h in idx_h[n]:
                par.setdefault((s, h), []).append(n)
    print("par skotare-skördare:", len(par), "; skotarrapporter med koppling:", len({s for s, _ in par}), "av", len(skot), "; skördarrapporter:", len({h for _, h in par}), "av", len(harv))
    with open(OUT / "hist_skotare_koppling_nr.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["skotare_sha256", "skordare_sha256", "nummer", "nummerslag"])
        for (s, h), ns in sorted(par.items()):
            w.writerow([s, h, ";".join(sorted(ns)), "/".join(sorted({str(len(x)) for x in ns}))])
    # komponenter
    foralder = {}

    def find(x):
        while foralder.setdefault(x, x) != x:
            foralder[x] = foralder[foralder[x]]
            x = foralder[x]
        return x
    for s, h in par:
        foralder[find("s" + s)] = find("h" + h)
    komp = defaultdict(lambda: [set(), set()])
    for s, h in par:
        r = find("s" + s)
        komp[r][0].add(s)
        komp[r][1].add(h)

    def riktig(o):
        if o["maskin_namn"] not in RIKTIG or o["volym_kvalitet"] or o["volym_m3fub"] in ("", "0"):
            return False
        return o["maskin_namn"] != "Ponsse Wisent" or (o["startdatum"] or o["rapportdatum"]) < "2024-09-01"
    print(f"{'grupp':28}{'n':>5}{'median':>8}{'p25':>7}{'p75':>7}{'p10':>7}{'p90':>7}{'±5%':>6}{'±10%':>6}{'±20%':>6}")
    dev = defaultdict(list)
    for ss, hh in komp.values():
        if not all(riktig(obj[s]) for s in ss):
            continue
        vs = sum(float(obj[s]["volym_m3fub"]) for s in ss)
        vh = sum(float(obj[h]["volym_m3fub"]) for h in hh)
        if vh <= 0:
            continue
        d = 100 * (vs - vh) / vh
        dev["alla"].append(d)
        for mk in {obj[s]["maskin_namn"] for s in ss}:
            dev[mk].append(d)
        sl = {len(x) for s in ss for x in par_nr(par, s)}
        dev["nummer " + "/".join(sorted(map(str, sl)))].append(d)

    def pc(v, p):
        v = sorted(v)
        return v[min(len(v) - 1, int(p * len(v)))]
    for k, v in sorted(dev.items(), key=lambda kv: (kv[0] != "alla", kv[0])):
        if len(v) < 1:
            continue
        a = lambda g: 100 * sum(1 for d in v if abs(d) <= g) / len(v)
        print(f"{k:28}{len(v):5}{statistics.median(v):+8.1f}{pc(v, .25):+7.1f}{pc(v, .75):+7.1f}{pc(v, .1):+7.1f}{pc(v, .9):+7.1f}{a(5):6.0f}{a(10):6.0f}{a(20):6.0f}")


def par_nr(par, s):
    return [n for (ss, _), ns in par.items() if ss == s for n in ns]


if __name__ == "__main__":
    main()
