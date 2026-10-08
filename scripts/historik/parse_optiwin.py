"""Steg 4b: parsers för MÄTBEVIS (OptiWin/Opti4G stämplingsutskrift), Lastcertifikat (skotad volym) och XPS-läsare.

Ingen databas. MÄTBEVIS saknar maskinnamn i texten: maskinen avgörs av mätsystemets version och objektnumren (se maskin_for_matbevis).
Volymenheten är m³(Fub) (under bark) i MÄTBEVIS. Lastcertifikat anger bara "m³" (se volym_enhet i bygg_historik).
"""
import re
import zipfile
from collections import defaultdict


def sv(s):
    return float(s.replace("\xa0", "").replace(" ", "").replace(",", "."))


def minuter(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


# ----------------------------------------------------------------------------------------------- XPS
def xps_text(path):
    """XPS = zip med XML-sidor; hämtar Glyphs (OriginX/OriginY/UnicodeString) och bygger rader sorterade på Y, sedan X.
    Returnerar en lista med sidtexter (rader separerade med \\n, ord på samma rad med mellanslag)."""
    z = zipfile.ZipFile(path)
    sidor = sorted((n for n in z.namelist() if n.lower().endswith(".fpage")),
                   key=lambda n: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", n)])
    ut = []
    for n in sidor:
        x = z.read(n).decode("utf-8", "ignore")
        gl = []
        for m in re.finditer(r"<Glyphs\b[^>]*>", x):
            tag = m.group(0)
            u = re.search(r'UnicodeString="([^"]*)"', tag)
            ox = re.search(r'OriginX="([-\d.]+)"', tag)
            oy = re.search(r'OriginY="([-\d.]+)"', tag)
            if u and ox and oy and u.group(1).strip():
                s = (u.group(1).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'"))
                gl.append((round(float(oy.group(1)) / 3), float(ox.group(1)), s))
        gl.sort()
        rader, cur, last = [], [], None
        for yy, xx, s in gl:
            if last is not None and yy != last:
                rader.append(" ".join(cur))
                cur = []
            cur.append(s)
            last = yy
        if cur:
            rader.append(" ".join(cur))
        ut.append("\n".join(rader))
    return ut


# ----------------------------------------------------------------------------------------------- MÄTBEVIS
def parse_matbevis(pages):
    t = "\n".join(pages).replace("\xa0", " ")
    j = " ".join(t.split())
    r = {"variant": "Inled" if j.startswith("MÄTBEVIS Inled") else "Start"}
    m = re.search(r"\n([^\n]+\.prd)", t) or re.search(r"\n([^\n]*)\n([^\n]*\.prd)", t)
    r["prd"] = " ".join(t.split("\n")[1:3]).strip()[:60]
    m = re.search(r"(\d{4}-\d\d-\d\d) (\d{4}-\d\d-\d\d|OAVSLUTAD) (\d{4}-\d\d-\d\d)", t)
    r["startdatum"], r["slutdatum"], r["utskriven"] = (m.group(1), m.group(2), m.group(3)) if m else ("", "", "")
    m = re.search(r"Spartid: (\d{4}-\d\d-\d\d)", t)
    r["rapportdatum"] = m.group(1) if m else r["utskriven"]
    ms = re.search(r"(OptiWin|Opti4G)\s*([\d.]+)", j)
    r["system"] = f"{ms.group(1)} {ms.group(2)}" if ms else ""
    mo = re.search(r"Säljare Storvirkesordernr(?: Storvirkesordernr 2)? Objektnr\n(.*?)\n", t)
    rad = mo.group(1) if mo else ""
    r["saljare_rad"] = rad
    mo2 = re.search(r"Beskrivning Delobjektsnr [^\n]*\n([^\n]*)\n", t)
    r["delobjektsnr_rad"] = mo2.group(1) if mo2 else ""
    nums = re.findall(r"\b\d{6,}\b", (rad + " " + r["delobjektsnr_rad"]))
    r["nummer"] = sorted(set(nums))
    # objektnamn: text före .prd-namnet eller Säljare
    r["objekt"] = re.sub(r"[_]+", " ", re.sub(r"-\d{6}-?\d*\.prd$", "", r["prd"].replace("\n", " "))).strip()[:50]
    mf = re.search(r"\d\.([A-Za-zÅÄÖåäö]+)\s+([A-Za-zÅÄÖåäö]+)\s+\(([^)]+)\)", t)
    r["forare"] = f"{mf.group(1)} {mf.group(2)}" if mf else ""
    # trädslagstabell: "TRÄDSLAG Träd.kod Stammar st lm m³(Fub)" ... "Summa a b c d"
    i = t.find("TRÄDSLAG Träd.kod Stammar")
    r["stammar"] = r["stockar"] = r["volym_m3fub"] = None
    r["arter"] = {}
    if i >= 0:
        blk = t[i:].split("TRÄDSLAG Träd.kod m³", 1)[0]
        for ln in blk.split("\n")[1:]:
            mm = re.match(r"^([A-ZÅÄÖ_ ]+?) (\d+) (\d+) (\d+) ([\d ]+,\d+) ([\d ]+,\d+)$", ln.strip())
            if mm:
                r["arter"][mm.group(1)] = (int(mm.group(3)), sv(mm.group(6)))
            ms2 = re.match(r"^Summa (\d+) (\d+) ([\d ]+,\d+) ([\d ]+,\d+)$", ln.strip())
            if ms2:
                r["stammar"], r["stockar"], r["volym_m3fub"] = int(ms2.group(1)), int(ms2.group(2)), sv(ms2.group(4))
    mp = re.search(r"Lump st lm m³\(Fub\)(.*?)Summa (\d+) ([\d ]+,\d+) ([\d ]+,\d+)", t, re.S)
    r["lump_m3"] = sv(mp.group(4)) if mp else None
    return r


def kontroll_matbevis(r):
    out = []
    if r["arter"] and r["stammar"] is not None:
        s = sum(v[0] for v in r["arter"].values())
        if s != r["stammar"]:
            out.append(("arter_stammar_vs_summa", r["stammar"], s, s - r["stammar"]))
        sv_ = round(sum(v[1] for v in r["arter"].values()), 3)
        if abs(sv_ - r["volym_m3fub"]) > 0.01:
            out.append(("arter_volym_vs_summa", r["volym_m3fub"], sv_, round(sv_ - r["volym_m3fub"], 3)))
    if r["stammar"] is None:
        out.append(("matbevis_summa_saknas", "", "", ""))
    return out


def maskin_for_matbevis(r, tal2maskin):
    """Mätsystem + objektnummer. Returnerar (maskinnyckel, orsak).
    OptiWin 4.745 och Opti4G 4.765 = Bear (förare Martin/Jocke Ringberg). OptiWin 4.728 = Scorpion King (gammal).
    Objektnummer som finns i en Maskinspecifik-rapport för en skördare får företräde."""
    kand = set()
    for n in r["nummer"]:
        kand |= {m for m in tal2maskin.get(n, set()) if m in ("Ponsse Bear", "Scorpion King gammal")}
    sysmask = {"OptiWin 4.745": "Ponsse Bear", "Opti4G 4.765": "Ponsse Bear", "OptiWin 4.728": "Scorpion King gammal"}.get(r["system"])
    if len(kand) == 1:
        return kand.pop(), "objektnummer"
    if sysmask:
        return sysmask, "mätsystem " + r["system"]
    return None, "okänt mätsystem"


# ----------------------------------------------------------------------------------------------- Lastcertifikat
def parse_lastcert(pages):
    p1 = pages[0].replace("\xa0", " ")
    t = "\n".join(pages).replace("\xa0", " ")
    r = {"rapportdatum": (re.search(r"Lastcertifikat\s*\n(\d{4}-\d\d-\d\d)", p1) or [0, ""])[1]}
    m = re.search(r"([A-Z]\d{6}|\d{5}) (\d{5})\s*\n", p1)
    r["maskinnr"] = m.group(1) if m else ""
    m = re.search(r"\n(\d{6,}) (\d{6,})\s*\n(\d{4}-\d\d-\d\d) -", p1)
    r["delobjektsnr"], r["objektnr"], r["startdatum"] = (m.group(1), m.group(2), m.group(3)) if m else ("", "", "")
    if not r["delobjektsnr"]:
        nn = re.findall(r"\b\d{6,}\b", p1[:600])
        r["delobjektsnr"] = nn[0] if nn else ""
        r["objektnr"] = nn[1] if len(nn) > 1 else ""
    r["objekt"] = " ".join((re.search(r"Delobjektsnr Objektnr\nSkifteTidsintervallMaskinnummer\n([^\n]*?)(?: [A-Z]?\d{5,6} \d{5})?\s*\n", p1) or [0, ""])[1].split())
    mf = re.search(r"Förare Objektstyp Distrikt\n\d\.([^\n]+)", p1)
    r["forare"] = " ".join(mf.group(1).split()) if mf else ""
    ms = re.search(r"Opti(?:4G|Win) ([\d.]+)", p1)
    r["system"] = ms.group(0) if ms else ""
    # sammanfattningssidan ("Förarspecifik sammanfattning")
    r["volym_m3"] = r["laster"] = None
    mm = re.search(r"Antal laster\n[^\n]*\n\s*(\d+)\s*\n\s*(\d+)\s*\n\s*(\d+)\s*\n\s*([\d ]*\d,\d+) m³\n\s*([\d ]*\d,\d+) m³", t)
    if mm:
        r["laster"], r["volym_m3"] = int(mm.group(1)), sv(mm.group(4))
    mt = re.search(r"\n(\d+:\d\d)\n(\d+:\d\d)\n(\d+:\d\d)\n\s*([\d ]*\d,\d)\n", t)
    if mt:
        r["g15"], r["avbrott"], r["arbetstid"], r["bransle_l"] = mt.group(1), mt.group(2), mt.group(3), sv(mt.group(4))
    else:
        r["g15"] = r["avbrott"] = r["arbetstid"] = ""
        r["bransle_l"] = None
    sm = re.findall(r"([\d ]+,\d+)\s*Summa", p1)
    r["summa_sida1"] = sv(sm[-1]) if sm else None
    return r


# ----------------------------------------------------------------------------------------------- XPS: Ponsse + MÄTBEVIS
def parse_ponsse_xps(pages):
    """Maskinspecifik summering ur XPS-text (etikett och värde på samma rad). Samma nycklar som parse_ponsse."""
    t = pages[0].replace("\xa0", " ")
    L = [x.strip() for x in t.split("\n")]
    r = {"rapportdatum": L[1] if len(L) > 1 else ""}
    m = re.search(r"^(?:Delobjektsnr|Stämpling)\s*(.*)$", t, re.M)
    sok = m.group(1).strip().rstrip(",") if m else ""
    parts = [x.strip() for x in sok.split(":")]
    r["nummer"] = sorted(set(re.findall(r"\b\d{6,}\b", sok)))
    r["objektnr"] = r["nummer"][0] if r["nummer"] else ""
    r["objekt"] = parts[-1] if parts and not re.fullmatch(r"[\d ]+", parts[-1]) else ""
    mm = re.search(r"^\d+\s+(Ponsse [^\n]+)$", t, re.M)
    r["modell"] = " ".join(mm.group(1).split()) if mm else ""
    g = lambda pat: (re.search(pat, t, re.M) or [None, ""])[1]
    r["arbetstid"] = g(r"^Arbetstid (\d+:\d\d)")
    r["g15"] = g(r"Effektiv arbetstid \(G15\) (\d+:\d\d)")
    r["avbrott"] = g(r"Total avbrottstid (\d+:\d\d)")
    r["reparation"] = g(r"Total reparationstid (\d+:\d\d)")
    ts = g(r"Tekniskt utnyttjande (\d+) %")
    r["tekn_utn_pct"] = int(ts) if ts else None
    h = g(r"Antal timmars användning (\d+) h")
    r["livstid_h"] = int(h) if h else None
    st = g(r"^Stammar (\d+) st")
    sk = g(r"^Stockar (\d+) st")
    vo = re.search(r"^Volym ([\d ]+,\d+) m³ ([\d ]+,\d+) m³/h", t, re.M)
    r["stammar"] = int(st) if st else None
    r["stockar"] = int(sk) if sk else None
    r["volym_m3fub"] = sv(vo.group(1)) if vo else None
    r["vol_per_h"] = sv(vo.group(2)) if vo else None
    bl = re.findall(r"Totalförbrukning ([\d ]+)\s*l\b", t)
    r["bransle_l"] = int(bl[-1].replace(" ", "")) if len(bl) >= 2 else None
    r["under_bark"] = "Under bark" in t
    return r


def parse_matbevis_xps(pages):
    t = "\n".join(pages).replace("\xa0", " ")
    j = " ".join(t.split())
    r = {"variant": "Inled" if "Inledningsdag" in j[:60] else "Start"}
    m = re.search(r"\n([^\n]*?)-(\d{6})-\s*(\d{4}-\d\d-\d\d)\s*(OAVSLUTAD|\d{4}-\d\d-\d\d)\s*(\d{4}-\d\d-\d\d)", t)
    if m:
        r["objekt"] = m.group(1).replace("_", " ").strip()
        r["startdatum"], r["slutdatum"], r["utskriven"] = m.group(3), m.group(4), m.group(5)
    else:
        r["objekt"], r["startdatum"], r["slutdatum"], r["utskriven"] = "", "", "", ""
    r["rapportdatum"] = (re.search(r"Spartid: (\d{4}-\d\d-\d\d)", t) or [0, r["utskriven"]])[1]
    ms = re.search(r"(OptiWin|Opti4G)\s*(4\.\d{3})", j)
    r["system"] = f"{ms.group(1)} {ms.group(2)}" if ms else ""
    mf = re.search(r"\d\.([A-Za-zÅÄÖåäö]+)\s+(?:\S+\s+)?([A-Za-zÅÄÖåäö]+)\s+\(([^)]+)\)", t)
    r["forare"] = f"{mf.group(1)} {mf.group(2)}" if mf else ""
    ms2 = re.search(r"\nSumma (\d+) (\d+) ([\d ]+,\d+) ([\d ]+,\d+)\n", t)
    r["stammar"] = int(ms2.group(1)) if ms2 else None
    r["volym_m3fub"] = sv(ms2.group(4)) if ms2 else None
    r["nummer"] = []
    return r
