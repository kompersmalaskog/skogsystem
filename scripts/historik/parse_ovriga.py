"""Del C: parsers för Rottne (Forester), Ponsse (OptiReport) och AptMan (DRIFT-INFO / PRODUKTIONSNOTA).

Ingen databas. Varje parser tar fulltext (lista med sidor) + metadata och ger rader i samma schema som Komatsu-parsern:
skift (bara där rapporten har riktiga skiftrader — Rottne: inloggningspass) och objekt (en rad per rapport).
Där rapporten bara har totaler skapas inga skiftrader.

Volym: under bark (fub). Rottne = m3fub, Ponsse = "Kapacitetsrapportering m³, Under bark", AptMan = m3fub/fub.
Finns bara över bark märks volym_enhet=sob och ingenting konverteras (förekommer inte i detta material).
"""
import re
from collections import defaultdict


def sv(s):
    """'5 667' / '1 022,00' / '1348.4' -> float."""
    s = s.replace("\xa0", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def minuter(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


NUM_LINE = re.compile(r"^-?[\d ]+(,\d+)?$")


# ------------------------------------------------------------------------------------------------ Rottne
SESSION = re.compile(
    r"^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)\s*(.*?)(\d+:\d\d)(?: (\d+:\d\d) (\d+:\d\d) (\d+:\d\d))?$")


def parse_rottne(pages):
    t = "\n".join(pages).replace("\xa0", " ")
    lines = [x.strip() for x in t.split("\n")]
    g = lambda pat, flags=re.M: (re.search(pat, t, flags) or [None, ""])[1].strip()
    r = {
        "rapportdatum": g(r"Skapad (\d{4}-\d\d-\d\d)"),
        "objekt": g(r"^Avverkningsobjekt[ \t]+(?!Delobjekt)(\S.*)$"),
        "objektnr": g(r"^Virkesordernummer[ \t]+(\d+)") or g(r"^Objektsid[ \t]+(\S+)"),
        "g15": g(r"Grundtid G\(t\) (\d+:\d\d)"),
        "g0": g(r"Grundtid G\(0\) (\d+:\d\d)"),
        "avbrott": g(r"Total avbrottstid (\d+:\d\d)"),
        "motortid": g(r"Motortid \(tt:mm\) (\d+:\d\d)"),
    }
    if r["objekt"].startswith("Ej tillg"):
        r["objekt"] = ""
    b = re.search(r"^Bränsle \(l\)[ \t]+([\d ]+,\d+)", t, re.M)
    r["bransle_l"] = round(sv(b.group(1))) if b else None
    # artabell: artnamn (versaler) följt av numeriska rader; "Summa" har sitt första tal på raden före
    species, cur = {}, None
    for i, x in enumerate(lines):
        if re.fullmatch(r"Summa|[A-ZÅÄÖ][A-ZÅÄÖ_ ]{2,}", x):
            cur = x
            species[cur] = []
            if x == "Summa" and i > 0 and NUM_LINE.match(lines[i - 1] or "x") and lines[i - 1]:
                species[cur].append(sv(lines[i - 1]))  # Summas första tal står på raden före
            continue
        if cur is not None:
            if x and NUM_LINE.match(x):
                species[cur].append(sv(x))
            else:
                cur = None
    # sista arten före Summa har fått Summas första tal som extra svans
    names = [k for k in species if k != "Summa"]
    if len(names) > 1 and "Summa" in species:
        n0 = len(species[names[0]])
        if len(species[names[-1]]) == n0 + 1:
            species[names[-1]] = species[names[-1]][:n0]
    elif len(names) == 1 and "Summa" in species and len(species[names[0]]) == len(species["Summa"]) + 1:
        species[names[0]] = species[names[0]][:-1]
    r["arter"] = {k: v for k, v in species.items() if k != "Summa" and len(v) >= 9}
    summa = species.get("Summa")
    r["summa"] = summa if summa and len(summa) >= 9 else None
    if r["summa"]:
        r["stammar"] = int(round(r["summa"][0] + r["summa"][5]))  # singelträd + MTH
        r["volym_m3fub"] = r["summa"][7]  # total volym inkl. MTH (m3fub)
    else:
        r["stammar"] = r["volym_m3fub"] = None
    # inloggningspass
    sess = []
    for x in lines:
        m = SESSION.match(x)
        if m:
            d_ut, t_ut, d_in, t_in, namn, tot, g15, g0, motor = m.groups()
            # kolumnordningen i textlagret: 'Logga ut' först, sedan 'Logga in'
            sess.append(dict(forare=namn.strip(), datum=d_in, tin=t_in[:5], dut=d_ut, tut=t_ut[:5], totalt=tot, g15=g15 or "", g0=g0 or "", motor=motor or ""))
    r["pass"] = sess
    return r


def kontroll_rottne(r):
    """-> lista (kontroll, förväntat, summa, diff)."""
    out = []
    if r["pass"] and r["g15"] and all(p["g15"] for p in r["pass"]):
        s = sum(minuter(p["g15"]) for p in r["pass"])
        e = minuter(r["g15"])
        if abs(s - e) > max(2, len(r["pass"]), 0.03 * e):
            out.append(("G15_pass_vs_total_min", e, s, s - e))
    if r["arter"] and r["summa"]:
        for idx, namn in ((0, "stammar_singel"), (7, "volym_inkl_mth")):
            s = round(sum(v[idx] for v in r["arter"].values()), 3)
            e = r["summa"][idx]
            if abs(s - e) > 0.02 * max(1, len(r["arter"])):
                out.append((f"arter_vs_summa_{namn}", e, s, round(s - e, 3)))
    return out


# ------------------------------------------------------------------------------------------------ Ponsse
def parse_ponsse(pages):
    t = pages[0].replace("\xa0", " ")
    lines = [x.rstrip() for x in t.split("\n")]
    r = {"rapportdatum": lines[1].strip() if len(lines) > 1 else ""}
    m = re.search(r"^(?:Delobjektsnr|Stämpling)\s+(.*?),?\s*$", t, re.M)
    sok = m.group(1).strip().rstrip(",") if m else ""
    parts = [x.strip() for x in sok.split(":")]
    r["objektnr"] = next((p for p in parts if re.fullmatch(r"\d{6,}", p)), "")
    r["objekt"] = parts[-1] if parts and not re.fullmatch(r"[\d ]+", parts[-1]) else ""
    mm = re.search(r"^\d+\s+(Ponsse [^\n]+)$", t, re.M)
    r["modell"] = " ".join(mm.group(1).split()) if mm else ""
    i = t.find("Arbetstid Utnyttjande")
    tid = re.findall(r"^(\d+:\d\d)\s*$", t[i:i + 200], re.M) if i >= 0 else []
    if len(tid) >= 4:
        r["reparation"], r["avbrott"], r["arbetstid"], r["g15"] = tid[:4]
    else:
        r["reparation"] = r["avbrott"] = r["arbetstid"] = r["g15"] = ""
    ta = re.search(r"(\d+)\s*%\s*Effektiv arbetstid", t)
    mp = re.search(r"(\d+,\d{3})\s+(\d+)st\s+m³\s+(\d+)\s+([\d ]+,\d{3})\s+Stockar\s+Stammar st/hst\s+(\d+)\s+(\d+)", t)
    if mp:
        r["vol_per_h"], r["stockar_per_h"], r["stockar"] = sv(mp.group(1)), int(mp.group(2)), int(mp.group(3))
        r["volym_m3fub"], r["stammar_per_h"], r["stammar"] = sv(mp.group(4)), int(mp.group(5)), int(mp.group(6))
    else:
        r["volym_m3fub"] = r["stammar"] = r["stockar"] = r["vol_per_h"] = None
    ml = re.search(r"Bränsleförbrukning.*?(\d[\d ]*)\s*l\s*\n", t, re.S)
    r["bransle_l"] = int(ml.group(1).replace(" ", "")) if ml else None
    r["under_bark"] = "Under bark" in t
    r["tekn_utn_pct"] = int(ta.group(1)) if ta else None
    return r


def kontroll_ponsse(r):
    out = []
    if r["g15"] and r["volym_m3fub"] and r["vol_per_h"]:
        h = minuter(r["g15"]) / 60
        e = round(r["vol_per_h"] * h, 1)
        if abs(e - r["volym_m3fub"]) > 0.02 * r["volym_m3fub"] + 1:
            out.append(("volym_vs_m3_per_h_x_G15", r["volym_m3fub"], e, round(e - r["volym_m3fub"], 1)))
    if r["g15"] and r["arbetstid"] and r["tekn_utn_pct"] is not None:
        kv = 100 * minuter(r["g15"]) / max(1, minuter(r["arbetstid"]))
        if abs(kv - r["tekn_utn_pct"]) > 1.5:
            out.append(("tekniskt_utnyttjande_pct", r["tekn_utn_pct"], round(kv, 1), round(kv - r["tekn_utn_pct"], 1)))
    return out


# ------------------------------------------------------------------------------------------------ AptMan
def parse_aptman_drf(pages):
    t = "\n".join(pages).replace("\xa0", " ")
    g = lambda pat: (re.search(pat, t) or [None, ""])[1].strip()
    m = re.search(r"DRIFT-INFO\s+(\d\d)-(\d\d)-(\d\d)", t)
    r = {
        "rapportdatum": f"20{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else "",
        "objekt": g(r"Objekt nr\s*:\s*(.+)"), "omrade": g(r"Område\s*:\s*(\d+)"),
        "maskin_nr": g(r"Maskin nr\s*:\s*(\d+)"), "version": g(r"AptMan version\s+([\d.]+)"),
        "nollstalld": g(r"DRF nollställd för område\s*:\s*(\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d)"),
        "utnyttjad": g(r"Utnyttjad tid:\s*(\d+:\d\d)"), "g15": g(r"Grundtid \(G15\):\s*(\d+:\d\d)"),
        "g0": g(r"Grundtid \(G0\):\s*(\d+:\d\d)"), "motortid": g(r"Motortid totalt:\s*(\d+:\d\d)"),
        "avbrott": g(r"Avbrott totalt \(TU\):\s*(\d+:\d\d)"),
    }
    a = g(r"Antal tr[äa]d:\s*(\d+)")
    r["stammar"] = int(a) if a else None
    p = g(r"Produktion totalt:\s*([\d,.]+)\s*m3fub")
    r["volym_m3fub"] = sv(p) if p else None
    ph = g(r"Produktion/timme:\s*([\d,.]+)")
    r["vol_per_h"] = sv(ph) if ph else None
    ms = g(r"Medelstam:\s*([\d,.]+)")
    r["medelstam"] = sv(ms) if ms else None
    return r


def kontroll_aptman_drf(r):
    out = []
    if r["volym_m3fub"] and r["stammar"] and r["medelstam"]:
        e = r["volym_m3fub"] / r["stammar"]
        if abs(e - r["medelstam"]) > 0.0015:
            out.append(("medelstam_vs_volym_per_stam", r["medelstam"], round(e, 3), round(e - r["medelstam"], 3)))
    return out


def parse_aptman_nota(pages):
    t = "\n".join(pages).replace("\xa0", " ")
    m = re.search(r"PRODUKTIONSNOTA\s+(\d\d)-(\d\d)-(\d\d)", t)
    r = {"rapportdatum": f"20{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else ""}
    r["objekt"] = " ".join((re.search(r"Objektnummer:\s*(.+?)\s*Maskinnummer", t, re.S) or [0, ""])[1].split())
    r["version"] = (re.search(r"AptMan version\s+([\d.]+)", t) or [0, ""])[1]
    r["omrade"] = (re.search(r"Område:\s*(\d+)", t) or [0, ""])[1]
    mz = re.search(r"Nollställd:\s*\S+\s+(\w{3})\s+(\d+)\s+[\d:]+\s+(\d{4})", t)
    MAN = {"Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "Maj": "05", "Jun": "06", "Jul": "07", "Aug": "08", "Sep": "09", "Okt": "10", "Nov": "11", "Dec": "12"}
    r["nollstalld"] = f"{mz.group(3)}-{MAN.get(mz.group(1), '??')}-{int(mz.group(2)):02d}" if mz else ""
    mn = re.search(r"Maskinnummer:\s*(.*?)\s*Nollst", t, re.S)
    nrs = [re.sub(r"\s", "", x) for x in mn.group(1).split(",")] if mn else []
    r["maskin_nr"] = nrs[-1] if nrs else ""
    # förartabellen: rubrikrad "Förare  TALL  GRAN ... Summa ProdVol Värde FrdKost"
    ls = [x.rstrip() for x in t.split("\n")]
    hi = next((i for i, x in enumerate(ls) if re.match(r"^Förare\s+[A-ZÅÄÖ0-9]", x)), None)
    r["forare"], r["arter_hdr"], r["total"] = [], [], None
    if hi is not None:
        hdr = ls[hi]
        j = hi + 1
        while "FrdKost" not in hdr and j < len(ls) and j < hi + 3:
            hdr += " " + ls[j].strip()
            j += 1
        seg = re.search(r"^Förare\s+(.*?)\s+Summa", hdr, re.S)
        r["arter_hdr"] = re.split(r"\s{2,}", seg.group(1).strip()) if seg else []
        hdr_n = len(r["arter_hdr"])
        k = j
        rows = []
        while k < len(ls):
            x = ls[k].strip()
            if not x or set(x) <= {"-"}:
                k += 1
                continue
            if re.match(r"^(Antal stam|Stamslag|Matris)", x):
                break
            # raden kan vara radbruten: FrdKost på nästa rad
            full = x
            if k + 1 < len(ls) and re.fullmatch(r"[\d.]+", ls[k + 1].strip() or "x"):
                full += " " + ls[k + 1].strip()
                k += 1
            tk = full.split()
            # namn = ledande icke-numeriska token(er); sedan n+1 heltal, sedan ProdVol, Värde, FrdKost
            i = 0
            while i < len(tk) and not re.fullmatch(r"\d+", tk[i]):
                i += 1
            namn, nums = " ".join(tk[:i]), tk[i:]
            n = len(nums) - 4  # arter + Summa + ProdVol + Värde + FrdKost
            if n >= 1 and len(nums) >= n + 2:
                try:
                    rows.append((namn, [int(v) for v in nums[:n + 1]], float(nums[n + 1])))
                except ValueError:
                    pass
            k += 1
        for namn, ints, vol in rows:
            if namn == "Total":
                r["total"] = (ints, vol)
            else:
                r["forare"].append((namn, ints, vol))
    if r["total"]:
        r["stammar"], r["volym_m3fub"] = r["total"][0][-1], r["total"][1]
    else:
        r["stammar"] = r["volym_m3fub"] = None
    r["enhet"] = "fub" if re.search(r"\bfub\b", t) else ""
    return r


def kontroll_aptman_nota(r):
    out = []
    if r["total"] and r["forare"]:
        ss = sum(f[1][-1] for f in r["forare"])
        if ss != r["total"][0][-1]:
            out.append(("forare_stammar_vs_total", r["total"][0][-1], ss, ss - r["total"][0][-1]))
        sv_ = round(sum(f[2] for f in r["forare"]), 1)
        if abs(sv_ - r["total"][1]) > 0.1 * len(r["forare"]):
            out.append(("forare_volym_vs_total", r["total"][1], sv_, round(sv_ - r["total"][1], 1)))
        n = len(r["total"][0]) - 1
        for ix in range(n):
            s = sum(f[1][ix] for f in r["forare"])
            if s != r["total"][0][ix]:
                out.append((f"art_{r['arter_hdr'][ix] if ix < len(r['arter_hdr']) else ix}_vs_total", r["total"][0][ix], s, s - r["total"][0][ix]))
        if sum(r["total"][0][:n]) != r["total"][0][n]:
            out.append(("arter_summa_vs_summa", r["total"][0][n], sum(r["total"][0][:n]), sum(r["total"][0][:n]) - r["total"][0][n]))
    return out
