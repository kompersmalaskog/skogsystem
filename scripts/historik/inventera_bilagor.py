"""Steg 4b DEL 0: inventera ALLA bilagor som inte är PDF i mbox-filerna. Sparar intressanta filtyper (dedupe på sha256) i
<importmappen>/bilagor/<sha256>.<ext> och metadata per förekomst i bilagor.jsonl. Ingen databas."""
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
SPARA = {"prt", "txt", "rep", "xps", "oxps", "drf", "prd", "hpr", "mom", "hqc", "fpr", "stm", "csv", "xml", "htm", "html", "log", "dat", "ini", "apt", "spp", "pri", "doc", "xls", "xlsx", "docx", "zip", ""}
BILD = {"jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "ico", "svg", "ics"}


def main():
    (IMP / "bilagor").mkdir(exist_ok=True)
    out = open(IMP / "bilagor.jsonl", "w", encoding="utf-8")
    n_ext = Counter()
    for mbox in sorted(IMP.rglob("*.mbox")):
        konto = next((p for p in mbox.relative_to(IMP).parts if p.startswith("takeout")), mbox.parent.name)
        for i, raw in enumerate(I.iter_mbox(mbox), 1):
            if i % 3000 == 0:
                print(konto[-20:], i, flush=True)
            try:
                msg = message_from_bytes(raw)
                try:
                    d = parsedate_to_datetime(msg.get("Date")).strftime("%Y-%m-%d")
                except Exception:
                    d = ""
                fr = re.search(r"[\w.+-]+@[\w.-]+", I.dekoda(msg.get("From")) or "")
                fran = fr.group(0).lower() if fr else ""
                amne = I.dekoda(msg.get("Subject"))[:70]
                for p in msg.walk():
                    if p.is_multipart():
                        continue
                    fn = I.dekoda(p.get_filename())
                    ct = p.get_content_type()
                    if not fn:
                        if ct.startswith("text/") or ct.startswith("multipart"):
                            continue
                    ext = fn.lower().rsplit(".", 1)[-1] if "." in fn else ""
                    if ext == "pdf" or (ct == "application/pdf"):
                        continue
                    data = p.get_payload(decode=True) or b""
                    if data[:5] == b"%PDF-":
                        continue
                    rec = dict(konto=konto, datum=d, fran=fran, amne=amne, namn=fn, ext=ext, typ=ct, bytes=len(data), sha="")
                    n_ext[ext] += 1
                    if ext in SPARA and ext not in BILD and len(data) <= 8_000_000 and data:
                        sha = hashlib.sha256(data).hexdigest()
                        rec["sha"] = sha
                        f = IMP / "bilagor" / f"{sha}.{ext or 'bin'}"
                        if not f.exists():
                            f.write_bytes(data)
                    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            except Exception as e:
                pass
    print("klar", dict(n_ext.most_common(25)))


if __name__ == "__main__":
    main()
