"""Engångsinventering av PDF-bilagor i Google Takeout-mbox-exporter.

Fristående — ingen databaskontakt, inget i Next-bygget. Allt skrivs till importmappen
(utanför repot): pdf/<sha256>.pdf, occurrences.jsonl, texter.jsonl, inventering.csv, inventering.md.

Faser (körs i ordning, varje fas återupptar där den slutade):
  extract  mbox -> pdf/ + occurrences.jsonl   (långsam: läser alla GB)
  texter   pdf/ -> texter.jsonl               (första sidans text, cache)
  rapport  texter + occurrences -> csv + md   (snabb, kan köras om efter att signaturer ändrats)

Användning: python inventera.py [importmapp] [--fas extract|texter|rapport|alla]
"""
import argparse
import csv
import hashlib
import io
import json
import logging
import re
import sys
import time
from collections import Counter, defaultdict
from email import message_from_bytes
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime, parseaddr
from pathlib import Path

DEFAULT_DIR = Path(r"C:\Users\lindq\skogsystem-import")
SEP_RE = re.compile(rb"^From \S+ +\w{3} +\w{3} +\d")  # Gmail: "From 123@xxx Mon Oct 06 ..."
TEXT_CHARS = 6000  # sparas per unik PDF i texter.jsonl


def dekoda(v):
    if v is None:
        return ""
    try:
        return str(make_header(decode_header(str(v)))).strip()
    except Exception:
        return str(v).strip()


# ----------------------------------------------------------------------------- extract

def iter_mbox(path):
    """Strömmar råa mejl (bytes) ur en mbox utan att ladda hela filen."""
    buf = []
    with open(path, "rb") as f:
        for line in f:
            if SEP_RE.match(line) and (not buf or buf[-1].strip() == b""):
                if buf:
                    yield b"".join(buf)
                buf = []
                continue  # själva From-raden hör inte till mejlet
            buf.append(line)
    if buf:
        yield b"".join(buf)


def pdf_delar(msg):
    """Ger (filnamn, bytes) för varje PDF-bilaga — även med fel MIME-typ."""
    for part in msg.walk():
        if part.is_multipart():
            continue
        namn = dekoda(part.get_filename())  # get_filename hanterar RFC 2231
        if not namn:
            namn = dekoda(part.get_param("name"))
        ctype = part.get_content_type()
        namn_pdf = namn.lower().endswith(".pdf")
        if not (namn_pdf or ctype == "application/pdf" or (ctype == "application/octet-stream" and not namn)):
            continue
        try:
            data = part.get_payload(decode=True)
        except Exception as e:
            logging.warning("payload-fel (%s): %s", namn, e)
            continue
        if not data:
            continue
        if data[:5] != b"%PDF-" and b"%PDF-" not in data[:1024]:
            continue  # lovade PDF men är det inte
        yield namn or "(namnlös).pdf", data


def fas_extract(imp: Path):
    pdf_dir = imp / "pdf"
    pdf_dir.mkdir(exist_ok=True)
    occ_path = imp / "occurrences.jsonl"
    klar_path = imp / "extract_klar.json"
    klara = set(json.loads(klar_path.read_text("utf-8"))) if klar_path.exists() else set()
    mboxar = sorted(imp.rglob("*.mbox"))
    if not mboxar:
        sys.exit(f"Inga .mbox hittades under {imp}")
    # konto = takeout-mappens namn (två konton → två exporter)
    for mbox in mboxar:
        konto = next((p for p in mbox.relative_to(imp).parts if p.startswith("takeout")), mbox.parent.name)
        if konto in klara:
            print(f"[{konto}] redan klar, hoppar över")
            continue
        total = mbox.stat().st_size
        print(f"[{konto}] {mbox.name} ({total / 1e9:.1f} GB)")
        n_mejl = n_fel = n_pdf = n_nya = 0
        pos = 0
        t0 = time.time()
        with open(occ_path, "a", encoding="utf-8") as occ:
            for raw in iter_mbox(mbox):
                n_mejl += 1
                pos += len(raw)
                try:
                    msg = message_from_bytes(raw)
                    fran = dekoda(msg.get("From"))
                    amne = dekoda(msg.get("Subject"))
                    try:
                        datum = parsedate_to_datetime(msg.get("Date")).strftime("%Y-%m-%d")
                    except Exception:
                        datum = ""
                    for namn, data in pdf_delar(msg):
                        sha = hashlib.sha256(data).hexdigest()
                        mal = pdf_dir / f"{sha}.pdf"
                        ny = not mal.exists()
                        if ny:
                            mal.write_bytes(data)
                            n_nya += 1
                        n_pdf += 1
                        occ.write(json.dumps({
                            "sha": sha, "konto": konto, "fran": fran, "datum": datum,
                            "amne": amne, "filnamn": namn, "bytes": len(data),
                        }, ensure_ascii=False) + "\n")
                except Exception as e:  # ett trasigt mejl stoppar aldrig körningen
                    n_fel += 1
                    logging.error("mejl %d i %s: %s: %s", n_mejl, konto, type(e).__name__, e)
                if n_mejl % 500 == 0:
                    occ.flush()
                    print(f"\r  {n_mejl} mejl · {pos / total * 100:4.1f}% · {n_pdf} PDF-förekomster · "
                          f"{n_nya} unika · {n_fel} fel · {time.time() - t0:.0f}s", end="", flush=True)
        print(f"\n  klart: {n_mejl} mejl, {n_pdf} PDF-förekomster, {n_nya} nya unika, {n_fel} trasiga mejl")
        klara.add(konto)
        klar_path.write_text(json.dumps(sorted(klara)), "utf-8")


# ----------------------------------------------------------------------------- texter

def _las_forsta_sidan(f):
    from pypdf import PdfReader
    logging.getLogger("pypdf").setLevel(logging.CRITICAL)
    rec = {"sha": f.stem, "text": "", "sidor": None, "fel": None}
    try:
        r = PdfReader(str(f))
        if r.is_encrypted:
            try:
                r.decrypt("")
            except Exception:
                pass
        rec["sidor"] = len(r.pages)
        rec["text"] = (r.pages[0].extract_text() or "")[:TEXT_CHARS]
    except Exception as e:
        rec["fel"] = f"{type(e).__name__}: {e}"[:200]
    return rec


def fas_texter(imp: Path, procs=6):
    from multiprocessing import Pool
    cache_path = imp / "texter.jsonl"
    gjorda = set()
    if cache_path.exists():
        for l in open(cache_path, encoding="utf-8"):
            if l.strip():
                gjorda.add(json.loads(l)["sha"])
    filer = sorted((imp / "pdf").glob("*.pdf"))
    kvar = [f for f in filer if f.stem not in gjorda]
    print(f"{len(filer)} unika PDF, {len(kvar)} kvar att läsa ({procs} processer)")
    with open(cache_path, "a", encoding="utf-8") as out, Pool(procs) as pool:
        for i, rec in enumerate(pool.imap_unordered(_las_forsta_sidan, kvar, chunksize=8), 1):
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            if i % 100 == 0:
                out.flush()
                print(f"\r  {i}/{len(kvar)}", end="", flush=True)
    print("\n  texter klara")


# ----------------------------------------------------------------------------- rapport

def klassa(text, fel):
    """-> (format, extra). Signaturerna ligger här — lägg till nya överst i listan."""
    t = text or ""
    if fel and not t.strip():
        return "pdf_oläsbar", ""
    if len(t.strip()) < 15:
        return "bild_utan_text", ""
    lo = t.lower()
    for namn, krav in SIGNATURER:
        if all(k.lower() in lo for k in krav):
            return namn, ""
    return "okand", " ".join(t.split())[:300]


# (formatnamn, [alla dessa strängar ska finnas i första sidans text])
SIGNATURER = [
    ("maxixplorer_drf", ["Driftsrapport", "MaxiXplorer"]),
    ("aptman_drf", ["DRIFT-INFO", "AptMan"]),
    # Tillagda efter inspektion av okand (tydliga mönster, ej driftsrapporter):
    ("forester_driftuppfoljning", ["Driftuppföljning", "Forester"]),
    ("maxixplorer_produktionsrapport", ["Produktionsrapport", "Alla användare"]),
    ("scania_forarstod", ["Förarstöd", "Vägmätare", "Scania"]),
    ("biometria_prins", ["BIOMETRIA", "produktionsuppföljningssystem"]),
    ("prins_aptuppfoljning", ["Rapporten består av", "Modulträffar"]),
    ("ranking_skordare", ["Ranking skördare"]),
    ("faktura_komatsu", ["Komatsu Forest AB", "Faktura"]),
    ("faktura_komatsu", ["Krediter ges endast"]),
    ("diplom_kurs", ["DIPLOM", "kursen"]),
    ("forester_matsedel", ["Mätsedel", "Forester"]),
    ("forester_driftuppfoljningsrapport", ["Driftuppföljningsrapport", "Maskindata"]),
    ("lastcertifikat", ["Lastcertifikat", "Säljare"]),
    ("aptman_produktionsnota", ["PRODUKTIONSNOTA", "AptMan"]),
    ("ponsse_maskinspecifik_summering", ["Maskinspecifik summering", "Sökvillkor"]),
    ("diameteravvikelse", ["Diameteravvikelse", "Skördare-Förare"]),
    ("faktura_ovrig", ["FAKTURA", "Kompersmåla"]),
    ("faktura_ovrig", ["Invoice number"]),
    ("orderbekraftelse", ["ORDERBEKRÄFTELSE"]),
]

def _g(pat, text, flags=0):
    m = re.search(pat, text, flags)
    return " ".join(m.group(1).split()) if m else ""


def meta_for(fmt, text):
    """Enkel regex-metadata ur första sidans text. Tomt fält = hittades inte."""
    t = text or ""
    if fmt == "maxixplorer_drf":
        obj = _g(r"För objekt,\s*(.+)", t) or _g(r"Objektnamn\s+(.+)", t)
        nr = _g(r"Objektnr\s+(\d+)", t) or _g(r"^\s*(\d{5,})\s*-", obj)
        return {
            "rapportdatum": _g(r"Driftsrapport\s+(\d{4}-\d{2}-\d{2})", t),
            "maskin_nr": _g(r"Maskinidentitet\s+(\d+)", t),
            "chassinummer": _g(r"Chassinummer\s+(\d+)", t),
            "maskinmodell": _g(r"Maskinmodell\s+(\S+)", t),
            "objekt": (f"{nr} " if nr and not obj.startswith(nr) else "") + obj,
            "programversion": _g(r"Programversion\s+MaxiXplorer\s+([\d.]+)", t),
        }
    if fmt == "aptman_drf":
        m = re.search(r"DRIFT-INFO\s+(\d{2})-(\d{2})-(\d{2})", t)
        return {
            "rapportdatum": f"20{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else "",
            "maskin_nr": _g(r"Maskin nr\s*:\s*(\S+)", t),
            "chassinummer": "",
            "maskinmodell": "",
            "objekt": _g(r"Objekt nr\s*:\s*(.+)", t),
            "programversion": _g(r"AptMan version\s+([\d.]+)", t),
        }
    if fmt == "maxixplorer_produktionsrapport":
        obj = _g(r"Objektnamn\s+(.+?)(?:\s+Maskin\w+|\s+Objektnr|$)", t, re.M)
        nr = _g(r"Objektnr\s+(\d+)", t)
        return {
            "rapportdatum": _g(r"Slutdatum\s+(\d{4}-\d{2}-\d{2})", t) or _g(r"Startdatum\s+(\d{4}-\d{2}-\d{2})", t),
            "maskin_nr": _g(r"Maskinidentitet\s+(\d+)", t),
            "chassinummer": _g(r"Chassinummer\s+(\d+)", t),
            "maskinmodell": _g(r"Maskinmodell\s+(\S+)", t),
            "objekt": (f"{nr} " if nr else "") + obj,
            "programversion": _g(r"Program\s*version\s+MaxiXplorer\s+([\d.]+)", t),
        }
    if fmt == "aptman_produktionsnota":
        m = re.search(r"PRODUKTIONSNOTA\s+(\d{2})-(\d{2})-(\d{2})", t)
        nrs = _g(r"Maskinnummer:\s*(\d+\s*,\s*\d+)", t) or _g(r"Maskinnummer:\s*(\d+)", t)
        return {
            "rapportdatum": f"20{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else "",
            "maskin_nr": nrs.split(",")[-1].strip() if nrs else "",  # "3004, 311608" -> 311608 (som i aptman_drf)
            "chassinummer": "",
            "maskinmodell": _g(r"Maskintyp:\s*([\d.]+)", t),
            "objekt": _g(r"Objektnummer:\s*(.+?)\s*Maskinnummer", t, re.S),
            "programversion": _g(r"AptMan version\s+([\d.]+)", t),
        }
    if fmt == "ponsse_maskinspecifik_summering":
        mod = re.search(r"^\d+\s+(Ponsse [^\n]+)$", t, re.M)
        obj = _g(r"Delobjektsnr\s+(.+?),\s*\n", t, re.S) or _g(r"Stämpling\s+(.+?),\s*\n", t, re.S)
        return {
            "rapportdatum": _g(r"Maskinspecifik summering\s+(\d{4}-\d{2}-\d{2})", t),
            "maskin_nr": "",  # "12345" i filen är platshållare, ingen riktig maskinidentitet
            "chassinummer": "",
            "maskinmodell": " ".join(mod.group(1).split()) if mod else "",
            "objekt": obj,
            "programversion": _g(r"(Opti4G\s+[\d.]+)", t),
        }
    if fmt in ("forester_driftuppfoljning", "forester_driftuppfoljningsrapport"):
        # period-/objektrapport: rapportdatum = periodens slut om den finns, annars "Skapad"
        per = re.search(r"Rapporttyp\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})", t) or \
            re.search(r"Slutdatum\s+Rapporttyp\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})", t)
        obj = _g(r"^Namn\s+(.+)$", t, re.M) or _g(r"Avverkningsobjekt\s+(?!Delobjekt)(\S.*)$", t, re.M)
        mid = _g(r"Maskin-id\s+(?!Registrerings)(\S+)", t)
        return {
            "rapportdatum": (per.group(2) if per else "") or _g(r"Skapad\s+(\d{4}-\d{2}-\d{2})", t),
            "maskin_nr": mid,
            "chassinummer": "",
            "maskinmodell": _g(r"Forester\s+(F\d+)", t),
            "objekt": "" if obj.startswith("Ej tillg") else obj,
            "programversion": "",
        }
    return {}


PRODUKTIONSFORMAT = (
    "maxixplorer_drf", "aptman_drf",
    "forester_driftuppfoljning", "forester_driftuppfoljningsrapport",
    "ponsse_maskinspecifik_summering", "aptman_produktionsnota", "maxixplorer_produktionsrapport",
)
BILD_PROD_RE = re.compile(r"drf|prd|prod|drift|gallr|slutavv|avv", re.I)


def fas_rapport(imp: Path):
    texter = {}
    for l in open((imp / "texter.jsonl"), encoding="utf-8"):
        if l.strip():
            r = json.loads(l)
            texter[r["sha"]] = r
    forekomster = defaultdict(list)
    for l in open((imp / "occurrences.jsonl"), encoding="utf-8"):
        if l.strip():
            o = json.loads(l)
            forekomster[o["sha"]].append(o)

    rader = []
    for sha, occ in forekomster.items():
        tr = texter.get(sha, {"text": "", "fel": "saknar text-post"})
        fmt, extra = klassa(tr["text"], tr.get("fel"))
        md = meta_for(fmt, tr["text"])
        forsta = min(occ, key=lambda o: o["datum"] or "9999")
        rader.append({
            "sha256": sha, "format": fmt, **{k: md.get(k, "") for k in META_FALT},
            "forsta_rader": extra if fmt == "okand" else "",
            "forekomster": len(occ),
            "konton": "+".join(sorted({o["konto"][:20] for o in occ})),
            "filnamn": forsta["filnamn"], "avsandare": forsta["fran"],
            "mejldatum": forsta["datum"], "amne": forsta["amne"],
            "sidor": tr.get("sidor") or "",
        })
    # bild_utan_text: troligen produktion om filnamn/ämne har nyckelord eller ett känt maskinnummer
    kanda = {r[k] for r in rader if r["format"] in PRODUKTIONSFORMAT for k in ("maskin_nr", "chassinummer")
             if len(r[k]) >= 4}
    for r in rader:
        r["bild_grupp"] = ""
        if r["format"] == "bild_utan_text":
            hay = f'{r["filnamn"]} {r["amne"]}'
            traff = BILD_PROD_RE.search(hay) or next((n for n in kanda if n in hay), None)
            r["bild_grupp"] = "troligen_produktion" if traff else "ovriga"
    rader.sort(key=lambda r: (r["mejldatum"] or "9999", r["filnamn"]))
    with open(imp / "inventering.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rader[0].keys()))
        w.writeheader()
        w.writerows(rader)
    skriv_md(imp, rader, forekomster)
    print(f"{len(rader)} unika PDF -> inventering.csv + inventering.md")


META_FALT = ["rapportdatum", "maskin_nr", "chassinummer", "maskinmodell", "objekt", "programversion"]


def ar_av(r):
    rd = r["rapportdatum"][:4]
    if rd.isdigit() and 2000 <= int(rd) <= 2026:
        return rd
    return (r["mejldatum"] or "")[:4] or "okänt"


def skriv_md(imp, rader, forekomster):
    ut = []
    P = ut.append
    antal_forek = sum(len(v) for v in forekomster.values())
    P("# Inventering av PDF-bilagor i mejlexporter\n")
    P(f"- Unika PDF: **{len(rader)}** · förekomster totalt: **{antal_forek}** "
      f"(dubbletter: {antal_forek - len(rader)})")
    fm = Counter(r["format"] for r in rader)
    P("- Per format: " + ", ".join(f"{k} {v}" for k, v in fm.most_common()) + "\n")

    KORT = {
        "maxixplorer_drf": "MaxiX drf", "aptman_drf": "AptMan drf",
        "maxixplorer_produktionsrapport": "MaxiX prod", "aptman_produktionsnota": "AptMan nota",
        "ponsse_maskinspecifik_summering": "Ponsse summ", "forester_driftuppfoljning": "Forester obj",
        "forester_driftuppfoljningsrapport": "Forester rapp",
    }
    P("## a) Unika rapporter per år: produktionsdata, bild utan text, övrigt\n")
    P("År = rapportdatum om det lästs ut (2000–2026), annars mejlets datum. "
      "Produktionsdata = de sju formaten i de första kolumnerna.\n")
    kol = list(PRODUKTIONSFORMAT)
    ar = sorted({ar_av(r) for r in rader})
    rubr = [KORT[k] for k in kol] + ["**Summa prod.data**", "Bild, trol. prod.", "Bild, övriga", "Övrigt", "Alla"]
    P("| År | " + " | ".join(rubr) + " |")
    P("|---|" + "---|" * len(rubr))
    c = Counter((ar_av(r), r["format"]) for r in rader)
    cb = Counter((ar_av(r), r["bild_grupp"]) for r in rader if r["bild_grupp"])
    tot = Counter()
    for a_ in ar + ["Totalt"]:
        sel = (lambda r: True) if a_ == "Totalt" else (lambda r, a_=a_: ar_av(r) == a_)
        rs = [r for r in rader if sel(r)]
        vals = [sum(1 for r in rs if r["format"] == f) for f in kol]
        sp = sum(vals)
        bp = sum(1 for r in rs if r["bild_grupp"] == "troligen_produktion")
        bo = sum(1 for r in rs if r["bild_grupp"] == "ovriga")
        ov = len(rs) - sp - bp - bo
        celler = [str(v) if v else "" for v in vals] + [f"**{sp}**", str(bp or ""), str(bo or ""), str(ov or ""), str(len(rs))]
        P(f"| {'**Totalt**' if a_ == 'Totalt' else a_} | " + " | ".join(celler) + " |")
    P("")

    P("## b) Maskinidentiteter (produktionsdata)\n")
    mm = defaultdict(list)
    for r in rader:
        if r["format"] in PRODUKTIONSFORMAT:
            nyckel = r["chassinummer"] or r["maskin_nr"] or ("(" + r["maskinmodell"] + ", utan nr)" if r["maskinmodell"] else "(saknas)")
            mm[(nyckel, r["maskinmodell"])].append(r)
    P("Gruppering på chassinummer (Komatsu) eller Maskin nr (AptMan); saknas båda grupperas på modell "
      "(Ponsse- och Forester-rapporterna har inget riktigt maskinnummer). Identitet = fältet Maskinidentitet.\n")
    P("| Chassinr / maskin nr | Modell | Identitet(er) | Format | Rapporter | Första | Sista |")
    P("|---|---|---|---|---|---|---|")
    for (nr, mod), rs in sorted(mm.items(), key=lambda kv: -len(kv[1])):
        d = sorted(f"{r['rapportdatum'] if ar_av(r) == r['rapportdatum'][:4] else r['mejldatum']}" for r in rs)
        fmts = ",".join(sorted(KORT[f] for f in {r["format"] for r in rs}))
        ids = ",".join(sorted({r["maskin_nr"] for r in rs if r["maskin_nr"]})) or "–"
        P(f"| {nr} | {mod} | {ids} | {fmts} | {len(rs)} | {d[0] if d else ''} | {d[-1] if d else ''} |")
    P("")

    P("## c) 20 vanligaste första raderna bland okand\n")
    rad1 = Counter()
    ex = {}
    for r in rader:
        if r["format"] == "okand":
            k = re.sub(r"\d+", "#", r["forsta_rader"])[:80] or "(tom)"
            rad1[k] += 1
            ex.setdefault(k, r["filnamn"])
    P("| Antal | Första raden (80 tecken) | Exempelfil |")
    P("|---|---|---|")
    for k, n in rad1.most_common(20):
        P(f"| {n} | {k.replace('|', '/')} | {ex[k].replace('|', '/')} |")
    P(f"\n(okand totalt: {fm.get('okand', 0)}, distinkta inledningar: {len(rad1)})\n")

    P("## d) År 2012–2026 utan produktionsdata\n")
    prod_ar = {ar_av(r) for r in rader if r["format"] in PRODUKTIONSFORMAT}
    tomma = [str(y) for y in range(2012, 2027) if str(y) not in prod_ar]
    P("Räknat på alla sju produktionsformat. " + (", ".join(tomma) if tomma else "Inga — alla år har minst en."))
    drf_ar = {ar_av(r) for r in rader if r["format"] in ("maxixplorer_drf", "aptman_drf")}
    P("\nBara de gamla driftsrapporterna (drf, MaxiXplorer + AptMan) saknas: " +
      ", ".join(str(y) for y in range(2012, 2027) if str(y) not in drf_ar) + "\n")

    P("## e) bild_utan_text: troligen produktion eller övriga\n")
    P("Troligen produktion = filnamn eller mejlämne innehåller drf, prd, prod, drift, gallr, slutavv, avv "
      "eller ett känt maskin-/chassinummer.\n")
    P("| År | Troligen produktion | Övriga | Summa |")
    P("|---|---|---|---|")
    bar = sorted({ar_av(r) for r in rader if r["bild_grupp"]})
    for a_ in bar:
        x, y = cb[(a_, "troligen_produktion")], cb[(a_, "ovriga")]
        P(f"| {a_} | {x or ''} | {y or ''} | {x + y} |")
    X = sum(v for (a_, g), v in cb.items() if g == "troligen_produktion")
    Y = sum(v for (a_, g), v in cb.items() if g == "ovriga")
    P(f"| **Totalt** | **{X}** | **{Y}** | **{X + Y}** |")
    ex_o = [r for r in rader if r["bild_grupp"] == "ovriga"][:8]
    P("\nExempel på övriga (filnamn): " + "; ".join(r["filnamn"].replace("|", "/") for r in ex_o))
    (imp / "inventering.md").write_text("\n".join(ut) + "\n", "utf-8")


# ----------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("importmapp", nargs="?", default=str(DEFAULT_DIR))
    ap.add_argument("--fas", default="alla", choices=["extract", "texter", "rapport", "alla"])
    a = ap.parse_args()
    imp = Path(a.importmapp)
    logging.basicConfig(filename=str(imp / "inventera.log"), level=logging.WARNING,
                        format="%(asctime)s %(levelname)s %(message)s", encoding="utf-8")
    if a.fas in ("extract", "alla"):
        fas_extract(imp)
    if a.fas in ("texter", "alla"):
        fas_texter(imp)
    if a.fas in ("rapport", "alla"):
        fas_rapport(imp)


if __name__ == "__main__":
    main()
