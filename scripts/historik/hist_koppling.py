"""Steg 13 punkt 6: koppla skotarrapporter till skördarrapporter (skotad volym = avverkad volym). Ingen databas skrivs; läser hist_csv/hist_objekt.csv
(+ en CSV-kopia av Skogsystems dim_objekt, hämtad med bara läsning, för metod a) och skriver hist_csv/hist_skotare_koppling.csv.

Ordning (en länk får den första metod som träffar):
  a  samma objekt i Skogsystem (rapporter från 2025-07 och framåt): objektnr = dim_objekt.vo_nummer eller samma normaliserade namn
  b  samma objektnr / VO-nummer (utan skräpvärden)
  c  namn med likhet >= 0,9 och skotningen inom 0-120 dagar efter avverkningen (skotningen börjar inte före avverkningens start)
Många-till-många. Kontroll: för skotare med riktig volym (Komatsu-skotare, Elephant King, Wisent före 2024-09) jämförs skotarens volym med skördarens per
sammanhängande grupp av länkar (komponent), per metod.
Kör: python hist_koppling.py [dim_objekt.csv]   (kolumner vo_nummer|object_name|fran|till)
"""
import csv
import statistics
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bygg_skift as BS  # noqa: E402  (lik)
import effektivitet as EF  # noqa: E402  (norm_obj)

OUT = BS.IMP / "hist_csv"
SKRAP_NR = {"", "-", "0", "12345", "98765", "98765 12345", "1234"}
RIKTIG_VOLYM = ("Komatsu 830.3", "Komatsu 840.4", "Komatsu 860.4", "Komatsu 875", "Elephant King gammal", "Elephant King ny", "Ponsse Wisent")
WISENT_RIKTIG_TILL = "2024-09-01"


def iso(s):
    try:
        return date.fromisoformat((s or "")[:10])
    except ValueError:
        return None


def dagar(o):
    return iso(o["startdatum"] or o["rapportdatum"]), iso(o["slutdatum"] or o["rapportdatum"])


def nr_ok(n):
    n = (n or "").strip()
    return n not in SKRAP_NR and len(n) >= 4 and not (n.isdigit() and len(set(n)) == 1)


def main():
    dim_fil = sys.argv[1] if len(sys.argv) > 1 else None
    typ_av = {m["namn"]: m["typ"] for m in csv.DictReader(open(OUT / "hist_maskin.csv", encoding="utf-8"))}
    rader = [o for o in csv.DictReader(open(OUT / "hist_objekt.csv", encoding="utf-8")) if o["raknas"] in ("true", "True") and o["maskin_namn"]]
    harv = [o for o in rader if typ_av[o["maskin_namn"]] == "skördare" and o["volym_m3fub"] not in ("", "0")]
    skot = [o for o in rader if typ_av[o["maskin_namn"]] == "skotare"]
    for o in harv + skot:
        o["_n"] = EF.norm_obj(o["objekt"])
        o["_d0"], o["_d1"] = dagar(o)
    print(f"skördarrapporter med volym {len(harv)}, skotarrapporter {len(skot)}")

    # ----- a: Skogsystem
    dim = []
    if dim_fil:
        for d in csv.DictReader(open(dim_fil, encoding="utf-8"), delimiter="|"):
            d["_n"], d["_f"], d["_t"] = EF.norm_obj(d["object_name"]), iso(d["fran"]), iso(d["till"])
            dim.append(d)
    dim_nr = {d["vo_nummer"] for d in dim}

    def dim_nycklar(o):
        """Skogsystem-objekt (vo_nummer) som rapporten hör till: samma objektnr, eller namn med likhet >= 0,9 (och tider som överlappar +-30 dagar om dim har tider)."""
        d0, d1 = o["_d0"], o["_d1"]
        if not d1 or d1 < date(2025, 11, 15):
            return set()
        k = set()
        if o["objektnr"] in dim_nr:
            k.add(o["objektnr"])
        if len(o["_n"]) >= 4:
            for d in dim:
                if len(d["_n"]) < 4 or d["vo_nummer"] in k:
                    continue
                if d["_f"] and d0 and ((d0 - d["_t"]).days > 30 or (d["_f"] - d1).days > 30):
                    continue
                if BS.lik(o["objekt"], d["object_name"]) >= 0.9:
                    k.add(d["vo_nummer"])
        return k

    hd, hn = defaultdict(list), defaultdict(list)
    for h in harv:
        for k in dim_nycklar(h):
            hd[k].append(h)
        if nr_ok(h["objektnr"]):
            hn[h["objektnr"]].append(h)
    lank = {}  # (skotare_sha, skordare_sha) -> (metod, sakerhet)
    for s in skot:
        for k in dim_nycklar(s):
            for h in hd.get(k, []):
                lank.setdefault((s["sha256"], h["sha256"]), ("a", 1.0))
        if nr_ok(s["objektnr"]):
            for h in hn.get(s["objektnr"], []):
                lank.setdefault((s["sha256"], h["sha256"]), ("b", 0.95))
    n_ab = len(lank)
    # ----- c: namn + tid
    for s in skot:
        if len(s["_n"]) < 4 or not s["_d0"]:
            continue
        for h in harv:
            if (s["sha256"], h["sha256"]) in lank or len(h["_n"]) < 4 or not h["_d0"]:
                continue
            if s["_d0"] < h["_d0"] or (s["_d0"] - h["_d1"]).days > 120:
                continue
            l = BS.lik(s["objekt"], h["objekt"])
            if l >= 0.9:
                lank[(s["sha256"], h["sha256"])] = ("c", round(l, 3))
    with open(OUT / "hist_skotare_koppling.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["skotare_sha256", "skordare_sha256", "metod", "sakerhet"])
        for (s, h), (m, sak) in sorted(lank.items()):
            w.writerow([s, h, m, sak])
    por = defaultdict(int)
    for v in lank.values():
        por[v[0]] += 1
    print(f"länkar: {dict(por)} (a+b {n_ab}, c {len(lank) - n_ab}); skotarrapporter med minst en länk: {len({s for s, _ in lank})} av {len(skot)}")

    # ----- kontroll: volym skotare mot skördare per komponent och metod
    vol = {o["sha256"]: float(o["volym_m3fub"]) for o in harv}
    def riktig(o):
        """Skotarrapport med en angiven volym som inte är schablon (laster x 1 m3 / 10 m3). Wisent delas i före/efter 2024-09 i redovisningen (maskinnamn märks)."""
        return o["maskin_namn"] in RIKTIG_VOLYM and not o["volym_kvalitet"] and o["volym_m3fub"] not in ("", "0")

    def grupp_namn(o):
        if o["maskin_namn"] == "Ponsse Wisent":
            return "Ponsse Wisent " + ("före 2024-09" if (o["startdatum"] or o["rapportdatum"]) < WISENT_RIKTIG_TILL else "från 2024-09")
        return o["maskin_namn"]

    sk_by = {o["sha256"]: o for o in skot}
    rapport = []
    for metod in ("a", "b", "c"):
        par = [(s, h) for (s, h), (m, _) in lank.items() if m == metod and riktig(sk_by[s])]
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
        dev, per_maskin = [], defaultdict(list)
        for ss, hh in komp.values():
            vs = sum(float(sk_by[x]["volym_m3fub"]) for x in ss)
            vh = sum(vol[x] for x in hh)
            if vh > 0:
                d = 100 * (vs - vh) / vh
                dev.append(d)
                for x in ss:
                    per_maskin[grupp_namn(sk_by[x])].append(d)
        def pc(v, p):
            v = sorted(v)
            return v[min(len(v) - 1, int(p * len(v)))] if v else None
        rapport.append((metod, len(par), len(komp), dev, per_maskin, pc))
        print(f"\n== metod {metod}: {len(par)} länkar med riktig skotarvolym, {len(komp)} grupper")
        if dev:
            print(f"   avvikelse skotare mot skördare (%): median {statistics.median(dev):+.1f}, p25 {pc(dev, .25):+.1f}, p75 {pc(dev, .75):+.1f}, p10 {pc(dev, .10):+.1f}, p90 {pc(dev, .90):+.1f}")
            for g in (5, 10, 20):
                print(f"   inom ±{g} %: {100 * sum(1 for d in dev if abs(d) <= g) / len(dev):.0f} % av grupperna")
            for m, v in sorted(per_maskin.items()):
                print(f"   {m:22} n={len(v):4} median {statistics.median(v):+.1f} p25 {pc(v, .25):+.1f} p75 {pc(v, .75):+.1f}")


if __name__ == "__main__":
    main()
