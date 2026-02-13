# Automatisk säkerhetskontroll vid placering av Avlägg

Källa för alla regler: "Upplag av virke och skogsbränsle vid allmän och enskild väg", utgåva 6 (Trafikverket, Skogforsk, Riksförbundet Enskilda Vägar).

## Vägtyp-mappning (OSM → vägtyp)

- primary, secondary, tertiary, trunk, motorway → **Allmän väg**
- residential, unclassified → **Oklar vägtyp** (kan vara allmän)
- track, service, path → **Enskild väg**

---

## VID ALLMÄN VÄG (primary/secondary/tertiary/trunk/motorway)

### Rubrik: "⚠️ Allmän väg – tillstånd krävs"

### TILLSTÅND

- Tillstånd krävs enligt väglagen (1971:948) 43§
- Inom vägområdet → Trafikverket beslutar
- Utanför vägområdet men inom 12–50m → Länsstyrelsen beslutar (47§)
- Kostnad: 2 900 kr per ansökan
- Tillståndsknappar: Ej sökt (röd) / Sökt (gul) / Beviljat (grön)
- Länk: "Sök tillstånd hos Trafikverket →" → https://www.trafikverket.se/e-tjanster/upplag-av-virke-eller-skogsbransle-vid-vag/

### GENERELLT TILLSTÅND

Om hastighetsgränsen är max 80 km/h, visa:
"💡 Generellt tillstånd kan sökas per län – gäller 2 år, max 80 km/h och max 2000 fordon/dygn."

Stöd för generellt tillstånd i inställningar:
- Län (dropdown med Sveriges län)
- Giltig t.o.m. datum

Om generellt tillstånd finns och inte gått ut OCH hastighet ≤ 80 → sätt automatiskt till "beviljat" med grön ring och texten "Generellt tillstånd gäller".
Om hastighet > 80 → visa alltid "Särskilt tillstånd krävs (2 900 kr)" oavsett generellt tillstånd.

### PLACERING (baserat på hastighetsgräns)

Visa:
- "Min avstånd vägkant → välta: [X]m"
- "Min avstånd till korsning, krön eller kurva: [X]m"

**Tabell avstånd vägkant → välta:**

| 30 km/h | 40 km/h | 50 km/h | 60 km/h | 70 km/h | 80 km/h | 90 km/h | 100 km/h | 110 km/h |
|---------|---------|---------|---------|---------|---------|---------|----------|----------|
| 2m      | 2m      | 2m      | 3m      | 3m      | 3m      | 7m      | 8m       | 9m       |

**Tabell avstånd till korsning/krön/kurva:**

| 30 km/h | 40 km/h | 50 km/h | 60 km/h | 70 km/h | 80 km/h | 90 km/h | 100 km/h | 110 km/h |
|---------|---------|---------|---------|---------|---------|---------|----------|----------|
| 35m     | 60m     | 80m     | 100m    | 130m    | 160m    | 190m    | 220m     | 250m     |

### CHECKLISTA (alla punkter måste bockas av, men blockerar inget)

Visa antal ibockade av totalt, typ "7/11 kontrollerade".

- [ ] Inte i kurva med skymd sikt
- [ ] Inte vid backkrön
- [ ] Inte vid heldragen mittlinje
- [ ] Inte vid busshållplats
- [ ] Inte vid plankorsning med järnväg
- [ ] Lossning kan ske från skogssidan
- [ ] Skotare kan lossa utan att köra upp på vägen
- [ ] Lastbil kan stå plant
- [ ] Utryckningsfordon kan passera
- [ ] Ingen kraftledning ovanför
- [ ] Vattenavrinning och diken inte blockerade

### Automatisk korsningsdetektering

Använd OSM-data för att kolla om det finns en vägkorsning inom det avstånd som hastigheten kräver (35–250m). Om ja → visa varning "⚠️ Korsning inom Xm – krav min Ym".

---

## VID ENSKILD VÄG (track/service/path)

### Rubrik: "Enskild väg"

- Kontakta väghållaren
- Inga tillståndsknappar
- Ingen checklista

---

## VID OKLAR VÄGTYP (unclassified/residential)

### Rubrik: "⚠️ Kontrollera om vägen är allmän"

- Kontrollera vägtyp med kommunen
- Visa samma info som allmän väg (placering, checklista, välta, lastning)
- Tillståndsknappar visas

---

## VÄLTAN (visas på ALLA vägar – allmän, enskild och oklar)

Visa som expanderbar sektion "Regler för vältan ▼"

- Max höjd: 4,5m
- Jämndragen mot vägen upp till 1,5m höjd
- Första vältan mot trafiken ska vara sluttande
- Stockändarna ska peka mot vägen
- Alla vältor ska märkas med ägarens namn
- Inga utstickande stamdelar under 1,5m höjd
- Virke får inte riskera att rasa in på vägbanan

---

## LASTNING & SÄKERHET (visas på ALLA vägar)

Visa som expanderbar sektion "Lastning & säkerhet ▼"

- Lastbil/maskin får inte blockera vägen – utryckningsfordon måste kunna passera
- Använd varningstriangel och varningslykta vid lastning
- Skylt X6 "Lastning" ska användas
- Ta bort skyltning när lastning är klar
- Min 2–6m från kraftledningar

---

## LIGGTIDER (visas på ALLA vägar)

- Rundvirke: max 60 dagar
- Skogsbränsle: max 18 månader

---

## EFTER AVHÄMTNING (visas på ALLA vägar)

- Städa vägen, slänter och diken
- Anmäl vägskador till väghållaren
- Den som skadat vägen har betalningsansvar
- Får EJ blockera vattenavrinning, diken eller vägtrummor
- Får EJ hindra snöplogning

---

## LÄNK TILL DOKUMENTET (visas på ALLA vägar)

Längst ner:
"📄 Trafikverket & Skogforsk instruktion (PDF)" → https://www.skogforsk.se/cd_20200406123332/contentassets/8431ded2d08246c69be60fa9eb35b7fb/100401_upplag_av_virke_och_skogsbransle_vid_allman_och_enskild_vag_utg_6.pdf

---

## VISUELL INDIKATOR PÅ KARTAN

Runt avläggssymbolen:
- **Röd streckad ring** = Allmän väg, tillstånd EJ sökt
- **Gul ring** = Tillstånd sökt
- **Grön ring** = Tillstånd beviljat
- **Ingen ring** = Enskild väg

---

## SAMMANFATTNING AV VAD SOM VISAS VAR

| Sektion              | Allmän väg | Oklar väg | Enskild väg |
|----------------------|-----------|-----------|-------------|
| Tillstånd            | ✅        | ✅        | ❌          |
| Generellt tillstånd  | ✅ (≤80)  | ✅ (≤80)  | ❌          |
| Placering (avstånd)  | ✅        | ✅        | ❌          |
| Checklista           | ✅        | ✅        | ❌          |
| Korsningsvarning     | ✅        | ✅        | ❌          |
| Vältan               | ✅        | ✅        | ✅          |
| Lastning & säkerhet  | ✅        | ✅        | ✅          |
| Liggtider            | ✅        | ✅        | ✅          |
| Efter avhämtning     | ✅        | ✅        | ✅          |
| Länk till dokument   | ✅        | ✅        | ✅          |
| Visuell ring         | ✅        | ✅        | ❌          |
