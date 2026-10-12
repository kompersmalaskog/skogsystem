"""Steg 10: bygger hist_csv/hist_korrigering.csv (manuella åtgärdskorrigeringar som Martin beslutat). hist_objekt.atgard skrivs ALDRIG över;
vyerna läser åtgärden härifrån först. Urvalet görs på Scorpion Giant 2025, rapporter från 2026, via rapportens filnamn (det är rent, till skillnad
från objektnamnet som har '?' för å/ä/ö). Mätbevis-dubbletter (dubblett_av pekar på den valda Skift-rapporten) får samma korrigering, så att rätt
åtgärd gäller oavsett vilken utskrift som räknas. Ingen databas.

  skada   "Vindfällor AB Karl Hedin, Gävle 2026"   (de objekt Martin pekat ut: storm/VF-blocket 20 april - 17 juni 2026)
  special "Specialjobb"                              (10 objekt Martin pekat ut)
"""
import csv
import sys
import unicodedata
from pathlib import Path

CSVDIR = Path("C:/Users/lindq/skogsystem-import/hist_csv")
MASKIN = "Scorpion Giant 2025"
AR = "2026"

SKADA_ORSAK = "Vindfällor AB Karl Hedin, Gävle 2026"
SKADA_FIL = [
    "Storm Louise g15.pdf", "Anders Moliis storm g15.pdf", "Hushållningssällskapet kungsgården vf g15.pdf", "Anders Moliis storm 2 g15.pdf",
    "Anna Karin Swerup VF g15.pdf", "Kenneth Karlsson VF g15.pdf", "Lexander VF g15.pdf", "Inger Åslund g15.pdf", "Peter Eklund VF g15.pdf",
    "Anders Larsson VF g15.pdf", "Ann-Sofie Åsberg VF g15.pdf", "Hushållningssällskapet 2 g15.pdf", "Claes Magnus Åkerberg g15.pdf",
]
SPECIAL_ORSAK = "Specialjobb"
SPECIAL_FIL = [
    "Kompersmåla Lövhuggn g15.pdf", "Harald Rapp g15.pdf", "Peter Kruka g15.pdf", "Santhe Dahl Tallar g15.pdf", "Björsamåla special vid hus g15.pdf",
    "Väghuggning Kuppersmåla g15.pdf", "Brändeborg frötallar g15.pdf", "Specialavv Uggleboda g15.pdf", "Vildt Timkörning g15.pdf",
    "Kroksjömåla Gallring AU g15.pdf",
]


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def las(fn):
    with open(CSVDIR / fn, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def main():
    R = {r["sha256"]: r for r in las("hist_rapport.csv")}
    H = las("hist_objekt.csv")
    rader, saknas = [], []
    for varde, orsak, filer in (("skada", SKADA_ORSAK, SKADA_FIL), ("special", SPECIAL_ORSAK, SPECIAL_FIL)):
        valda = set()
        for f in filer:
            traff = [h["sha256"] for h in H if R[h["sha256"]]["maskin_namn"] == MASKIN and h["rapportdatum"].startswith(AR) and nfc(R[h["sha256"]]["filnamn"]) == nfc(f)
                     and R[h["sha256"]]["format"] == "ponsse_skift"]
            if len(traff) != 1:
                saknas.append((f, len(traff)))
            valda.update(traff)
        dubb = {h["sha256"] for h in H if h["dubblett_av"] in valda}
        for sha in sorted(valda | dubb):
            rader.append(dict(sha256=sha, falt="atgard", nytt_varde=varde, orsak=orsak))
        print(f"{varde}: {len(valda)} objekt (Skift) + {len(dubb)} dubblett-utskrifter (Mätbevis m.fl.) = {len(valda | dubb)} rader; saknade/otydliga filnamn: {[s for s in saknas if s[0] in filer]}")
    # regler från hist_bygg.py (Rottne gallring, skotares ärvda åtgärd): orsak börjar med "regel: "
    regler = las("hist_korrigering_regler.csv") if (CSVDIR / "hist_korrigering_regler.csv").exists() else []
    manuella = {(r["sha256"], r["falt"]) for r in rader}
    krock = [r for r in regler if (r["sha256"], r["falt"]) in manuella]
    if krock:
        sys.exit(f"AVBRYTER: {len(krock)} rader finns både som manuell korrigering och som regel")
    rader += [dict(sha256=r["sha256"], falt=r["falt"], nytt_varde=r["nytt_varde"], orsak=r["orsak"]) for r in regler]
    if len({(r['sha256'], r['falt']) for r in rader}) != len(rader):
        sys.exit("AVBRYTER: samma rapport i både skada och special (eller dubbla regler)")
    with open(CSVDIR / "hist_korrigering.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["sha256", "falt", "nytt_varde", "orsak"])
        w.writeheader()
        w.writerows(rader)
    print("hist_korrigering.csv:", len(rader), "rader")


if __name__ == "__main__":
    main()
