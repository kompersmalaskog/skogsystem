"""Parsers för de avkodade vektortext-PDF:erna (se glyph_text.py / avkoda_vektor.py):
  * ponsse_skift          Ponsse OptiReport "Skift" (månadsrapport "Förra månaden" eller objektrapport "Arbetsområde")
  * ponsse_matbevis_ny    Ponsse "Mätbevis" (2023→): produktion per objekt, med maskinens modelltext
Indata: lista med rader per sida (str). Ingen databas.
"""
import re
from datetime import date

NUM = r"(\d[\d ]*(?:,\d[\d ]*)?)"
TID = r"(\d+)\s*:\s*(\d\d)"


def tal(s):
    s = re.sub(r"\s", "", s)
    return float(s.replace(",", ".")) if s else None


def tid_h(s):
    m = re.search(TID, s)
    return f"{int(m.group(1))}:{m.group(2)}" if m else ""


def minuter(hm):
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def celler(rad):
    return [c.strip() for c in rad.split(" | ")]


def normtext(s):
    """Accent- och I/l-okänslig text för sökning."""
    s = s.lower().replace("å", "a").replace("ä", "a").replace("ö", "o")
    return s


# ------------------------------------------------------------------------------------------------ Skift
KATEGORIER = ("slutavverkning", "förnyelseavverkning", "gallring", "röjning", "alla")
BLOCK = re.compile(r"^Summa \| (.+?) \| F.rare \| (.+)$")


def skift_typ(rader):
    t = normtext(" ".join(rader[:4]))
    if re.search(r"manaden", t):
        return "manad"  # "Förra månaden" / "Den här månaden"
    if re.search(r"arbetsomr", t):
        return "objekt"
    if re.search(r"sokvillkor: skift", t):
        return "skift_sok"  # sökvillkor Skift: en eller flera skift i ett intervall
    return "okand"


def parse_skift(sidor):
    rader = [r for s in sidor for r in s]
    r = {"typ": skift_typ(rader)}
    full = "\n".join(rader)
    m = re.search(r"Utskriven (\d{4}-\d\d-\d\d) (\d\d:\d\d)", full)
    r["utskriven"] = m.group(1) if m else ""
    m = re.search(r"Rapporteringsintervall\s+(\d{4})[ -]+(\d\d)[ -]+(\d\d)[ -]+(\d{4})[ -]+(\d\d)[ -]+(\d\d)", full)
    r["fran"] = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else ""
    r["till"] = f"{m.group(4)}-{m.group(5)}-{m.group(6)}" if m else ""
    # arbetsområde: celler mellan rubrikraden "Arbetsområde" och "E-postadress"
    i0 = next((i for i, x in enumerate(rader) if re.search(r"Arbetsomr.de \|", x) and "Personal" in x), None)
    obj = []
    if i0 is not None:
        for x in rader[i0 + 1:i0 + 14]:
            if re.match(r"E-?\s*p?ostadress|Visningsmetod", x):
                break
            for c in celler(x):
                if re.search(r"=|Arbetstid|Rast|Service|Planering|@|telia|\.com|^om$|Arbetstiderna|minut|Flyttning|Bogsering", c):
                    continue
                if re.fullmatch(r"[A-Za-zÅÄÖåäö. ,?:0-9()-]{3,}", c) and not re.fullmatch(r"-+", c):
                    obj.append(c)
    r["arbetsomrade"] = " ".join(obj).strip()
    # block
    blocks = []
    cur = None
    for x in rader:
        m = BLOCK.match(x)
        if m:
            cur = {"kategori": m.group(1).strip(), "forare": m.group(2).strip()}
            blocks.append(cur)
            continue
        if cur is None:
            continue
        if x.startswith("Arbetstid"):
            # pipe efter "Arbetstid" saknas ibland ("Arbetstid 175:23 | Rast | ...") och siffror kan ha mellanslag ("221 :57", "1 75:23")
            hm_ = lambda ord_: (re.search(ord_ + r"[\s|]*(\d[\d ]*?)\s*:\s*(\d\s?\d)", x))
            vals = {k: hm_(v) for k, v in (("Arbetstid", "Arbetstid"), ("Rast", "(?:Rast|Annan tid)"), ("G0", "G0"), ("G15", "G15"))}
            if all(vals.values()):
                f = {k: f"{int(m.group(1).replace(' ', ''))}:{m.group(2).replace(' ', '')}" for k, m in vals.items()}
                cur["arbetstid"], cur["rast"], cur["g0"], cur["g15"] = f["Arbetstid"], f["Rast"], f["G0"], f["G15"]
                mp = re.search(r"G15[\s|]*\d[\d ]*?\s*:\s*\d\d\s*\((\d[\d ]*)\s*%", x)
                if mp:
                    cur["g15_pct_rapport"] = int(mp.group(1).replace(" ", ""))
        elif re.match(r"m\S* \| " + NUM, x) and "Stam" in x and "rbrukning" not in x:
            m = re.search(r"^m\S* \| " + NUM + r" \| .*?\| " + NUM + r" \| m\S* ?/ ?[Ss]tam \| " + NUM + r" \| Stammar \| " + NUM, x)
            if m:
                cur["m3"], cur["medelstam_rad"], cur["stammar"] = tal(m.group(1)), tal(m.group(3)), int(tal(m.group(4)))
        elif x.startswith("m") and "G15" in x and "rbrukning" in x:
            m = re.search(r"G15 \| " + NUM + r" \| .*?\| " + NUM + r" \| F.rbrukning", x)
            if m:
                cur["m3_per_g15"], cur["m3_per_h"] = tal(m.group(1)), tal(m.group(2))
            # Förbrukning i liter (kontroll: ~20 l/G15). Pipe efter ordet saknas ibland; "951 ,0" = 951,0
            m = re.search(r"F.rbrukning[\s|]*(\d[\d ]*(?:\s*,\s*\d+)?)", x)
            if m:
                cur["forbrukning_l"] = tal(m.group(1))
        elif x.startswith("Bearbetade m"):
            nums = re.findall(NUM, x)
            cur["mth_rad"] = x[:80]
    r["blocks"] = blocks
    # dagrader (månadsrapport): datum | tid-tid | förare | tal...
    dag = []
    kat = ""
    for x in rader:
        low = x.strip().lower()
        if low in ("slutavverkning", "förnyelseavverkning", "gallring", "röjning"):
            kat = x.strip()
            continue
        m = re.match(r"^(\d{4}-\d\d-\d\d) \| (\d\d:\d\d) - (\d\d:\d\d) \| ([^|]+?) \| (.*)$", x)
        if m:
            tk = [c for c in celler(m.group(5))]
            dag.append({"datum": m.group(1), "tin": m.group(2), "tut": m.group(3), "forare": m.group(4).strip(), "kat": kat, "celler": tk})
    r["dagrader"] = dag
    ms = next((x for x in rader if x.startswith("Summa | ") and re.match(r"Summa \| \d+ ?:\d\d", x)), None)
    r["dagsumma_rad"] = ms or ""
    return r


def dagrad_falt(d):
    """Tolkar en dagrads tal efter förarnamnet. Två varianter: 5 tal efter tiderna (m3, stammar, m3/G15, m3/h, m3/stam) eller 9 (med MTH)."""
    c = d["celler"]
    if len(c) < 9:
        return None
    t = [tid_h(x) for x in c[:4]]
    if not all(t):
        return None
    rest = c[4:]
    try:
        if len(rest) == 5:
            m3, st, a, b, ms = [tal(x) for x in rest]
            return {"arbetstid": t[0], "rast": t[1], "g15": t[2], "g0": t[3], "m3": m3, "stammar": int(st), "m3_per_g15": a, "m3_per_h": b, "medelstam": ms}
        if len(rest) == 9:
            m3, bm3, fm3, fst, bst, st, a, b, ms = [tal(x) for x in rest]
            return {"arbetstid": t[0], "rast": t[1], "g15": t[2], "g0": t[3], "m3": m3, "stammar": int(st), "m3_per_g15": a, "m3_per_h": b, "medelstam": ms,
                    "mth_m3": bm3, "fallda_m3": fm3}
    except (ValueError, TypeError):
        return None
    return None


def kontroll_skift(r):
    """-> lista (kontroll, förväntat, utläst, diff_pct): G15 x m3/G15 = m3 och m3/stammar = medelstam (inom 2 %)."""
    ut = []
    for b in r["blocks"]:
        if all(k in b for k in ("g15", "m3_per_g15", "m3")) and b["m3"]:
            h = minuter(b["g15"]) / 60
            e = h * b["m3_per_g15"]
            if abs(e - b["m3"]) > 0.02 * b["m3"]:
                ut.append((f"block {b['forare']}: G15 x m3/G15 = m3", b["m3"], round(e, 1), round(100 * (e - b["m3"]) / b["m3"], 1)))
        if all(k in b for k in ("m3", "stammar", "medelstam_rad")) and b["stammar"]:
            e = b["m3"] / b["stammar"]
            if abs(e - b["medelstam_rad"]) > 0.02 * b["medelstam_rad"] + 0.001:
                ut.append((f"block {b['forare']}: m3/stammar = medelstam", b["medelstam_rad"], round(e, 3), round(100 * (e - b["medelstam_rad"]) / b["medelstam_rad"], 1)))
    return ut


# ------------------------------------------------------------------------------------------------ Mätbevis (ny)
def parse_matbevis_ny(sidor):
    rader = [r for s in sidor for r in s]
    r = {}
    full = "\n".join(rader)
    m = re.search(r"Utskriven (\d{4}-\d\d-\d\d) (\d\d:\d\d)", full)
    r["utskriven"] = m.group(1) if m else ""
    i = next((k for k, x in enumerate(rader) if x.startswith("Namn |") and "Startdatum" in x), None)
    r["objekt"], r["start"], r["slut"], r["andring"] = "", "", "", ""
    if i is not None and i + 1 < len(rader):
        c = celler(rader[i + 1])
        datum = [x for x in c if re.match(r"\d{4}-\d\d-\d\d \d\d:\d\d", x)]
        r["objekt"] = c[0] if c and not re.match(r"\d{4}-\d\d-\d\d", c[0]) else ""
        if len(datum) >= 3:
            r["start"], r["slut"], r["andring"] = datum[:3]
        elif len(datum) == 2:
            r["start"], r["andring"] = datum
        elif len(datum) == 1:
            r["start"] = datum[0]
    for j, x in enumerate(rader):
        if x.startswith("Identifiering |") and j + 1 < len(rader):
            c = celler(rader[j + 1])
            r["objektid"] = c[0] if c else ""
        if x.startswith("Virkesordernro") and j + 1 < len(rader):
            c = celler(rader[j + 1])
            r["virkesordernr"] = c[0] if c else ""
    j = next((k for k, x in enumerate(rader) if x.startswith("Maskin |") and "Entrepren" in x), None)
    mt = ""
    if j is not None:
        for x in rader[j + 1:j + 5]:
            if x.startswith("Aggregat"):
                break
            mt += " " + celler(x)[0]
    r["maskin_text"] = " ".join(mt.split())
    m = next((x for x in rader if x.startswith("Summa | ") and len(celler(x)) == 6), None)
    r["stammar"] = r["medelstam"] = r["m3"] = None
    if m:
        c = celler(m)
        try:
            r["stammar"], r["medelstam"], r["m3"] = int(tal(c[1])), tal(c[2]), tal(c[5])
        except Exception:
            pass
    # flerträd: sista "Summa | adbh | stammar | stambuntar | m3/stam | m3"
    f = [x for x in rader if x.startswith("Summa | ") and len(celler(x)) == 6 and x is not m]
    r["flertrad_m3"] = None
    arter = {}
    for x in rader:
        c = celler(x)
        if len(c) == 8 and re.match(r"SE\d+_", c[1]):
            try:
                arter[c[0]] = (int(tal(c[3])), tal(c[7]))
            except Exception:
                pass
    r["arter"] = arter
    return r


def maskin_ur_text(t):
    """Modellnamn ur mätbevisets maskinrad. GIANT + 2023/2025, KING + 2022/2023. Tolerant mot I/l/1-förväxling (SCORPlON, GlANT, KLNG)."""
    s = t.upper().replace("|", "I")
    ar = re.search(r"(?<!\d)(20\d\d)(?!\d)", re.sub(r"[IL]", "1", s) if False else s)
    # år: sök "8W 20xx" först (modellåret), annars första 4-siffriga år som inte är del av ett datum
    m8 = re.search(r"8W\s*(20\d\d)", s.replace("I", "1").replace("L", "1")) or re.search(r"8W\s*(20\d\d)", s)
    a = m8.group(1) if m8 else (ar.group(1) if ar else "")
    if re.search(r"G[IL1]ANT", s):
        return ("Scorpion Giant 2025" if a == "2025" else "Scorpion Giant 2023" if a == "2023" else ""), "GIANT " + a
    if re.search(r"K[IL1]NG", s):
        return ("Scorpion King ny" if a in ("2022", "2023") else ""), "KING " + a
    return "", s[:40]


def kontroll_matbevis_ny(r):
    ut = []
    if r["stammar"] and r["medelstam"] and r["m3"]:
        e = r["m3"] / r["stammar"]
        if abs(e - r["medelstam"]) > 0.02 * r["medelstam"] + 0.001:
            ut.append(("m3/stammar = medelstam", r["medelstam"], round(e, 3), round(100 * (e - r["medelstam"]) / r["medelstam"], 1)))
    if r["arter"] and r["m3"]:
        s = round(sum(v[1] for v in r["arter"].values()), 3)
        if abs(s - r["m3"]) > 0.02 * r["m3"]:
            ut.append(("arter_m3 = summa", r["m3"], s, round(100 * (s - r["m3"]) / r["m3"], 1)))
    return ut
