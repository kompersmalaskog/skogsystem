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

**Skärm 2 — tryck på trakten**
- Traktens namn som rubrik. **Dag**: Idag · I går · Annan dag. **Från/Till**:
  Från förifyllt (slutet på dagens senaste period, annars 07:00).
  **Aktivitet**: Planering (förvald) · Manuellt · Möte · Restid.
- En knapp: **Spara 3 tim** — tiden i knappen. Låst ("Välj tid") tills tiden stämmer.
- Fakturering följer aktivitetens default (`AKTIVITETER.debDefault`), ingen
  väljare; raden under aktiviteterna säger vad som gäller. Ändra via raden i
  veckolistan genom att byta aktivitet.

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
