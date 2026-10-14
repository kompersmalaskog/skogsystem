"""Steg 15 (STOPP 1 svar punkt 3): som hist_volym_fyll.py men för Elephant King utan lass: fördelning efter G15 och kontroll m3/G15 inom 0,5-2,0 x maskinens egen referens (median per åtgärd 2022-2023, annars total median).

Ursprung: Steg 14/15 DEL 3: volym från skördare till skotare via delat objektnummer (hist_objektnr.csv) och Skogsystems egna data (vo_nummer). Ingen databas skrivs.
Regler (godkända): tidsfönster (skotaren klar före skördarens start, eller start > 180 dagar efter skördarens slut => bort), flera skotare på samma nummer fördelas efter lass,
bara där skotaren saknar uppmätt volym, kontroll m3/lass (Wisent 6-18, Elephant King 14-27; lass saknas => inget skrivs), (a) Skogsystem före (b) PDF-skördare.
Skriver hist_csv/hist_volym_ek_harledd.csv (förslag) och hist_csv/hist_volym_ek_stoppade.csv.
Kör: python hist_volym_fyll.py [vo_volym.txt]"""
import csv
import datetime as dt
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hist_objektnr_text import las_text  # noqa: E402
from hist_r3 import lc_period  # noqa: E402
from hist_rimlighet import OUT  # noqa: E402

GRANS = {"Elephant King gammal": (0.5, 2.0), "Elephant King ny": (0.5, 2.0)}  # faktor mot maskinens egen referens m3/G15
FLAGGOR = ("laster_x_1m3", "schablon_10m3")


def f(x):
    return float(x) if x not in ("", None) else 0.0


def d(s):
    return dt.date.fromisoformat(s[:10])


def las_data():
    mt = {m["namn"]: m["typ"] for m in csv.DictReader(open(OUT / "hist_maskin.csv", encoding="utf-8"))}
    rap = {r["sha256"]: r for r in csv.DictReader(open(OUT / "hist_rapport.csv", encoding="utf-8"))}
    obj = {o["sha256"]: o for o in csv.DictReader(open(OUT / "hist_objekt.csv", encoding="utf-8"))}
    nr = {r["sha256"]: [x for x in r["objektnr_alla"].split(";") if x] for r in csv.DictReader(open(OUT / "hist_objektnr.csv", encoding="utf-8"))}
    skift = defaultdict(float)
    har_skift = set()
    for s in csv.DictReader(open(OUT / "hist_skift.csv", encoding="utf-8")):
        if s["antal_lass"]:
            skift[s["sha256"]] += float(s["antal_lass"])
            har_skift.add(s["sha256"])
    korr = {}
    for k in csv.DictReader(open(OUT / "hist_korrigering.csv", encoding="utf-8")):
        if k["falt"] == "volym_kvalitet":
            korr[k["sha256"]] = k["nytt_varde"]
    return mt, rap, obj, nr, skift, har_skift, korr


def main():
    vo_fil = sys.argv[1] if len(sys.argv) > 1 else "C:/temp/vo_vol.txt"
    vo_vol = {}
    for p in open(vo_fil, encoding="utf-8").read().replace("\n", "|").split("|"):
        if p.strip():
            a, b = p.split()
            vo_vol[a] = float(b)
    T = las_text()
    mt, rap, obj, nr, skift, har_skift, korr = las_data()
    tw = {o["dubblett_av"]: o for o in obj.values() if o["dubblett_av"] and rap[o["sha256"]]["format"] == "lastcertifikat"}
    raknas = lambda o: o["raknas"] in ("true", "True") and o["maskin_namn"]

    # ---------------------------------------------------------------- skotare
    skot = {}
    for sha, o in obj.items():
        m = o["maskin_namn"]
        if not raknas(o) or mt.get(m) != "skotare" or m not in GRANS:
            continue
        t = tw.get(sha)
        src = t or o
        lass = skift[src["sha256"]] if src["sha256"] in har_skift else (skift[sha] if sha in har_skift else f(src["antal_lass"]) or f(o["antal_lass"]))
        vol = f(src["volym_m3fub"]) or f(o["volym_m3fub"])
        kv = korr.get(sha) or (src["volym_kvalitet"] if t else o["volym_kvalitet"])
        lo, hi = GRANS[m]
        flaggad = m == "Ponsse Wisent" and kv in FLAGGOR
        uppmatt = vol > 0 and not flaggad
        osaker = uppmatt and m == "Ponsse Wisent" and lass > 0 and not (lo <= vol / lass <= hi)
        st, sl = (lc_period(T.get(src["sha256"], ""), src["rapportdatum"]) if t or rap[sha]["format"] == "lastcertifikat" else (o["rapportdatum"], o["rapportdatum"]))
        skot[sha] = dict(o=o, lass=lass, vol=vol, uppmatt=uppmatt, osaker=osaker, start=st, slut=max(sl, o["rapportdatum"]) if False else sl, nr=nr.get(sha, []) + (nr.get(t["sha256"], []) if t else []),
                         ar=(o["startdatum"] or o["rapportdatum"])[:4], g15=f(o["g15_h"]), maskin=m)
        skot[sha]["slut"] = max(sl, o["rapportdatum"])
        skot[sha]["nr"] = sorted(set(skot[sha]["nr"]))
    # ---------------------------------------------------------------- skördare
    harv = {}
    for sha, o in obj.items():
        if raknas(o) and mt.get(o["maskin_namn"]) == "skördare" and f(o["volym_m3fub"]) > 0:
            harv[sha] = dict(o=o, vol=f(o["volym_m3fub"]), start=(o["startdatum"] or o["rapportdatum"])[:10], slut=(o["slutdatum"] or o["rapportdatum"])[:10], nr=nr.get(sha, []))
    idx_h = defaultdict(set)
    for sha, h in harv.items():
        for n in h["nr"]:
            idx_h[n].add(sha)
    stor = {n for n, s in idx_h.items() if len(s) > 12}

    kandidater = [s for s, r in skot.items() if not r["uppmatt"] or r["osaker"]]
    kandidater = [s for s in kandidater if not skot[s]["uppmatt"]]  # bara där uppmätt volym saknas (osäker lasstorlek behåller sin uppmätta volym)
    rader, stopp = [], []

    def fonster_ok(s, h):
        if d(s["slut"]) < d(h["start"]):
            return False
        if (d(s["start"]) - d(h["slut"])).days > 180:
            return False
        return True

    # grupper per källa
    grupp_a = defaultdict(list)   # vo -> skotare
    grupp_b = []                  # skotare som saknar (a)
    for sha in kandidater:
        s = skot[sha]
        vo = [n for n in s["nr"] if n in vo_vol]
        if vo:
            grupp_a[vo[0]].append(sha)
        else:
            grupp_b.append(sha)
    res = {}
    logg_ab = []
    # (a) Skogsystem: fördela vo-volymen (minus uppmätta skotare med samma vo) efter lass
    for vo, lst in grupp_a.items():
        v = vo_vol[vo]
        uppm = sum(r["vol"] for sh, r in skot.items() if r["uppmatt"] and vo in r["nr"])
        rest = v - uppm
        tot = sum(skot[s]["g15"] for s in lst)
        for sh in lst:
            r = skot[sh]
            if rest <= 0:
                stopp.append((sh, "a", f"Skogsystem {vo}: kvar {rest:.0f} m3 efter uppmätt skotarvolym"))
                continue
            if r["g15"] <= 0 or tot <= 0:
                stopp.append((sh, "a", "G15 saknas"))
                continue
            vi = rest * r["g15"] / tot
            res[sh] = dict(vol=vi, kalla="skogsystem", nr=vo, harv="", rest=rest)
        # (b) för samma nummer, för loggning av skillnad
    # (b) PDF: komponenter via delade nummer
    foralder = {}

    def find(x):
        while foralder.setdefault(x, x) != x:
            foralder[x] = foralder[foralder[x]]
            x = foralder[x]
        return x
    kopp = defaultdict(set)
    for sha in kandidater:
        s = skot[sha]
        for n in s["nr"]:
            if n in stor:
                continue
            for h in idx_h.get(n, ()):
                if fonster_ok(s, harv[h]):
                    kopp[sha].add(h)
                    foralder[find("s" + sha)] = find("h" + h)
    komp = defaultdict(lambda: [set(), set()])
    for sha, hs in kopp.items():
        r = find("s" + sha)
        komp[r][0].add(sha)
        for h in hs:
            komp[r][1].add(h)
    for ss, hh in komp.values():
        # skotare med uppmätt volym som delar de skördarna
        uppm = 0.0
        for sh, r in skot.items():
            if r["uppmatt"] and any(h in kopp.get(sh, set()) or any(n in harv[h]["nr"] for n in r["nr"]) for h in hh):
                if any(fonster_ok(r, harv[h]) for h in hh):
                    uppm += r["vol"]
        V = sum(harv[h]["vol"] for h in hh)
        rest = V - uppm
        tot = sum(skot[s]["g15"] for s in ss)
        for sh in ss:
            r = skot[sh]
            nrs = ",".join(sorted({n for h in hh for n in harv[h]["nr"] if n in r["nr"]}))
            if sh in res:
                logg_ab.append((sh, res[sh]["vol"], rest * r["g15"] / tot if tot else None))
                continue
            if rest <= 0:
                stopp.append((sh, "b", f"skördarvolym {V:.0f} m3 redan uppmätt hos skotare ({uppm:.0f})"))
                continue
            if r["g15"] <= 0 or tot <= 0:
                stopp.append((sh, "b", "G15 saknas"))
                continue
            res[sh] = dict(vol=rest * r["g15"] / tot, kalla="pdf", nr=nrs, harv=";".join(sorted(h[:10] for h in hh)), rest=rest)
    for sh in kandidater:
        if sh not in res and not any(x[0] == sh for x in stopp):
            stopp.append((sh, "-", "ingen kopplad skördare (delat nummer + tidsfönster)"))
    # kontroll m3/G15 mot maskinens egen referens
    import statistics
    korr_at = {}
    for k in csv.DictReader(open(OUT / "hist_korrigering.csv", encoding="utf-8")):
        if k["falt"] == "atgard":
            korr_at[k["sha256"]] = k["nytt_varde"]
    def atg(sh):
        return korr_at.get(sh) or skot[sh]["o"]["atgard"] or "okand"
    refl = defaultdict(list)
    for sh, r in skot.items():
        if r["maskin"] == "Elephant King gammal" and r["ar"] in ("2022", "2023") and r["uppmatt"] and r["g15"] > 0 and r["vol"] > 0:
            refl[atg(sh)].append(r["vol"] / r["g15"])
    tot_ref = [x for l in refl.values() for x in l]
    REF = {k: statistics.median(v) for k, v in refl.items() if len(v) >= 3}
    REF["_alla"] = statistics.median(tot_ref)
    ok = {}
    for sh, v in res.items():
        r = skot[sh]
        lo, hi = GRANS[r["maskin"]]
        ref = REF.get(atg(sh), REF["_alla"])
        pg = v["vol"] / r["g15"] if r["g15"] > 0 else None
        if pg is None:
            stopp.append((sh, v["kalla"], "G15 saknas"))
        elif not (lo * ref <= pg <= hi * ref):
            stopp.append((sh, v["kalla"], f"m3/G15 {pg:.1f} utanför {lo*ref:.1f}-{hi*ref:.1f} (referens {ref:.1f}, {atg(sh)})"))
        else:
            ok[sh] = dict(v, pl=pg)
    main.REF = REF
    main.REFN = {k: len(v) for k, v in refl.items()}
    with open(OUT / "hist_volym_ek_harledd.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "maskin", "objekt", "ar", "volym_m3", "lass", "m3_per_g15", "g15_h", "kalla", "nummer", "skordare_sha10"])
        for sh, v in sorted(ok.items()):
            r = skot[sh]
            w.writerow([sh, r["maskin"], r["o"]["objekt"], r["ar"], round(v["vol"], 3), r["lass"], round(v["pl"], 2), r["g15"], v["kalla"], v["nr"], v["harv"]])
    with open(OUT / "hist_volym_ek_stoppade.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "maskin", "objekt", "ar", "lass", "g15_h", "kalla", "orsak"])
        for sh, k, why in stopp:
            r = skot[sh]
            w.writerow([sh, r["maskin"], r["o"]["objekt"], r["ar"], r["lass"], r["g15"], k, why])
    return skot, ok, stopp, kandidater, logg_ab, res


def rapport():
    skot, ok, stopp, kandidater, logg_ab, res = main()
    print("referens m3/G15 (EK gammal 2022-2023, objektmedian):", {k: round(v, 1) for k, v in main.REF.items()}, "n:", main.REFN)
    print(f"kandidater: {len(kandidater)}; fyllda: {len(ok)}; stoppade: {len(stopp)}")
    from collections import Counter
    print("stoppade per orsak:", Counter(x[2][:28] for x in stopp).most_common(8))
    per = defaultdict(lambda: defaultdict(float))
    for sh, r in skot.items():
        p = per[(r["maskin"], r["ar"])]
        p["obj"] += 1
        p["g15"] += r["g15"]
        if r["uppmatt"]:
            p["vol"] += r["vol"]; p["g15v"] += r["g15"]
        if sh in ok:
            p["fvol"] += ok[sh]["vol"]; p["fg15"] += r["g15"]; p["fobj"] += 1
    for (m, y), p in sorted(per.items()):
        print(f"{m:21}{y} obj {int(p['obj']):3} G15 {p['g15']:7.0f}  G15 m vol före {p['g15v']:6.0f} ({100*p['g15v']/p['g15']:.0f}%)  fyllda {int(p['fobj'])} +{p['fvol']:.0f} m3  efter {p['g15v']+p['fg15']:6.0f} ({100*(p['g15v']+p['fg15'])/p['g15']:.0f}%) vol före {p['vol']:.0f} efter {p['vol']+p['fvol']:.0f}")
    print("(a) mot (b):", [(skot[a]['o']['objekt'][:20], round(x), y and round(y)) for a, x, y in logg_ab])


if __name__ == "__main__":
    rapport()
