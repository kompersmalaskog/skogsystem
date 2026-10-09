"""Steg 5/5b: effektivitet per objekt för alla egna skördare, normkurva per åtgärd (log-log) och index.

Läser objekt.csv + inventering/bilagor (mejlämne). Skriver effektivitet.csv, index_per_ar.csv och normkurvor.csv i importmappen.
Ingen databas.

Åtgärd (gissa inte från medelstam), egna ord eller ordbörjan (siffror får följa):
  gallring: ga, gall*; slutavverkning: au, rp, slutavv*, hygge*; skada: vf, bb, vindfäll*, barkborr*.
Ris, grot, ata och kundnamn är ingen åtgärd. Två olika åtgärder = okänd. Objektnamnet prövas först, sedan mejlämnet.
Skada ligger kvar i effektivitet.csv men ingår inte i normkurvor och index.
"""
import csv
import json
import math
import re
import statistics
from collections import defaultdict
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
HARVESTERS = {"Komatsu 941", "Komatsu 941 AptMan", "Komatsu 901XC", "Komatsu 911.3", "Ponsse Bear", "Scorpion King gammal",
              "Scorpion King ny", "Scorpion Giant 2023", "Scorpion Giant 2025", "Rottne H8B", "Rottne H8D", "Rottne H8E Logmax", "Rottne H8E 2026"}
HELA = {"ga": "gallring", "au": "slutavverkning", "rp": "slutavverkning", "vf": "skada", "bb": "skada", "vind": "skada", "sl": "slutavverkning"}  # "mall" är ingen åtgärd   # hela ord (siffror får följa)
BORJAN = {"gall": "gallring", "slutavv": "slutavverkning", "hygge": "slutavverkning", "vindfäll": "skada", "vindf": "skada", "baggaträd": "skada", "barkb": "skada"}  # ordbörjan (barkb* täcker barkborr*, barkbagge*; steg 8: barkb*, barkborr*, baggaträd* = skada)
TOKEN = re.compile(r"[a-zåäö]+\d*|\d+")


def atgard_av(text):
    """Egna ord eller ordbörjan, inte inuti andra ord. Två olika åtgärder = 'okänd (flera)'."""
    funna = set()
    for tok in TOKEN.findall((text or "").lower()):
        m = re.fullmatch(r"([a-zåäö]+)\d*", tok)
        if not m:
            continue
        w = m.group(1)
        if w in HELA:
            funna.add(HELA[w])
        for pre, a in BORJAN.items():
            if w.startswith(pre):
                funna.add(a)
    if len(funna) > 1:
        return "okänd (flera)"
    return next(iter(funna)) if funna else ""


STANDARD = {  # åtgärd när varken objektnamn eller mejlämne ger någon (märks atgardens_kalla=maskinstandard); 901XC saknar standard
    "Komatsu 941": "slutavverkning", "Komatsu 941 AptMan": "slutavverkning", "Ponsse Bear": "slutavverkning", "Scorpion King gammal": "slutavverkning",
    "Rottne H8B": "gallring", "Rottne H8D": "gallring", "Rottne H8E Logmax": "gallring", "Rottne H8E 2026": "gallring", "Komatsu 911.3": "gallring",
}


def klassa(objekt, amne):
    for kalla, txt in (("objektnamn", objekt), ("mejlämne", amne)):
        a = atgard_av(txt)
        if a.startswith("okänd"):
            return "okänd", kalla + ": flera åtgärder i samma text"
        if a:
            return a, kalla
    return "okänd", ""


def norm_obj(s):
    return " ".join(re.sub(r"[^a-zåäö0-9 ]", " ", (s or "").lower()).split())


def main():
    O = list(csv.DictReader(open(IMP / "objekt.csv", encoding="utf-8-sig")))
    amne = {}
    for l in open(IMP / "occurrences.jsonl", encoding="utf-8"):
        o = json.loads(l)
        if o["sha"] not in amne or o["datum"] < amne[o["sha"]][1]:
            amne[o["sha"]] = (o["amne"], o["datum"])
    for l in open(IMP / "bilagor.jsonl", encoding="utf-8"):
        b = json.loads(l)
        if b["sha"] and b["sha"] not in amne:
            amne[b["sha"]] = (b["amne"], b["datum"])
    grupper = defaultdict(list)
    for o in O:
        if o["maskin_namn"] not in HARVESTERS or o["status"] != "ok" or o["format"] in ("matbevis", "lastcertifikat", "aptman_produktionsnota", "ponsse_skift", "ponsse_matbevis_ny"):
            continue
        # nyckel: samma objekt och maskin; rapporterna är kumulativa -> senaste (största) gäller
        key = (o["maskin_namn"], o["objekt_nyckel"] or f'{o["objektnr"]}|{norm_obj(o["objekt"])}')
        grupper[key].append(o)
    rader, bort = [], defaultdict(int)
    for (maskin, nyckel), rs in grupper.items():
        rs = [r for r in rs if r["rapportdatum"]]
        # AptMan drf, Komatsu, Rottne, Ponsse: ta rapporten med högst G15 (kumulativt), annars senaste datum
        def g15h(r):
            if not r["g15"]:
                return -1
            h, m = r["g15"].split(":")
            return int(h) + int(m) / 60
        rs.sort(key=lambda r: (g15h(r), r["rapportdatum"]))
        r = rs[-1]
        if r["stammar"] in ("", None) or r["volym_m3fub"] in ("", None):
            bort[f"{maskin}: saknar stammar eller volym"] += 1
            continue
        g = g15h(r)
        if g < 1:
            bort[f"{maskin}: G15 saknas eller < 1 h"] += 1
            continue
        st, vol = int(float(r["stammar"])), float(r["volym_m3fub"])
        if st <= 0 or vol <= 0:
            bort[f"{maskin}: stammar/volym 0"] += 1
            continue
        a, ak = klassa(r["objekt"], amne.get(r["sha256"], ("", ""))[0])
        if r.get("atgard_rapport"):  # Ponsse Skift: kategorin i rapporten (Slutavverkning/Förnyelseavverkning/Gallring) går först
            a, ak = r["atgard_rapport"], "rapportkategori"
        if a == "okänd" and ak == "" and maskin in STANDARD:
            a, ak = STANDARD[maskin], "maskinstandard"
        rader.append(dict(maskin=maskin, objekt=r["objekt"], ar=r["rapportdatum"][:4], rapportdatum=r["rapportdatum"], stammar=st, volym_m3fub=round(vol, 3),
                          g15_h=round(g, 2), medelstam=round(vol / st, 4), m3fub_per_g15=round(vol / g, 2), atgard=a, atgardens_kalla=ak,
                          kalla=r["format"] + "/" + (r["kalla_typ"] or "pdf"), mejlamne=amne.get(r["sha256"], ("", ""))[0][:50], sha256=r["sha256"]))
    # normkurva per åtgärd: ln(m3fub/G15) = a + b ln(medelstam)
    def anpassa(urval):
        k = {}
        for a in ("gallring", "slutavverkning"):
            xs = [(math.log(r["medelstam"]), math.log(r["m3fub_per_g15"])) for r in urval if r["atgard"] == a]
            n = len(xs)
            mx, my = sum(x for x, _ in xs) / n, sum(y for _, y in xs) / n
            sxx = sum((x - mx) ** 2 for x, _ in xs)
            b = sum((x - mx) * (y - my) for x, y in xs) / sxx
            c = my - b * mx
            ss_res = sum((y - (c + b * x)) ** 2 for x, y in xs)
            ss_tot = sum((y - my) ** 2 for _, y in xs)
            k[a] = (c, b, 1 - ss_res / ss_tot, n)
        return k
    kurvor_med = anpassa(rader)  # med maskinstandard (jämförelse)
    kurvor_utan = anpassa([r for r in rader if r["atgardens_kalla"] != "maskinstandard"])
    kurvor = kurvor_utan  # index och index_per_ar.csv räknas sedan steg 6 mot kurvorna UTAN maskinstandard
    for r in rader:
        if r["atgard"] in kurvor:
            c, b, _, _ = kurvor[r["atgard"]]
            fv = math.exp(c + b * math.log(r["medelstam"]))
            r["forvantad_m3fub_per_g15"] = round(fv, 2)
            r["index"] = round(r["m3fub_per_g15"] / fv * 100, 1)
        else:
            r["forvantad_m3fub_per_g15"] = r["index"] = ""
    rader.sort(key=lambda r: (r["maskin"], r["rapportdatum"], r["objekt"]))
    kol = ["maskin", "objekt", "ar", "rapportdatum", "stammar", "volym_m3fub", "g15_h", "medelstam", "m3fub_per_g15", "atgard", "atgardens_kalla",
           "forvantad_m3fub_per_g15", "index", "kalla", "mejlamne", "sha256"]
    with open(IMP / "effektivitet.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=kol)
        w.writeheader()
        w.writerows(rader)
    with open(IMP / "normkurvor.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["variant", "atgard", "n", "ln_a", "exponent_b", "R2", "formel"])
        for vn, kk in (("med_maskinstandard", kurvor_med), ("utan_maskinstandard", kurvor_utan)):
            for a, (c, b, r2, n) in kk.items():
                w.writerow([vn, a, n, round(c, 4), round(b, 4), round(r2, 3), f"m3fub/G15 = {math.exp(c):.2f} * medelstam^{b:.3f}"])
    grp = defaultdict(list)
    for r in rader:
        if r["index"] != "":
            grp[(r["ar"], r["maskin"], r["atgard"])].append(r["index"])
    with open(IMP / "index_per_ar.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ar", "maskin", "atgard", "antal_objekt", "medianindex"])
        for k in sorted(grp):
            w.writerow([*k, len(grp[k]), round(statistics.median(grp[k]), 1)])
    grp2 = defaultdict(list)  # alternativt index: mot kurvan MED maskinstandard-objekt
    for r in rader:
        if r["atgard"] in kurvor_med:
            c, b, _, _ = kurvor_med[r["atgard"]]
            grp2[(r["ar"], r["maskin"], r["atgard"])].append(r["m3fub_per_g15"] / math.exp(c + b * math.log(r["medelstam"])) * 100)
    with open(IMP / "index_per_ar_med_standardkurva.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ar", "maskin", "atgard", "antal_objekt", "medianindex"])
        for k in sorted(grp2):
            w.writerow([*k, len(grp2[k]), round(statistics.median(grp2[k]), 1)])
    okand = [r for r in rader if r["atgard"] == "okänd"]
    print(f"{len(rader)} objekt i effektivitet.csv; okänd åtgärd: {len(okand)} ({100 * len(okand) / len(rader):.0f} %)")
    print("bortfall:", dict(bort))
    for vn, kk in (("MED maskinstandard", kurvor_med), ("UTAN maskinstandard", kurvor_utan)):
        for a, (c, b, r2, n) in kk.items():
            print(f"{vn:20s} {a:15s} n={n:4d}  m3fub/G15 = {math.exp(c):.2f} * medelstam^{b:.3f}  R2={r2:.3f}")
    for a in kurvor:
        for ms in (0.15, 0.50):
            m1 = math.exp(kurvor_med[a][0] + kurvor_med[a][1] * math.log(ms))
            m2 = math.exp(kurvor_utan[a][0] + kurvor_utan[a][1] * math.log(ms))
            print(f"{a:15s} medelstam {ms:.2f}: med {m1:.2f}, utan {m2:.2f} m3fub/G15 -> skillnad {100 * (m1 - m2) / m2:+.1f} %")
    return rader, kurvor, grp


if __name__ == "__main__":
    main()
