"""Bygger skift.csv, objekt.csv och avvikelser.csv för ALLA produktionsformat (Komatsu, Rottne, Ponsse, AptMan).

Komatsu: parse_maxixplorer (skiftrader per förare och dag). Rottne: inloggningspass som skiftrader (utan volym/stammar,
rapporten anger dem bara som totaler). Ponsse och AptMan: bara totaler -> en rad per rapport i objekt.csv, inga skiftrader.
Ingen databas.  Körordning: maskinregister.py -> bygg_historik.py
"""
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import parse_maxixplorer as PM  # noqa: E402
import parse_ovriga as PO  # noqa: E402

IMP = Path("C:/Users/lindq/skogsystem-import")
SKIFT_KOL = ["maskin_namn", "chassinr", "objektnr", "objekt", "forare", "datum", "tin", "tut", "g15", "g15_h", "avbrott", "stammar",
             "antal_lass", "vikt_ton", "volym_m3fub", "bransle_l", "typ", "sha256", "volym_enhet", "format", "kalla", "g0", "motortid"]
OBJEKT_KOL = ["status", "format", "volym_enhet", "sha256", "rapportdatum", "maskin_namn", "chassinr", "typ", "rapporttyp", "objektnr",
              "objekt", "programversion", "stammar", "stockar", "volym_m3fub", "volym_2b_arter", "flertrad_102b", "volym_per_tradslag",
              "g0", "g15", "extratid", "rasttid", "avbrott_g15", "motortid", "bransle_l", "antal_skift", "forare", "objekt_nyckel",
              "senaste_for_nyckel", "filnamn"]
SKOTARE = {"Komatsu 840.4", "Komatsu 860.4", "Komatsu 830.3", "Komatsu 875", "Elephant King gammal", "Elephant King ny", "Ponsse Wisent"}


def load_full(fn):
    d = {}
    for l in open(IMP / fn, encoding="utf-8"):
        x = json.loads(l)
        d[x["sha"]] = x["pages"]
    return d


def main():
    inv = {r["sha256"]: r for r in csv.DictReader(open(IMP / "inventering.csv", encoding="utf-8-sig"))}
    maskin = {r["sha256"]: r["maskin_namn"] for r in csv.DictReader(open(IMP / "rapport_maskin.csv", encoding="utf-8-sig"))}
    kop = {r["sha256"]: r for r in csv.DictReader(open(IMP / "rottne_koppling.csv", encoding="utf-8-sig"))}

    srows, orows, avv = PM.main(write=False)
    srows = [{**{k: "" for k in SKIFT_KOL}, **s} for s in srows]
    orows = [{**{k: "" for k in OBJEKT_KOL}, **o} for o in orows]

    def avvik(sha, rapportdatum, namn, kontroll, forv, summa, diff):
        avv.append(dict(sha256=sha, filnamn=inv[sha]["filnamn"], rapportdatum=rapportdatum, maskin_namn=namn, kontroll=kontroll,
                        forvantat=forv, summa=summa, diff=diff))

    # ---------------------------------------------------------------- Rottne
    ROTTNE = {"Rottne H8B", "Rottne H8D", "Rottne H8E Logmax", "Rottne H8E 2026"}
    ful = load_full("forester_full.jsonl")
    sess_keys = {}
    n_r = 0
    for sha, pages in sorted(ful.items(), key=lambda kv: inv[kv[0]]["rapportdatum"] or inv[kv[0]]["mejldatum"]):
        namn = maskin.get(sha)
        if namn not in ROTTNE:
            continue
        r = PO.parse_rottne(pages)
        n_r += 1
        ch = kop[sha]["chassinummer"]
        for p in r["pass"]:
            row = {k: "" for k in SKIFT_KOL}
            row.update(maskin_namn=namn, chassinr=ch, objektnr=r["objektnr"], objekt=r["objekt"], forare=p["forare"], datum=p["datum"],
                       tin=p["tin"], tut=p["tut"], g15=p["g15"], g15_h=round(PO.minuter(p["g15"]) / 60, 3) if p["g15"] else "",
                       typ="skördare", sha256=sha, volym_enhet="fub", format="forester_driftuppfoljningsrapport", kalla="objekt",
                       g0=p["g0"], motortid=p["motor"])
            sess_keys[(ch, p["forare"], p["datum"], p["tin"])] = row  # senaste rapporten vinner
        for k, f, s_, d_ in PO.kontroll_rottne(r):
            avvik(sha, r["rapportdatum"], namn, k, f, s_, d_)
        key = f'{namn}|{r["objektnr"] or r["objekt"]}'
        orows.append({**{k: "" for k in OBJEKT_KOL}, "status": "ok", "format": "forester_driftuppfoljningsrapport", "volym_enhet": "fub",
                      "sha256": sha, "rapportdatum": r["rapportdatum"], "maskin_namn": namn, "chassinr": ch, "typ": "skördare",
                      "rapporttyp": "objekt", "objektnr": r["objektnr"], "objekt": r["objekt"], "stammar": r["stammar"] or "",
                      "volym_m3fub": r["volym_m3fub"] if r["volym_m3fub"] is not None else "",
                      "volym_per_tradslag": ";".join(f"{k}={v[7]:.2f}" for k, v in sorted(r["arter"].items())),
                      "g0": r["g0"], "g15": r["g15"], "avbrott_g15": r["avbrott"], "motortid": r["motortid"],
                      "bransle_l": r["bransle_l"] if r["bransle_l"] is not None else "", "antal_skift": len(r["pass"]),
                      "forare": ",".join(sorted({p["forare"] for p in r["pass"]})), "objekt_nyckel": key, "filnamn": inv[sha]["filnamn"]})
    srows += list(sess_keys.values())

    # ---------------------------------------------------------------- Ponsse + AptMan
    pa = load_full("ponsse_aptman_full.jsonl")
    for sha, pages in sorted(pa.items(), key=lambda kv: inv[kv[0]]["rapportdatum"]):
        fmt = inv[sha]["format"]
        namn = maskin.get(sha)
        if not namn or namn == "exkludera":
            continue
        base = {k: "" for k in OBJEKT_KOL}
        base.update(status="ok", format=fmt, sha256=sha, maskin_namn=namn, typ="skotare" if namn in SKOTARE else "skördare",
                    rapporttyp="objekt", filnamn=inv[sha]["filnamn"], volym_enhet="fub")
        if fmt == "ponsse_maskinspecifik_summering":
            r = PO.parse_ponsse(pages)
            if not r["under_bark"]:
                base["volym_enhet"] = "okänd"
            base.update(rapportdatum=r["rapportdatum"], objektnr=r["objektnr"], objekt=r["objekt"], programversion="",
                        stammar=r["stammar"] if r["stammar"] is not None else "", stockar=r["stockar"] if r["stockar"] is not None else "",
                        volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "", g15=r["g15"], avbrott_g15=r["avbrott"],
                        bransle_l=r["bransle_l"] if r["bransle_l"] is not None else "", antal_skift=0,
                        objekt_nyckel=f'{namn}|{r["objektnr"] or r["objekt"]}')
            for k, f, s_, d_ in PO.kontroll_ponsse(r):
                avvik(sha, r["rapportdatum"], namn, k, f, s_, d_)
        elif fmt == "aptman_drf":
            r = PO.parse_aptman_drf(pages)
            nd = r["nollstalld"][:8]  # YY-MM-DD
            base.update(rapportdatum=r["rapportdatum"], objekt=r["objekt"], programversion=r["version"],
                        stammar=r["stammar"] if r["stammar"] is not None else "",
                        volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "", g0=r["g0"], g15=r["g15"],
                        avbrott_g15=r["avbrott"], motortid=r["motortid"], antal_skift=0,
                        objekt_nyckel=f'{namn}|{r["objekt"]}|{r["omrade"]}|20{nd}')
            for k, f, s_, d_ in PO.kontroll_aptman_drf(r):
                avvik(sha, r["rapportdatum"], namn, k, f, s_, d_)
        else:  # aptman_produktionsnota
            r = PO.parse_aptman_nota(pages)
            base.update(rapportdatum=r["rapportdatum"], objekt=r["objekt"], programversion=r["version"],
                        stammar=r["stammar"] if r["stammar"] is not None else "",
                        volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "", antal_skift=0,
                        forare=";".join(f"{n}={i[-1]}/{v}" for n, i, v in r["forare"]),
                        volym_per_tradslag=";".join(f"{h}={r['total'][0][ix]}st" for ix, h in enumerate(r["arter_hdr"])) if r["total"] else "",
                        objekt_nyckel=f'{namn}|{r["objekt"]}|{r["omrade"]}|{r["nollstalld"]}')
            if not r["total"]:
                avvik(sha, r["rapportdatum"], namn, "nota_totalrad_saknas", "", "", "")
            if r["enhet"] != "fub":
                base["volym_enhet"] = "okänd"
            for k, f, s_, d_ in PO.kontroll_aptman_nota(r):
                avvik(sha, r["rapportdatum"], namn, k, f, s_, d_)
        orows.append(base)

    # ---------------------------------------------------------------- senaste rapport per objektnyckel (kumulativa rapporter)
    # Komatsu-objektrader har ingen nyckel (volym per år tas ur skift.csv).
    senast = {}
    for o in orows:
        if o["objekt_nyckel"] and o["status"] == "ok":
            pref = 1 if o["format"] == "aptman_drf" else 0  # DRF och nota ger samma kumulativa totaler; DRF har G15
            k = o["objekt_nyckel"]
            cand = (o["rapportdatum"], pref)
            # nyckeln för nota och drf är lika (maskin|objekt|område|nollställd-datum) endast om datumformaten stämmer
            if k not in senast or cand > senast[k][0]:
                senast[k] = (cand, o["sha256"])
    for o in orows:
        o["senaste_for_nyckel"] = "ja" if o["objekt_nyckel"] and senast.get(o["objekt_nyckel"], (0, ""))[1] == o["sha256"] else (
            "" if not o["objekt_nyckel"] else "nej")

    def skriv(fn, rows, kol):
        with open(IMP / fn, "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=kol, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)

    srows.sort(key=lambda x: (x["maskin_namn"], x["datum"], x["tin"], x["forare"]))
    # skift ur exkluderade tidsavgränsade månads-/årsrapporter dubbelräknar (finare uppdelning av samma tid): egen fil
    tid_ = [x for x in srows if x["kalla"] == "tidsavgransad"]
    srows = [x for x in srows if x["kalla"] != "tidsavgransad"]
    skriv("skift_tidsavgransade_exkluderade.csv", tid_, SKIFT_KOL)
    skriv("skift.csv", srows, SKIFT_KOL)
    skriv("objekt.csv", orows, OBJEKT_KOL)
    akol = ["sha256", "filnamn", "rapportdatum", "maskin_namn", "kontroll", "forvantat", "summa", "diff"]
    skriv("avvikelser.csv", avv, akol)
    print("skift:", len(srows), Counter(s["format"] for s in srows))
    print("objekt:", len(orows), Counter(o["format"] for o in orows))
    print("avvikelser:", len(avv), "i", len({a['sha256'] for a in avv}), "rapporter", Counter(a["kontroll"].split(":")[0] for a in avv).most_common(12))
    return srows, orows, avv


if __name__ == "__main__":
    main()
