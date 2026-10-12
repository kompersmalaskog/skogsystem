"""Steg 14 DEL B: objektnummer ur varje rapport (text, filnamn, mejlämne). Ingen databas.
Två nummerslag, båda delas mellan skördare och skotare i samma objekt:
  objektnr_normaliserat          6 siffror  (Vidas objektnr/storvirkesordernr, t.ex. 954664)
  virkesordernr_normaliserat     8 siffror  (VIOL/virkesordernr/delobjekt-id, t.ex. 40074099, 48203858, 11177393)
Bara siffror. Datum (yymmdd), tidsstämplar (12 siffror), placeholdern 12345 och nummer som står på maskin-/serierader tas inte med.
Skrivs till hist_csv/hist_objektnr.csv: sha256, objektnr_normaliserat, virkesordernr_normaliserat, kalla, ambiguous."""
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hist_objektnr_text import IMP, las_text  # noqa: E402

OUT = IMP / "hist_csv"
LABEL = re.compile(r"(virkesorder|storvirkesorder|objektnr|objekt nr|objekt-?id|objektsid|delobjektsnr|objekt, unikt|delobjekt, unikt|vo[- ]?nr|vo-nummer|objektnummer)", re.I)
UTESLUT_RAD = re.compile(r"(maskin|chassi|serie|aggregat|kund|telefon|tel\b|org)", re.I)
TOKEN = re.compile(r"(?<![\d.,\-/:])(\d{6}|\d{8})(?![\d.,/:])")
SKRAP = {"123456", "12345678", "000000", "00000000", "111111", "222222", "999999"}


def datum_lik8(s):
    return len(s) == 8 and s[:2] in ("19", "20") and 1 <= int(s[4:6]) <= 12 and 1 <= int(s[6:8]) <= 31


def datum_lik(s):
    return len(s) == 6 and 10 <= int(s[:2]) <= 29 and 1 <= int(s[2:4]) <= 12 and 1 <= int(s[4:6]) <= 31


def tokens(rad):
    for m in TOKEN.finditer(rad):
        n = m.group(1)
        if n in SKRAP or n.strip("0") == "" or (len(n) == 6 and datum_lik(n)) or datum_lik8(n) or len(set(n)) == 1:
            continue
        yield n


def ur_text(text):
    rader = text.split("\n")
    ut = []
    for i, r in enumerate(rader):
        if LABEL.search(r):
            for j in range(i, min(i + 3, len(rader))):
                if UTESLUT_RAD.search(rader[j]) and j > i:
                    continue
                ut += list(tokens(rader[j]))
    return ut


PONSSE_HUVUD = {"lastcertifikat", "ponsse_maskinspecifik_summering", "matbevis", "ponsse_matbevis_ny"}


def ur_huvud(text):
    """Ponsse OptiReport-formaten: id-fälten står i sidhuvudet, före första sortiments-/lagerspecifikation."""
    ut = []
    for i, r in enumerate(text.split(chr(10))):
        if i > 45 or r.startswith("Lagerspecifik") or "Sortiment" in r[:12]:
            break
        if UTESLUT_RAD.search(r):
            continue
        ut += list(tokens(r))
    return ut


def ur_namn(s):
    return list(tokens(s or ""))


def main():
    T = las_text()
    rap = {r["sha256"]: r for r in csv.DictReader(open(OUT / "hist_rapport.csv", encoding="utf-8"))}
    amne = {}
    for l in open(IMP / "occurrences.jsonl", encoding="utf-8"):
        o = json.loads(l)
        amne.setdefault(o["sha"], o.get("amne", ""))
    obj = {o["sha256"]: o for o in csv.DictReader(open(OUT / "hist_objekt.csv", encoding="utf-8"))}
    rader = []
    for sha, o in obj.items():
        src = {"text": ur_text(T.get(sha, "")) + (ur_huvud(T.get(sha, "")) if rap[sha]["format"] in PONSSE_HUVUD else []), "namn": ur_namn(o["objekt"]), "filnamn": ur_namn(rap[sha]["filnamn"]), "amne": ur_namn(amne.get(sha, ""))}
        if o["objektnr"]:
            src["parser"] = ur_namn(o["objektnr"]) if re.fullmatch(r"\d{6}|\d{8}", o["objektnr"] or "") else []
        alla = Counter()
        kalla = defaultdict(set)
        for k, v in src.items():
            for n in set(v):
                alla[n] += 1
                kalla[n].add(k)
        rader.append((sha, alla, kalla))
    # nummer som förekommer i väldigt många rapporter är inte objektnummer
    frek = Counter(n for _, a, _ in rader for n in a)
    vanliga = {n for n, c in frek.items() if c > 25}
    print("tokens som förekommer i >25 rapporter (utesluts):", sorted(vanliga)[:20], len(vanliga))
    # nummer ärvs mellan tvillingar (dubblett_av): lastcertifikatets objektnr och summeringens virkesordernr hör till samma objekt
    egna = {sha: (alla, kalla) for sha, alla, kalla in rader}
    grupp = defaultdict(set)
    for sha, o in obj.items():
        if o["dubblett_av"] and o["dubblett_av"] in obj:
            grupp[o["dubblett_av"]].add(sha)
            grupp[sha].add(o["dubblett_av"])
    ut = []
    for sha, alla, kalla in rader:
        sam, ks = Counter(), defaultdict(set)
        for k in [sha] + sorted(grupp.get(sha, ())):
            a_, k_ = egna[k]
            for n, c in a_.items():
                if n in vanliga:
                    continue
                sam[n] += c
                ks[n] |= set(k_.get(n, set())) | ({"tvilling"} if k != sha else set())
        c6 = sorted((n for n in sam if len(n) == 6), key=lambda n: (-sam[n], n))
        c8 = sorted((n for n in sam if len(n) == 8), key=lambda n: (-sam[n], n))
        n6 = c6[0] if c6 else ""
        n8 = c8[0] if c8 else ""
        ks_ = sorted(set().union(*[ks[n] for n in ([n6] if n6 else []) + ([n8] if n8 else [])])) if (n6 or n8) else []
        ut.append(dict(sha256=sha, objektnr_normaliserat=n6, virkesordernr_normaliserat=n8, objektnr_alla=";".join(c6 + c8), kalla=",".join(ks_),
                       kandidater6=len(c6), kandidater8=len(c8), ambiguous="ja" if (len(c6) > 1 or len(c8) > 1) else ""))
    with open(OUT / "hist_objektnr.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(ut[0]))
        w.writeheader()
        w.writerows(ut)
    return ut, obj, rap


def tabell(ut, obj, rap):
    mt = {m["namn"]: m["typ"] for m in csv.DictReader(open(OUT / "hist_maskin.csv", encoding="utf-8"))}
    d = {u["sha256"]: u for u in ut}
    agg = defaultdict(lambda: [0, 0, 0, 0])
    for sha, o in obj.items():
        if not o["maskin_namn"] or o["raknas"] not in ("true", "True"):
            continue
        u = d[sha]
        y = (o["startdatum"] or o["rapportdatum"])[:4]
        a = agg[(o["maskin_namn"], y)]
        a[0] += 1
        a[1] += bool(u["objektnr_normaliserat"] or u["virkesordernr_normaliserat"])
        a[2] += bool(u["objektnr_normaliserat"])
        a[3] += bool(u["virkesordernr_normaliserat"])
    print(f"{'maskin':22}{'år':6}{'n':>5}{'något nr':>9}{'andel':>7}{'6-siffr':>9}{'8-siffr':>9}")
    for (mk, y), a in sorted(agg.items()):
        print(f"{mk:22}{y:6}{a[0]:5}{a[1]:9}{100 * a[1] / a[0]:6.0f}%{a[2]:9}{a[3]:9}")


if __name__ == "__main__":
    ut, obj, rap = main()
    tabell(ut, obj, rap)
