"""Avkodar vektortext i alla 'vektor'-PDF:er (bild_typ.json) med de inlärda glyf-etiketterna. Sparar rader per sida i <importmappen>/vektortext/<sha>.json.
Ingen OCR körs här. Ingen databas."""
import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import glyph_text as G  # noqa: E402

IMP = Path("C:/Users/lindq/skogsystem-import")
UT = IMP / "vektortext_v2"
_K = _ET = None


def etiketter(K):
    """Etiketter ur glyfer_etiketter.json; sammansatta glyfer med accent: OCR saknar å/ä/ö och ger a/o -> rätta efter antal delar."""
    et = {int(k): v for k, v in json.load(open(IMP / "glyfer_etiketter.json", encoding="utf-8"))["etikett"].items()}
    # å/ä/ö/Ä/Ö ritas som egna banor; OCR saknar dem och ger a/o. Skiljs på antal punkter i glyfen (kontrollerat visuellt):
    ACC = {("a", 143): "ä", ("a", 157): "ä", ("a", 191): "å", ("a", 205): "å", ("o", 85): "ö", ("o", 89): "ö",
           ("A", 39): "Ä", ("A", 47): "Ä", ("O", 89): "Ö"}
    for k, ch in list(et.items()):
        inf = K.info.get(k, {})
        if (ch, inf.get("n")) in ACC and inf.get("typ") != "sammansatt":
            et[k] = ACC[(ch, inf["n"])]
    return et


def init():
    global _K, _ET
    _K = G.Klasser.las(IMP / "glyfer_klasser.json")
    _ET = etiketter(_K)


def kor(sha):
    import pymupdf
    f = UT / f"{sha}.json"
    if f.exists():
        return sha, "finns"
    try:
        d = pymupdf.open(IMP / "pdf" / f"{sha}.pdf")
        sidor = []
        for p in d:
            gl = G.sidglyfer(p, _K)
            okt = sum(1 for g in gl if g["k"] not in _ET)
            sidor.append({"glyfer": len(gl), "okanda": okt, "rader": G.rader_av_glyfer(gl, _ET)})
        f.write_text(json.dumps({"sha": sha, "sidor": sidor}, ensure_ascii=False), "utf-8")
        return sha, "ok"
    except Exception as e:
        return sha, f"fel {type(e).__name__}: {e}"


def main(procs=7):
    UT.mkdir(exist_ok=True)
    typ = json.load(open(IMP / "bild_typ.json"))
    shas = [t[0] for t in typ if t[1] == "vektor" and not (UT / f"{t[0]}.json").exists()]
    print(len(shas), "PDF kvar", flush=True)
    t0 = time.time()
    fel = 0
    with Pool(procs, initializer=init) as pool:
        for i, (sha, st) in enumerate(pool.imap_unordered(kor, shas, chunksize=2), 1):
            if st.startswith("fel"):
                fel += 1
                print(sha, st, flush=True)
            if i % 50 == 0:
                print(f"{i}/{len(shas)} {time.time() - t0:.0f}s", flush=True)
    print("klar, fel:", fel, flush=True)


if __name__ == "__main__":
    main()
