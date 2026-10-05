# Planera — tid på en trakt, trakten först

`/planera` (hemskärmens kort **Planera**). Samma data, samma tabeller
(`extra_tid`), samma kalender och lön som arbetsrapporten — bara en annan
ingång för den som inte sitter i en maskin (Joacims planering, Martins
markägarmöten). Synlig för alla: ett sätt in, inte en roll.

*Namnet:* `/planering` är traktplaneringen med karta (finns kvar). Den här
vyn heter **Planera** för att inte krocka.

## Varför en egen vy

Martin testade Planera-läget i arbetsrapporten (#665, första versionen):
*"allt är jätteomständigt"*. Tio steg från startsidan till en sparad period —
Startsidan, Planera, datum, Lägg till period, trakt, från, till, aktivitet,
Spara, Klar — och det såg ut som arbetsrapporten. Flödet utgick från **dagen**;
en planerare tänker i **trakter**.

## Flödet: trakt, tid, spara

**Skärm 1 — uppifrån**
1. *Pågår* (om något pågår): kort med grön ram — se "Starta nu" nedan.
2. *Förslag* när det finns ett (idag: **Samma som i går**; döljs medan något pågår, och tills gårdagens sista sluttid har passerat idag).
3. *Sök trakt, markägare eller VO.*
4. *Senaste*: en rad per trakt med senaste användning ("i går 3 tim").
5. *Aktiva trakter per åtgärdstyp*: **Gallring · Slutavverkning · GROT · Övrigt** (se nedan).
6. *Den här veckan*: perioderna per dag med dagens och veckans summa (kommentaren syns på raden). Tryck på en rad → ändra eller ta bort.

Trakterna kommer ur `lib/arbetsobjekt` (samma byggare som arbetsrapporten, #657).
Sökningen filtrerar grupperna och når även **avslutade** trakter — man fyller i dagar i efterhand.

### Åtgärdstyp — var den finns (utredd mot prod 2026-10-02)
- `objekt.typ` (`gallring` / `slutavverkning`) är satt på **alla 63** rader — den
  rena källan. `objekt.atgard` är finare men glest (Au 27, Gallring 7, Första
  gallring 4, Special 1, Rp 1, **23 NULL**).
- `dim_objekt.huvudtyp` (Gallring 43, Slutavverkning 83, **Grot 18**, NULL 13);
  `dim_objekt.atgard` är en blandning (Första gallring, Au, Rp, VF/Bark, Lövgallring, Special, LRK, Klippning, …).
- Regel: dim `Grot` → GROT; annars `objekt.typ`; annars `dim.huvudtyp`; saknas allt → Övrigt.
  Förstagallring/röjning/markberedning finns alltså **som åtgärd** men inte som egen
  typ — de hamnar under Gallring (åtgärden kunde visas som underrad om det behövs).
- **Aktiv** = `objekt.status` planerad/pågående (legacy skördning/skotning räknas med).
  I prod är det idag 12 objekt. **105 av 157 dim_objekt saknar objekt-rad** (maskinimporterade,
  ingen status) — de är inte "aktiva" och syns bara via sökning.

**Skärm 2 — tryck på trakten, ny period, uppifrån**
1. *Trakt och dag.* Traktnamnet som rubrik; under den en blå rad **"Idag, fre 2 okt ›"** (senaste sju dagarna +
   datumfält för äldre, **bara bakåt**). Vid ändring av en sparad period är dagen text.
2. **Starta nu** — stor grön knapp direkt under trakt och dag, **bara idag**. **Ett tryck startar** (se nedan).
   Under den en avdelare "eller fyll i tid".
3. *Tiden, stor:* **07:00 – --:--**. Tryck på en tid → − och + en kvart per tryck. Inga klockfält.
4. *Hur länge:* **1 tim · 2 tim · 4 tim · Till nu** (efterhandsregistrering; kvartar).
6. *Aktivitet:* Planering (förvald) · Manuellt · Markägare · Möte · Restid.
7. *Faktureras + kommentar:* reglage (förvalt efter aktiviteten) och en blå rad **Lägg till kommentar**.
8. *Spara* ("Välj hur länge" tills längden är vald).

Snabbvägen för den som vet sluttiden är trakt → 2 tim → Spara. För den som inte vet: trakt → **Starta nu**.

### Kvartar och förifylld start
Allt är kvartar. Martins testdata (2026-10-02) hade 10:17, 16:17 och längder som
"3 tim 17 min" — förifyllning med exakta klockslag. Nu:
- Dagen har redan en period → start = där den slutade, **avrundad UPP** till
  kvarten (en gammal 10:17 ger 10:30, aldrig en överlappande 10:15).
- Dagens första period → **förarens vanliga start**: median av dagens första
  periods start de senaste 30 dagarna (före idag), närmaste kvart. Inga data → 07:00.
  Systemet lär sig i stället för att fråga.
- Står en tid mellan två kvartar (gammal data) snappar första +/−-trycket till kvarten.
- Senaste sluttid är 23:45 (24:00 hanteras inte av dagsegmenten).

### Idag kan aldrig sluta efter nu
Samma regel på två ställen — en spärr i bara ena änden är ingen spärr:
- *Vyn:* + på slutet stannar vid nu (exakt nu, eller närmaste kvart för kvartsteg/Till nu), längdknappar som skulle
  passera nu är grå, ingen framtida dag kan väljas. Ligger en redan sparad period
  i framtiden (öppnad via veckolistan) visas en orange rad och Spara låses tills den kortats.
- *Sparandet* (`lib/planera/spara.ts`, `liggerIFramtiden`): nekar en period som slutar
  efter nu eller ligger på en framtida dag. Testet anropar `sparaNyPeriod` direkt med
  en fast klocka (`nu` kan injiceras).
- *Samma som i går* erbjuds inte förrän gårdagens sista sluttid har passerat idag.

### Krock
Överlappar perioden en annan samma dag visas en orange rad ovanför Spara
("Krockar med Betet gallring 2026 07:00–10:00") och Spara är låst. Raden syns
bara när det händer. Maskinpasskontrollerna nedan är oförändrade och ger sina
egna felmeddelanden efter tryck.

Vyn skapar **bara perioder**. Dagen bekräftas som vanligt under Dag/Kalender.

## Starta nu startar — och allt bekräftas vid Avsluta

*"Man vet när man kommer, inte när man går."* (Martin) **En knapp som heter Starta nu ska starta.** Martin testade
en tidigare version där knappen bara bytte läge (perioden startade först med "Starta 13:51" längst ner) och
missade att perioden aldrig startade: *"jag tror man kan missa det, för det gjorde jag"*.

- **Ett tryck på Starta nu** sparar en `extra_tid`-rad med start = exakt nu, `slut_tid = null`, `minuter = 0`,
  `rast_min = null` och går **direkt tillbaka till skärm 1 med Pågår-kortet överst**. Inget mellansteg, ingen fråga,
  inget som måste väljas före — man kan stoppa telefonen i fickan. Planering och aktivitetens fakturering är förval;
  en aktivitet (eller kommentar) som valts före följer med, men det är aldrig ett krav.
- Det grå "?" och läget "Starta nu valt" finns inte längre. (En redan pågående period som öppnas via
  "Ändra eller ta bort" visar sluttiden som "pågår".)
- **Fel visas under knappen** (t.ex. starten ligger inom dagens maskinpass, eller en annan period pågår) och man
  stannar på skärm 2.
- **Allt bekräftas vid Avsluta** (Martins princip, och Apples: *besluta när du vet, inte på morgonen när du gissar* —
  att känna igen är lättare för hjärnan än att välja från noll). Avsluta visar en sammanfattning med allt förvalt:
  **"Planering · 07:34–16:52 · Faktureras · 9 tim 18 min"**, och under den **Klipp upp dagen** (sax-ikon), aktivitet
  (segmenterad), Faktureras-reglaget och kommentar. Stämmer allt trycker man Spara — oftast ett tryck. Stämmer något
  inte ändrar man just det. (Rasten ligger inte här som en siffra — se *Rasten* nedan.)
- **Starta nu och Avsluta använder EXAKT minut** (Martin 2026-10-04: "tryckte Starta nu 13:51 och fick 13:45"): start =
  klockan nu (07:34 → 07:34), slut vid Avsluta = klockan nu (16:52 → 16:52).
  Kom man 07:00 men öppnade appen 07:20: starta, och ändra sedan starten via **Ändra eller ta bort** på Pågår-kortet
  (första minustrycket snappar till kvarten: 07:20 → 07:15 → 07:00; **plus passerar aldrig nu**). Längdknapparna
  (1, 2, 4 tim, Till nu) är för efterhandsregistrering och använder den *förifyllda* starten.
- **Kvartar finns bara i förifyllning, längdknapparna och plus/minus-stegen.** Förr rundades klockan till närmaste kvart
  (först nedåt, sedan närmaste), vilket gav fel tid för den som trycker på en knapp: 13:51 blev 13:45. Exakt minut löser
  också rastbiasen (en rast som rundades åt olika håll blev ~15 min för lång) utan att något behöver "jämna ut sig".
  Spärren mot framtida tid: en pågående period får starta högst vid exakt nu; ett slut får vara exakt nu, och Till nu/plus
  (kvartsteg) får ligga upp till en halv kvart efter klockan (`liggerIFramtiden`, `startLiggerIFramtiden` — i vy OCH sparväg).
- **Pågår-kortet** ligger överst på skärm 1: "PÅGÅR · Betet gallring · Planering sedan 07:34 · 2 tim 15 min"
  (levande räknare, omritning var 30:e sekund) med **Avsluta** och "Ändra eller ta bort". Perioden **ligger kvar
  tills man trycker Avsluta eller Ta bort** — man kan stänga appen och komma tillbaka. Ingen Rast- eller Fortsätt-knapp:
  i skogen glömmer man trycka Rast.
- **Rasten — EN modell: lucka mellan perioder** (Martin 2026-10-04: *"jag vill kunna sätta hur mycket rast jag haft,
  den får inte vara ett defaultvärde"*). Rasten är en egen DEL med tider i redigeraren och sparas som luckan mellan
  extra_tid-raderna — ingen rad, ingen minutsiffra. `extra_tid.minuter` = slut − start för varje arbetsdel, så allt som
  summerar `minuter` (löneunderlag, övertid, Min tid, Dag/Kalender) räknar rätt utan att dra av något och rasten kan
  aldrig dras av två gånger. **Ingen förifylld rast, ingen "vanlig rast"-median.** Kolumnen `extra_tid.rast_min` och
  triggern `trg_extra_tid_minuter_netto` (migration 2026-10-04) ligger kvar i databasen oanvända; Planera skriver
  `rast_min = null` när en gammal rad rättas, och visar gamla rader som förr ("rast 30 min").
  - **Är dagen längre än 5 tim och ingen rast satts frågar Spara "Hade du rast?"** — **Ingen rast** eller **Lägg till
    rast**. Spara går inte förrän han svarat; ett aktivt val, aldrig en gissning. Exakt 5 tim frågar inte. Gäller
    Avsluta-sammanfattningen, skärm 2 (efterhandsregistrering) och redigeraren.
  - **Lägg till rast → "Hur lång rast?"** (Martin 2026-10-05: förr hamnade rasten på periodens slut och blev flera timmar
    om man inte flyttade den). Valen **15 · 30 · 45 · 60 min** — **ingen förvald** — och en knapp **Annan längd** (stegare
    i 5 min, 5–180; den börjar på 60 och inget sparas förrän "Lägg till rast N min"). Rasten läggs **mitt i perioden**
    (mitt i den längsta arbetsdelen, närmaste kvart; `laggTillRast` i `lib/planera/dag.ts`) och resten fortsätter som
    delen var. Redigeraren öppnas med rasten på plats och den **går att flytta efteråt** (tryck på rasten → start/slut).
    **Spara finns inte förrän en längd valts**, och inget är sparat förrän man trycker Spara i redigeraren. Samma
    längdval i alla tre ingångarna (Avsluta, skärm 2, redigeraren från veckolistan).
  - Vill man klippa dit en rast på ett exakt klockslag finns Klipp upp dagen → Rast (med *Klipp vid* och *Rast till*).

## Klipp och rätta dagen (Martins verkliga fall)

Han startar planering på Odenssvalahult 07:00, går över till manuellt arbete, åker en stund till Betet — **och glömmer att
byta eller avsluta.** På kvällen står hela dagen som en planering. *"Detta kommer att glömmas, så jag måste kunna
redigera."* Det han behöver är inte att byta live (det gör han inte) utan att **klippa och rätta dagen i efterhand.**

- **Klipp upp dagen** (Avsluta-sammanfattningen) eller **tryck på en dag i veckolistan** → redigeraren
  (`components/planera/delar.tsx`, logik i `lib/planera/dag.ts`). Överst en **färgstapel** över hela dagen — en färg per
  del (`DELFARG` i tokens), rast grå; varje rad har samma färgprick.
  `Planering · Odenssvalahult 07:00–10:00 · Rast 10:00–10:30 · Manuellt · Odenssvalahult 10:30–13:00 · Manuellt · Betet 13:00–16:00`
- **Klipp**: välj klockslag (förifyllt mitt i delen, − och + en kvart; vid flera delar väljs vilken del först) och vad den
  NYA delen var — någon aktivitet eller rast. Den nya delen går från klippet till delens slut och ärver trakt (är källan
  en rast: närmaste arbetsdels). **Klipp igen** för fler delar. Rast har även *Rast till* så resten fortsätter som delen var.
- **Varje del går att ändra**: start och slut (− och +, en kvart; **gränsen mot grannen flyttar med** så att det aldrig
  blir hål eller krockar), **trakt** (inte bara aktivitet — en del av dagen kan ha varit på en annan trakt), aktivitet eller
  rast, Faktureras, kommentar.
- **Ta bort en del**: tiden går till föregående *arbetsdel* (annars nästa) — aldrig till en rast, eftersom en rast som
  växer tyst ser ut som något man inte gjort. Finns ingen arbetsgranne blir delen rast (obetald) i stället för att
  försvinna. Den enda delen → hela perioden tas bort. (Tydligast: inget blir en osynlig lucka, och rast är alltid något man själv satt.)
- **Luckor i veckolistan-läget**: luckan mellan två perioder (≤ 3 tim) visas som rast; längre luckor som "Ej inlagd tid"
  (låsta). Rader Planera inte hanterar (service, reparation …) syns låsta ("ändras i Dag") och rörs aldrig; gränser mot dem är fasta.
- **Sparande** (`sparaDelar`): ALLT kontrolleras före första skrivningen (inte efter nu, inte inne i/korsande ett
  maskinpass, trakt på varje arbetsdel). Varje arbetsdel blir en egen rad i extra_tid. Raderingar skrivs först, sedan
  ändringar/nya delar i en ordning där två delar aldrig överlappar ens tillfälligt; varje skrivning går genom samma
  kontroller som en enskild period. **Stoppar något halvvägs** rapporteras exakt hur många som hann sparas och redigeraren
  kopplar de nya delarna till sina rader så ett nytt försök inte infogar dubbletter. **Kvittot byggs av det sparade
  svaret** (dagens rader läses tillbaka), t.ex. "Sparat · 3 delar · 8 tim 30 min arbetad".
- **Bekräftad dag**: ändrar man en redan bekräftad dag bryts bekräftelsen (`arbetsdag.bekraftad = false`) — samma regel
  som arbetsrapporten ("en underskrift gäller det man skrev under"); kvittot säger att dagen måste bekräftas igen.
  Regeln gäller alla Planera-skrivningar (ny period, ändra, ta bort, delar).
- **Glömde avsluta samma dag**: har perioden pågått längre än han brukar jobba (median av dagens spann senaste 30 dagarna,
  minst 3 dagar) väljer han mellan **"Slutade 16:00?"** (hans vanliga sluttid) och **"Nu, 19:30"** — **ett val, inte ett förval**;
  ingen sammanfattning visas förrän han valt.

- **Bara en pågående period åt gången**: Starta nu är låst med förklaring, och sparandet nekar en andra.
  En pågående period räknas som löpande framåt vid krock (allt som slutar efter dess start krockar).
- **Glömde avsluta**: är perioden från en tidigare dag sätts slut **ALDRIG** till nu. Kortet blir orange,
  "Glömde du avsluta? Startade i går 07:00", och Avsluta öppnar skärm 2 med sluttiden att välja. Samma sak för en period startad i arbetsrapporten utan trakt/Planera-aktivitet.
- **En dag med pågående period kan inte bekräftas** — en underskrift utan sluttid är ingen underskrift.
  `lib/dagsegment.harOppenPeriod`; Dag döljer redan Bekräfta medan en timer går, Redigera visar nu
  "Extra arbete utan sluttid — avsluta eller ta bort det först".
- Sparvägen (`spara.ts`): bara idag, start inte i framtiden, inte inom ett maskinpass (redan arbetstid),
  ingen annan pågående. Avslutas med `uppdateraPeriod` (samma kontroller som en vanlig period, plus `kalla` räknas om).
- Arbetsrapporten stoppar en pågående period när maskinen startar samma dag (slut = maskinstart) — gäller även
  perioder som startats här, och är avsiktligt: passet är då redan betald tid.

## Reglerna (samma som arbetsrapportens periodformulär)

`lib/planera/spara.ts` speglar `sparaPeriod`/`taBortPeriod`:
- Periodens läge mot dagens maskinpass (`klassificeraPeriod`): **inne i
  passet** är redan arbetstid → sparas inte här ("Perioder inom passet märks
  under Dag eller Kalender"); **korsar** passets gräns → delas aldrig tyst;
  före/efter/inget pass → `extra_tid`.
- Överlapp mot dagens andra perioder → begripligt fel.
- Första perioden på en dag skapar dagen (skalrad utan klockslag).
- `minuter` är inte en genererad kolumn — räknas om på varje skrivväg.
- Kvittot byggs på raden databasen gav tillbaka (`sparatSkiljerSig`), aldrig på
  formuläret. Skiljer den sig stannar vyn med ett fel.
- Raderas dagens sista period försvinner den tomma skalraden med.
- Trakt är **obligatorisk** i Planera (den väljs först). Restid sparas med
  trakten men faktureras inte.

Vyn hanterar `planering`, `manuellt`, `markagare`, `mote`, `restid`. Övriga perioder
(service, reparation, utbildning …) hanteras i Dag/Redigera och syns inte i
veckolistan. Perioder inne i ett maskinpass är segment och syns bara i Redigera.

## Förslag — en lista, flera källor

Ett **förslag** (`Forslag` i `lib/planera/logik.ts`) är en lista perioder som
föraren godkänner med ett tryck. **Ett förslag sparas aldrig förrän föraren
bekräftat** — ärlig data eller ingen data. Idag finns en källa, `igar`
("Samma som i går": gårdagens planering med trakt kopieras till idag; inget
förslag om idag redan har planering). Framtida källor landar i samma lista med
`kalla` satt, utan att ändra vyn eller sparvägen:

### Riktning (inte byggt): bilens position — Mercedes Fleet API
Bilen vet när Joacim varit på en trakt, och då kan dagen föreslås helt utan
inmatning: *"Du var på Trestensdal 07:12–10:05. Stämmer?"* — ett tryck. Det
knyter ihop körjournalen (`project_fordon_resurs_modell`, blockerad av revisor
+ bilar) och planeringstiden till samma källa. Kräver: bil → medarbetare,
Fleet API-åtkomst, besök = stillestånd i en trakts geofence i minst en
tröskeltid, samtycke. Förslaget är `Forslag { kalla: 'bil' }` med perioden och
traktens id; sparvägen och kontrollerna ovan är oförändrade. Är bilen privat
kvar att avgöra: positionen får aldrig bli arbetstid utan förarens tryck.

### Utredning (inte byggt): incheckning vid öppning
*"Du är vid Trestensdal. Starta?"* när vyn öppnas nära en trakt.

- **Behörighet.** Webbappen läser position med Geolocation API. På en
  installerad iOS-PWA ger anropet ingen prompt utan en riktig gest (tryck) —
  auto-anrop vid öppning avfärdas tyst (`project_ios_standalone_gps_permission`).
  Alltså: första gången en knapp **"Använd min plats"** i vyn, sedan fungerar
  läsningen vid öppning när tillståndet väl är beviljat. Nekat tillstånd måste
  stå som text, inte tyst.
- **Hur nära.** 12 av 12 aktiva trakter (planerade/pågående) har en koordinat;
  20 trakter har riktig traktgräns (`objekt_geometri`). `lib/objektPlats`
  (`valjObjektForPosition`, #631) har redan punkt-i-polygon. Förslag: **inne i
  traktgränsen** där geometri finns, annars **≤ 300 m från traktens punkt**;
  telefon-GPS är 5–20 m i det fria, 20–50 m i tät skog, och en bil står oftast
  på väg/avlägg i närheten snarare än mitt i trakten. Flera träffar → närmaste
  först, högst tre.
- **"Starta" ≠ timer.** Beslutet 2026-09-09 var två klockslag, ingen timer. Starta
  kan öppna skärm 2 med Från = nu (avrundad 5 min) och Till tom — samma sak som
  Dag-vyns "Extra arbete" som noterar starten och låter föraren avsluta.
- **Integritet.** Positionen används bara i klienten för att välja ett förslag;
  den skickas inte och sparas inte.
- **Risk.** Falska förslag när man kör förbi eller står vid en granntrakt —
  därför förslag och aldrig automatik.
- **Bygge.** En ren `foreslaFranPlats(pos, objekt): Forslag | null` (testad mot
  fixturerna från #631) + en knapp och en hint i skärm 1. Ungefär en dag.
  Rekommendation: vänta tills vyn setts i bruk en vecka; bilen ger bättre data
  än ett besök vid öppning.
