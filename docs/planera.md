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

**Skärm 1 — välj trakt**
- *Förslag* överst när det finns ett (idag: **Samma som i går**).
- *Senaste trakter*: en rad per trakt, med senaste användning ("i går 3 tim").
- *Sök annan trakt*: alla objekt, även planerade utan dim-rad (`lib/arbetsobjekt`,
  samma byggare som arbetsrapporten, #657).
- *Den här veckan*: perioderna per dag med dagens och veckans summa. Tryck på
  en rad → ändra eller ta bort.

**Skärm 2 — tryck på trakten: fyra block, uppifrån och ned**
1. *Trakt och dag.* Traktens namn som rubrik; under den en blå rad **"Idag, fre 2 okt ›"**.
   Tryck → senaste sju dagarna + ett datumfält för äldre (**bara bakåt, aldrig framåt**).
   Dagen finns kvar — Joacim fyller i dagar i efterhand — men är inte längre en
   tre-vägs-väljare. Vid ändring av en sparad period är dagen text.
2. *Tiden, stor:* **07:00 – 09:00**. Under, dämpat: "tryck på en tid för att
   ändra". Tryck på en tid → **−** och **+** visas, **en kvart per tryck**. Inga
   klockfält och ingen `<input type="time">` någonstans (Martin 2026-10-02: den
   inbyggda väljaren var "skit dålig").
3. *Hur länge:* **1 tim · 2 tim · 4 tim · Till nu** (≥ 44 px). "Till nu" finns bara
   för idag och rundar NED till kvarten. Längder som skulle passera nu är grå.
4. *Aktivitet och Spara:* Planering (förvald) · Manuellt · Möte · Restid, sedan
   **Spara 2 tim**. Låst ("Välj hur länge") tills längden är vald. Snabbvägen är
   trakt → 2 tim → Spara, tre tryck.

Tidslinjen och start-knapparna är borta. Fakturering följer aktivitetens default
(`AKTIVITETER.debDefault`), ingen väljare och ingen rad om det; ändra via raden i
veckolistan genom att byta aktivitet.

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
- *Vyn:* + på slutet stannar vid nu (nedrundat till kvart), längdknappar som skulle
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

Vyn hanterar `planering`, `manuellt`, `mote`, `restid`. Övriga perioder
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
