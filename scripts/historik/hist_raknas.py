"""Steg 9: sätter raknas / dubblett_av på hist_objekt (CSV), så att summor per maskin och år inte dubbelräknar.

raknas = true för EXAKT EN rapport per objekt och maskin: ej exkluderad, typ = objekt, och bland dubbletterna den senaste/största:
  rangordning inom en grupp: har G15 (Ponsse: Skift med G15 före Mätbevis utan), störst G15, störst volym, senast rapportdatum.
Grupper (samma maskin):
  - samma objektnyckel (kumulativa utskrifter av samma objekt: Komatsu/Rottne/AptMan/Ponsse Maskinspecifik/Lastcertifikat/Ponsse Skift)
  - Ponsse Mätbevis (ny) ingår i samma grupp som Skift-rapporten för samma objekt (objektnamn lik >= 0,8 och +-45 dagar, eller samma stammar och volym +-1 %)
  - OptiWin-Mätbevis (Bear m.fl.) ingår i samma grupp som Maskinspecifik för samma objekt (nummer ur objekt.csv:dubblett_av, annars namn >= 0,8 och +-45 dagar)
  - AptMan produktionsnota ingår i samma grupp som DRIFT-INFO för samma objekt (samma nyckel, annars samma namn och maskin)
dubblett_av = sha256 för den rapport som räknas, på alla övriga rapporter i gruppen. Exkluderade, månads- och sök-rapporter: raknas=false, dubblett_av tomt.
Skriver om hist_csv/hist_objekt.csv med kolumnerna raknas och dubblett_av. Ingen databas.
"""
import csv
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bygg_skift as B  # noqa: E402  (lik: namnlikhet)
import effektivitet as EF  # noqa: E402  (norm_obj)

IMP = Path("C:/Users/lindq/skogsystem-import")
OUT = IMP / "hist_csv"


def d(s):
    try:
        return date.fromisoformat((s or "")[:10])
    except Exception:
        return None


def las(p, enc="utf-8"):
    with open(p, encoding=enc, newline="") as fh:
        r = csv.DictReader(fh)
        return list(r), list(r.fieldnames)


def num(x):
    return float(x) if x not in ("", None) else 0.0


def nara(a, b, dagar=45):
    """Datumfönster: [start-45, slut+45] för a överlappar b."""
    a0, a1 = d(a["startdatum"]) or d(a["rapportdatum"]), d(a["slutdatum"]) or d(a["rapportdatum"])
    b0, b1 = d(b["startdatum"]) or d(b["rapportdatum"]), d(b["slutdatum"]) or d(b["rapportdatum"])
    if not (a0 and a1 and b0 and b1):
        return True
    return (a0 - b1).days <= dagar and (b0 - a1).days <= dagar


def main():
    H, kol = las(OUT / "hist_objekt.csv")
    R = {r["sha256"]: r for r in las(OUT / "hist_rapport.csv")[0]}
    OBJ = {o["sha256"]: o for o in las(IMP / "objekt.csv", "utf-8-sig")[0] if o["format"] != "ponsse_skift_objekt"}
    for h in H:
        r = R[h["sha256"]]
        h["_f"], h["_m"] = r["format"], r["maskin_namn"]
        h["_ok"] = r["exkluderad"] == "false" and r["typ"] == "objekt"
        h["raknas"], h["dubblett_av"] = "false", ""
    kand = [h for h in H if h["_ok"] and h["_m"]]
    # --------------------------------------------------------------- grupp-id via union-find
    forf = {h["sha256"]: h["sha256"] for h in kand}

    def find(x):
        while forf[x] != x:
            forf[x] = forf[forf[x]]
            x = forf[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            forf[rb] = ra

    nyckel = defaultdict(list)
    for h in kand:
        nyckel[(h["_m"], h["objekt_nyckel"] or f'{h["objektnr"]}|{EF.norm_obj(h["objekt"])}')].append(h)
    for g in nyckel.values():
        for h in g[1:]:
            union(g[0]["sha256"], h["sha256"])
    per_m = defaultdict(list)
    for h in kand:
        per_m[h["_m"]].append(h)
    stat = Counter()
    for m, rows in per_m.items():
        # Ponsse Mätbevis (ny) -> Skift
        skift = [h for h in rows if h["_f"] == "ponsse_skift"]
        for mb in (h for h in rows if h["_f"] == "ponsse_matbevis_ny"):
            best = max(((B.lik(mb["objekt"], s["objekt"]), s) for s in skift if nara(mb, s)), key=lambda x: x[0], default=(0, None))
            if best[0] >= 0.8:
                union(best[1]["sha256"], mb["sha256"])
                stat["mätbevis_ny -> skift"] += 1
                continue
            # namnen läses ibland fel ur ritad text ('?' för å/ä/ö): samma stammar och samma volym (+-1 %) inom +-45 dagar = samma objekt
            if mb["stammar"] and mb["volym_m3fub"]:
                v = float(mb["volym_m3fub"])
                for s in skift:
                    if s["stammar"] == mb["stammar"] and s["volym_m3fub"] and abs(float(s["volym_m3fub"]) - v) <= 0.01 * v + 0.2 and nara(mb, s):
                        union(s["sha256"], mb["sha256"])
                        stat["mätbevis_ny -> skift (stammar+volym)"] += 1
                        break
        # OptiWin-Mätbevis -> Maskinspecifik
        ms = [h for h in rows if h["_f"] == "ponsse_maskinspecifik_summering"]
        for mb in (h for h in rows if h["_f"] == "matbevis"):
            ref = OBJ[mb["sha256"]]["dubblett_av"]
            tr = None
            if len(ref) == 64 and ref in forf:
                tr = ref
            elif ref.startswith("maskinspecifik:"):
                nr = ref.split(":")[1]
                tr = next((s["sha256"] for s in ms if s["objektnr"] == nr), None)
            if tr is None:
                best = max(((B.lik(mb["objekt"], s["objekt"]), s) for s in ms if nara(mb, s)), key=lambda x: x[0], default=(0, None))
                if best[0] >= 0.8:
                    tr = best[1]["sha256"]
            if tr:
                union(tr, mb["sha256"])
                stat["matbevis -> maskinspecifik"] += 1
        # AptMan nota -> DRIFT-INFO (samma maskin, samma objektnamn, +-45 dagar)
        drf = [h for h in rows if h["_f"] == "aptman_drf"]
        for n in (h for h in rows if h["_f"] == "aptman_produktionsnota"):
            if find(n["sha256"]) in {find(x["sha256"]) for x in drf if x["objekt_nyckel"] == n["objekt_nyckel"]}:
                continue
            best = max(((B.lik(n["objekt"], s["objekt"]), s) for s in drf if nara(n, s)), key=lambda x: x[0], default=(0, None))
            if best[0] >= 0.95:
                union(best[1]["sha256"], n["sha256"])
                stat["nota -> drf (namn)"] += 1
    # --------------------------------------------------------------- välj en rapport per grupp
    grupper = defaultdict(list)
    for h in kand:
        grupper[find(h["sha256"])].append(h)

    def rang(h):
        g15 = num(h["g15_h"])
        return (g15 > 0, g15, h["_f"] == "ponsse_skift" or h["_f"] == "maskinspecifik" or h["_f"] in ("aptman_drf", "maxixplorer_drf"), num(h["volym_m3fub"]), h["rapportdatum"])

    for g in grupper.values():
        vald = max(g, key=rang)
        vald["raknas"] = "true"
        for h in g:
            if h is not vald:
                h["dubblett_av"] = vald["sha256"]
    # --------------------------------------------------------------- skriv
    kol2 = kol + [k for k in ("raknas", "dubblett_av") if k not in kol]
    with open(OUT / "hist_objekt.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=kol2, extrasaction="ignore")
        w.writeheader()
        w.writerows(H)
    n_true = sum(1 for h in H if h["raknas"] == "true")
    print(f"hist_objekt: {len(H)} rader, raknas=true {n_true}, dubblett_av satt {sum(1 for h in H if h['dubblett_av'])}, ej kandidat (exkluderad/månad/sök/utan maskin) {len(H) - len(kand)}")
    print("sammanslagningar:", dict(stat))
    print("grupper:", len(grupper), "storlek:", Counter(len(g) for g in grupper.values()).most_common(6))
    print("raknas=true per format:", Counter(h["_f"] for h in H if h["raknas"] == "true"))
    return H


if __name__ == "__main__":
    main()
