"""Renderar ut/urval_steg1.json till en läsbar rapport (Markdown). Rör inga data."""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
rader = json.load(open(os.path.join(HERE, "ut", "urval_steg1.json"), encoding="utf-8"))
MASKIN = {"PONS20SDJAA270231": "Ponsse Scorpion Giant 8W", "R64428": "Rottne H8E (R64428)", "R64101": "Rottne H8E (R64101)"}


def antal(r: dict) -> str:
    # Scorpion kapar vid 4000 per fil; fortsättningen ligger i en _1-fil som
    # den här körningen inte slår ihop. Visa det som en nedre gräns.
    return f"≥{r['stammar']}" if r["stammar"] == 4000 and r["maskin"].startswith("PONS") else str(r["stammar"])


def rad(r: dict) -> str:
    return (
        f"| {r['objekt_namn'] or r['hpr_namn'] or r['grupp']} | {r['objekt_vo'] or r['contract'] or '–'} "
        f"| {r['objekt_typ'] or '(ingen rad)'} | {r['cutting_method'] or '–'} | {r['t_min']}…{r['t_max']} "
        f"| {antal(r)} | {r['dbh_medel_mm'] or '–'} | {r['andel_boom']*100:.0f} % | {r['filer']} |"
    )


HUVUD = "| Objekt | VO | typ i DB | skärmetod | fällt | stammar | DBH mm | med boom | filer |\n|---|---|---|---|---|---|---|---|---|"
ut: list[str] = []
P = ut.append

P("# Steg 1 — urval (genererad av rapport_steg1.py)\n")
P(f"{len(rader)} objektposter ur {len({(r['maskin'], r['grupp']) for r in rader})} filgrupper.\n")

# 1. Kranvinkel per maskin — HELA frågan
P("## 1. Skriver maskinen BoomPositioning?\n")
P("| Maskin | objektposter | stammar | stammar med boom | andel |\n|---|---|---|---|---|")
for m in ("PONS20SDJAA270231", "R64428", "R64101"):
    rs = [r for r in rader if r["maskin"] == m]
    n = sum(r["stammar"] for r in rs)
    b = sum(round(r["andel_boom"] * r["stammar"]) for r in rs)
    P(f"| {MASKIN[m]} | {len(rs)} | {n} | {b} | {100*b/max(n,1):.1f} % |")
P("")

# 2. Slutavverkningar i DB
sl = [r for r in rader if r["objekt_typ"] == "slutavverkning"]
P(f"## 2. Slutavverkningar i databasen med HPR på disk: {len({r['objekt_vo'] for r in sl})}\n")
P(HUVUD)
for r in sorted(sl, key=lambda r: (r["maskin"], r["t_min"])):
    P(rad(r))
mb = [r for r in sl if r["andel_boom"] >= 0.9]
P(f"\n**Slutavverkningar med kranvinkel (≥90 % av stammarna): {len(mb)} av {len(sl)}.**\n")

# 3. ClearCutting enligt filen, oavsett DB
cc = [r for r in rader if (r["cutting_method"] or "").lower() == "clearcutting"]
P(f"## 3. Filer som själva säger ClearCutting: {len(cc)} objektposter, varav utan DB-rad: "
  f"{sum(1 for r in cc if not r['objekt_typ'])}\n")

# 4. Rottne-grupper — vilka är egentligen slutavverkning?
P("## 4. Alla Rottne-objekt (för att se om något är slutavverkning)\n")
P(HUVUD)
for r in sorted([r for r in rader if r["maskin"].startswith("R64")], key=lambda r: r["t_min"]):
    P(rad(r))
P("\nDBH-medel i en gallring ligger kring 100–140 mm; en slutavverkning kring 200–300 mm.\n")

# 5. Rader utan koppling mot DB
ej = [r for r in rader if not r["objekt_typ"] and r["stammar"] >= 50]
P(f"## 5. Poster utan rad i `objekt` (≥50 stammar): {len(ej)}\n")
for r in sorted(ej, key=lambda r: (r["maskin"], r["t_min"])):
    P(f"- {MASKIN[r['maskin']]} — {r['hpr_namn'] or r['grupp']} (kontrakt {r['contract']}), {antal(r)} st, DBH {r['dbh_medel_mm']}, boom {r['andel_boom']*100:.0f} %")

# 6. Läsarkontroll
av = [r for r in rader if r["kontroll_taggar"] != r["kontroll_lasta"]]
P(f"\n## 6. Läsarkontroll\n\nFiler där antalet lästa stammar ≠ antalet <Stem>-taggar: **{len(av)}**.")
txt = "\n".join(ut)
open(os.path.join(HERE, "ut", "rapport_steg1.md"), "w", encoding="utf-8").write(txt)
sys.stdout.buffer.write(txt.encode("utf-8"))
