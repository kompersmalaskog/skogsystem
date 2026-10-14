"""Läser vektortext (Ponsse OptiReport-PDF:er där texten är ritad som fyllda glyf-banor, utan textlager) utan OCR.

Varje tecken är en egen fylld bana. Samma tecken i samma storlek har samma form, oavsett läge på sidan. Formerna klassas
(klass-id), klasserna får tecken genom att jämföras med OCR-text på några sidor (se lar_glyfer.py), och därefter avkodas
alla sidor direkt. Läsriktning: sidan är ritad roterad 90° (text löper nedåt i sidans y); u = y, v = W - x.
"""
import json
from pathlib import Path

import numpy as np

W_SIDA = 612.0


def glyf_lista(page):
    """-> lista med (u, v, bredd_u, hojd_v, x0, y0, x1, y1, klassnyckel). Endast små fyllda banor (tecken)."""
    ut = []
    for d in page.get_drawings():
        if d["type"] != "f":
            continue
        r = d["rect"]
        if r.width >= 30 or r.height >= 30:
            continue
        pts = []
        for it in d["items"]:
            for p in it[1:]:
                if hasattr(p, "x"):
                    pts.append((p.x - r.x0, p.y - r.y0))
                elif hasattr(p, "x0"):  # Rect
                    pts += [(p.x0 - r.x0, p.y0 - r.y0), (p.x1 - r.x0, p.y1 - r.y0)]
        typ = "".join(it[0] for it in d["items"])
        ut.append((typ, np.array(pts, dtype=np.float32), r, d.get("fill")))
    return ut


def nyckel(typ, pts, nd=1):
    return typ + ":" + ",".join(f"{round(float(x), nd)}:{round(float(y), nd)}" for x, y in pts)


class Klasser:
    """Klassar glyf-former med tolerans. Snabb väg: avrundad hash; långsam väg: närmaste prototyp inom tol."""

    def __init__(self, tol=0.04):
        self.tol = tol
        self.hash2id = {}
        self.protos = {}  # (typ, n) -> list[(id, pts)]
        self.n = 0
        self.info = {}

    def id_av(self, typ, pts):
        # skalinvariant form: koordinater delas med glyfens största utsträckning; kvoten bredd/höjd läggs till som extra punkt
        sc = max(float(pts[:, 0].max()), float(pts[:, 1].max()), 1e-3)
        pts = np.vstack([pts / np.float32(sc), np.array([[pts[:, 0].max() / sc, pts[:, 1].max() / sc]], dtype=np.float32)])
        h = nyckel(typ, pts, 2)
        i = self.hash2id.get(h)
        if i is not None:
            return i
        key = (typ, len(pts))
        for pid, pp in self.protos.get(key, ()):
            if np.abs(pp - pts).max() <= self.tol:
                self.hash2id[h] = pid
                return pid
        pid = self.n
        self.n += 1
        self.protos.setdefault(key, []).append((pid, pts))
        self.hash2id[h] = pid
        self.info[pid] = {"typ": typ, "n": len(pts), "bredd": float(pts[-1, 0]), "hojd": float(pts[-1, 1])}
        return pid

    def sammansatt(self, sig, antal):
        i = self.hash2id.get(sig)
        if i is None:
            i = self.n
            self.n += 1
            self.hash2id[sig] = i
            self.info[i] = {"typ": "sammansatt", "n": antal, "sig": sig}
        return i

    def spara(self, fn):
        json.dump({"tol": self.tol, "n": self.n,
                   "protos": [[pid, typ, pts.tolist()] for (typ, _), L in self.protos.items() for pid, pts in L],
                   "info": self.info, "sammansatta": {k: v for k, v in self.hash2id.items() if k.startswith("S")}}, open(fn, "w"))

    @classmethod
    def las(cls, fn):
        d = json.load(open(fn))
        k = cls(d["tol"])
        k.n = d["n"]
        k.info = {int(a): b for a, b in d["info"].items()}
        k.hash2id.update(d.get("sammansatta", {}))
        for pid, typ, pts in d["protos"]:
            arr = np.array(pts, dtype=np.float32)
            k.protos.setdefault((typ, len(arr)), []).append((pid, arr))
        return k


def orientering(lista):
    """True om texten är ritad roterad 90° (tecknen är då bredare än höga i sidans koordinater)."""
    if not lista:
        return False
    b = np.median([t[2].width for t in lista])
    h = np.median([t[2].height for t in lista])
    return bool(b > h)


def sidglyfer(page, klasser):
    """-> lista av dict(u, v, u0, u1, v0, v1, k) i läsramen. u=y (växer åt höger), v=W-x (växer nedåt).
    Delar som hör ihop (prick över i/j, prickar över ä/ö, ring över å, kolon, procenttecken) slås ihop till en sammansatt glyf
    vars klass är sammansättningen av delarnas klasser."""
    lista = [t for t in glyf_lista(page) if len(t[1]) >= 2]
    rot = orientering(lista)
    bas = []
    for typ, pts, r, fill in lista:
        if rot:  # sidan ritad roterad 90°: texten löper nedåt i sidans y
            bas.append({"k": klasser.id_av(typ, pts), "u0": r.y0, "u1": r.y1, "v0": W_SIDA - r.x1, "v1": W_SIDA - r.x0})
        else:
            bas.append({"k": klasser.id_av(typ, pts), "u0": r.x0, "u1": r.x1, "v0": r.y0, "v1": r.y1})
    bas.sort(key=lambda g: g["u0"])
    n = len(bas)
    forälder = list(range(n))

    def rot(i):
        while forälder[i] != i:
            forälder[i] = forälder[forälder[i]]
            i = forälder[i]
        return i

    M = float(np.median([g["v1"] - g["v0"] for g in bas])) if bas else 6.0  # typisk teckenhöjd på sidan
    for i in range(n):
        gi = bas[i]
        j = i + 1
        while j < n and bas[j]["u0"] < gi["u1"]:
            gj = bas[j]
            ov = min(gi["u1"], gj["u1"]) - max(gi["u0"], gj["u0"])
            hi, hj = gi["v1"] - gi["v0"], gj["v1"] - gj["v0"]
            smal = min(gi["u1"] - gi["u0"], gj["u1"] - gj["u0"])
            gap = max(gi["v0"], gj["v0"]) - min(gi["v1"], gj["v1"])
            # delar som hör ihop: minst en liten del (prick/ring/streck) som ligger tätt på en annan del i samma kolumn
            if smal > 0 and ov >= 0.5 * smal and gap <= 0.45 * M and (min(hi, hj) <= 0.45 * M):
                forälder[rot(i)] = rot(j)
            j += 1
    grupper = {}
    for i in range(n):
        grupper.setdefault(rot(i), []).append(bas[i])
    ut = []
    for delar in grupper.values():
        if len(delar) == 1:
            g = delar[0]
            ut.append({**g, "k": g["k"], "u": (g["u0"] + g["u1"]) / 2, "v": (g["v0"] + g["v1"]) / 2, "delar": 1})
            continue
        delar.sort(key=lambda g: (g["v0"], g["u0"]))
        u0 = min(g["u0"] for g in delar)
        u1 = max(g["u1"] for g in delar)
        v0 = min(g["v0"] for g in delar)
        v1 = max(g["v1"] for g in delar)
        sc = max(u1 - u0, v1 - v0, 1e-3)
        sig = "S" + "|".join(str(g["k"]) for g in delar)
        ut.append({"k": klasser.sammansatt(sig, len(delar)), "u0": u0, "u1": u1, "v0": v0, "v1": v1, "u": (u0 + u1) / 2, "v": (v0 + v1) / 2, "delar": len(delar)})
    return ut


def rader_av_glyfer(gl, etikett, okand="?", ordgap=0.30, kolumngap=2.2):
    """Grupperar glyfer till rader (på baslinje) och ord. etikett: klass-id -> tecken."""
    if not gl:
        return []
    gl = sorted(gl, key=lambda g: g["v1"])  # baslinje = nedre kant (största v)
    rader, cur = [], [gl[0]]
    for g in gl[1:]:
        h = np.median([x["v1"] - x["v0"] for x in cur] + [3.0])
        if g["v1"] - np.median([x["v1"] for x in cur]) > max(2.2, 0.55 * h):
            rader.append(cur)
            cur = [g]
        else:
            cur.append(g)
    rader.append(cur)
    ut = []
    for r in rader:
        r.sort(key=lambda g: g["u0"])
        h = np.median([x["v1"] - x["v0"] for x in r])
        s, prev = [], None
        for g in r:
            if prev is not None:
                gap = g["u0"] - prev["u1"]
                if gap > kolumngap * h:
                    s.append(" | ")
                elif gap > ordgap * h:
                    s.append(" ")
            s.append(etikett.get(g["k"], okand))
            prev = g
        ut.append(("".join(s), r[0]["v1"]))
    ut.sort(key=lambda x: x[1])
    return [t for t, _ in ut]
