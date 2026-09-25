# Kalibreringsvyn — designspec

*Skogsystem · kalibrering · utkast 2026-05-23*

Det här dokumentet samlar designarbetet för den ombyggda kalibreringsvyn. Det är en beställning till Desktop (Claude Code) — vad som ska byggas, i vilken ordning, mot vilken data. Allt här är verifierat mot prod-databasen (`mxydghzfacbenbgpodex`), inte gissat.

Justera fritt — det här är ett utkast, inte facit.

---

## Designprincipen (gäller hela vyn)

**Ren yta, djup i verkligheten.** Apple-principen vi landade på:

- **Ytan visar en sak.** Lugnt, svart iOS, färg bara där den betyder något. Föraren ska fatta läget på en sekund.
- **Djupet ligger ett tryck bort.** Proffset som vill förstå *varför* trycker sig nedåt, lager för lager.
- **Varje nivå landar i verkligheten** — virket föraren känner igen (stockar som de ligger, mätpunkter där de mättes), aldrig abstrakta grafer på ytan.
- **Mänskligt språk, inte tekniskt.** "Mätningen fastnar här", inte "planområde 40 cm". Tekniska tal finns i djupet.

Stil: appens befintliga svarta iOS-look (kort #1C1C1E på #000, systemfärger: röd #FF453A, orange #FF9F0A, grön #30D158, blå #0A84FF).

---

## Flikstruktur

Fyra flikar i tab-baren: **Idag · Trend · Dagar · Rapport**

| Flik | Syfte | Förarens fråga |
|---|---|---|
| Idag | Dagens/senaste kontroll, uppkapad + diagnos | "Vad ligger felet i på stammen jag mätte idag?" |
| Trend | Mönster över tid, per mätställe + trädslag | "Var ska jag skruva — tryck eller kalibrering?" |
| Dagar | Efterlevnad, en kontroll/skift | "Tog jag en stam varje dag?" |
| Rapport | Markägardokument (PDF/mail) | "Bevisa att avverkningen var kontrollerad" |

---

## Idag — trycka-kedjan (kärnan)

Tre nivåer, man trycker sig nedåt. Det befintliga modal-skalet behålls; diagnosen vävs in i djupet.

### Nivå 1 — översikt (ytan)
- Två kort: **Längd** och **Diameter** (snitt + status: "inom tolerans" / "drar på grovt").
- Stammen som ett tryckbart kort: "Göljahult · stam 1 · gran · 5 stockar · 7 mars".
- Behåll det befintliga skalet (Längd/Diameter-sammanfattning + stocklista). Detta ÄR ytan.

### Nivå 2 — stockarna som de ligger
- De N stockarna staplade **rot → topp** (samma ordning som man lägger dem vid kontrollmätning — det är verkligt, inte bara prydligt).
- Varje stock färgad efter sin avvikelse: grön = rätt (±2), orange = nästan (3–5), röd = för stort (6+).
- Stockens storlek speglar grovleken. Tryck på en stock →

### Nivå 3 — var på stocken
- Den enskilda stocken liggande, med de **verkliga mätpunkterna** prickade där de mättes (100/200/300/400 cm).
- Punkterna färgade efter **riktning**: blå = för litet, grön = rätt, orange/röd = för stort. (Diverging-skala — så drar allt åt samma håll syns det som enfärgat = systematiskt; hoppar färgerna = spretigt.)
- En mening: vad slags fel + vad man gör. Ex: "Punkten +13 mm mitt på sticker ut. Annars samlat. Kontrollera anliggning vid den grovleken."

### Stamhållning (planområden) — i djupet på Idag
Eget kort eller ett lager under nivå 3:
- Den **täta diameterprofilen** (var 10:e cm) ritad: vit linje = maskinen mätte, streckad = borde smalna.
- **Planområden** skuggade — där diametern står still ≥30 cm fast den borde fortsätta nedåt mot toppen.
- Lista med exakta lägen: "4,3–5,0 m · 361 mm · 70 cm".
- Tolkning: planområden på grovt → mätorganen tappar kontakt → anliggning/knivtryck.

---

## Diagnos-logiken (Skogforsks metod)

Tre nyckeltal, räknade ur kontrollmätningen (källa: handledningen "Håll måttet!", Skogforsk):

- **Träffprocent** — andel inom ±4 mm (diameter) / ±2 cm (längd). Huvudsiffran.
- **Systematisk avvikelse** — drar maskinen konsekvent åt ett håll? KAN kalibreras bort.
- **Spridning (standardavvikelse)** — spretar mätningen? Tyder på mekaniskt fel / inställningar. Kan INTE kalibreras bort.

**Snett vs spretigt visas i verkligheten, inte som måltavla.** På enskild stam: mätpunkternas riktningsfärg visar det (enfärgat = systematiskt, brokigt = spretigt). Måltavlan sparas till Trend (statistik över många stammar).

### Åtgärd — alltid i Skogforsks ordning
1. **Mekanik** — givare, mäthjul, knivar. Spretar det? Fixa först.
2. **Tryck** — kniv/matarvals, särskilt på grovt.
3. **Kalibrering** — bara om felet är systematiskt OCH samlat. Kräver data i alla grovleksklasser.

Vyn säger ALDRIG "kalibrera" först. Spretig mätning blir inte bättre av kalibrering.

Alltid med: "En stam räcker inte. Bekräfta med fler innan du justerar."

---

## Trend — mönster över tid

Förarens fråga: "Avviker maskinen alltid vid 300? På gran men inte tall? Var ska jag skruva?"

- **Alla mätställen** (130/200/300/400/500 cm) på x, avvikelse på y.
- **Per trädslag** (gran/tall växlingsbart) — de beter sig olika.
- **Brus synligt:** varje snitt-stapel har ett ljust band bakom = spridningen. När bandet är bredare än stapeln är mönstret svagt → "samla mer data innan du skruvar". Detta är ärlighetsskyddet — visar inte +1,8 som larm när bruset är 5 mm.
- Här hör måltavlan/träffbilden hemma (statistik, inte enskild stam).
- Kalibreringsmarkörer på tidsaxel (källa: `fakt_kalibrering_historik`, 65 händelser) — "blev det bättre efter kalibrering".

---

## Datakällor (verifierat mot prod)

| Vad | Var | Status |
|---|---|---|
| Tät diametervektor (var 10:e cm) | `detalj_kontroll_stam.stem_diameter_profile` (JSONB) | **758 kontrollstammar, alla maskiner. Finns nu.** |
| Mätpunkter per stock | `detalj_kontroll_stock_matpunkt` (position_cm, dia_maskin/operator) | Finns |
| Stock-nivå avvikelse | `detalj_kontroll_stock` | Finns |
| Kontroll-sammanfattning | `fakt_kalibrering` (376 rader) | Finns |
| Kalibreringshändelser | `fakt_kalibrering_historik` (65 rader, datum/typ/orsak) | Finns — redo för trendmarkörer |
| GROT-flagga | `dim_objekt.grot_anpassad` (bool) | 48 ja / 55 nej. Sätts av GROT-knappen i Scorpion |

**Byggbart NU utan parser-ändring:** hela Idag-vyn (diagnos + stamhållning) på de 758 kontrollstammarna. Trend på `fakt_kalibrering` + historik.

---

## Öppna frågor (kräver beslut/utredning)

1. **Ponsse tät vektor i HPR.** Ponsse sparar INTE profilen i produktions-HPR idag (bara Top/Mid/Butt). Men Martin: den exporterades tidigare i år — finns i ÄLDRE Ponsse-HPR-filer. *Desktop: hitta brytpunktsdatumet (när den slutade), bekräfta format. Om den finns: inställningen kan slås på igen → diagnos på ALLA produktionsstammar, inte bara 758 kontroller.* Rottne sparar den redan (63–82 pkt/stam).

2. **DBH-höjd 110 vs 130 — LÖST, men måste hanteras i Rapport.** Maskinen rapporterar DBH vid 110 cm (fabrikslåst, alla maskiner). Svensk standard + kontrollmätaren = 130. Ofarligt för kalibrering (jämförs vid faktiska positioner). MEN: i markägarrapporten måste DBH etiketteras "vid 110 cm" eller räknas om till 130, annars är värdet ~5 mm för grovt. *Förarens klavning ändras INTE — fortsätt vid 130.*

3. **GROT-effekt — utrett, låg prioritet.** Grotanpassade stammar mäter svagt större diameter-bias (+0,84 vs +0,53 mm på Ponsse), men effekten är liten och spridningen lika. Längden opåverkad. Eventuellt ett filter i Trend ("alla / grot / ej grot"), inte mer.

4. **Längd — lucka.** Allt ovan är diameter. Längd är ett eget problem (mäthjul, ±2 cm, fryser vid kyla). Behöver egen enkel vy. Inte designad än.

---

## Byggordning (förslag)

1. Behåll modal-skalet. Gör stockraderna expanderbara → nivå 2 (stockar som de ligger).
2. Nivå 3 (stock med mätpunkter, riktningsfärg) på de 758 kontrollstammarna.
3. Stamhållning (tät profil + planområden) som djup-lager på Idag.
4. Trend-vyn (mätställen per trädslag, brus-band, kalibreringsmarkörer).
5. Rapport (med DBH-etikett rätt).
6. Dagar (efterlevnad). Längd-vy.

Bygg på det säkra (758 stammar) först. Väx till Ponsse-HPR / Rottne-HPR när öppna fråga 1 är löst.
