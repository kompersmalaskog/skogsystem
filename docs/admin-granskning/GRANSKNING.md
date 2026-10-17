# Granskning av Admin-vyn — för mycket text

> **Status 2026-10-17: byggt.** Allt utom det som är märkt SENARE är gjort i samma PR — se [Utfall](#utfall-byggt-i-samma-pr) längst ned. Texten nedan är granskningen som den stod innan bygget (bilderna i `bilder/` är *före*).

Granskning (före bygget). Alla bilder i `bilder/` (390 och 1440 px, samma namn med `-390`/`-1440`).

**Kort svar:** Admin är bra där den följer samma mönster (Översikt, Maskiner, Avtal: rubrik i versaler → kort → en rad per sak). Den är dålig i **Lön → Löneunderlag** och **Lön → Dagar**, som tillsammans är 2 268 av de 3 800 orden jag räknade över alla vyer. Det är där hjärnan tar slut. Resten är småsaker som tillsammans gör att appen låter som en utvecklare, inte som en app: tekniska ord, upprepade märken, hjälptexter som upprepar etiketten.

Fem saker att göra först (alla under en halvdag styck, utom Löneunderlag som delas upp):

1. En svarsrad överst i Löneunderlag (#1a).
2. "Att ta med löneansvarig" ned till EN rad (#2).
3. Samma månadsord i Löneunderlag och Dagar — i dag betyder "September 2026" augusti i den ena och september i den andra (#3).
4. Dagar öppnar på "Bara avvikelser" (#4).
5. Ta bort dubbletterna och varningarna utan knapp i förarkorten (#5).

---

## Hur jag mätte

- **Riktig app, falsk data.** Next dev-server mot en låtsas-Supabase med påhittade namn (ingen prod-data, inga riktiga personer). Datan är gjord för att trigga det som är svårt: augusti 2026 (OB 10,30 / 14,42 / 7,08 / 1,27 / 7,00, rastvarningar, vilobrott 10,6 h, kortpass, sjukdag), januari 2026 (helglön 32 och 16 tim med skäl: sjuk, tjänstledig omkring, arbetad röd dag, anställningsdatum saknas), en ny omatchad maskin, en maskin utan filer i 26 dagar, en manuell maskin (JD810E), en medarbetare utan hemadress.
- **Ordräkning** = synlig text i huvudytan (`<main>`, inklusive sidrubrik och flikrad, exklusive sidomeny/bottenfält), delat på blanksteg. ±10 ord. Samma antal på 390 och 1440 — layouten ändrar aldrig vad som visas, bara hur högt.
- **Bilder:** långa sidor (Dagar, Löneunderlag augusti på 390) är beskurna vid 4 000 px i repot för storlekens skull; ordräkningen är gjord på hela sidan.

**Begränsningar i riggen — läs innan du litar på något enskilt fynd:**
- Hempunktskartan visar "Kartan kunde inte laddas" (komponenten hämtar MapLibre från ett CDN som sandlådan blockerar). Kartkortet är alltså inte bedömt visuellt.
- "0 operatörer" på varje rad i Medarbetare (#11) kan vara riggens fel: seeden har fyra kopplingar men listan visar noll. Jag har inte kunnat avgöra om det är riggen eller en riktig bugg — **en SELECT mot prod avgör** (jag körde ingen, uppgiften sa bara granska).
- Datumfält visar `mm/dd/yyyy` och decimaler med punkt (`3.62`): det är webbläsarens språk i riggen, inte appen. Jag räknar det inte som fynd.

---

## Ord per vy: före → mål

Målet är inte ett tal i sig utan en regel: **en rad ≈ 3–5 ord, ett svar överst, längre text i detaljvy.** Tidsuppskattningarna nedan förutsätter mål-kolumnen, inte en omskrivning.

| Vy (flik › underflik) | Ord nu | Höjd 390 | Mål | Vad som tar bort orden |
|---|---:|---:|---:|---|
| Översikt | 95 | 1 179 | 60 | "Stämmer"-raderna blir en rad; Arbetstid-gruppen försvinner när inget är rött |
| Medarbetare (lista) | 74 | 1 013 | 45 | "0 operatörer" ×8 och roll-märken ×8 ersätts av grupper |
| Medarbetare › person | 130 | 1 943 | 75 | hjälptexter som upprepar etiketten; tekniska förklaringar |
| Maskiner (lista) | 79 | 1 067 | 45 | "Öppna som maskin" ×6 |
| Maskiner › ny maskin | 117 | 1 533 | 60 | två brytare blir ett val; tekniska ord |
| Lön › Löneunderlag (aug) | **953** | 4 575 | **250** | svarsrad; frågor/beslut till egen sida; ett kort per förare |
| Lön › Löneunderlag (jan) | 617 | 3 368 | 200 | samma + helglön som rader, inte löpande text |
| Lön › Dagar | **1 315** | 7 212 | **200** | förvald "Bara avvikelser"; resten bakom "Visa alla" |
| Lön › Lönearter | 111 | 1 194 | 60 | namnet upprepas ×10 |
| Lön › Lönesystem | 86 | 1 845 | 40 | miljövariabler, krypteringstext, STUB-chips, 8 Spara |
| Lön › ATK-val | 46 | 1 017 | 25 | "EJ VALT" ×8 |
| Lön › Vilobrott | 66 | 844 | 40 | metodtexten före svaret |
| Avtal | 106 | 2 423 | 80 | rubrikkortet som upprepar formuläret; tom grupp |
| **Summa** | **3 800** | | **~1 200** | |

Inom Löneunderlag (aug, 1 035 ord inkl. flikrad): "Att ta med löneansvarig" **291 ord** (28 %), de fyra förarkorten + företagsledarna **647 ord** (62 %). Av förarkorten är sex varningsblock med rubriken "PÅVERKAR RIKTIGHETEN — GÅR INTE MED"; samma rastmening står ×4, "Brandrisk … en lönerad, se listan ovan" ×5, rast-varningen på ~35 ord ×3.

---

## Fynd, rangordnade

Tagg: **KRITISKT** (man fattar fel beslut eller tappar bort sig), **VÄRT DET** (tydlig vinst, liten kostnad), **NICE-TO-HAVE**. Tid: 15 min / 1 h / halvdag / dag+. Allt märkt **SENARE** är en större omskrivning som jag inte föreslår nu.

### KRITISKT

**#1a. Löneunderlag har ingen svarsrad — "Skicka till Fortnox" ligger 4 500 px ned.**
Var: Lön › Löneunderlag, `lon-underlag-aug-390.jpg` / `-1440.jpg`.
Vad: Sidan öppnar med Årsövertid (7 rader), en utjämningsrad och en teknisk beskrivning ("Mängder … aldrig kronor. Fortnox äger satserna."). Frågan "är det här klart att skicka?" besvaras först efter ett par tusen pixlar, och knapparna (Uppdatera, Skicka till Fortnox) ligger sist. Sidan har också en helt egen stil (orange fält, FRÅGA/BEKRÄFTA-märken) i stället för flikarnas gemensamma rubrik-kort-mönster.
Apple: Ett kort överst, som Hälsa-sammanfattningen: *"Augusti · 4 förare · 24 rader · 3 saker att kolla"* med en knapp **Skicka** som är grå tills sakerna är rättade.
Tid: **1 h** (svarsraden, återanvänd `attGora`-logiken). Hela omgörningen till ett kort per förare med detaljvy = **dag+, SENARE (#1b)**.

**#2. "Att ta med löneansvarig": 8 punkter, 291 ord, permanent, går inte att kvittera.**
Var: Lön › Löneunderlag, samma bilder, mitten av sidan.
Vad: Frågor och beslut (§-hänvisningar, "MARTINS BESLUT") som är utvecklarens och Martins att-göra-lista, inte lönearbete. De står kvar varje månad och varje period, även i januari, och försvinner aldrig — appen kan inte se att de är besvarade. Det är mer text än alla andra flikar tillsammans.
Apple: En rad **"8 öppna frågor ›"** som öppnar en egen sida. Inget på huvudytan.
Tid: **1 h** (fäll ihop till en rad + egen vy). Att kunna bocka av (kräver en sparad markering) = **halvdag, SENARE**.

**#3. Samma månadsord, olika månader.**
Var: Lön › Löneunderlag mot Lön › Dagar, `lon-underlag-aug-*` mot `lon-dagar-*`.
Vad: Månadsväljaren säger "September 2026" i båda. I Löneunderlag är det *löneperioden* (rubriken längre ned: "Löneperiod september 2026 — arbetstid augusti 2026"); i Dagar är det *kalendermånaden* (raderna börjar "TIS 1 SEPTEMBER"). Man jämför två flikar med samma rubrik och olika data. Översikt säger "Lönen för september" och menar augusti-arbetet. Det här är den enda sak i granskningen som kan göra att någon läser fel månad.
Apple: Ett ord överallt, det man faktiskt ser — *"Arbetstid augusti"* med *"Lön i september"* som undertext. Väljaren i båda flikarna styrs av samma sak.
Tid: **1 h** för texterna; **halvdag** om väljarens val ska delas mellan flikarna (testa att URL:en `period=` fortfarande betyder löneperiod).

**#4. Dagar: 111 platta rader; svaret ("9 med avvikelse") är en liten rad överst.**
Var: Lön › Dagar, `lon-dagar-390.jpg` (beskuren) / `-1440.jpg`.
Vad: 1 315 ord, 112 chevrons. Filtret "Bara avvikelser" finns men är av. Raderna är namn + objekt + "gallring 2026" + tid, ×111 — ingenting skiljer en avvikelse från de 102 normala dagarna.
Apple: Förvalt **Bara avvikelser** (9 rader), och längst ned **"Visa alla 111 ›"**. Svaret först.
Tid: **15 min** (byt förval) → **1 h** (om "Visa alla" ska vara en egen rad och filtret sparas).

**#5. Förarkorten: varningar utan knapp, och samma sak sagd flera gånger.**
Var: Lön › Löneunderlag, förarkorten (aug), `lon-underlag-aug-390.jpg`.
Vad:
- Rubriken **"PÅVERKAR RIKTIGHETEN — GÅR INTE MED"** är jargong ("går inte med" — med vad?).
- *"Skotarna loggar ingen rast i filen och körs i regel utan."* står ×4 ordagrant — samma förklaring på varje skotare.
- Rastvarning på ~35 ord ×3 för Mats ("Skogsavtalet §5 mom 6 … rättas i förarens Redigera") — utan en knapp som tar dit.
- *"Brandrisk: 7,00 tim OB (3 beordrade morgnar) — en lönerad, se listan ovan"* ×5 — upprepar raden direkt ovanför.
- Karin Holm är företagsledare ("lön utanför appen") men får ändå *"Frånvaro (sjuk) … sätt manuellt innan sändning"* och *"Felinloggning? Ta bort dagen."* — varningar för någon som inte får några rader.
- *"UTKAST"* ×4, ett märke per kort som alla har samma värde.
Apple: En rad per sak med knappen bredvid: **"Rast saknas 6 dagar · Rätta ›"**. Förklaringen en gång, i en ⓘ. Raden "Brandrisk … se listan ovan" bort. Inga varningar på företagsledare.
Tid: **1 h** (ta bort dubbletter, dölj företagsledares varningar, byt rubrik) + **halvdag** (knappen som öppnar rätt dag i rätt vy).

### VÄRT DET

**#6. "Anställningsdatum saknas" upprepas på varje förare, varje månad — och helglön är en löpande text.**
Var: Lön › Löneunderlag (jan), `lon-underlag-jan-390.jpg`.
Vad: Varningen (~35 ord med §-hänvisning) står på varje förare som saknar datum — i prod är det alla sju — i varje månad som har helglön, och har ingen knapp (åtgärden bor i en annan flik). Helglönens skäl är ett enda stycke på ~40 ord: *"12-24 Julafton, 12-25 Juldagen — ingen helglön: sjuk, 12-26 Annandag jul (arbetad — helglön ändå, praxis) …"*.
Apple: **En** rad på Översikt: *"7 saknar anställningsdatum · Fyll i ›"*; på förarkortet bara ett litet märke. Helglön som fyra rader (datum, ✓/✗, skäl) i en detaljvy.
Tid: **1 h** (Översikt-raden) + **halvdag** (helglön som rader — `helglonText` finns redan per dag).

**#7. Anställningsnumret finns på två ställen, med åtta Spara-knappar.**
Var: Lön › Lönesystem (nederst), `lon-lonesystem-1440.jpg`, och Medarbetare › person, `medarbetare-person-1440.jpg`.
Vad: Samma fält redigeras både i personens sida och i en lista på åtta rader i Lönesystem, där varje rad har en egen (grå) Spara-knapp. De som saknar nummer (Admin Test, Lena) ser ut som alla andra.
Apple: Redigeras bara i personen. Lönesystem visar en rad *"2 saknar anställningsnummer · Fyll i ›"*.
Tid: **1 h**.

**#8. Lönesystem pratar utvecklarspråk.**
Var: Lön › Lönesystem, `lon-lonesystem-390.jpg`.
Vad: *"Inloggningsuppgifterna (FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET) ligger i miljövariabler. Tokens krypteras med AES-256-GCM innan de sparas i databasen."* Rå tidsstämplar med sekunder ("Token utgår 2026-12-01 01:00:00"). Fem av sju val är märkta **STUB** (Visma, Hogia, Kontek, Crona, Agda) — fem knappar som inte gör något. "Koppla ifrån" (destruktiv) ligger ovanför "Testa anslutning" och väger lika tungt. Meningen *"Vilken löneart i Fortnox varje rad skickas som väljer du under Lön → Lönearter"* är en vägvisning till grannfliken.
Apple: *"Fortnox · Anslutet · Synkades igår 23:10"*. Token visas som varning först när den går ut inom 14 dagar, då med **Förnya** bredvid. Ta bort STUB-chipsen tills de fungerar. "Koppla ifrån" som röd text längst ned.
Tid: **30 min** (texter och tider) + **15 min** (STUB-chips) + **15 min** (omflytt av knappar).

**#9. Lönearter: namnet står två gånger på varje rad.**
Var: Lön › Lönearter, `lon-lonearter-1440.jpg`.
Vad: Raden *"Premielön skördare — I Fortnox: Premielön skördare 1355"*: titeln och Fortnox-namnet är samma ord ×10. FRIVILLIG-märket står klistrat mot titeln utan mellanrum i texten. Fortnox-namnet *"Helglön skotare:"* har ett avslutande kolon (kommer ur Fortnox, men syns). Introt är tre meningar.
Apple: Namn till vänster, **koden till höger** ("1355"). Fortnox-namnet visas i detaljvyn där man ändrar koden. Intro: en mening.
Tid: **30 min**.

**#10. Översikt är bäst i klassen men har fyra småfel.**
Var: Översikt, `oversikt-390.jpg` / `-1440.jpg`.
Vad:
- **NÄRA GRÄNSEN** (Mats, 11,3 h vila, kravet är 11) är en varning utan något man kan göra. Samma person står ovanför med ett riktigt brott — Mats finns två gånger på sidan.
- **Anders Wik — "Delägare – arbetstidslagen gäller inte"** är en dämpad rad som aldrig kräver något.
- **STÄMMER**: fyra rader med bock (bland dem *"Alla maskiner har skickat fil inom 10 dygn"* som bryter över två rader).
- Knapparna heter **Granska / Visa / Öppna / Bekräfta** och sitter ibland under texten, ibland bredvid.
Apple: Det som kräver dig är redan rätt gjort (svaret först, knappen bredvid). Ta bort Arbetstid-gruppen när inget är rött; en rad *"Allt annat stämmer ✓"* som fälls ut vid tryck; ett ord (**Öppna**) och samma plats för knappen.
Tid: **30 min**.

**#11. Medarbetare-listan: samma sak sagd åtta gånger.**
Var: Medarbetare, `medarbetare-1440.jpg`.
Vad: Varje rad har ett roll-märke (ADMIN/FÖRARE) och texten "0 operatörer" (+ maskin). *Obs: "0 operatörer" ×8 kan vara riggen (se Begränsningar). Är det sant i prod säger det emot Översikts "Alla operatörer är kopplade ✓".* Roll-märket är en etikett per rad i stället för en grupp.
Apple: Grupper som i Inställningar: **FÖRARE (5)**, **ADMIN (3)**; raden = namn + maskin + chevron. Operatörer visas bara när något är fel ("Inte kopplad").
Tid: **30 min** (+ en SELECT mot prod för att avgöra operatörsräkningen).

**#12. Personsidan: hjälptexter som upprepar etiketten, och Spara långt ned.**
Var: Medarbetare › person, `medarbetare-person-390.jpg`.
Vad: *"Hemadress — Gata och nummer, postnummer och ort."* (upprepar etiketten). Företagsledare-texten är ~33 ord, tekniskt och pekar på en annan flik (*"visas då grått i Arbetstid på Översikten, utan gul eller röd"*). "Anställningsnummer (Fortnox)" + raden *"Finns i Fortnox som Anställd 1005."* säger Fortnox två gånger. Tom-tillståndet för operatörer: *"En operatör är namnet i maskinfilerna. Utan koppling når tiden inte lönen."* — två tekniska ord ("operatör", "maskinfilerna"). Spara-knappen ligger 1 700 px ned.
Apple: Ta bort hjälptexter som bara upprepar etiketten. Företagsledare: en rad, *"Ingen lön i appen"*. Operatörer: *"Ingen maskinkoppling — tiden når inte lönen. Koppla ›"*. Spara i sidhuvudet (som iOS "Klar").
Tid: **1 h**.

**#13. Maskiner: "Öppna som maskin" står på alla sex raderna.**
Var: Maskiner, `maskiner-1440.jpg`.
Vad: En rad ska vara en sak. Här har varje rad både en chevron (öppna maskinen) och en andra knapp (öppna som maskin) — samma val sex gånger. "Ny maskin i importen → Bekräfta" är däremot rätt gjort och bör vara mallen för resten av Admin (varning + knappen bredvid).
Apple: Tryck på raden öppnar maskinen; "Öppna som maskin" som en rad i detaljvyn.
Tid: **15–30 min**.

**#14. Ny maskin: två brytare svarar på samma fråga, och texten är teknisk.**
Var: Maskiner › ny maskin, `maskiner-ny-1440.jpg`.
Vad: **Sänder filer** och **Manuell datakälla** beskriver samma val (JD810E är av/på) med olika ord. Texten: *"…importen avvisar FPR-filer för maskinen. En maskin har en källa."* ("FPR", "datakälla", "nyckel mot filerna"). Intro-kortet är tre meningar.
Apple: **Ett val**: *"Hur kommer datan? Maskinfiler · Manuellt"* (segmentväljare). En rad förklaring under det valda.
Tid: **1 h** (ändrar två fält till ett, kräver att man behåller de två kolumnerna bakom).

**#15. Avtal: rubrikkortet upprepar formuläret; Spara ligger mitt på sidan.**
Var: Avtal, `avtal-1440.jpg`.
Vad:
- Kortet överst (*"AKTUELLT AVTAL · Skogsavtalet 2025–2027 · 1 apr. 2025 – 31 mars 2027"*) och gruppen AVTAL (Namn, Giltigt från, Giltigt till) säger samma sak.
- Namnfältet klipps på 1440 ("Skogsavtalet 2025–20").
- **Spara ändringar** ligger efter sju grupper och *före* Utjämningsperioder — det är oklart vad den sparar och att den inte sparar perioderna nedanför.
- Tom grupp med två meningar: *"Inga tidigare avtalsversioner. Den som gällde före det nuvarande står här när ett nytt läggs in."* (ingenting att göra → ska inte synas).
Apple: Rubrikkortet ÄR namnet/datumet (redigeras vid tryck). Spara i sidhuvudet. Gruppen göms när den är tom.
Tid: **1 h**.

**#16. ATK-val: "EJ VALT" åtta gånger i en grupp som redan heter "SAKNAR VAL (8)".**
Var: Lön › ATK-val, `lon-atk-1440.jpg`.
Vad: Statusen upprepas på varje rad. Företagsledarna och Admin Test (som inte får några lönerader) står med. Sidan förklarar aldrig vad valet är (pengar eller ledighet). Ingen knapp för att åtgärda — man måste öppna varje rad.
Apple: Gruppen heter SAKNAR VAL; raderna är bara namn + chevron; en knapp **Påminn alla** bredvid gruppen om det går. Dölj de som inte omfattas.
Tid: **30 min** (**1 h** med Påminn alla, om det finns ett sätt att påminna).

**#17. Årsövertid: sju identiska rader; utjämningsraden visas där den inte gäller.**
Var: Lön › Löneunderlag, överst, `lon-underlag-jan-390.jpg`.
Vad: Sju rader *"0 av 250 tim"* (inklusive företagsledare, för vilka taket inte gäller). *"Utjämningsperiod v17–27 (Gävle/Hedemora-Sandviken), 77 dagar — räknas som genomsnitt"* visas även på **januari**, där perioden (april–juli) inte berör månaden.
Apple (Hälsa): Visa bara dem som närmar sig taket (> 50 %), annars en rad *"Ingen närmar sig 250 tim"*. Utjämningsraden bara när månaden överlappar perioden.
Tid: **30 min**.

**#18. Fel i texten som syns.**
Var: Lön › Löneunderlag (jan/aug), `lon-underlag-jan-390.jpg`.
Vad: *"Frånvaro (tjanstledig)"* — råa nyckeln, utan å. *"dag(ar)"*. Brandrisk står som **10,3 tim** i raden och **10,30 tim** i texten under, samma tal. Datum blandar tre format: `2026-08-11`, `08-17`, `11 aug`.
Apple: Svenska ord, ett datumformat, samma antal decimaler.
Tid: **15–30 min**.

### NICE-TO-HAVE

**#19. Vilobrott: metodbeskrivning före svaret.**
Var: Lön › Vilobrott, `lon-vilobrott-1440.jpg`.
Vad: *"Analyserar arbetsdagar de senaste 3 månaderna mot arbetstidslagens krav: dygnsvila minst 11 h sammanhängande, veckovila minst 36 h sammanhängande."* står före första brottet. Bra: **Exportera PDF** ligger bredvid i en rätt form (en åtgärd, rätt plats).
Apple: Metodtexten bakom ⓘ. Svaret (brottet) först.
Tid: **15 min**.

**#20. Dagar: tvetydiga rader.**
Var: Lön › Dagar, `lon-dagar-1440.jpg`.
Vad: *"Mats · rast 3 tim 43 min · 8 tim 27 min"* — vilket tal är arbetad tid? *"Johan · utan maskin · utan objekt · 8 tim"* — "objekt" är ett tekniskt ord för en förare som ser det som "trakt".
Apple: Arbetad tid som huvudtal, rast som undertext med etikett.
Tid: **30 min**.

**#21. "UTKAST"-märket ×4 per förarkort** (se #5, men det är ett eget 15-minutersfynd om du bara vill ha det mest synliga). **Tid: 15 min.**

---

## Medvetet **SENARE** (större än ett fynd)

- **#1b. Ett kort per förare i Löneunderlag med detaljvy** (raden = namn · rader · ett märke; tryck → hela förarens underlag). Det är där de flesta av de 950 orden försvinner. Dag+. Gör #1a, #2 och #5 först och mät om.
- **Lön har sex underflikar på en rad** och "Lönesystem" klipps vid skärmkanten på 390 (`lon-underlag-aug-390.jpg`). Apple hade delat i *görs varje månad* (Underlag, Dagar, Vilobrott) och *ställs in sällan* (Lönearter, Lönesystem, ATK-val, och kanske Avtal, som idag är en egen flik). Det är en strukturfråga som rör Martins mentala karta över appen — fråga honom först.
- **Kvittera frågorna i "Att ta med löneansvarig"** (sparad markering per fråga). Halvdag, men först när #2 är gjort.

## Det som redan är rätt — ändra inte

- **Översikts övre kort** ("4 saker kräver dig" med knappen bredvid varje rad).
- **"Ny maskin i importen → Bekräfta"** — varning + åtgärd i samma rad. Mallen för punkterna ovan.
- **Avtals gruppstil** (rubrik i versaler → kort → rad med etikett till vänster, värde till höger).
- **PDF-kortet i Avtal** (*"Inte uppladdad än"* + **Ladda upp PDF**) och **Exportera PDF** i Vilobrott: en åtgärd bredvid sin varning.
- **Inga horisontella scrollar**: alla 26 bilder har sidbredd = skärmbredd.

## Att verifiera mot prod (1 SELECT)

`operator_medarbetare` per medarbetare — avgör om "0 operatörer" i #11 är riggen eller en riktig bugg.


---

## Utfall: byggt i samma PR

Beslut (Martin 2026-10-17): **arbetsmånaden är alltid huvudnamnet ("Augusti"), utbetalningen står i liten text under ("lön betalas 25 september")** — samma i Löneunderlag, Dagar, Min månad och exportdialogen (`lib/lonesystem/lonemanad.ts`, EN källa). Adressen (`?period=`) och API:erna talar fortfarande löneperiod; bara det som SYNS har bytt ord. Och: rastvarningen "dagar över 6 tim utan rast" är borta och ersatt av en neutral info-rad i dagens detalj (Dagar): *"Inget stopp över 15 min – räknas som arbetstid med måltidsuppehåll (G15)"*.

### Ord per vy: före → efter (390 px, samma antal på 1440)

| Vy | Före | Efter | Mål |
|---|---:|---:|---:|
| Översikt | 95 | 51 | 60 |
| Medarbetare (lista) | 74 | 56 | 45 |
| Medarbetare › person | 130 | 92 | 75 |
| Maskiner (lista) | 79 | 61 | 45 |
| Maskiner › ny maskin | 117 | 59 | 60 |
| Lön › Löneunderlag (aug) | 953 | 171 | 250 |
| Lön › Löneunderlag (jan) | 617 | 145 | 200 |
| Lön › Dagar (förvalt: avvikelser) | 1 315 | 128 | 200 |
| Lön › Dagar (efter "Visa alla 111") | 1 315 | 1 250 | — |
| Lön › Lönearter | 111 | 75 | 60 |
| Lön › Lönesystem | 86 | 29 | 40 |
| Lön › ATK-val | 46 | 37 | 25 |
| Lön › Vilobrott | 66 | 50 | 40 |
| Avtal | 106 | 78 | 80 |
| **Summa** (Dagar räknad i sitt förvalda läge) | **3 795** | **1 032** | **~1 200** |

Måttet är detsamma som före (synlig text i `<main>`, ±10 ord). "Visa alla 111" är fortfarande 111 rader (1 250 ord): det är data, inte text, och det är inte längre det man möter först. Tre vyer ligger över sitt mål (Medarbetare-listan, Lönearter, ATK-val): de är redan korta, och det som återstår är namn och rubriker, inte förklaringar.

### Vad som byggdes, per fynd

| # | Fynd | Utfall |
|---|---|---|
| 1a | Svarsrad i Löneunderlag | **Gjort.** "Klart att skicka" / "N saker att kolla" överst, Uppdatera + Skicka direkt under. Skicka är oförändrat aktiv (bara saknade koder blockerar, som förut) — varningarna är information, inte spärrar |
| 2 | "Att ta med löneansvarig" | **Gjort.** EN rad "8 öppna frågor ›" som öppnar ett ark. Kodrådet ("Koppla koderna för …") är kvar på ytan med knappen Koppla, eftersom det går att göra något åt |
| 3 | Samma månadsord | **Gjort**, se beslutet ovan. Min månad och exportdialogen med |
| 4 | Dagar | **Gjort.** Förvalt bara avvikelserna ("9 dagar med avvikelse"), "Visa alla 111" längst ned; `?avv=0` öppnar med alla |
| 5 | Förarkorten | **Gjort.** Brandriskraden, "dagar utan rast", UTKAST och rast-paragrafen är borta; företagsledare får inga varningar; varje "att kolla"-rad har en knapp till dagen |
| 6 | Anställningsdatum | **Gjort.** EN rad i Löneunderlag ("Anställningsdatum saknas: Johan, Oskar · Fyll i"), helglönen som korta rader (bara undantagen). *Inte* flyttat till Översikt: varningen finns bara när månaden har röda dagar, och Översikten har inte datumet i sin läsning — det är en egen ändring |
| 7 | Anställningsnummer på två ställen | **Gjort.** Redigeras bara på personen; Lönesystem visar "N saknar anställningsnummer · Fyll i" (företagsledare räknas inte) |
| 8 | Lönesystem | **Gjort.** Miljövariabel-/krypteringstexten, Stub-knapparna och tidsstämplarna borta; token visas bara när den går ut inom 14 dagar (med Förnya); "Koppla ifrån" sist som röd text |
| 9 | Lönearter | **Gjort.** Namnet i Fortnox står bara när det skiljer sig från rubriken; kolonet bort |
| 10 | Översikt | **Gjort.** EN knapp-ord (Öppna) och alltid bredvid texten; "Allt annat stämmer" som en rad; Arbetstid-kortet visas bara när någon är *över* en gräns |
| 11 | Medarbetare-listan | **Gjort.** Grupper Förare/Admin; raden = namn + maskin, en orange rad när en förare saknar koppling till maskinfilerna |
| 12 | Personsidan | **Gjort.** Hjälptexter som upprepar etiketten borta; Spara i sidhuvudet |
| 13–14 | Maskiner | **Gjort.** "Öppna som maskin" flyttad till maskinens vy; två brytare blev EN fråga ("Hur kommer datan?" Maskinfiler / Manuellt / Ingen data) |
| 15 | Avtal | **Gjort.** Rubrikkortet borta, Spara i sidhuvudet, gruppen "Resor", namnfältet 280 px, tomma "Tidigare avtal" dolt |
| 16 | ATK-val | **Gjort** (utom "Påminn alla": det finns inget sätt att påminna i appen) |
| 17 | Årsövertid | **Gjort.** Bara förare halvvägs till taket (≥ 125 av 250 tim) får en rad; utjämningsraden bara när månaden berörs |
| 18 | Textfel | **Gjort.** "tjanstledig", "dag(ar)", tre datumformat → "Tjänstledig", ett format ("11 aug") |
| 19 | Vilobrott | **Gjort.** Metodtexten bakom "Så räknas det" |
| 20 | Dagar-rader | **Gjort.** Larmordet under namnet (tiden står för sig till höger), "ingen trakt" i stället för "utan objekt" |
| 21 | UTKAST | **Gjort** (märket visas bara för SKICKAT och FEL) |

**Medvetet inte gjort (SENARE, som i rapporten):** ett kort per förare med detaljvy (#1b), omgruppering av Lön-flikarna, kvittera frågor.

**Två beslut som ändrar något Martin tidigare bestämt — säg till om de ska tillbaka:**
1. Den **grå delägarraden** i Översiktens Arbetstid (2026-10-13) är borta: en rad om att något *inte* gäller var brus. Företagsledare syns inte alls där; det står fortfarande "Företagsledare – lön utanför appen" i Löneunderlaget.
2. **"Nära gränsen"** (gul) visas bara tillsammans med en röd. Ensam gul är en varning utan åtgärd.

**Öppna punkter:** utbetalningsdagen är fast den 25:e — ingen justering för helg eller röd dag (appen vet inte vilken dag banken kör; 25 oktober 2026 är en söndag). Säg vilken regel som gäller om den ska justeras.
