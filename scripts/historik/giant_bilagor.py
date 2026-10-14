"""Scorpion Giant-sökning: konton per mbox, och alla bilagor (alla filtyper) 2023-03..2026-10 som matchar nyckelord eller kommer från
avsändare som skickat Ponsse-rapporter. Ingen OCR. Skriver giant_bilagor.csv och sparar bilder under giant_bilder/."""
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from email import message_from_bytes
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import inventera as I  # noqa: E402

IMP = Path("C:/Users/lindq/skogsystem-import")
KEY = re.compile(r"giant|gigant|scorpion|skördare|månad", re.I)
BILDEXT = {"jpg", "jpeg", "png", "heic", "tif", "tiff", "gif", "bmp"}


def adr(s):
    m = re.search(r"[\w.+-]+@[\w.-]+", s or "")
    return m.group(0).lower() if m else (s or "").strip().lower()


def text_av(msg):
    ut = []
    for p in msg.walk():
        if p.get_content_type() in ("text/plain", "text/html"):
            try:
                b = p.get_payload(decode=True) or b""
                t = b.decode(p.get_content_charset() or "utf-8", "replace")
                if p.get_content_type() == "text/html":
                    t = re.sub(r"<[^>]+>", " ", t)
                ut.append(t[:20000])
            except Exception:
                pass
    return " ".join(ut)


def main():
    # ---- 1. konton
    for mbox in sorted(IMP.rglob("*.mbox")):
        c_to, c_del = Counter(), Counter()
        for i, raw in enumerate(I.iter_mbox(mbox), 1):
            m = message_from_bytes(raw[:20000])
            c_del[adr(I.dekoda(m.get("Delivered-To")))] += 1
            c_to[adr(I.dekoda(m.get("To")).split(",")[0])] += 1
            if i >= 200:
                break
        print(mbox.parts[-4][:30], "Delivered-To:", c_del.most_common(3), "| To:", c_to.most_common(4))
    # ---- 2. Ponsse-avsändare
    inv = {r["sha256"]: r for r in csv.DictReader(open(IMP / "inventering.csv", encoding="utf-8-sig"))}
    T = {}
    for l in open(IMP / "texter.jsonl", encoding="utf-8"):
        d = json.loads(l)
        T[d["sha"]] = d["text"]
    pshas = {s for s, r in inv.items() if r["format"] in ("ponsse_maskinspecifik_summering", "lastcertifikat")
             or re.match(r"\s*(MÄTBEVIS|Lastcertifikat|Skift\s*\n|Produktionsinfo)", T.get(s, ""))}
    psend = Counter()
    for l in open(IMP / "occurrences.jsonl", encoding="utf-8"):
        o = json.loads(l)
        if o["sha"] in pshas:
            psend[adr(o["fran"])] += 1
    psend = {a for a in psend if "@" in a}
    print("Ponsse-avsändare:", sorted(psend))
    # ---- 3. alla bilagor
    (IMP / "giant_bilder").mkdir(exist_ok=True)
    rader = []
    for mbox in sorted(IMP.rglob("*.mbox")):
        konto = next((p for p in mbox.relative_to(IMP).parts if p.startswith("takeout")), mbox.parent.name)
        for i, raw in enumerate(I.iter_mbox(mbox), 1):
            if i % 4000 == 0:
                print(konto[-22:], i, len(rader), flush=True)
            try:
                msg = message_from_bytes(raw)
                try:
                    d = parsedate_to_datetime(msg.get("Date")).strftime("%Y-%m-%d")
                except Exception:
                    continue
                if not ("2023-03-01" <= d <= "2026-10-31"):
                    continue
                fran = adr(I.dekoda(msg.get("From")))
                amne = I.dekoda(msg.get("Subject"))
                atts = []
                for p in msg.walk():
                    if p.is_multipart():
                        continue
                    fn = I.dekoda(p.get_filename())
                    ct = p.get_content_type()
                    if not fn and (ct.startswith("text/") or not (ct.startswith("image/") or ct.startswith("application/"))):
                        continue
                    atts.append((fn, ct, p))
                if not atts:
                    continue
                body = text_av(msg)
                traff = bool(KEY.search(amne) or KEY.search(body))
                av = fran in psend
                for fn, ct, p in atts:
                    if not (traff or av or KEY.search(fn)):
                        continue
                    data = p.get_payload(decode=True) or b""
                    ext = fn.lower().rsplit(".", 1)[-1] if "." in fn else ct.split("/")[-1]
                    sha = hashlib.sha256(data).hexdigest() if data else ""
                    sig = ext in BILDEXT and len(data) < 30000
                    klass = ""
                    if data[:5] == b"%PDF-" or ext == "pdf":
                        klass = inv[sha]["format"] if sha in inv else "pdf (ej i inventering)"
                        if sha in inv and inv[sha]["format"] == "bild_utan_text":
                            klass = "bild_utan_text"
                    elif ext in BILDEXT:
                        klass = "bild (ej klassad)" if not sig else "liten bild (signatur)"
                    else:
                        klass = f"{ext} (ej klassad)"
                    why = ",".join(x for x, f in (("nyckelord", traff or bool(KEY.search(fn))), ("ponsse-avsändare", av)) if f)
                    rader.append(dict(datum=d, avsandare=fran, amne=amne[:70], bilaga=fn[:60], filtyp=ext, bytes=len(data), nuvarande_klassning=klass, traff=why, sha=sha[:16], konto=konto[-22:]))
                    if ext in BILDEXT and not sig and data and len(data) < 15_000_000:
                        f = IMP / "giant_bilder" / f"{sha}.{ext}"
                        if not f.exists():
                            f.write_bytes(data)
            except Exception:
                pass
    with open(IMP / "giant_bilagor.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rader[0]))
        w.writeheader()
        w.writerows(sorted(rader, key=lambda r: (r["datum"], r["avsandare"])))
    print("klar", len(rader))


if __name__ == "__main__":
    main()
