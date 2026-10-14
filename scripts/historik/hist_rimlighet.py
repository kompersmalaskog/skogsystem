"""Steg 14 DEL A: rimlighet för G15 per maskin och år + dubbelräkning av Ponsse lastcertifikat. Läser bara lokala CSV/JSONL, skriver ingenting till databasen.
Lastcertifikat delas efter antal rader i 'Objektpostval': 1 = objektcertifikat, >=2 = månads-/periodcertifikat (flera objekt)."""
import csv
import json
import re
import statistics
import sys
from pathlib import Path as _P
sys.path.insert(0, str(_P(__file__).parent))
from collections import defaultdict
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
OUT = IMP / "hist_csv"


def lastcert_info():
    """sha -> {n_obj, start, slut} ur texter.jsonl (bara lastcertifikat)."""
    ut = {}
    for l in open(IMP / "texter.jsonl", encoding="utf-8"):
        o = json.loads(l)
        t = o.get("text") or ""
        if not t.startswith("Lastcertifikat"):
            continue
        rader = t.split("\n")
        i = next((k for k, x in enumerate(rader) if x.startswith("Objektpostval")), None)
        if i is None:
            continue
        n = 0
        for x in rader[i + 2:]:
            if x.startswith("Lagerspecifik"):
                break
            if x.strip():
                n += 1
        datum = re.findall(r"^(\d{4}-\d\d-\d\d)(?:Slutdatum|Startdatum)?$", t, re.M)
        ut[o["sha"]] = dict(n_obj=n, datum=sorted(set(datum)))
    return ut


_TEXT = None


def _lik(a, b):
    import bygg_skift
    return bygg_skift.lik(a, b)


MANADER = {"januari": 1, "februari": 2, "mars": 3, "april": 4, "maj": 5, "juni": 6, "juli": 7, "augusti": 8, "september": 9, "oktober": 10, "november": 11, "december": 12}


def manad_ur_filnamn(fn):
    m = re.match(r"^\s*([^\W\d_]+)\s*(\d\d)", fn or "")
    if m and m.group(1).lower() in MANADER:
        return 2000 + int(m.group(2)), MANADER[m.group(1).lower()]
    return None


def foresla_raknas(obj, rap):
    """Rättning av raknas för Ponsse lastcertifikat. Returnerar {sha: (orsak, dubblett_av)} för rapporter som bör sluta räknas.
    R1  objektcertifikat med G15 (+-0,3 h) och datum (+-10 dagar) lika med en maskinspecifik summering = samma jobb -> dubblett av summeringen
    R2  månadscertifikat (tomt objekt + månad i filnamnet) räknas bara om maskinen saknar annan räknad rapport med startdatum/rapportdatum i den månaden"""
    import datetime as dt
    d = lambda x: dt.date.fromisoformat(x[:10])
    g = lambda o: float(o["g15_h"] or 0)
    ut = {}
    per_m = defaultdict(list)
    for o in obj:
        if o["raknas"] in ("true", "True") and o["maskin_namn"]:
            per_m[o["maskin_namn"]].append(o)
    for mk, lst in per_m.items():
        ms = [o for o in lst if rap[o["sha256"]]["format"] == "ponsse_maskinspecifik_summering" and g(o) > 0]
        lcs = [o for o in lst if rap[o["sha256"]]["format"] == "lastcertifikat"]
        if not ms or not lcs:
            continue
        # R1: parvis, bästa (minsta G15-skillnad) först, en tvilling per certifikat och tvärtom
        from hist_objektnr_text import las_text
        global _TEXT
        if _TEXT is None:
            _TEXT = las_text()
        tok = lambda t: set(re.findall(r"(?<!\d)(\d{6}|\d{8})(?!\d)", t)) - {"12345", "98765"}
        kand = []
        for l in lcs:
            if manad_ur_filnamn(rap[l["sha256"]]["filnamn"]) and not l["objekt"]:
                continue
            for m in ms:
                dd = abs((d(m["rapportdatum"]) - d(l["rapportdatum"])).days)
                dg = abs(g(m) - g(l))
                if dd > 5:
                    continue
                rel = dg / max(g(m), g(l))
                namn = l["objekt"] not in ("", "98765 12345") and m["objekt"] not in ("", "-") and _lik(l["objekt"], m["objekt"]) >= 0.6
                delat = bool(tok(_TEXT.get(l["sha256"], "")) & tok(_TEXT.get(m["sha256"], "")))
                if dg <= 0.005 and dd <= 1:
                    ok = True
                elif dg <= 0.04 or rel <= 0.025:
                    ok = namn or delat
                else:
                    ok = False
                if ok:
                    kand.append((dg, dd, l["sha256"], m["sha256"]))
        tagna_l, tagna_m = set(), set()
        for dg, dd, ls, ms_ in sorted(kand):
            if ls in tagna_l or ms_ in tagna_m:
                continue
            tagna_l.add(ls)
            tagna_m.add(ms_)
            ut[ls] = ("R1: samma jobb som maskinspecifik summering", ms_)
        kvar = [o for o in lst if o["sha256"] not in ut]
        tackta = {(d(o["startdatum"] or o["rapportdatum"]).year, d(o["startdatum"] or o["rapportdatum"]).month) for o in kvar
                  if not (rap[o["sha256"]]["format"] == "lastcertifikat" and not o["objekt"] and manad_ur_filnamn(rap[o["sha256"]]["filnamn"]))}
        for l in lcs:
            ym = manad_ur_filnamn(rap[l["sha256"]]["filnamn"])
            if ym and not l["objekt"]:
                # månaden täcks om minst en objektrapport ligger i månaden eller månaden efter (certifikaten skickas i efterhand)
                if ym in tackta:
                    ut[l["sha256"]] = ("R2: månadscertifikat, objektrapporter finns samma månad", "")
    return ut


def main():
    mt = {m["namn"]: m["typ"] for m in csv.DictReader(open(OUT / "hist_maskin.csv", encoding="utf-8"))}
    rap = {r["sha256"]: r for r in csv.DictReader(open(OUT / "hist_rapport.csv", encoding="utf-8"))}
    obj = [o for o in csv.DictReader(open(OUT / "hist_objekt.csv", encoding="utf-8")) if o["maskin_namn"] in mt]
    lc = lastcert_info()
    foresl = foresla_raknas(obj, rap)

    def klass(o):
        f = rap[o["sha256"]]["format"]
        if f == "lastcertifikat":
            return "lastcert månad/period" if (not o["objekt"] and manad_ur_filnamn(rap[o["sha256"]]["filnamn"])) else "lastcert objekt"
        return f

    def ar(o):
        return (o["startdatum"] or o["rapportdatum"])[:4]
    ja = lambda o: o["raknas"] in ("true", "True")
    print("== A1: Ponsse Wisent, G15 per år, format och raknas (nu) och efter förslag")
    a = defaultdict(lambda: [0, 0.0])
    for o in obj:
        if o["maskin_namn"] != "Ponsse Wisent":
            continue
        k = (ar(o), klass(o), ja(o), o["sha256"] in foresl)
        a[k][0] += 1
        a[k][1] += float(o["g15_h"] or 0)
    for k, v in sorted(a.items()):
        if k[2] or True:
            print(f"{k[0]}  {k[1]:24} raknas={'ja ' if k[2] else 'nej'} förslag_bort={'ja ' if k[3] else 'nej'} n={v[0]:4} G15={v[1]:8.1f}")
    for y in sorted({k[0] for k in a}):
        nu = sum(v[1] for k, v in a.items() if k[0] == y and k[2])
        ef = sum(v[1] for k, v in a.items() if k[0] == y and k[2] and not k[3])
        print(f"  {y}: nu {nu:.1f} h -> efter förslag {ef:.1f} h")
    print("\n== A2: G15 mot timräknare, alla maskiner och år")
    print("Ponsse: räknare = livstid_h (skillnad mellan årets första och sista rapport med räknare, G15 räknas då bara över samma tidsfönster). Övriga: räknare saknas, jämförs mot summan av rapporternas motortid_h.")
    rows = defaultdict(lambda: dict(g15=0.0, g15_ef=0.0, mot=0.0, n=0, liv=[], rg=[]))
    for o in obj:
        if not ja(o):
            continue
        k = (o["maskin_namn"], ar(o))
        r = rows[k]
        gg = float(o["g15_h"] or 0)
        r["g15"] += gg
        if o["sha256"] not in foresl:
            r["g15_ef"] += gg
        r["mot"] += float(o["motortid_h"] or 0)
        r["n"] += 1
        r["rg"].append((o["rapportdatum"], gg, o["sha256"] in foresl))
        if o["livstid_h"]:
            r["liv"].append((o["rapportdatum"], float(o["livstid_h"])))
    print(f"{'maskin':22}{'år':6}{'n':>5}{'G15 nu':>9}{'G15 efter':>10}{'timmar':>9}{'källa':>9}{'kvot nu':>9}{'kvot efter':>11}  flagga")
    for (mk, y), r in sorted(rows.items()):
        if mt.get(mk) is None or r["g15"] == 0:
            continue
        if r["liv"]:
            liv = sorted(r["liv"])
            span = (dt_(liv[-1][0]) - dt_(liv[0][0])).days
            diff = liv[-1][1] - liv[0][1]
            tim = diff
            kalla = "räknare"
            # bara G15 från rapporter efter årets första och till och med årets sista räknarvärde (samma tidsfönster som räknarens skillnad)
            win = [x for x in r["rg"] if liv[0][0] < x[0] <= liv[-1][0]]
            r["g15"] = sum(x[1] for x in win)
            r["g15_ef"] = sum(x[1] for x in win if not x[2])
        elif r["mot"] > 0:
            tim, kalla = r["mot"], "motortid"
        else:
            tim, kalla = None, "saknas"
        kv = f"{r['g15'] / tim:9.2f}" if tim else "        -"
        kv2 = f"{r['g15_ef'] / tim:11.2f}" if tim else "          -"
        fl = []
        if tim and r["g15"] > tim:
            fl.append("G15 > timmar")
        if r["g15"] > 3000:
            fl.append("G15 > 3000 h")
        print(f"{mk:22}{y:6}{r['n']:5}{r['g15']:9.0f}{r['g15_ef']:10.0f}{(f'{tim:9.0f}' if tim else '        -')}{kalla:>9}{kv}{kv2}  {', '.join(fl)}")
    with open(OUT / "hist_foreslagen_raknas_steg14.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "orsak", "dubblett_av"])
        for sha, (orsak, dub) in sorted(foresl.items()):
            w.writerow([sha, orsak, dub])
    print("\nförslag: ", len(foresl), "rapporter slutar räknas:", {o: sum(1 for v in foresl.values() if v[0].startswith(o)) for o in ("R1", "R2")})


def dt_(x):
    import datetime
    return datetime.date.fromisoformat(x[:10])



def fore_efter(maskiner=("Ponsse Wisent", "Elephant King gammal", "Elephant King ny")):
    """Före/efter förslaget: G15, lass, volym, bränsle, avbrott per maskin och år. Efter = räknade rader utan de borttagna, där en räknad summering
    får lass och volym från sin lastcertifikat-tvilling (R1). Volym är rapportens råa volym (före Wisent-regeln 'lass utan storlek')."""
    rap = {r["sha256"]: r for r in csv.DictReader(open(OUT / "hist_rapport.csv", encoding="utf-8"))}
    obj = {o["sha256"]: o for o in csv.DictReader(open(OUT / "hist_objekt.csv", encoding="utf-8"))}
    foresl = {r["sha256"]: (r["orsak"], r["dubblett_av"]) for r in csv.DictReader(open(OUT / "hist_foreslagen_raknas_steg14.csv", encoding="utf-8"))}
    for sha in foresl:
        obj[sha]["raknas"] = "true"  # före steg 14 räknades de
    skift_lass = defaultdict(float)
    harskift = set()
    for s in csv.DictReader(open(OUT / "hist_skift.csv", encoding="utf-8")):
        if s["antal_lass"]:
            skift_lass[s["sha256"]] += float(s["antal_lass"])
            harskift.add(s["sha256"])
    tvilling = {v[1]: k for k, v in foresl.items() if v[0].startswith("R1")}
    f = lambda x: float(x) if x not in ("", None) else 0.0

    def lass(o):
        sha = o["sha256"]
        return skift_lass[sha] if sha in harskift else f(o["antal_lass"])

    def avb(o):
        return f(o["avbrott_totalt_min"]) / 60

    sum_ = defaultdict(lambda: [0.0] * 10)
    for sha, o in obj.items():
        if o["maskin_namn"] not in maskiner or o["raknas"] not in ("true", "True"):
            continue
        y = (o["startdatum"] or o["rapportdatum"])[:4]
        for lage, aktiv in (("fore", True), ("efter", sha not in foresl)):
            if not aktiv:
                continue
            v = sum_[(o["maskin_namn"], y)]
            i = 0 if lage == "fore" else 5
            l, vol = lass(o), f(o["volym_m3fub"])
            if lage == "efter" and sha in tvilling:
                t = obj[tvilling[sha]]
                l = lass(t) if (lass(t) or True) else l
                vol = f(t["volym_m3fub"]) if t["volym_m3fub"] else vol
            v[i] += f(o["g15_h"])
            v[i + 1] += l
            v[i + 2] += vol
            v[i + 3] += f(o["bransle_l"])
            v[i + 4] += avb(o)
    print(f"{'maskin':22}{'år':6}| {'G15 före':>9}{'lass':>7}{'volym':>9}{'bränsle':>9}{'avbr h':>8} | {'G15 efter':>9}{'lass':>7}{'volym':>9}{'bränsle':>9}{'avbr h':>8}")
    for (mk, y), v in sorted(sum_.items()):
        print(f"{mk:22}{y:6}| " + "".join(f"{x:{w}.0f}" for x, w in zip(v[:5], (9, 7, 9, 9, 8))) + " | " + "".join(f"{x:{w}.0f}" for x, w in zip(v[5:], (9, 7, 9, 9, 8))))


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "fore_efter":
    fore_efter()


if __name__ == "__main__" and len(sys.argv) == 1:
    main()


def tillampa():
    """Skriver förslaget (R1/R2) in i lokala hist_objekt.csv så att den motsvarar databasen efter steg 14. Idempotent: kör efter hist_raknas.py."""
    rap = {r["sha256"]: r for r in csv.DictReader(open(OUT / "hist_rapport.csv", encoding="utf-8"))}
    fn = OUT / "hist_objekt.csv"
    rader = list(csv.DictReader(open(fn, encoding="utf-8")))
    foresl = foresla_raknas(rader, rap)
    n = 0
    for o in rader:
        v = foresl.get(o["sha256"])
        if v and o["raknas"] in ("true", "True"):
            o["raknas"] = "false"
            o["dubblett_av"] = v[1]
            n += 1
    with open(fn, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rader[0]))
        w.writeheader()
        w.writerows(rader)
    print("tillämpade", n, "rader i hist_objekt.csv")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "tillampa":
    tillampa()
