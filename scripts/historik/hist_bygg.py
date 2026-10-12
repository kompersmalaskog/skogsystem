"""Steg 8: bygger CSV-filerna som importera.py läser (en per hist_-tabell) i C:/Users/lindq/skogsystem-import/hist_csv/.

Bara fakta ur rapporterna. Index, normkurvor och jämförelser lagras INTE. Ingen databas, ingen uppladdning.
Källor: objekt.csv, skift.csv, rapport_maskin*.csv, inventering.csv, maskinregister.csv, hist_avbrott.csv, hist_stopp.csv,
        hist_rapporter_underlag.csv (kör hist_underlag.py först), vektortext_v2 (förarblock för Ponsse Skift).
Körordning: hist_underlag.py -> hist_avbrott.py -> hist_bygg.py
"""
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import effektivitet as EF  # noqa: E402  (klassa, STANDARD: samma åtgärdsregler som i effektivitet.csv)

IMP = Path("C:/Users/lindq/skogsystem-import")
OUT = IMP / "hist_csv"

# maskin_id i dim_maskin där namnet är entydigt (se CLAUDE.md). Giant 2023/2025 delar "PONS20SDJAA270231" i CLAUDE.md och lämnas tomma.
MASKIN_ID = {"Rottne H8E Logmax": "R64101", "Rottne H8E 2026": "R64428", "Ponsse Wisent": "A030353", "Elephant King gammal": "A110148"}
ALIAS = {  # alias (gemener) -> kanoniskt namn. Angivna av Martin 2026-10-09 (+ uppenbart OCR-fel). Göran är egen förare.
    "jocke": "Joacim Ringberg", "joacim": "Joacim Ringberg", "jocke ringberg": "Joacim Ringberg", "joacim ringberg": "Joacim Ringberg",
    "martin": "Martin Lindqvist", "martin lindqvist": "Martin Lindqvist", "martn lndqvist": "Martin Lindqvist",
    "daniel": "Daniel Johansson", "danne": "Daniel Johansson", "daniel jonsson": "Daniel Johansson", "daniel johnsson": "Daniel Johansson",
    "stefan": "Stefan Karlsson", "oskar": "Oskar Nilsson",
}
DEKLARERADE = {"Daniel Johansson": ["Daniel", "Danne", "Daniel Jonsson", "Daniel Johnsson"], "Stefan Karlsson": ["Stefan"], "Oskar Nilsson": ["Oskar"],
               "Joacim Ringberg": ["Jocke", "Jocke Ringberg"], "Martin Lindqvist": ["Martin", "Martn Lndqvist"]}
TEKNISK = {"ponsseusb masterkey", "driver", "komatsu", "komponent test", "service service", "5", "7", "911", "trailer", "komatsu demo",
           "komatsu demo (rör ej)", "ponsse ab ponsse ab", "ponsse ab ponsse ab", "förare", "ponsse ponsse (ponsse)"}
FORARE_STJART = re.compile(r"\s*\(.*?\)|\s+(Första gallring|Slutavverkning|Unknown)\s*$")


def las(fn):
    with open(IMP / fn, encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def skriv(fn, rows, kol):
    OUT.mkdir(exist_ok=True)
    with open(OUT / fn, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=kol, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in kol})


def tim(hm):
    m = re.fullmatch(r"(\d+):(\d\d)", (hm or "").strip())
    return round(int(m.group(1)) + int(m.group(2)) / 60, 3) if m else ""


def num(x):
    return "" if x in ("", None) else x


def forare_kanon(namn):
    n = FORARE_STJART.sub("", namn or "").strip()
    if not n:
        return ""
    if n.islower():  # "sven" och "Sven" är samma förare
        n = n.capitalize()
    if n.lower() == "ponsse ab ponsse ab":
        n = "Ponsse AB Ponsse AB"
    n = n.replace("PONSSE PONSSE", "Ponsse AB Ponsse AB")
    return ALIAS.get(n.lower(), n)


def main():
    inv = {r["sha256"]: r for r in las("inventering.csv")}
    under = las("hist_rapporter_underlag.csv")
    O = [o for o in las("objekt.csv") if o["format"] != "ponsse_skift_objekt"]
    obj = {o["sha256"]: o for o in O}
    S = las("skift.csv")
    rmk = {r["sha256"]: r["orsak"] for r in las("rapport_maskin.csv")}
    for r in las("rapport_maskin_tillagg.csv"):
        rmk.setdefault(r["sha256"], r["orsak_eller_kalla"])
    avb = {r["sha256"]: r for r in las("hist_avbrott.csv")}
    amne = {}
    for l in open(IMP / "occurrences.jsonl", encoding="utf-8"):
        o = json.loads(l)
        if o["sha"] not in amne or o["datum"] < amne[o["sha"]][1]:
            amne[o["sha"]] = (o["amne"], o["datum"])
    for l in open(IMP / "bilagor.jsonl", encoding="utf-8"):
        b = json.loads(l)
        if b["sha"] and b["sha"] not in amne:
            amne[b["sha"]] = (b["amne"], b["datum"])

    # ------------------------------------------------------------------ hist_maskin
    reg = [r for r in las("maskinregister.csv") if r["agare"] == "egen"]
    maskin_rader = [dict(namn=r["maskin_namn"], typ=r["typ"], tillverkare=r["tillverkare"], identifierare=r["identifierare"], fran=r["forsta_datum"], till=r["sista_datum"],
                         agare=r["agare"], maskin_id=MASKIN_ID.get(r["maskin_namn"], "")) for r in reg]
    skriv("hist_maskin.csv", maskin_rader, ["namn", "typ", "tillverkare", "identifierare", "fran", "till", "agare", "maskin_id"])
    maskinnamn = {r["namn"] for r in maskin_rader}

    # ------------------------------------------------------------------ hist_forare
    namn_set = Counter()
    for x in S:
        namn_set[forare_kanon(x["forare"])] += 1
    for o in O:
        for n in re.split(r"[,;]", o["forare"] if o["format"] != "aptman_produktionsnota" else ";".join(p.split("=")[0] for p in o["forare"].split(";"))):
            if n.strip():
                namn_set[forare_kanon(n)] += 1
    alias_av = defaultdict(set)
    for x in S:
        if forare_kanon(x["forare"]) != x["forare"]:
            alias_av[forare_kanon(x["forare"])].add(x["forare"])
    for o in O:
        for n in re.split(r"[,;]", o["forare"] if o["format"] != "aptman_produktionsnota" else ";".join(p.split("=")[0] for p in o["forare"].split(";"))):
            k = forare_kanon(n)
            if n.strip() and k != n.strip():
                alias_av[k].add(n.strip())
    for kanon, al in DEKLARERADE.items():  # alias som Martin angett, även när de inte syns i data
        alias_av[kanon] |= set(al)
        namn_set[kanon] += 0
    forare_rader = []
    for n in sorted(k for k in namn_set if k):
        forare_rader.append(dict(namn=n, alias="|".join(sorted(alias_av.get(n, ()))), teknisk="true" if n.lower() in TEKNISK else "false"))
    skriv("hist_forare.csv", forare_rader, ["namn", "alias", "teknisk"])

    # ------------------------------------------------------------------ hist_rapport
    ar_av = lambda sha, r: (inv.get(sha, {}).get("rapportdatum") or inv.get(sha, {}).get("mejldatum") or "")[:4] or "okand"
    typ_av = {"objekt": "objekt", "manad": "manad", "tidsavgransad": "tidsavgransad", "tidsavgr\u00e4nsad": "tidsavgransad", "skift_sok": "skift", "objekt_aggregat": "objekt"}
    rapport_rader = []
    for u in under:
        sha = u["sha256"]
        o = obj.get(sha, {})
        typ = typ_av.get(o.get("rapporttyp", ""), "")
        if not typ:
            typ = "manad" if re.search(r"Tidsorienterad|mne m.nad|Tidsintervall", u["exkluderad_orsak"]) else "objekt"
        iv = inv.get(sha, {})
        mk = o.get("maskin_kalla") or rmk.get(sha, "")
        rapport_rader.append(dict(sha256=sha, format=u["format"], typ=typ, maskin_namn=u["maskin_namn"] if u["maskin_namn"] in maskinnamn else "", maskin_kalla=mk,
                                  mejldatum=iv.get("mejldatum", "")[:10], avsandare=iv.get("avsandare", ""), filnamn=u["filnamn"], filtyp=u["filtyp"],
                                  storage_path=f"{ar_av(sha, u)}/{sha}.{u['filtyp']}", exkluderad="true" if u["exkluderad"] == "ja" else "false",
                                  exkluderad_orsak=u["exkluderad_orsak"], tolkad="true" if u["tolkad"] == "ja" else "false"))
    skriv("hist_rapport.csv", rapport_rader, ["sha256", "format", "typ", "maskin_namn", "maskin_kalla", "mejldatum", "avsandare", "filnamn", "filtyp", "storage_path",
                                              "exkluderad", "exkluderad_orsak", "tolkad"])

    # ------------------------------------------------------------------ hist_objekt
    per_sha = defaultdict(list)
    for x in S:
        per_sha[x["sha256"]].append(x)
    obj_rader = []
    atg_kalla = Counter()
    for o in O:
        sha = o["sha256"]
        a = avb.get(sha)
        g = {k: (a[f"avbrott_{k}_min"] if a else "") for k in ("reparation", "service", "storning", "flytt", "trailer", "varmkorning", "ovrigt", "totalt")}
        if not a and o["avbrott_g15"]:  # Lastcertifikat m.fl.: bara rapportens totalsiffra
            t = EF.re.match(r"(\d+):(\d\d)$", o["avbrott_g15"])
            if t:
                g["totalt"] = int(t.group(1)) * 60 + int(t.group(2))
        g15h = tim(o["g15"])
        vals = [int(v) for v in g.values() if v != ""]
        if not vals:
            reg_ = "ej_i_format"
        elif any(v > 0 for v in vals):
            reg_ = "ja"
        elif g15h != "" and g15h >= 8:
            reg_ = "nej"
        else:
            reg_ = "osaker"
        if o.get("atgard_rapport"):
            at, ak = o["atgard_rapport"], "rapportkategori"
        else:
            at, ak = EF.klassa(o["objekt"], amne.get(sha, ("", ""))[0])
            if at == "okänd" and ak == "" and o["maskin_namn"] in EF.STANDARD:
                at, ak = EF.STANDARD[o["maskin_namn"]], "maskinstandard"
        atg_kalla[(at, ak)] += 1
        ds = sorted(x["datum"] for x in per_sha.get(sha, ()) if x["datum"])
        start = o.get("fran") or (ds[0] if ds else "")
        slut = o.get("till") or (ds[-1] if ds else "")
        obj_rader.append(dict(sha256=sha, maskin_namn=o["maskin_namn"] if o["maskin_namn"] in maskinnamn else "", objekt=o["objekt"], objektnr=o["objektnr"], startdatum=start, slutdatum=slut,
                              rapportdatum=o["rapportdatum"], atgard=at.replace("okänd", "okand"), atgard_kalla=ak, stammar=num(o["stammar"]), volym_m3fub=num(o["volym_m3fub"]),
                              volym_enhet=o["volym_enhet"], g15_h=g15h, g0_h=tim(o["g0"]), motortid_h=tim(o["motortid"]), bransle_l=num(o["bransle_l"]),
                              avbrott_reparation_min=g["reparation"], avbrott_service_min=g["service"], avbrott_storning_min=g["storning"], avbrott_flytt_min=g["flytt"],
                              avbrott_trailer_min=g["trailer"], avbrott_varmkorning_min=g["varmkorning"], avbrott_ovrigt_min=g["ovrigt"], avbrott_totalt_min=g["totalt"],
                              avbrott_registrerade=reg_, objekt_nyckel=o["objekt_nyckel"], programversion=o["programversion"], antal_lass=num(o["antal_lass"]),
                              volym_kvalitet=o["volym_kvalitet"], livstid_h=num(o["livstid_h"])))
    # Steg 10: Rottnarnas maskinstandard (gallring) är bekräftad av Martin (98 % gallring) -> räknas som säker.
    ROTTNE_BEKRAFTAD = {"Rottne H8B", "Rottne H8D", "Rottne H8E Logmax", "Rottne H8E 2026"}
    for o in obj_rader:
        if o["maskin_namn"] in ROTTNE_BEKRAFTAD and o["atgard_kalla"] == "maskinstandard":
            o["atgard_kalla"] = "maskinstandard_bekraftad"
    # Steg 10: skotarens åtgärd ärvs från skördarens objekt med samma objektnamn (normaliserat) eller objektnr inom 60 dagar. Ingen träff (eller
    # motstridiga träffar) = okänd. Bara skördarobjekt med säker åtgärd (inte obekräftad maskinstandard) räknas som källa.
    typ_av = {m["namn"]: m["typ"] for m in maskin_rader}

    def dagar(o):
        d0 = o["startdatum"] or o["rapportdatum"]
        d1 = o["slutdatum"] or o["rapportdatum"]
        try:
            return date.fromisoformat(d0[:10]), date.fromisoformat(d1[:10])
        except Exception:
            return None, None

    def gap(a_, b_):
        a0, a1 = dagar(a_)
        b0, b1 = dagar(b_)
        if not (a0 and b0):
            return 9999
        return max((a0 - b1).days, (b0 - a1).days, 0)

    harv_namn, harv_nr = defaultdict(list), defaultdict(list)
    for o in obj_rader:
        if typ_av.get(o["maskin_namn"]) == "skördare" and o["atgard"] in ("gallring", "slutavverkning", "skada") and o["atgard_kalla"] != "maskinstandard":
            n = EF.norm_obj(o["objekt"])
            if len(n) >= 4:
                harv_namn[n].append(o)
            if o["objektnr"]:
                harv_nr[o["objektnr"]].append(o)
    arvt = Counter()
    for o in obj_rader:
        if typ_av.get(o["maskin_namn"]) == "skotare" and o["atgard"] == "okand" and o["atgard_kalla"] == "":
            n = EF.norm_obj(o["objekt"])
            kand = (harv_namn.get(n, []) if len(n) >= 4 else []) + (harv_nr.get(o["objektnr"], []) if o["objektnr"] else [])
            kand = [h for h in kand if gap(o, h) <= 60]
            akt = {h["atgard"] for h in kand}
            if len(akt) == 1:
                o["atgard"], o["atgard_kalla"] = akt.pop(), "arvd_fran_skordare"
                arvt[o["atgard"]] += 1
            elif len(akt) > 1:
                arvt["motstridiga"] += 1
            else:
                arvt["ingen träff"] += 1
    print("skotare: åtgärd ärvd från skördare:", dict(arvt))
    okol = ["sha256", "maskin_namn", "objekt", "objektnr", "startdatum", "slutdatum", "rapportdatum", "atgard", "atgard_kalla", "stammar", "volym_m3fub", "volym_enhet", "g15_h", "g0_h",
            "motortid_h", "bransle_l", "avbrott_reparation_min", "avbrott_service_min", "avbrott_storning_min", "avbrott_flytt_min", "avbrott_trailer_min", "avbrott_varmkorning_min",
            "avbrott_ovrigt_min", "avbrott_totalt_min", "avbrott_registrerade", "objekt_nyckel", "programversion", "antal_lass", "volym_kvalitet", "livstid_h"]

    # ------------------------------------------------------------------ hist_skift
    sk_rader, kolliderar = {}, 0
    for x in S:
        if x["maskin_namn"] not in maskinnamn:
            continue
        fk = forare_kanon(x["forare"])
        key = (x["maskin_namn"], fk, x["datum"], x["tin"])
        if key in sk_rader:
            kolliderar += 1
            continue
        sk_rader[key] = dict(maskin_namn=x["maskin_namn"], forare_namn=fk, datum=x["datum"], in_tid=x["tin"], ut_tid=x["tut"], g15_h=num(x["g15_h"]), g0_h=tim(x["g0"]),
                             volym=num(x["volym_m3fub"]), volym_enhet=x["volym_enhet"], stammar=num(x["stammar"]), bransle_l=num(x["bransle_l"]), motortid_h=tim(x["motortid"]),
                             sha256=x["sha256"], kalla=x["kalla"], objekt=x["objekt"], antal_lass=num(x["antal_lass"]))
    skriv("hist_skift.csv", list(sk_rader.values()), ["maskin_namn", "forare_namn", "datum", "in_tid", "ut_tid", "g15_h", "g0_h", "volym", "volym_enhet", "stammar", "bransle_l",
                                                       "motortid_h", "sha256", "kalla", "objekt", "antal_lass"])

    # Ponsse Skift: summablocken saknar ibland G15 för en förare (arbetstidsraden ej tolkad) -> rapportens G15 blir för låg. Dagraderna är hela tabellen:
    # är dagradssumman större än blocksumman används den (g15_h/g0_h), annars blocksumman.
    fmt_av = {r["sha256"]: r["format"] for r in rapport_rader}
    dag_g15, dag_g0 = defaultdict(float), defaultdict(float)
    for r in sk_rader.values():
        dag_g15[r["sha256"]] += float(r["g15_h"] or 0)
        dag_g0[r["sha256"]] += float(r["g0_h"] or 0)
    korr = 0
    for o in obj_rader:
        if fmt_av.get(o["sha256"]) == "ponsse_skift" and o["sha256"] in dag_g15:
            blk = float(o["g15_h"] or 0)
            if dag_g15[o["sha256"]] > blk * 1.02 + 0.02:
                o["g15_h"], o["g0_h"] = round(dag_g15[o["sha256"]], 3), round(dag_g0[o["sha256"]], 3)
                korr += 1
    print("Ponsse Skift-rapporter där G15 hämtats ur dagraderna i stället för ofullständiga summablock:", korr)
    skriv("hist_objekt.csv", obj_rader, okol)

    # ------------------------------------------------------------------ hist_forare_objekt (förarblock där skiftrader saknas)
    har_skift = set(per_sha)
    fo = {}
    def lagg(sha, namn, g15, vol, st):
        fk = forare_kanon(namn)
        if fk and sha not in har_skift and (sha, fk) not in fo:
            fo[(sha, fk)] = dict(sha256=sha, forare_namn=fk, g15_h=g15, volym=vol, stammar=st)
    for o in O:
        if o["format"] in ("matbevis", "lastcertifikat") and o["forare"]:
            lagg(o["sha256"], o["forare"], tim(o["g15"]), num(o["volym_m3fub"]), num(o["stammar"]))
        elif o["format"] == "aptman_produktionsnota" and o["forare"]:
            for p in o["forare"].split(";"):
                m = re.match(r"^(.*?)=(\d+)/([\d.]+)$", p)
                if m:
                    lagg(o["sha256"], m.group(1), "", m.group(3), m.group(2))
    import bygg_skift as B  # Ponsse Skift: summablock per förare för rapporter utan dagrader
    sk, _ = B.las_alla()
    for s in sk:
        for b in s["blocks"]:
            if b["forare"] != "Alla" and "m3" in b:
                lagg(s["sha"], b["forare"], tim(b.get("g15", "")), b["m3"], b.get("stammar", ""))
    skriv("hist_forare_objekt.csv", list(fo.values()), ["sha256", "forare_namn", "g15_h", "volym", "stammar"])

    # ------------------------------------------------------------------ hist_stopp
    st, seen = [], set()
    for r in las("hist_stopp.csv"):
        k = (r["maskin_namn"], r["datum"], r["tid"], r["felkod"])
        if r["maskin_namn"] in maskinnamn and k not in seen:
            seen.add(k)
            st.append(r)
    skriv("hist_stopp.csv", st, ["maskin_namn", "datum", "tid", "felkod", "beskrivning", "minuter", "forare", "sha256"])

    man = dict(hist_maskin=len(maskin_rader), hist_forare=len(forare_rader), hist_rapport=len(rapport_rader), hist_objekt=len(obj_rader), hist_skift=len(sk_rader),
               hist_forare_objekt=len(fo), hist_stopp=len(st), skift_nyckelkollisioner_efter_alias=kolliderar)
    (OUT / "manifest.json").write_text(json.dumps(man, indent=1), encoding="utf-8")
    print(man)
    print("åtgärd/källa:", sorted(atg_kalla.items(), key=lambda kv: -kv[1])[:14])
    print("avbrott_registrerade:", Counter(r["avbrott_registrerade"] for r in obj_rader))
    print("rapport typ:", Counter(r["typ"] for r in rapport_rader), "exkluderade:", sum(1 for r in rapport_rader if r["exkluderad"] == "true"))
    print("rapporter utan maskin i register:", sum(1 for r in rapport_rader if not r["maskin_namn"]))


if __name__ == "__main__":
    main()
