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
4. *Starta nu — avsluta sen* (grön, bara idag) under längdknapparna: sluttiden blir ett grått **?**
   och Spara heter **Starta 07:00**. Se nedan.
5. *Aktivitet:* Planering (förvald) · Manuellt · Markägare · Möte · Restid — fem i en rad
   går i 390 px (renderat), knapparna är 44 px höga.
6. *Faktureras + kommentar* i ett kort: **Faktureras** som en rad med reglage (Ja/Nej),
   förvalt efter aktivitetens default (planering, manuellt, markägare på; restid och möte av) — inte en
   väljare — och en blå rad **Lägg till kommentar** som fäller ut ett textfält (`extra_tid.kommentar`).
7. *Spara.* Låst ("Välj hur länge") tills längden är vald. Snabbvägen är trakt → 2 tim → Spara, tre tryck.

Tidslinjen är borta. Fakturering var borta i första omgången (Martin: "det finns ju inget om
jag ska fakturera tiden") och är tillbaka som en rad med reglage.

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

## Starta nu — avsluta sen, och rasten vid Avsluta

*"Man vet när man kommer, inte när man går."* (Martin) **Starta nu** sparar en
`extra_tid`-rad med `slut_tid = null`, `minuter = 0` och `rast_min = null`.

- **Starten är klockan när man trycker** (Martin: "trycker jag 07:34 är det då jag började"): Starta nu sätter
  start = nu avrundat till **närmaste kvart** (07:34 → 07:30, 07:38 → 07:45), det stora klockslaget visar
  "07:30 – ?" direkt och knappen heter "Starta 07:30". **Starta nu ger ALLTID nu** — ett andra tryck läser
  klockan på nytt, det backar inte. Kom man 07:00 men öppnade appen 07:20: tryck på klockslaget och backa med minus.
  **Plus passerar aldrig nu**. Längdknapparna (1, 2, 4 tim, Till nu) är för efterhandsregistrering och använder den
  *förifyllda* starten.
- **Närmaste kvart överallt** (Martin 2026-10-04): Starta nu, Avsluta och Till nu. Förr rundades Avsluta/Rast nedåt och
  Starta/Fortsätt till närmaste, så varje rast blev längre än den var (11:41–12:10 blev 11:30–12:15: 45 min i stället för 29,
  ~19 min/dag åt förarens nackdel). Nu jämnar det ut sig. Konsekvens, godkänd: start och slut får ligga **upp till en
  halv kvart efter klockan** (16:53 → 17:00; `liggerIFramtiden` / `startLiggerIFramtiden` i vy OCH sparväg); längre fram än så nekas.
- **Pågår-kortet** ligger överst på skärm 1: "PÅGÅR · Betet gallring · Planering sedan 07:30 · 2 tim 15 min"
  (levande räknare, omritning var 30:e sekund) med **Avsluta** och "Ändra eller ta bort". Perioden **ligger kvar
  tills man trycker Avsluta eller Ta bort** — man kan stänga appen och komma tillbaka. Ingen Rast- eller Fortsätt-knapp:
  i skogen glömmer man trycka Rast.
- **Avsluta** visar sammanfattningen **"07:30 – 16:45 · Rast 30 min · 8 tim 45 min"** med − och + på rasten (en kvart
  per tryck, 0–180 min) och **Spara 8 tim 45 min**. Inget är sparat före Spara. Är det mindre än en kvart sedan
  start blir det ingen nollängd — besked i stället.
- **Rasten** är minuter på perioden, inte en lucka: `extra_tid.rast_min` (migration 2026-10-04, körd av Martin).
  `extra_tid.minuter` är **NETTO** (längd − rast) — allt som summerar `minuter` (löneunderlag, `arbetstid.extraMinPerDag`,
  årsövertid, Min tid, Dag/Kalender) drar därför av rasten en enda gång utan ändring. En trigger
  (`trg_extra_tid_minuter_netto`, bara när `rast_min > 0`) håller `minuter` netto även när arbetsrapportens
  periodformulär räknar om `minuter = slut − start` — arbetsrapporten är orörd.
  - **Förifylld** med förarens vanliga rast: median av registrerade `rast_min` på perioder **längre än 5 tim** de senaste
    30 dagarna (närmaste kvart); inga data → 30 min. Kort pass får 0 och räknas inte i medianen.
  - **Föreslås bara över 5 tim** (exakt 5 tim = ingen rast). Samma rastrad visas på skärm 2 när en vald längd överstiger 5 tim.
  - `NULL` = ingen rast registrerad (alla gamla rader). En gammal rad som öppnas och sparas utan att rasten rörs får
    ingen rast tillagd.
  - Sparvägen verifierar att både `rast_min` och nettominuterna landade (`sparatSkiljerSig`); nekar rast ≥ perioden,
    > 180 min, och rast på en pågående period (den anges först vid Avsluta). Kvitto och veckolista visar rasten.
  - Dag/Kalender visar nettot (8 tim 45 min) men inte rasten som egen rad — kan läggas till.
- **Bara en pågående period åt gången**: Starta nu är låst med förklaring, och sparandet nekar en andra.
  En pågående period räknas som löpande framåt vid krock (allt som slutar efter dess start krockar).
- **Glömde avsluta**: är perioden från en tidigare dag sätts slut **ALDRIG** till nu. Kortet blir orange,
  "Glömde du avsluta? Startade i går 07:00", och Avsluta öppnar skärm 2 med sluttiden att välja (rastraden visas
  när längden överstiger 5 tim). Samma sak för en period startad i arbetsrapporten utan trakt/Planera-aktivitet.
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
