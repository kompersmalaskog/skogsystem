"""Steg 2: parser för maxixplorer_drf (ingen databas).

Läser fulltexten (alla sidor) för varje maxixplorer_drf som inte är exkluderad i rapport_maskin.csv och skriver
i importmappen: skift.csv, objekt.csv, avvikelser.csv.

Rapporterna finns i två varianter: skördare (stammar, volym 2a/2b) och skotare (lass, vikt, volym 402 = fub).
Volym är alltid under bark: kolumnen "Volym (2b+102b)" (äldre rapporter: "(2b)"; skotare: volym fub).
Textlagret har ibland blanksteg mitt i tal ("244 ,369", "3739,3 23", "8 26") — se tal_tokens().

Användning: python parse_maxixplorer.py [--fulltext maxi_full.jsonl]
Fulltexten skapas med pypdf (alla sidor) om filen saknas.
"""
import argparse
import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
T5 = r"(\d+:\d\d) (\d+:\d\d) (\d+:\d\d) (\d+:\d\d) (\d+:\d\d)"
DATE_ROW = re.compile(r"^(\d{4}-\d\d-\d\d) (\d\d:\d\d) (\d\d:\d\d) " + T5 + r"(?: (.*))?$")
DRIVER_ROW = re.compile(r"^(?:(.*?) )?" + T5 + r"(?: (.*))?$")
TOT_ROW = re.compile(r"^Totalt " + T5 + r"(?: (.*))?$")
HEADER_WORDS = {"Volym", "Bränsle", "Antal", "lass", "Vikt", "Stammar", "Extratid", "Objekt", "ton", "Förare", "Datum"}
SKIP_PREFIX = ("Driftsrapport", "Kompersmåla Skog", "Produktion", "Skifttider", "Avbrott")


def fix_tal(s):
    """Lägger ihop tal som splittrats av textlagret: '244 ,369' och '97, 288' -> kommatecknet ska sitta ihop."""
    s = re.sub(r"(?<=\d) ,(?=\d)", ",", s)
    s = re.sub(r"(?<=\d), (?=\d)", ",", s)
    return s


def tal_tokens(rest, forwarder=False):
    """-> (heltal_före, decimaler, heltal_efter) för en skift-/totalrad efter tidskolumnerna.

    Textlagret kan splittra siffror mitt i tal ("20 2,129" = 202,129, "2 77,077" = 277,077, "8 26" = 826).
    Decimaltal har exakt 3 decimaler. Heltal mellan två decimaltal hör till det andra decimaltalet. Heltal före första
    decimaltalet delas mellan antal (stammar/lass) och första decimaltalets heltalsdel: den delning väljs där
    förhållandet mellan de två volymerna är rimligt (2a/2b resp. volym/vikt 0,9-1,6)."""
    toks = fix_tal(rest or "").split()
    for n_, t_ in enumerate(toks):  # tal slutar där text (objektnamn) börjar
        if not re.fullmatch(r"\d+(,\d+)?", t_):
            toks = toks[:n_]
            break
    out, i = [], 0
    while i < len(toks):
        t = toks[i]
        m = re.fullmatch(r"(\d+),(\d{1,2})", t)
        if m and i + 1 < len(toks) and re.fullmatch(r"\d+", toks[i + 1]) and len(m.group(2)) + len(toks[i + 1]) == 3:
            t, i = t + toks[i + 1], i + 1
        out.append(t)
        i += 1
    seg = [[]]
    decs = []
    for t in out:
        if re.fullmatch(r"\d+,\d{3}", t):
            decs.append(t)
            seg.append([])
        elif re.fullmatch(r"\d+", t):
            seg[-1].append(t)
    if not decs:
        return "".join(seg[0]), [], ""
    pre = seg[0]
    vals = [None] * len(decs)
    for j in range(1, len(decs)):
        vals[j] = float(("".join(seg[j]) + decs[j]).replace(",", "."))
    if len(decs) >= 2 and vals[1] is not None:
        best = None
        for k in range(len(pre), 0, -1):
            v0 = float(("".join(pre[k:]) + decs[0]).replace(",", "."))
            if forwarder:
                ok = v0 > 0 and 0.9 <= vals[1] / v0 <= 1.6
            else:
                ok = vals[1] == 0 and v0 == 0 or (vals[1] > 0 and 0.999 <= v0 / vals[1] <= 1.5)
            if ok:
                best = k
                break
        k = best if best is not None else len(pre)
        stam = "".join(pre[:k])
        vals[0] = float(("".join(pre[k:]) + decs[0]).replace(",", "."))
    else:
        stam = "".join(pre)
        vals[0] = float(decs[0].replace(",", "."))
    post = "".join(seg[-1]) if len(seg) > 1 else ""
    return stam, vals, post


def art_rad(rest):
    """Trädslagsrad: ('stammar','stockar') som heltal + decimaltal (vol*, 2a, 2b, medel...)."""
    toks = fix_tal(rest).split()
    ints, dec, i = [], [], 0
    while i < len(toks):
        t = toks[i]
        m = re.fullmatch(r"(\d+),(\d{1,2})", t)
        if m and i + 1 < len(toks) and re.fullmatch(r"\d+", toks[i + 1]) and len(m.group(2)) + len(toks[i + 1]) == 3:
            t, i = t + toks[i + 1], i + 1
        if re.fullmatch(r"\d+,\d+", t):
            dec.append(float(t.replace(",", ".")))
        elif re.fullmatch(r"\d+", t) and not dec and len(ints) < 2:
            ints.append(int(t))
        i += 1
    return ints, dec


def minuter(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def hm(minutes):
    return f"{minutes // 60}:{minutes % 60:02d}"


def parse_rapport(pages, forwarder):
    """-> dict med header, arter, totaler, drivare, skift, shifttotal."""
    t = "\n".join(pages)
    L = fix_tal(t)
    g = lambda pat, s=L, fl=0: (re.search(pat, s, fl) or [None, ""])[1]
    r = {
        "rapporttyp": "tidsavgränsad" if re.search(r"Tidsavgränsad,", L) else "objekt",
        "rapportdatum": g(r"Driftsrapport (\d{4}-\d\d-\d\d)") or "-".join(re.findall(r"Driftsrapport\s+(\d{4}) ?-(\d\d) ?-(\d\d)", L)[0]) if re.search(r"Driftsrapport\s+\d{4} ?-\d\d ?-\d\d", L) else "",
        "objekt": " ".join(g(r"För objekt,[ \t]*(.+)").split()) or " ".join(g(r"Objektnamn[ \t]+(.+?)(?:[ \t]+Maskin\w+|[ \t]+Objektnr|$)", L, re.M).split()),
        "objektnr": g(r"Objektnr[ \t]+(\d+)"),
        "programversion": g(r"MaxiXplorer ([\d.]+)"),
        "g15": g(r"Grundtid G\(t\) (\d+:\d\d)"),
        "g0": g(r"Grundtid G0 (\d+:\d\d)"),
        "extratid": g(r"Extratid (\d+:\d\d)"),
        "rasttid": g(r"Rasttid (\d+:\d\d)"),
        "avbrott_g15": g(r"Avbrottstid G\(t\) (\d+:\d\d)"),
        "motortid": g(r"Motortid (\d+:\d\d)"),
        "bransle_header_l": g(r"Bränsle \(l\) (\d+)\b"),
    }
    if not r["objektnr"]:
        r["objektnr"] = g(r"^\s*(\d{5,})\s*-", r["objekt"], re.M)
    lines = [x.rstrip() for x in L.split("\n")]

    # --- skiftavsnittet
    shifts, drivers, total, pend = [], {}, None, []
    start = next((i for i, x in enumerate(lines) if x.startswith("In Ut G(t)")), None)
    if start is not None:
        cur = None
        manad_stil = False  # "Objekt"-kolumn: dagraderna har efterföljande objektnamn som radbryts
        for x in lines[start + 1:]:
            x = x.strip()
            if not x or x.startswith(SKIP_PREFIX):
                continue
            if x == "Objekt" and not drivers:
                manad_stil = True
                continue
            m = DATE_ROW.match(x)
            if m:
                pend = []
                if cur is None:
                    continue
                datum, tin, tut, g15, ex, av, tot, rast, rest = m.groups()
                pre, dec, post = tal_tokens(rest, forwarder)
                shifts.append(dict(forare=cur, datum=datum, tin=tin, tut=tut, g15=g15, extratid=ex, avbrott=av, totalt=tot,
                                   rast=rast, pre=pre, dec=dec, post=post))
                continue
            m = TOT_ROW.match(x)
            if m:
                total = dict(g15=m.group(1), extratid=m.group(2), avbrott=m.group(3), totalt=m.group(4), rast=m.group(5),
                             tal=tal_tokens(m.group(6), forwarder))
                break
            m = DRIVER_ROW.match(x)
            if m and re.search(r"\d:\d\d", m.group(1) or ""):
                continue  # radbruten rad som börjar med klockslag
            if m:
                prefix = (m.group(1) or "").strip()
                name = " ".join((pend if not (manad_stil and drivers) else []) + ([prefix] if prefix else [])).strip()
                name = re.sub(r"^(Objekt\s+|\d+\s+)+", "", name).strip() or name
                pend = []
                cur = name
                drivers[cur] = dict(g15=m.group(2), extratid=m.group(3), avbrott=m.group(4), totalt=m.group(5), rast=m.group(6),
                                    tal=tal_tokens(m.group(7), forwarder))
                continue
            if re.fullmatch(r"[^\d()]+", x) and x not in HEADER_WORDS:
                pend.append(x)
            elif x.startswith(("Datum ", "(*)", "Förkortningar")):
                break
    r["shifts"], r["drivers"], r["shift_total"] = shifts, drivers, total

    # --- arter + totaler (skördare)
    arter, tot_art = {}, None
    hi = next((i for i, x in enumerate(lines) if x.startswith("Trädslag Stammar")), None)
    if hi is not None and not forwarder:
        for x in lines[hi + 1:]:
            if x.startswith("Totalt"):
                ints, dec = art_rad(x[6:])
                tot_art = dict(stammar=ints[0] if ints else None, dec=dec)
                break
            m = re.match(r"^([^\d]+?)\s+(\d.*)$", x)
            if m:
                ints, dec = art_rad(m.group(2))
                arter[m.group(1).strip().upper()] = dict(stammar=ints[0] if ints else None, dec=dec)
            else:
                break
        # totalraden (2a+102a / 2b+102b)
        for i, x in enumerate(lines):
            if re.match(r"^Stammar Stockar Volym \(2a\+\d+a\) Volym \(2b\+\d+b\)", x) and i + 1 < len(lines):
                m = re.match(r"^Totalt (\d+) (\d+) (\d+,\d{3}) (\d+,\d{3})", lines[i + 1])
                if m:
                    r["tot_stammar"], r["tot_stockar"] = int(m.group(1)), int(m.group(2))
                    r["tot_vol_a"], r["tot_vol_b"] = float(m.group(3).replace(",", ".")), float(m.group(4).replace(",", "."))
                break
    r["arter"], r["tot_art"] = arter, tot_art
    # --- skotare: leveranser
    lev, lev_tot = defaultdict(float), None
    if forwarder:
        li = next((i for i, x in enumerate(lines) if x.startswith("Leveranser Info")), None)
        if li is not None:
            for x in lines[li + 1:]:
                if x.startswith("Totalt"):
                    _, dec, _ = tal_tokens(x[6:], True)
                    lev_tot = dec[0] if dec else None
                    break
                m = re.match(r"^([A-Za-zÅÄÖåäö]+) (\S+) \S+ (\d+,\d{3})", x)
                if m:
                    lev[m.group(1).upper()] += float(m.group(3).replace(",", "."))
    r["lev"], r["lev_tot"] = dict(lev), lev_tot
    return r


def tal_av(rec, forwarder):
    """(stammar|lass, vikt, volym, bransle) ur (pre, dec, post)."""
    pre, dec, post = rec
    if forwarder:
        return dict(lass=int(pre) if pre else None, vikt=dec[0] if len(dec) > 0 else None, volym=dec[1] if len(dec) > 1 else None,
                    bransle=int(post) if post else None, ok=len(dec) == 2 and bool(pre))
    return dict(stammar=int(pre) if pre else None, vol_a=dec[0] if len(dec) > 0 else None, volym=dec[1] if len(dec) > 1 else None,
                bransle=int(post) if post else None, ok=len(dec) == 2 and bool(pre))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fulltext", default=str(IMP / "maxi_full.jsonl"))
    a = ap.parse_args()
    inv = {r["sha256"]: r for r in csv.DictReader(open(IMP / "inventering.csv", encoding="utf-8-sig"))}
    maskin = {r["sha256"]: r["maskin_namn"] for r in csv.DictReader(open(IMP / "rapport_maskin.csv", encoding="utf-8-sig"))}
    skord, skotare = {"Komatsu 941", "Komatsu 901XC"}, {"Komatsu 840.4", "Komatsu 860.4", "Komatsu 830.3", "Komatsu 875"}

    objekt_rows, avv, skift = [], [], {}
    dup_diff = 0
    rapporter = []
    for l in open(a.fulltext, encoding="utf-8"):
        d = json.loads(l)
        sha = d["sha"]
        if maskin.get(sha, "exkludera") == "exkludera" or sha not in inv:
            continue
        forwarder = "Antal lass" in "\n".join(d["pages"]) or maskin[sha] in skotare
        try:
            r = parse_rapport(d["pages"], forwarder)
        except Exception as e:  # trasig rapport stoppar aldrig körningen
            avv.append(dict(sha256=sha, filnamn=inv[sha]["filnamn"], rapportdatum="", maskin_namn=maskin[sha], kontroll="parsefel",
                            forvantat="", summa="", diff=f"{type(e).__name__}: {e}"))
            continue
        r.update(sha=sha, forwarder=forwarder, maskin=maskin[sha], chassinr=inv[sha]["chassinummer"], filnamn=inv[sha]["filnamn"])
        rapporter.append(r)

    rapporter.sort(key=lambda r: (r["rapportdatum"], r["sha"]))
    # föraren kan ha tappat förnamnet i "Objekt"-layouten: expandera enstaka efternamn mot kända fullständiga namn på samma maskin
    fulla = defaultdict(set)
    for r in rapporter:
        for sh_ in r["shifts"]:
            if " " in sh_["forare"] and not re.search(r"\d", sh_["forare"]):
                fulla[r["chassinr"]].add(sh_["forare"])
    expanderade = Counter()
    for r in rapporter:
        for sh_ in r["shifts"]:
            n_ = sh_["forare"]
            if " " not in n_ and n_[:1].isupper() and not re.search(r"\d", n_):
                kand = [f for f in fulla[r["chassinr"]] if f.endswith(" " + n_)] or [f for f in fulla[r["chassinr"]] if f.startswith(n_ + " ")]
                if len(kand) == 1:
                    expanderade[(n_, kand[0])] += 1
                    sh_["forare"] = kand[0]
        def _namn(k, r=r):
            if " " in k or not k[:1].isupper():
                return k
            kand = [f for f in fulla[r["chassinr"]] if f.endswith(" " + k)] or [f for f in fulla[r["chassinr"]] if f.startswith(k + " ")]
            return kand[0] if len(kand) == 1 else k
        r["drivers"] = {_namn(k): v for k, v in r["drivers"].items()}
    for r in rapporter:
        r["shifts"] = [x for x in r["shifts"] if "2011" <= x["datum"][:4] and x["datum"] <= r["rapportdatum"]
                       or avv.append(dict(sha256=r["sha"], filnamn=r["filnamn"], rapportdatum=r["rapportdatum"], maskin_namn=r["maskin"],
                                         kontroll="skift_datum_orimligt_utelamnat", forvantat="", summa="", diff=f'{x["forare"]} {x["datum"]} {x["tin"]}'))]
    for r in rapporter:
        sha, fw = r["sha"], r["forwarder"]
        base = dict(sha256=sha, filnamn=r["filnamn"], rapportdatum=r["rapportdatum"], maskin_namn=r["maskin"])
        sh = r["shifts"]
        if not sh or r["shift_total"] is None:
            avv.append({**base, "kontroll": "inga_skift_eller_saknar_totalrad", "forvantat": "", "summa": "", "diff": f"{len(sh)} skiftrader; {len(r['drivers'])} förarrader utan dagrader" if not sh and r["drivers"] else f"{len(sh)} skift"})
        for s in sh:
            s.update(tal_av((s.pop("pre"), s.pop("dec"), s.pop("post")), fw))
            if not s["ok"]:
                avv.append({**base, "kontroll": "skiftrad_tal_ej_tolkade", "forvantat": "", "summa": "", "diff": f'{s["forare"]} {s["datum"]} {s["tin"]}'})
            key = (r["chassinr"], s["forare"], s["datum"], s["tin"])
            row = dict(maskin_namn=r["maskin"], chassinr=r["chassinr"], objektnr=r["objektnr"], objekt=r["objekt"], forare=s["forare"],
                       datum=s["datum"], tin=s["tin"], tut=s["tut"], g15=s["g15"], g15_h=round(minuter(s["g15"]) / 60, 3),
                       avbrott=s["avbrott"], stammar="" if fw else (s["stammar"] if s["stammar"] is not None else ""),
                       antal_lass=(s.get("lass") if fw and s.get("lass") is not None else ""),
                       vikt_ton=(s.get("vikt") if fw and s.get("vikt") is not None else ""),
                       volym_m3fub=s["volym"] if s["volym"] is not None else "", bransle_l=s["bransle"] if s["bransle"] is not None else "",
                       typ="skotare" if fw else "skördare", sha256=sha)
            if key in skift:
                prev = skift[key]
                if any(prev[k] != row[k] for k in ("g15", "avbrott", "stammar", "volym_m3fub", "bransle_l", "antal_lass")):
                    dup_diff += 1
            skift[key] = row  # senaste rapporten vinner (kumulativa rapporter: mest kompletta)
        # kontroller mot skiftabellens totalrad
        tt = r["shift_total"]
        if tt and sh:
            tv = tal_av(tt["tal"], fw)
            n = len(sh)
            kolla = [("G15_min", minuter(tt["g15"]), sum(minuter(s["g15"]) for s in sh), max(1, math.ceil(0.5 * n)))]
            kolla.append(("avbrott_min", minuter(tt["avbrott"]), sum(minuter(s["avbrott"]) for s in sh), max(1, n)))
            if fw:
                kolla.append(("lass", tv.get("lass"), sum(s.get("lass") or 0 for s in sh), 0))
            else:
                kolla.append(("stammar", tv.get("stammar"), sum(s.get("stammar") or 0 for s in sh), 0))
            kolla.append(("volym_m3fub", tv.get("volym"), round(sum(s.get("volym") or 0 for s in sh), 3), 0.0007 * n + 0.002))
            kolla.append(("bransle_l", tv.get("bransle"), sum(s.get("bransle") or 0 for s in sh), max(1, math.ceil(0.5 * n))))
            for namn, fv, sm, tol in kolla:
                if fv is None or abs(fv - sm) > tol:
                    avv.append({**base, "kontroll": namn, "forvantat": fv, "summa": sm, "diff": "" if fv is None else round(sm - fv, 3)})
            # förarraderna mot sina dagar
            per = defaultdict(list)
            for s in sh:
                per[s["forare"]].append(s)
            for fn, dr in r["drivers"].items():
                dv = tal_av(dr["tal"], fw)
                ss = per.get(fn, [])
                v = round(sum(s.get("volym") or 0 for s in ss), 3)
                if dv.get("volym") is not None and abs(dv["volym"] - v) > 0.0007 * len(ss) + 0.002:
                    avv.append({**base, "kontroll": f"forare:{fn}:volym", "forvantat": dv["volym"], "summa": v, "diff": round(v - dv["volym"], 3)})
                key2 = "lass" if fw else "stammar"
                sm = sum(s.get(key2) or 0 for s in ss)
                if dv.get(key2) is not None and dv[key2] != sm:
                    avv.append({**base, "kontroll": f"forare:{fn}:{key2}", "forvantat": dv[key2], "summa": sm, "diff": sm - dv[key2]})
        # objektrad
        if fw:
            vol_obj = r["lev_tot"] if r["lev_tot"] is not None else (tal_av(tt["tal"], True).get("volym") if tt else None)
            stam = ""
            arter = ";".join(f"{k}={v:.3f}" for k, v in sorted(r["lev"].items()))
            tot2b, flertrad = vol_obj, ""
            stockar = ""
        else:
            vol_obj = r.get("tot_vol_b")
            art_sum = 0.0
            arter_l = []
            for k, v in r["arter"].items():
                if len(v["dec"]) >= 3:
                    arter_l.append(f"{k}={v['dec'][2]:.3f}")
                    art_sum += v["dec"][2]
            arter = ";".join(arter_l)
            ta = r["tot_art"]
            tot2b = ta["dec"][2] if ta and len(ta["dec"]) >= 3 else None
            if vol_obj is None:
                vol_obj = tot2b  # äldre rapporter utan 102b-rad
            flertrad = round(vol_obj - tot2b, 3) if (vol_obj is not None and tot2b is not None) else ""
            stam = r.get("tot_stammar", ta["stammar"] if ta else "")
            stockar = r.get("tot_stockar", "")
            if ta and len(ta["dec"]) >= 3 and abs(art_sum - ta["dec"][2]) > 0.002 * max(1, len(r["arter"])):
                avv.append({**base, "kontroll": "arter_vs_totalt_2b", "forvantat": ta["dec"][2], "summa": round(art_sum, 3), "diff": round(art_sum - ta["dec"][2], 3)})
        objekt_rows.append(dict(sha256=sha, rapportdatum=r["rapportdatum"], maskin_namn=r["maskin"], chassinr=r["chassinr"], typ="skotare" if fw else "skördare", rapporttyp=r["rapporttyp"],
                                objektnr=r["objektnr"], objekt=r["objekt"], programversion=r["programversion"], stammar=stam, stockar=stockar,
                                volym_m3fub=vol_obj if vol_obj is not None else "", volym_2b_arter=tot2b if tot2b is not None else "",
                                flertrad_102b=flertrad, volym_per_tradslag=arter, g0=r["g0"], g15=r["g15"], extratid=r["extratid"],
                                rasttid=r["rasttid"], avbrott_g15=r["avbrott_g15"], motortid=r["motortid"], bransle_l=r["bransle_header_l"],
                                antal_skift=len(sh), filnamn=r["filnamn"]))

    def skriv(fn, rows):
        if not rows:
            return
        with open(IMP / fn, "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)

    srows = sorted(skift.values(), key=lambda x: (x["maskin_namn"], x["datum"], x["tin"], x["forare"]))
    skriv("skift.csv", srows)
    skriv("objekt.csv", objekt_rows)
    skriv("avvikelser.csv", avv)

    # regressionsvakt
    rp = [o for o in objekt_rows if o["filnamn"].startswith("Rotposter Kompersm") and o["rapportdatum"] == "2012-11-19" and o["g15"] == "138:14"]
    ok = bool(rp) and rp[0]["stammar"] == 8201 and abs(rp[0]["volym_m3fub"] - 3739.913) < 1e-6
    print("rapporter:", len(objekt_rows), "skift:", len(srows), "(kumulativa dubbletter som skilde sig:", dup_diff, ")", "avvikelser:", len(avv),
          "i", len({x["sha256"] for x in avv}), "rapporter")
    print("regressionsvakt RP Kompersmåla:", "OK" if ok else "FEL", rp[0] if rp else "saknas")
    if not ok:
        sys.exit(2)
    return srows, objekt_rows, avv


if __name__ == "__main__":
    main()
