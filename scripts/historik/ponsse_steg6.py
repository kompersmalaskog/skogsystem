"""Steg 6, utdata: lägger Ponsse Skift/Mätbevis(ny) i objekt.csv, skift.csv, avvikelser.csv (idempotent), skriver
ponsse_skift_gissade.csv, ponsse_manad_mot_objekt.csv, ponsse_maskin_bevis.txt. Ingen databas.
Körordning: bygg_skift.py (läser) -> ponsse_steg6.py -> effektivitet.py"""
import csv
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bygg_skift as B  # noqa: E402
import parse_skift as P  # noqa: E402

IMP = B.IMP
NYA_FORMAT = {"ponsse_skift", "ponsse_matbevis_ny"}
AVV_PREFIX = ("skift_ocr", "dagrad_ocr", "matbevis_ny", "skift:", "dagrad_dubblett", "skift_summa")
KAT_MAP = {"slutavverkning": "slutavverkning", "förnyelseavverkning": "slutavverkning", "gallring": "gallring"}
G_START_2023 = "2023-04-01"
G_START_2025 = "2025-07-01"


def gissa(s):
    a, _ = B.skift_period(s)
    dt = (a or B.d(s["mejldatum"]) or date(2000, 1, 1)).isoformat()
    fn = " + filnamn gigant" if re.search(r"gigant|giant", s["fil"], re.I) else ""
    if dt < G_START_2023:
        return "Scorpion King ny", "gissad: datum före första Giant 2023-mätbevis (2023-04-03); King ny 2023-01..03" + fn
    if dt < G_START_2025:
        return "Scorpion Giant 2023", "gissad: datum" + fn + " (avsändare " + s["avsandare"][:30] + ")"
    return "Scorpion Giant 2025", "gissad: datum ≥ 2025-07" + fn + " (avsändare " + s["avsandare"][:30] + ")"


def tot(blocks):
    alla = next((b for b in blocks if b["forare"] == "Alla" and "g15" in b and "m3" in b), None)
    bl = [b for b in blocks if b["forare"] != "Alla" and "m3" in b]
    saknar = [b for b in bl if "g15" not in b]
    src = [alla] if alla else bl
    if not src:
        return None
    g15 = sum(P.minuter(b["g15"]) for b in src if "g15" in b)
    g0 = sum(P.minuter(b["g0"]) for b in src if "g0" in b)
    # bränsle (rapportens "Förbrukning", liter) och arbetstid (G15 + reparation + service + störning ... enligt rapportens definition) ur samma block som G15
    med = [b for b in src if "g15" in b and "arbetstid" in b]
    arb = sum(P.minuter(b["arbetstid"]) for b in med)
    g15_arb = sum(P.minuter(b["g15"]) for b in med)
    fuel = sum(b["forbrukning_l"] for b in src if "forbrukning_l" in b)
    kat = {KAT_MAP.get(b["kategori"].lower(), "?") for b in blocks if b["kategori"] != "Alla"}
    return dict(g15=g15, g0=g0, arbetstid=arb, g15_arb=g15_arb, bransle_l=fuel if any("forbrukning_l" in b for b in src) else None,
                fuel_g15=sum(P.minuter(b["g15"]) for b in src if "g15" in b and "forbrukning_l" in b), m3=sum(b["m3"] for b in src), stammar=sum(b.get("stammar", 0) for b in src), saknar=len(saknar) if not alla else 0,
                kat="/".join(sorted(blocks and {b["kategori"] for b in blocks if b["kategori"] != "Alla"})), katset=kat,
                forare=",".join(sorted({b["forare"] for b in bl})))


def hm(m):
    return f"{m // 60}:{m % 60:02d}"


def las_csv(fn):
    with open(IMP / fn, encoding="utf-8-sig") as fh:
        r = csv.DictReader(fh)
        return list(r), list(r.fieldnames)


def skriv(fn, rows, kol):
    with open(IMP / fn, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=kol, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main():
    skift, mb = B.las_alla()
    B.bestam_maskin(skift, mb)
    gissade = []
    for s in skift:
        if not s["maskin"]:
            s["maskin"], s["maskin_kalla"] = gissa(s)
            gissade.append(s)
    avv = []

    def avvik(sha, fil, datum, namn, kontroll, f="", s_="", dd=""):
        avv.append(dict(sha256=sha, filnamn=fil, rapportdatum=datum, maskin_namn=namn, kontroll=kontroll, forvantat=f, summa=s_, diff=dd))

    orows, srows = [], {}
    # ---------------------------------------------------------- Mätbevis (ny)
    for m in mb:
        for kk, f_, u_, dp in P.kontroll_matbevis_ny(m):
            avvik(m["sha"], m["fil"], m["utskriven"], m["maskin"], "matbevis_ny: " + kk, f_, u_, f"{dp} %")
        orows.append(dict(status="ok", format="ponsse_matbevis_ny", volym_enhet="fub", sha256=m["sha"], rapportdatum=m["utskriven"], maskin_namn=m["maskin"],
                          typ="skördare", rapporttyp="objekt", objektnr=m.get("virkesordernr", ""), objekt=m["objekt"],
                          stammar=m["stammar"] if m["stammar"] is not None else "", volym_m3fub=m["m3"] if m["m3"] is not None else "", antal_skift=0,
                          kalla_typ="vektor-pdf", filnamn=m["fil"], maskin_kalla="modelltext: " + m["maskin_traff"],
                          objekt_nyckel=f'{m["maskin"]}|PM|{P.normtext(m["objekt"])}|{m["start"][:10]}'))
    # ---------------------------------------------------------- Skift: rapporter, dagrader
    dag = {}      # (maskin, forare, datum, tin) -> rad (objektrapport först)
    obj_dag = defaultdict(dict)   # (maskin, objekt_norm) -> {key: rad} bara från objektrapporter
    rapport_tot = {}
    for s in sorted(skift, key=lambda s: (s["typ"] == "manad", s["utskriven"], s["sha"])):
        t = tot(s["blocks"])
        objekt = s["arbetsomrade"] or B.obj_av_filnamn(s["fil"])
        a, b = B.skift_period(s)
        rt = "manad" if s["typ"] == "manad" else ("objekt" if s["typ"] == "objekt" else "skift_sok")
        o = dict(status="ok", format="ponsse_skift", volym_enhet="fub", sha256=s["sha"], rapportdatum=s["utskriven"], maskin_namn=s["maskin"], typ="skördare",
                 rapporttyp=rt, objekt=objekt, antal_skift=len(s["dagrader"]), kalla_typ="vektor-pdf", filnamn=s["fil"], maskin_kalla=s["maskin_kalla"],
                 objekt_nyckel=f'{s["maskin"]}|S|{P.normtext(objekt)}|{a or ""}|{b or ""}', fran=a or "", till=b or "")
        if t:
            o.update(arbetstid=hm(t["arbetstid"]) if t["arbetstid"] else "", g15_arbetstid=hm(t["g15_arb"]) if t["arbetstid"] else "",
                     bransle_l=round(t["bransle_l"], 1) if t["bransle_l"] is not None and t["fuel_g15"] == t["g15"] else "", g15=hm(t["g15"]), g0=hm(t["g0"]), stammar=t["stammar"], volym_m3fub=round(t["m3"], 3), forare=t["forare"], volym_per_tradslag=t["kat"])
            ks = {KAT_MAP[x] for x in t["katset"] if x in KAT_MAP}
            o["atgard_rapport"] = (next(iter(ks)) if len(ks) == 1 else "okänd (flera)") if ks and "?" not in t["katset"] else ""
            if t["saknar"]:
                avvik(s["sha"], s["fil"], s["utskriven"], s["maskin"], "skift: förarblock utan G15 (summa ofullständig)", "", "", t["saknar"])
        else:
            avvik(s["sha"], s["fil"], s["utskriven"], s["maskin"], "skift: inga summablock tolkade")
        if rt == "manad":
            o["status"] = "manad_ej_effektivitet"
        elif rt != "objekt":
            o["status"] = "skift_sok_ej_effektivitet"
        orows.append(o)
        rapport_tot[s["sha"]] = (s, t, objekt, a, b)
        for kk, f_, u_, dp in P.kontroll_skift(s):
            avvik(s["sha"], s["fil"], s["utskriven"], s["maskin"], "skift_ocr: " + kk, f_, u_, f"{dp} %")
        for x in s["dagrader"]:
            f = P.dagrad_falt(x)
            if not f:
                avvik(s["sha"], s["fil"], x["datum"], s["maskin"], "skift: dagrad ej tolkad", dd=f'{x["forare"]} {x["tin"]}')
                continue
            h = P.minuter(f["g15"]) / 60
            if f["m3"] and h > 0:
                e = h * f["m3_per_g15"]
                tol = max(0.02 * f["m3"], (0.5 / 60 + 1e-9) * f["m3_per_g15"] + 0.002)
                if abs(e - f["m3"]) > tol:
                    avvik(s["sha"], s["fil"], x["datum"], s["maskin"], "dagrad_ocr: G15 x m3/G15 = m3", f["m3"], round(e, 3),
                          f'{round(100 * (e - f["m3"]) / f["m3"], 1)} % ({x["forare"]} {x["tin"]})')
            if f["m3"] and f["stammar"]:
                e = f["m3"] / f["stammar"]
                if abs(e - f["medelstam"]) > 0.02 * f["medelstam"] + 0.0006:
                    avvik(s["sha"], s["fil"], x["datum"], s["maskin"], "dagrad_ocr: m3/stammar = medelstam", f["medelstam"], round(e, 4),
                          f'{round(100 * (e - f["medelstam"]) / max(f["medelstam"], 1e-9), 1)} % ({x["forare"]} {x["tin"]})')
            key = (s["maskin"], x["forare"], x["datum"], x["tin"])
            row = dict(maskin_namn=s["maskin"], objekt=objekt, forare=x["forare"], datum=x["datum"], tin=x["tin"], tut=x["tut"], g15=f["g15"], g15_h=round(h, 3),
                       stammar=f["stammar"], volym_m3fub=f["m3"], typ="skördare", sha256=s["sha"], volym_enhet="fub", format="ponsse_skift",
                       kalla="manad" if rt == "manad" else "objekt", g0=f["g0"], kategori=x["kat"], maskin_kalla=s["maskin_kalla"])
            if key in dag:
                p = dag[key]
                if abs(float(p["volym_m3fub"]) - f["m3"]) > 0.01:
                    avvik(s["sha"], s["fil"], x["datum"], s["maskin"], "dagrad_dubblett: volym skiljer mellan rapporter", p["volym_m3fub"], f["m3"], f"{key[1]} {key[3]}")
                continue
            dag[key] = row
            if rt == "objekt":
                obj_dag[(s["maskin"], P.normtext(objekt))][key] = row

    # ---------------------------------------------------------- månad mot objekt
    jmf = []
    for sha, (s, t, objekt, a, b) in rapport_tot.items():
        if s["typ"] != "manad" or not t:
            continue
        ds = [B.d(x["datum"]) for x in s["dagrader"] if B.d(x["datum"])]
        lo, hi = (min(ds), max(ds)) if ds else (a, b)
        obj_rows = [r for k, r in dag.items() if k[0] == s["maskin"] and r["kalla"] == "objekt" and lo.isoformat() <= r["datum"] <= hi.isoformat()]
        m_rows = [P.dagrad_falt(x) for x in s["dagrader"]]
        m_vol = round(t["m3"], 1)
        m_dag_vol = round(sum(f["m3"] for f in m_rows if f), 1)
        o_vol = round(sum(float(r["volym_m3fub"]) for r in obj_rows), 1)
        o_g15 = sum(P.minuter(r["g15"]) for r in obj_rows)
        jmf.append(dict(filnamn=s["fil"], maskin=s["maskin"], maskin_kalla=s["maskin_kalla"], period=f"{lo}..{hi}", manad_m3_block=m_vol, manad_m3_dagrader=m_dag_vol,
                        manad_g15=hm(t["g15"]), objektrapporter_m3=o_vol, objektrapporter_g15=hm(o_g15), objektrapporter_dagrader=len(obj_rows),
                        diff_m3=round(o_vol - m_vol, 1), diff_pct=round(100 * (o_vol - m_vol) / m_vol, 1) if m_vol else ""))
        if m_vol and abs(o_vol - m_vol) > 0.02 * m_vol:
            avvik(sha, s["fil"], s["utskriven"], s["maskin"], "skift_summa: objektrapporter mot månadsrapport", m_vol, o_vol, f"{round(100 * (o_vol - m_vol) / m_vol, 1)} %")
    skriv("ponsse_manad_mot_objekt.csv", jmf, list(jmf[0]) if jmf else ["filnamn"])

    # ---------------------------------------------------------- aggregat per (maskin, objekt) av unika dagrader (effektivitet)
    kum = {}
    for (mk, on), rows in obj_dag.items():
        g15 = sum(P.minuter(r["g15"]) for r in rows.values())
        m3 = sum(float(r["volym_m3fub"]) for r in rows.values())
        st = sum(int(r["stammar"]) for r in rows.values())
        # största objektrapport (kumulativ) som kontroll
        rep = [(t, s, ob) for sha, (s, t, ob, a, b) in rapport_tot.items() if s["typ"] == "objekt" and t and s["maskin"] == mk and P.normtext(ob) == on]
        mx = max(rep, key=lambda x: x[0]["g15"]) if rep else None
        kum[(mk, on)] = (g15, m3, st, rows, mx)
    ack = []
    for (mk, on), (g15, m3, st, rows, mx) in kum.items():
        first = sorted(rows.values(), key=lambda r: r["datum"])[0]
        last = sorted(rows.values(), key=lambda r: r["datum"])[-1]
        ks = Counter(r["kategori"] for r in rows.values() if r["kategori"])
        katm = {KAT_MAP.get(k.lower(), "?") for k in ks}
        ar = ""
        if len(katm) == 1 and "?" not in katm:
            ar = next(iter(katm))
        elif katm:
            ar = "okänd (flera)"
        if not ar and mx:
            ar = ""  # blockkategori används i rapporterna nedan
        mxs = mx[1] if mx else None
        if mx and mx[0]["g15"] and abs(g15 - mx[0]["g15"]) > 0.02 * mx[0]["g15"]:
            avvik(mxs["sha"], mxs["fil"], first["datum"], mk, "skift_summa: unika dagrader mot största objektrapport (G15)", hm(mx[0]["g15"]), hm(g15),
                  f"{round(100 * (g15 - mx[0]['g15']) / mx[0]['g15'], 1)} %")
        if mx and mx[0]["m3"] and abs(m3 - mx[0]["m3"]) > 0.02 * mx[0]["m3"]:
            avvik(mxs["sha"], mxs["fil"], first["datum"], mk, "skift_summa: unika dagrader mot största objektrapport (m3)", round(mx[0]["m3"], 1), round(m3, 1),
                  f"{round(100 * (m3 - mx[0]['m3']) / mx[0]['m3'], 1)} %")
        # blockkategori från alla objektrapporter för (maskin, objekt)
        ks2 = set()
        for sha, (s, t, ob, a, b) in rapport_tot.items():
            if s["typ"] == "objekt" and t and s["maskin"] == mk and P.normtext(ob) == on:
                ks2 |= {KAT_MAP.get(k.lower(), "?") for k in t["kat"].split("/") if k}
        if not ar and ks2:
            ar = next(iter(ks2)) if len(ks2) == 1 and "?" not in ks2 else "okänd (flera)"
        ext = {}
        if mx and mx[0]["g15"] and abs(g15 - mx[0]["g15"]) <= 0.05 * mx[0]["g15"] and mx[0]["bransle_l"] is not None and mx[0]["fuel_g15"] == mx[0]["g15"]:
            ext = dict(bransle_l=round(mx[0]["bransle_l"], 1), arbetstid=hm(mx[0]["arbetstid"]), g15_arbetstid=hm(mx[0]["g15_arb"])) if mx[0]["arbetstid"] else dict(bransle_l=round(mx[0]["bransle_l"], 1))
        ack.append(dict(**ext, status="ok", format="ponsse_skift_objekt", volym_enhet="fub", sha256=(mxs["sha"] if mxs else first["sha256"]), rapportdatum=last["datum"],
                        maskin_namn=mk, typ="skördare", rapporttyp="objekt_aggregat", objekt=(mxs and kum[(mk, on)][4][2]) or first["objekt"], stammar=st,
                        volym_m3fub=round(m3, 3), g15=hm(g15), antal_skift=len(rows), kalla_typ="vektor-pdf", filnamn=(mxs["fil"] if mxs else ""),
                        maskin_kalla=first["maskin_kalla"], objekt_nyckel=f"{mk}|SA|{on}", atgard_rapport=ar, fran=first["datum"], till=last["datum"]))
    # objektrapporter utan dagrader (18 st) -> egen rad med blocktotaler (kumulativ: största G15 per maskin+objekt)
    utan = defaultdict(list)
    for sha, (s, t, ob, a, b) in rapport_tot.items():
        if s["typ"] == "objekt" and t and not s["dagrader"] and (s["maskin"], P.normtext(ob)) not in kum:
            utan[(s["maskin"], P.normtext(ob))].append((t, s, ob, a, b))
    for (mk, on), lst in utan.items():
        t, s, ob, a, b = max(lst, key=lambda x: x[0]["g15"])
        ks = {KAT_MAP.get(k.lower(), "?") for k in t["kat"].split("/") if k}
        ext = dict(bransle_l=round(t["bransle_l"], 1) if t["bransle_l"] is not None and t["fuel_g15"] == t["g15"] else "",
                   arbetstid=hm(t["arbetstid"]) if t["arbetstid"] else "", g15_arbetstid=hm(t["g15_arb"]) if t["arbetstid"] else "")
        ack.append(dict(**ext, status="ok", format="ponsse_skift_objekt", volym_enhet="fub", sha256=s["sha"], rapportdatum=b.isoformat() if b else s["utskriven"], maskin_namn=mk,
                        typ="skördare", rapporttyp="objekt_aggregat", objekt=ob, stammar=t["stammar"], volym_m3fub=round(t["m3"], 3), g15=hm(t["g15"]), antal_skift=0,
                        kalla_typ="vektor-pdf", filnamn=s["fil"], maskin_kalla=s["maskin_kalla"], objekt_nyckel=f"{mk}|SA|{on}",
                        atgard_rapport=(next(iter(ks)) if len(ks) == 1 and "?" not in ks else ("okänd (flera)" if ks else "")), fran=a or "", till=b or ""))
    orows += ack

    # ---------------------------------------------------------- skriv in i objekt.csv / skift.csv / avvikelser.csv (idempotent)
    O, ok = las_csv("objekt.csv")
    for k in ("maskin_kalla", "atgard_rapport", "fran", "till", "arbetstid", "g15_arbetstid"):
        if k not in ok:
            ok.append(k)
    O = [o for o in O if o["format"] not in NYA_FORMAT and o["format"] != "ponsse_skift_objekt"]
    skriv("objekt.csv", O + [{**{k: "" for k in ok}, **o} for o in orows], ok)
    S, sk = las_csv("skift.csv")
    for k in ("kategori", "maskin_kalla"):
        if k not in sk:
            sk.append(k)
    S = [x for x in S if x["format"] != "ponsse_skift"]
    nya = sorted(dag.values(), key=lambda r: (r["maskin_namn"], r["datum"], r["tin"]))
    skriv("skift.csv", S + [{**{k: "" for k in sk}, **r} for r in nya], sk)
    A, ak = las_csv("avvikelser.csv")
    A = [x for x in A if not x["kontroll"].startswith(AVV_PREFIX)]
    skriv("avvikelser.csv", A + avv, ak)

    with open(IMP / "ponsse_skift_gissade.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "filnamn", "datum", "avsandare", "typ", "maskin_gissad", "grund"])
        for s in gissade:
            w.writerow([s["sha"], s["fil"], s["utskriven"], s["avsandare"], s["typ"], s["maskin"], s["maskin_kalla"]])
    # bevis: råtext där modellen hittades, 5 per maskin
    with open(IMP / "ponsse_maskin_bevis.txt", "w", encoding="utf-8") as fh:
        for mn in ("Scorpion Giant 2023", "Scorpion Giant 2025", "Scorpion King ny"):
            fh.write(f"=== {mn} ({sum(1 for m in mb if m['maskin'] == mn)} mätbevis) ===\n")
            for m in [m for m in mb if m["maskin"] == mn][::max(1, sum(1 for m in mb if m['maskin'] == mn) // 5)][:5]:
                fh.write(f"{m['utskriven']}  {m['fil'][:40]:40s}  maskinrad: {m['maskin_text'][:110]!r}\n")
    print(f"mätbevis {len(mb)}, skift {len(skift)} (gissade {len(gissade)}), unika dagrader {len(dag)}, aggregat {len(ack)}, avvikelser nya {len(avv)}")
    print("maskin_kalla Skift:", Counter(s["maskin_kalla"].split(":")[0].split(" (")[0] for s in skift))
    print("gissade per maskin:", Counter(s["maskin"] for s in gissade), "per typ:", Counter(s["typ"] for s in gissade))
    print("avvikelser nya per kontroll:", Counter(a["kontroll"] for a in avv).most_common(12))


if __name__ == "__main__":
    main()
