"""Steg 4b: tillägg till objekt.csv — AptMan ur .prt/.xps, Ponsse Maskinspecifik ur .xps, MÄTBEVIS (PDF+XPS), Lastcertifikat.

Anropas från bygg_historik.main(). Ingen databas. Skriver aptman_maskinnr_alla.csv och rapport_maskin_tillagg.csv.
"""
import csv
import difflib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import parse_optiwin as PW
import parse_ovriga as PO

IMP = Path("C:/Users/lindq/skogsystem-import")
APTMAN_MASKIN = {"311608": "Komatsu 911.3", "011970": "Komatsu 941 AptMan"}
PONSSE_MODELL = {
    "Ponsse Bear 2015": "Ponsse Bear", "Ponsse Scorpion King": "Scorpion King gammal",
    "Ponsse Elephant King Af": "Elephant King gammal", "Ponsse Elephant King 2015": "Elephant King ny", "Ponsse Wisent 2015": "Ponsse Wisent",
}
LAST_MASKIN = {"A110148": "Elephant King gammal", "A030353": "Ponsse Wisent", "A130743": "Elephant King ny"}
SKOTARE = {"Elephant King gammal", "Elephant King ny", "Ponsse Wisent"}


def norm(s):
    return re.sub(r"[^a-zåäö0-9 ]", "", (s or "").lower().replace("_", " ")).split()


def lik(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if set(na) == set(nb):
        return 1.0
    r = difflib.SequenceMatcher(None, " ".join(na), " ".join(nb)).ratio()
    s, l = (set(na), set(nb)) if len(na) <= len(nb) else (set(nb), set(na))
    if len(s) >= 2 and s <= l:
        r = max(r, 0.95)
    return r


def lagg_till(orows, avv, inv, maskin, kolumner):
    def blank():
        return {k: "" for k in kolumner}

    def avvik(sha, fil, datum, namn, kontroll, f="", s="", d=""):
        avv.append(dict(sha256=sha, filnamn=fil, rapportdatum=datum, maskin_namn=namn, kontroll=kontroll, forvantat=f, summa=s, diff=d))

    til = []  # rapport_maskin_tillagg
    bil = [json.loads(l) for l in open(IMP / "bilagor.jsonl", encoding="utf-8")]
    unika = {}
    for b in bil:
        if b["sha"] and b["ext"] in ("prt", "xps"):
            unika.setdefault(b["sha"], b)

    # ------------------------------------------------------------ nummer -> maskin (för MÄTBEVIS/Lastcertifikat)
    pa = {}
    for l in open(IMP / "ponsse_aptman_full.jsonl", encoding="utf-8"):
        d = json.loads(l)
        pa[d["sha"]] = d["pages"][0].replace("\xa0", " ")
    tal2m = defaultdict(set)
    ponsse_obj = []  # (maskin, objektnamn, datum, sha)
    for sha, t in pa.items():
        if inv[sha]["format"] != "ponsse_maskinspecifik_summering" or maskin.get(sha) in (None, "exkludera"):
            continue
        m = re.search(r"^(?:Delobjektsnr|Stämpling)\s+(.*)$", t, re.M)
        if m:
            for n in re.findall(r"\b\d{6,}\b", m.group(1)):
                tal2m[n].add(maskin[sha])
        ponsse_obj.append((maskin[sha], (m.group(1).split(":")[-1].strip() if m else ""), inv[sha]["rapportdatum"], sha))

    # ------------------------------------------------------------ Ponsse: livstidstimmar på PDF-raderna
    for o in orows:
        if o["format"] == "ponsse_maskinspecifik_summering" and o["sha256"] in pa:
            h = re.search(r"\nh (\d+)\n", pa[o["sha256"]])
            o["livstid_h"] = int(h.group(1)) if h else ""
            o["kalla_typ"] = "pdf"

    # ------------------------------------------------------------ AptMan ur .prt och .xps
    apt_nr = []  # alla AptMan-källor för maskinnummerlistan
    for o in orows:
        if o["format"] in ("aptman_drf", "aptman_produktionsnota"):
            o["kalla_typ"] = "pdf"
            apt_nr.append(dict(kalla="pdf", maskin_nr=o["maskinnr_rapport"] or "311608", datum=o["rapportdatum"], fran=inv[o["sha256"]]["avsandare"], stammar=o["stammar"]))
    xps_cache = {}
    for sha, b in unika.items():
        f = IMP / "bilagor" / f"{sha}.{b['ext']}"
        try:
            if b["ext"] == "xps":
                pages = PW.xps_text(f)
                text = "\n".join(pages)
                xps_cache[sha] = pages
            else:
                raw = f.read_bytes()
                try:
                    text = raw.decode("cp1252")
                except Exception:
                    text = raw.decode("latin-1")
        except Exception as e:
            avvik(sha, b["namn"], b["datum"], "", "bilaga_ej_läsbar", d=f"{type(e).__name__}")
            continue
        t0 = text.replace("\x00", "")
        t0 = re.sub(r"^\s*(\d\d-\d\d-\d\d)\s*\n\s*(DRIFT-INFO|PRODUKTIONSNOTA)\s*\n", r"\2 \1\n", t0)
        base = blank()
        base.update(status="ok", sha256=sha, kalla_typ=b["ext"], filnamn=b["namn"], volym_enhet="fub", rapporttyp="objekt", antal_skift=0)
        if "DRIFT-INFO" in t0 and ("AptMan" in t0 or "DriftMan" in t0):
            r = PO.parse_aptman_drf([t0])
            nr = r["maskin_nr"]
            namn = APTMAN_MASKIN.get(nr, f"okopplad: AptMan {nr or 'utan nr'}")
            nd = r["nollstalld"][:8]
            base.update(format="aptman_drf", rapportdatum=r["rapportdatum"], maskin_namn=namn, typ="skördare", objekt=r["objekt"], programversion=r["version"],
                        volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "", g0=r["g0"], g15=r["g15"], avbrott_g15=r["avbrott"], motortid=r["motortid"],
                        maskinnr_rapport=nr, objekt_nyckel=f'{namn}|{r["objekt"]}|{r["omrade"]}|20{nd}')
            if r["stammar"]:
                base["stammar"] = r["stammar"]
            else:
                base["utan_stammar"] = "ja"  # "Antal träd: 0" = stammar saknas i rapporten, inte skotare
            for k, f_, s_, d_ in PO.kontroll_aptman_drf(r):
                avvik(sha, b["namn"], r["rapportdatum"], namn, k, f_, s_, d_)
            orows.append(base)
            apt_nr.append(dict(kalla=b["ext"], maskin_nr=nr, datum=r["rapportdatum"], fran=b["fran"], stammar=r["stammar"]))
            til.append((sha, namn, "aptman_drf", r["rapportdatum"], b["fran"], b["ext"], b["namn"]))
        elif "PRODUKTIONSNOTA" in t0:
            r = PO.parse_aptman_nota([t0])
            nr = r["maskin_nr"]
            namn = APTMAN_MASKIN.get(nr, f"okopplad: AptMan {nr or 'utan nr'}")
            base.update(format="aptman_produktionsnota", rapportdatum=r["rapportdatum"], maskin_namn=namn, typ="skördare", objekt=r["objekt"], programversion=r["version"],
                        volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "", maskinnr_rapport=nr,
                        forare=";".join(f"{n}={i[-1]}/{v}" for n, i, v in r["forare"]),
                        objekt_nyckel=f'{namn}|{r["objekt"]}|{r["omrade"]}|{r["nollstalld"]}')
            if r["stammar"]:
                base["stammar"] = r["stammar"]
            else:
                base["utan_stammar"] = "ja"
            if not r["total"]:
                avvik(sha, b["namn"], r["rapportdatum"], namn, "nota_totalrad_saknas")
            for k, f_, s_, d_ in PO.kontroll_aptman_nota(r):
                avvik(sha, b["namn"], r["rapportdatum"], namn, k, f_, s_, d_)
            orows.append(base)
            apt_nr.append(dict(kalla=b["ext"], maskin_nr=nr, datum=r["rapportdatum"], fran=b["fran"], stammar=r["stammar"]))
            til.append((sha, namn, "aptman_produktionsnota", r["rapportdatum"], b["fran"], b["ext"], b["namn"]))
        elif b["ext"] == "xps" and t0.startswith("Maskinspecifik"):
            r = PW.parse_ponsse_xps(xps_cache[sha])
            namn = PONSSE_MODELL.get(r["modell"])
            if not namn:
                avvik(sha, b["namn"], r["rapportdatum"], "", "ponsse_xps_okänd_modell", d=r["modell"])
                continue
            for n in r["nummer"]:
                tal2m[n].add(namn)
            ponsse_obj.append((namn, r["objekt"], r["rapportdatum"], sha))
            base.update(format="ponsse_maskinspecifik_summering", rapportdatum=r["rapportdatum"], maskin_namn=namn, typ="skotare" if namn in SKOTARE else "skördare",
                        objektnr=r["objektnr"], objekt=r["objekt"], stammar=r["stammar"] if r["stammar"] is not None else "", stockar=r["stockar"] if r["stockar"] is not None else "",
                        volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "", g15=r["g15"], avbrott_g15=r["avbrott"],
                        bransle_l=r["bransle_l"] if r["bransle_l"] is not None else "", livstid_h=r["livstid_h"] or "",
                        objekt_nyckel=f'{namn}|{r["objektnr"] or r["objekt"]}')
            if not r["under_bark"]:
                base["volym_enhet"] = "okänd"
            for k, f_, s_, d_ in PO.kontroll_ponsse({**r, "reparation": r["reparation"]}):
                avvik(sha, b["namn"], r["rapportdatum"], namn, k, f_, s_, d_)
            orows.append(base)
            til.append((sha, namn, "ponsse_maskinspecifik_summering", r["rapportdatum"], b["fran"], "xps", b["namn"]))
        elif b["ext"] == "xps" and t0.startswith("MÄTBEVIS"):
            r = PW.parse_matbevis_xps(xps_cache[sha])
            sysmask = {"OptiWin 4.745": "Ponsse Bear", "Opti4G 4.765": "Ponsse Bear", "OptiWin 4.728": "Scorpion King gammal"}.get(r["system"])
            namn = sysmask or "okopplad: MÄTBEVIS"
            dub = ""
            best = 0
            for pm, pob, pd, psha in ponsse_obj:
                if pm == namn and abs((_d(pd) - _d(r["rapportdatum"])).days) <= 45:
                    sc = lik(pob, r["objekt"])
                    if sc > best and sc >= 0.8:
                        best, dub = sc, psha
            base.update(format="matbevis", rapportdatum=r["rapportdatum"], maskin_namn=namn, typ="skördare", objekt=r["objekt"], programversion=r["system"],
                        stammar=r["stammar"] if r["stammar"] is not None else "", volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "",
                        forare=r["forare"], dubblett_av=dub, objekt_nyckel=f'{namn}|M|{r["objekt"]}|{r["startdatum"]}')
            if r["stammar"] is None:
                avvik(sha, b["namn"], r["rapportdatum"], namn, "matbevis_summa_saknas")
            orows.append(base)
            til.append((sha, namn, "matbevis", r["rapportdatum"], b["fran"], "xps", b["namn"]))
        elif "STOCKNOTA" in t0:
            avvik(sha, b["namn"], b["datum"], "", "stocknota_ej_tolkad")

    # ------------------------------------------------------------ MÄTBEVIS + Lastcertifikat ur PDF
    ow = {}
    for l in open(IMP / "optiwin_full.jsonl", encoding="utf-8"):
        d = json.loads(l)
        ow[d["sha"]] = d["pages"]
    lastrader = []
    for sha, pages in ow.items():
        h = pages[0].lstrip()
        fil = inv[sha]["filnamn"]
        if h.startswith("MÄTBEVIS"):
            r = PW.parse_matbevis(pages)
            m, orsak = PW.maskin_for_matbevis(r, tal2m)
            namn = m or "okopplad: MÄTBEVIS"
            dub = ""
            for n in r["nummer"]:
                if namn in tal2m.get(n, set()):
                    dub = "maskinspecifik:" + n
                    break
            base = blank()
            base.update(status="ok", format="matbevis", volym_enhet="fub", sha256=sha, rapportdatum=r["rapportdatum"], maskin_namn=namn, typ="skördare", rapporttyp="objekt",
                        objektnr=(r["nummer"][-1] if r["nummer"] else ""), objekt=r["objekt"], programversion=r["system"],
                        stammar=r["stammar"] if r["stammar"] is not None else "", stockar=r["stockar"] if r["stockar"] is not None else "",
                        volym_m3fub=r["volym_m3fub"] if r["volym_m3fub"] is not None else "", forare=r["forare"], antal_skift=0, kalla_typ="pdf",
                        dubblett_av=dub, filnamn=fil, objekt_nyckel=f'{namn}|M|{r["objekt"]}|{r["startdatum"]}')
            for k, f_, s_, d_ in PW.kontroll_matbevis(r):
                avvik(sha, fil, r["rapportdatum"], namn, k, f_, s_, d_)
            if not m:
                avvik(sha, fil, r["rapportdatum"], namn, "matbevis_maskin_okand", d=r["system"])
            orows.append(base)
            til.append((sha, namn, "matbevis", r["rapportdatum"], inv[sha]["avsandare"], orsak, fil))
        elif h.startswith("Lastcertifikat"):
            r = PW.parse_lastcert(pages)
            lastrader.append((sha, fil, r))

    # Lastcertifikat -> maskin: A-nummer i rapporten, annars via objektnummer mot skotarnas Maskinspecifik-rapporter
    for sha, fil, r in lastrader:
        namn, orsak = LAST_MASKIN.get(r["maskinnr"]), "maskinnummer i rapporten"
        if not namn:
            kand = set()
            for n in (r["delobjektsnr"], r["objektnr"]):
                kand |= {x for x in tal2m.get(n, set()) if x in SKOTARE}
            if len(kand) == 1:
                namn, orsak = kand.pop(), "objektnummer mot Maskinspecifik"
        if not namn:  # förarregel, lärd av certifikaten som har maskinnummer eller objektnummer-träff: Max Karlsson -> Wisent, Daniel Johansson -> Elephant King
            if r["forare"].startswith("Max Karlsson") and r["rapportdatum"] >= "2023-08-01":
                namn, orsak = "Ponsse Wisent", "förare Max Karlsson (alla kopplade certifikat = Wisent)"
            elif r["forare"].startswith("Daniel Johansson"):
                namn, orsak = ("Elephant King ny" if r["rapportdatum"] >= "2026-08-01" else "Elephant King gammal"), "förare Daniel Johansson (alla kopplade = Elephant King)"
        if not namn:
            namn, orsak = "okopplad: Lastcertifikat", "maskin saknas (98765/12345)"
        base = blank()
        base.update(status="ok", format="lastcertifikat", volym_enhet="m3_ej_angivet", sha256=sha, rapportdatum=r["rapportdatum"], maskin_namn=namn, typ="skotare",
                    rapporttyp="objekt", objektnr=r["delobjektsnr"], objekt=r["objekt"], programversion=r["system"], volym_m3fub=r["volym_m3"] if r["volym_m3"] is not None else "",
                    g15=r["g15"], avbrott_g15=r["avbrott"], bransle_l=r["bransle_l"] if r["bransle_l"] is not None else "", forare=r["forare"], antal_skift=0,
                    antal_lass=r["laster"] if r["laster"] is not None else "", kalla_typ="pdf", filnamn=fil, maskinnr_rapport=r["maskinnr"],
                    objekt_nyckel=f'{namn}|L|{r["delobjektsnr"]}|{r["startdatum"]}')
        if r["volym_m3"] is None:
            avvik(sha, fil, r["rapportdatum"], namn, "lastcert_volym_saknas")
        orows.append(base)
        til.append((sha, namn, "lastcertifikat", r["rapportdatum"], inv[sha]["avsandare"], orsak, fil))

    # ------------------------------------------------------------ "Antal träd: 0" (PDF-rader) -> stammar tomma
    for o in orows:
        if o["format"] in ("aptman_drf", "aptman_produktionsnota") and o["stammar"] in (0, "0"):
            o["stammar"] = ""
            o["utan_stammar"] = "ja"
        if o["format"] in ("aptman_drf", "aptman_produktionsnota") and not o["maskinnr_rapport"]:
            o["maskinnr_rapport"] = "311608"

    # ------------------------------------------------------------ utskrifter / filer
    with open(IMP / "rapport_maskin_tillagg.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sha256", "maskin_namn", "format", "datum", "avsandare", "orsak_eller_kalla", "filnamn"])
        for x in sorted(til, key=lambda x: (x[3], x[0])):
            w.writerow(x)
    g = defaultdict(list)
    for a in apt_nr:
        g[a["maskin_nr"] or "(saknas)"].append(a)
    with open(IMP / "aptman_maskinnr_alla.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["maskin_nr", "kopplad_till", "forsta", "sista", "antal", "kallor", "avsandare", "rapporter_med_stammar", "rapporter_utan_stammar"])
        for nr, xs in sorted(g.items(), key=lambda kv: -len(kv[1])):
            d = sorted(x["datum"] for x in xs if x["datum"])
            sm = sum(1 for x in xs if x["stammar"])
            w.writerow([nr, APTMAN_MASKIN.get(nr, "(ej kopplad)"), d[0] if d else "", d[-1] if d else "", len(xs),
                        ",".join(f"{k}:{v}" for k, v in Counter(x["kalla"] for x in xs).items()),
                        ",".join(f"{k.split('@')[0]}:{v}" for k, v in Counter(re.sub(r".*<|>.*", "", x["fran"]) if "<" in x["fran"] else x["fran"] for x in xs).most_common(4)),
                        sm, len(xs) - sm])


def _d(s):
    from datetime import date
    try:
        return date.fromisoformat(s)
    except Exception:
        return date(2000, 1, 1)
