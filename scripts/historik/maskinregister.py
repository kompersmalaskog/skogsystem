"""Steg 1: slutligt maskinregister + maskin per produktionsrapport (ingen databas).

Läser inventering.csv, texter.jsonl, forester_full.jsonl och rottne_koppling.csv i importmappen och skriver
maskinregister.csv (en rad per maskin) och rapport_maskin.csv (en rad per produktionsrapport).
"""
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import inventera as I  # noqa: E402

IMP = Path("C:/Users/lindq/skogsystem-import")

# (namn, typ, tillverkare, identifierare, agare)
KOMATSU = {
    "9410013317": ("Komatsu 941", "skördare"),
    "9013050241": ("Komatsu 901XC", "skördare"),
    "8400041312": ("Komatsu 840.4", "skotare"),
    "8600041961": ("Komatsu 860.4", "skotare"),
    "8300031793": ("Komatsu 830.3", "skotare"),
    "8750000091": ("Komatsu 875", "skotare"),
}
ROTTNE = {
    "63308": "Rottne H8B", "63818": "Rottne H8D",
    "64101": "Rottne H8E Logmax", "64428": "Rottne H8E 2026",
}
PONSSE = {  # modellnamn i rapporten -> (maskinnamn, typ)
    "Ponsse Bear 2015": ("Ponsse Bear", "skördare"),
    "Ponsse Scorpion King": ("Ponsse Scorpion King", "skördare"),
    "Ponsse Elephant King Af": ("Elephant King gammal", "skotare"),
    "Ponsse Elephant King 2015": ("Elephant King ny", "skotare"),
    "Ponsse Wisent 2015": ("Ponsse Wisent", "skotare"),
}
INFO = {  # maskinnamn -> (typ, tillverkare, identifierare, agare)
    **{n: (t, "Komatsu", c, "egen") for c, (n, t) in KOMATSU.items()},
    "Komatsu 911.3": ("skördare", "Komatsu", "AptMan 911.3 (maskin nr 311608)", "egen"),
    **{n: ("skördare", "Rottne", c, "egen") for c, n in ROTTNE.items()},
    **{n: (t, "Ponsse", m, "egen") for m, (n, t) in PONSSE.items()},
    "Extern: Magnus Gustafsson": ("", "Rottne/Ponsse (Forester F30, okänd)", "magnusgustafsson76@gmail.com", "extern"),
    "exkludera: Komatsu 951 demo": ("skördare", "Komatsu", "9510004659", "exkludera"),
    "exkludera: per.lyseback (Komatsu 901)": ("skördare", "Komatsu", "9010053324", "exkludera"),
    "exkludera: Ponsse månads-/årsrapporter": ("", "Ponsse", "ämne 'månad' eller Tidsintervall >= 21 dagar", "exkludera"),
    "exkludera: Rottne månads-/årsrapporter": ("", "Rottne", "Rapporttyp Tidsorienterad", "exkludera"),
    "exkludera: Rottne okopplade objektrapporter": ("", "Rottne", "ingen mätsedel hittad", "exkludera"),
}
EXKL = {"exkludera: Komatsu 951 demo", "exkludera: per.lyseback (Komatsu 901)",
        "exkludera: Ponsse månads-/årsrapporter", "exkludera: Rottne månads-/årsrapporter",
        "exkludera: Rottne okopplade objektrapporter"}


def mail(s):
    m = re.search(r"[\w.+-]+@[\w.-]+", s)
    return m.group(0).lower() if m else s.strip()


def datum(r):
    return r["rapportdatum"] if I.ar_av(r) == r["rapportdatum"][:4] else r["mejldatum"]


def main():
    rows = [r for r in csv.DictReader(open(IMP / "inventering.csv", encoding="utf-8-sig"))
            if r["format"] in I.PRODUKTIONSFORMAT]
    texter = {}
    for l in open(IMP / "texter.jsonl", encoding="utf-8"):
        d = json.loads(l)
        texter[d["sha"]] = d["text"]
    kopp = {r["sha256"]: r for r in csv.DictReader(open(IMP / "rottne_koppling.csv", encoding="utf-8-sig"))}
    tidsor = set()
    for l in open(IMP / "forester_full.jsonl", encoding="utf-8"):
        d = json.loads(l)
        if "Tidsorienterad" in " ".join(d["pages"]):
            tidsor.add(d["sha"])

    out = []
    for r in rows:
        f, sha, a = r["format"], r["sha256"], mail(r["avsandare"])
        namn, orsak = None, ""
        if a == "magnusgustafsson76@gmail.com":
            namn, orsak = "Extern: Magnus Gustafsson", "avsändare"
        elif a == "per.lyseback@komatsuforest.com":
            namn, orsak = "exkludera: per.lyseback (Komatsu 901)", "avsändare"
        elif f in ("maxixplorer_drf", "maxixplorer_produktionsrapport"):
            ch = r["chassinummer"]
            if ch == "9510004659":
                namn, orsak = "exkludera: Komatsu 951 demo", "demomaskin"
            elif ch in KOMATSU:
                namn = KOMATSU[ch][0]
            else:
                namn, orsak = "exkludera: per.lyseback (Komatsu 901)", f"okänt chassinr {ch}"
        elif f in ("aptman_drf", "aptman_produktionsnota"):
            namn = "Komatsu 911.3"
        elif f == "ponsse_maskinspecifik_summering":
            t = texter[sha]
            m = re.search(r"Tidsintervall\s+(\d{4}-\d\d-\d\d)\s*-\s*(\d{4}-\d\d-\d\d)", t)
            span = (date.fromisoformat(m.group(2)) - date.fromisoformat(m.group(1))).days if m else 0
            if re.search(r"m[åa]nad", r["amne"], re.I) or span >= 21:
                namn = "exkludera: Ponsse månads-/årsrapporter"
                orsak = "ämne månad" if re.search(r"m[åa]nad", r["amne"], re.I) else f"Tidsintervall {span} dagar"
            else:
                namn = PONSSE[r["maskinmodell"]][0]
        elif f == "forester_driftuppfoljningsrapport":
            k = kopp[sha]
            if sha in tidsor:
                namn, orsak = "exkludera: Rottne månads-/årsrapporter", "Tidsorienterad"
            elif k["koppling"] == "okopplad":
                namn, orsak = "exkludera: Rottne okopplade objektrapporter", "okopplad"
            else:
                namn, orsak = ROTTNE[k["chassinummer"]], k["koppling"]
        elif f == "forester_driftuppfoljning":
            namn = "Extern: Magnus Gustafsson"
        out.append(dict(sha256=sha, format=f, maskin_namn=namn, orsak=orsak, datum=datum(r),
                        avsandare=a, filnamn=r["filnamn"]))

    assert len(out) == len({o["sha256"] for o in out}) == len(rows) and all(o["maskin_namn"] for o in out)
    for o in out:
        o["maskin_namn_csv"] = "exkludera" if o["maskin_namn"] in EXKL else o["maskin_namn"]
    with open(IMP / "rapport_maskin.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "maskin_namn", "format", "datum", "avsandare", "orsak", "filnamn"])
        for o in sorted(out, key=lambda o: (o["datum"], o["sha256"])):
            w.writerow([o["sha256"], o["maskin_namn_csv"], o["format"], o["datum"], o["avsandare"], o["orsak"], o["filnamn"]])

    g = defaultdict(list)
    for o in out:
        g[o["maskin_namn"]].append(o["datum"])
    with open(IMP / "maskinregister.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["maskin_namn", "typ", "tillverkare", "identifierare", "forsta_datum", "sista_datum", "antal_rapporter", "agare"])
        for n, d in sorted(g.items(), key=lambda kv: (INFO[kv[0]][3] == "exkludera", INFO[kv[0]][3] == "extern", kv[0])):
            t, tv, ident, ag = INFO[n]
            w.writerow([n, t, tv, ident, min(d), max(d), len(d), ag])
    return out, g


if __name__ == "__main__":
    out, g = main()
    print(len(out), "rapporter")
    for n, d in sorted(g.items(), key=lambda kv: -len(kv[1])):
        print(f"{len(d):5d}  {min(d)}  {max(d)}  {INFO[n][3] if INFO[n][3] == 'exkludera' else INFO[n][2]!s:40.40}  {n}")
