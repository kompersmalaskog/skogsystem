"""Lär klass->tecken för vektortext genom att jämföra glyf-klasser med OCR-text på tränings-sidor (OCR cachas i glyfer_ocr_cache2.json).
Skriver glyfer_klasser.json och glyfer_etiketter.json i importmappen. Ingen databas."""
import difflib
import io
import json
import random
import sys
from collections import Counter, defaultdict
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import glyph_text as G  # noqa: E402

IMP = Path("C:/Users/lindq/skogsystem-import")
DPI = 130
SK = DPI / 72.0
_ocr = None


def init():
    global _ocr
    from rapidocr_onnxruntime import RapidOCR
    _ocr = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1)


def ocr_sida(arg):
    import pymupdf
    from PIL import Image
    sha, pi = arg
    p = pymupdf.open(IMP / "pdf" / f"{sha}.pdf")[pi]
    rot = G.orientering([x for x in G.glyf_lista(p) if len(x[1]) >= 2])
    im = Image.open(io.BytesIO(p.get_pixmap(dpi=DPI).tobytes("png"))).convert("RGB")
    if rot:
        im = im.rotate(90, expand=True)
    res, _ = _ocr(np.array(im))
    return [sha, pi, [([list(map(float, q)) for q in b], t, float(c)) for b, t, c in (res or [])]]


def hamta_ocr(uppg, procs=7):
    cf = IMP / "glyfer_ocr_cache2.json"
    cache = json.load(open(cf, encoding="utf-8")) if cf.exists() else {}
    saknas = [u for u in uppg if f"{u[0]}:{u[1]}" not in cache]
    if saknas:
        with Pool(procs, initializer=init) as pool:
            for sha, pi, res in pool.imap_unordered(ocr_sida, saknas):
                cache[f"{sha}:{pi}"] = res
        json.dump(cache, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
    return {u: cache[f"{u[0]}:{u[1]}"] for u in uppg}


def glyfer_i_box(gl, box):
    xs = [q[0] for q in box]
    ys = [q[1] for q in box]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    h = y1 - y0
    cy = (y0 + y1) / 2
    inn = [g for g in gl if x0 - 1 <= g["u"] * SK <= x1 + 1 and abs(g["v"] * SK - cy) <= 0.42 * h + 1]
    inn.sort(key=lambda g: g["u0"])
    return inn


def main(n_sidor=48, seed=11):
    import pymupdf
    typ = json.load(open(IMP / "bild_typ.json"))
    vek = [t for t in typ if t[1] == "vektor" and t[3] <= 12]
    random.seed(seed)
    uppg = [(sha, random.randrange(n)) for sha, _, nd, n in random.sample(vek, n_sidor)]
    ocr = hamta_ocr(uppg)
    K = G.Klasser()
    sidor = []
    for u in uppg:
        page = pymupdf.open(IMP / "pdf" / f"{u[0]}.pdf")[u[1]]
        sidor.append((G.sidglyfer(page, K), ocr[u]))
    rost = defaultdict(Counter)

    def rosta(vilka):
        r = defaultdict(Counter)
        for gl, res in sidor:
            for box, txt, cf in res:
                if cf < 0.85:
                    continue
                inn = glyfer_i_box(gl, box)
                tecken = [c for c in txt if not c.isspace()]
                if len(inn) == len(tecken):
                    for g, c in zip(inn, tecken):
                        r[g["k"]][c] += 1
        return r

    def etiketter(r, tr=0.6, minn=6):
        et = {}
        for k, c in r.items():
            (ch, n), tot = c.most_common(1)[0], sum(c.values())
            if n / tot >= tr and n >= minn:
                et[k] = ch
        return et

    rost = rosta(None)
    et = etiketter(rost)
    for it in range(4):  # förfina: sekvensjustering mot OCR med nuvarande etiketter
        ny = defaultdict(Counter)
        for gl, res in sidor:
            for box, txt, cf in res:
                if cf < 0.85:
                    continue
                inn = glyfer_i_box(gl, box)
                pred = "".join(et.get(g["k"], "\x00") for g in inn)
                ocrt = "".join(c for c in txt if not c.isspace())
                sm = difflib.SequenceMatcher(None, pred, ocrt, autojunk=False)
                for tag, a0, a1, b0, b1 in sm.get_opcodes():
                    if tag == "equal" or (tag == "replace" and a1 - a0 == b1 - b0):
                        for i in range(a1 - a0):
                            ny[inn[a0 + i]["k"]][ocrt[b0 + i]] += 1
        et2 = etiketter(ny, 0.7, 4)
        print(f"varv {it}: märkta {len(et2)} av {K.n}")
        et = et2
        rost = ny
    json.dump({"etikett": {str(k): v for k, v in et.items()}, "rost": {str(k): dict(c) for k, c in rost.items()}},
              open(IMP / "glyfer_etiketter.json", "w", encoding="utf-8"), ensure_ascii=False)
    K.spara(IMP / "glyfer_klasser.json")
    tot = sum(1 for gl, _ in sidor for g in gl)
    tackt = sum(1 for gl, _ in sidor for g in gl if g["k"] in et)
    print(f"klasser {K.n}, märkta {len(et)}; glyfer täckta {tackt}/{tot} = {100 * tackt / tot:.1f} %")
    return K, et, rost


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 48)
