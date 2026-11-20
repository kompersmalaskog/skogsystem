"""Steg 6: gör bild_utan_text-PDF:erna läsbara. PDF:erna har text ritad som vektorer (inget textlager).
Renderar varje sida med PyMuPDF, roterar upprätt (orientering ur bara-detektion) och kör RapidOCR (ONNX).
Sparar text per sida i <importmappen>/ocr/<sha256>.json (resumerbart). Ingen databas.

OBS: RapidOCR:s teckenuppsättning saknar å/ä/ö (läses som a/o), siffror och tabeller läses mycket bra. Se ocr_kontroll i parse_skift.
"""
import csv
import io
import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
UT = IMP / "ocr"
DPI = 130
_ocr = None


def init():
    global _ocr
    from rapidocr_onnxruntime import RapidOCR
    _ocr = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1)


def rader_av(res):
    """res = [(box, text, conf)] -> radvis text, rader sorterade på y och x, kolumner skilda med ' | '."""
    items = []
    for box, txt, cf in res:
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append(((min(ys) + max(ys)) / 2, max(ys) - min(ys), min(xs), txt))
    if not items:
        return []
    items.sort()
    med = sorted(h for _, h, _, _ in items)[len(items) // 2] or 10
    rader, cur, last = [], [], None
    for y, h, x, t in items:
        if last is not None and abs(y - last) > 0.6 * med:
            rader.append(" | ".join(t_ for _, t_ in sorted(cur)))
            cur = []
        cur.append((x, t))
        last = y if not cur[:-1] else last
    if cur:
        rader.append(" | ".join(t_ for _, t_ in sorted(cur)))
    return rader


def kor(sha):
    import numpy as np
    import pymupdf
    from PIL import Image
    f = UT / f"{sha}.json"
    if f.exists():
        return sha, 0.0, "finns"
    t0 = time.time()
    try:
        d = pymupdf.open(IMP / "pdf" / f"{sha}.pdf")
        sidor = []
        for p in d:
            try:
                lo = Image.open(io.BytesIO(p.get_pixmap(dpi=60).tobytes("png"))).convert("RGB")
                det, _ = _ocr(np.array(lo), use_cls=False, use_rec=False)
                bx = [(max(q[0] for q in b) - min(q[0] for q in b), max(q[1] for q in b) - min(q[1] for q in b)) for b in (det or [])]
                stand = sum(1 for w, h in bx if h > w) > sum(1 for w, h in bx if w >= h)
                im = Image.open(io.BytesIO(p.get_pixmap(dpi=DPI).tobytes("png"))).convert("RGB")
                if stand:
                    im = im.rotate(90, expand=True)
                res, _ = _ocr(np.array(im))
                sidor.append({"rot": 90 if stand else 0, "rader": rader_av(res or [])})
            except Exception as e:
                sidor.append({"fel": f"{type(e).__name__}: {e}", "rader": []})
        f.write_text(json.dumps({"sha": sha, "sidor": sidor}, ensure_ascii=False), "utf-8")
        return sha, time.time() - t0, "ok"
    except Exception as e:
        return sha, time.time() - t0, f"fel {type(e).__name__}"


def main(procs=7):
    UT.mkdir(exist_ok=True)
    shas = [r["sha256"] for r in csv.DictReader(open(IMP / "inventering.csv", encoding="utf-8-sig")) if r["format"] == "bild_utan_text"]
    kvar = [s for s in shas if not (UT / f"{s}.json").exists()]
    print(len(shas), "PDF,", len(kvar), "kvar", flush=True)
    t0 = time.time()
    with Pool(procs, initializer=init) as pool:
        for i, (sha, dt, st) in enumerate(pool.imap_unordered(kor, kvar, chunksize=1), 1):
            if i % 20 == 0:
                print(f"{i}/{len(kvar)}  {time.time() - t0:.0f}s", flush=True)
    print("klar", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 7)
