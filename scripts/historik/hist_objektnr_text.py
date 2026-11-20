"""Samlar all utläst text per rapport (sha256) ur de lokala JSONL/JSON-filerna. Ingen databas."""
import glob
import json
import pickle
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
CACHE = IMP / "text_per_sha.pkl"


def las_text():
    if CACHE.exists():
        return pickle.load(open(CACHE, "rb"))
    t = {}
    for fn in ("texter.jsonl", "maxi_full.jsonl", "optiwin_full.jsonl", "forester_full.jsonl", "ponsse_aptman_full.jsonl", "matsedel_full.jsonl"):
        for l in open(IMP / fn, encoding="utf-8"):
            o = json.loads(l)
            sha = o.get("sha")
            if not sha:
                continue
            txt = o.get("text") if "text" in o else "\n".join(o.get("pages") or [])
            t.setdefault(sha, []).append(txt or "")
    for f in glob.glob(str(IMP / "vektortext_v2" / "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        t.setdefault(d["sha"], []).append("\n".join(r for s in d["sidor"] for r in s["rader"]))
    t = {k: "\n".join(v) for k, v in t.items()}
    pickle.dump(t, open(CACHE, "wb"))
    return t


if __name__ == "__main__":
    t = las_text()
    print(len(t), "rapporter med text")
