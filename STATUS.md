# Skogsystem — Status

## Klart
- Timer-flöde för extra tid (logga tid)
- Frånvaro: Sjuk/VAB med direkt registrering
- Sammanfattningskort med extra tid-rader
- Morgon/Kväll-labels på extra tid
- Persisterad frånvarotyp i databas
- Anpassat sammanfattningskort per dagtyp
- Körning alltid synlig
- Bekräftad dag med re-bekräftelse
- Markägarrapport-algoritm verifierad mot
  Husjönäs 2026-05-06

## Markägarrapport — verifierade siffror
Husjönäs (objekt_id 11124938, slutavverkning):
- Stammar: 1 349
- Volym: 678 m³sub
- Virkesvärde: 433 163 kr
- Rotstammar: 235 (Bmav 207, Avkap 28)
- Värdeförlust: −26 382 kr
- Räddat värde: +2 597 kr
- Lyckade avkap: 23 av 28

Förväntade siffror i originalprompten
(375 461 / −16 640 / +2 240) var överslag,
inte DB-verifierade. Felsök inte mot dem.

## Markägarrapport — framtida tillägg

### Naturhänsyn på kartan
Lager med eternitytree, naturecorner, highstump
från planering_markeringar. Aktiveras när nya
jobb planeras i planeringsvyn INNAN avverkning.
Husjönäs saknar markeringar, andra slut-
avverkningsobjekt likadant.

Koordinattransformation: återanvänd från
app/planering/PlaneringVy.tsx — data->x och
data->y är planeringsvyns lokala koordinater,
inte lat/lng.

### GROT-högar
Ingen explicit symboltyp idag. Lägg till
`grothög` i planeringsvyn när det blir aktuellt,
eller härleda från `landing` (avlägg).

## Kända buggar
- Kalenderdagar inte klickbara (regression)
- Bottomnav ändrad: "Min tid" borta,
  "Löneunderlag" istället — verifiera

## Nästa
- Fixa kalenderklick
- Timer-banner testad med fliknavigation
- Sjuk/VAB hela flödet verifierat
- Push-notiser vid obekräftad dag
- Vila-fliken (11h dygnsvila, 250h övertidstak)
- Löneunderlag → Fortnox

## Avtalsvärden (gs_avtal)
- OB, övertid, helglön — ej implementerat
- Två rader i gs_avtal — rätt val behöver
  verifieras

## Fortnox-integration
- OAuth klart, tokens i Supabase
- Semester: 500→5 fix pushat, ej verifierat
- ATK: kronbelopp OK, timmar kräver timlön

## Schema-skuld
- fakt_avbrott saknas i supabase/migrations/.
  Skapad utanför Git. Backfilla som egen
  migration när vi har tid att verifiera
  kompletta schemat live (kolumner, defaults,
  identity-mekanism, index, constraints).
  Risk: dev-reset eller frisk dev-branch
  tappar tabellen tyst. Inte akut.

## TODO efter MOM-reparationsutbyggnad
- UI: Uppföljningsvyns avbrott-lista visar
  tekniska kategori_kod (REPAIR_LOADERLINKAGE_
  HYDRAULICS) istället för human-readable.
  Behöver samma renderings-logik som
  maskin_service-historiken.
- Refactor: TS-felet på
  app/maskin-service/[id]/page.tsx:41
  (formatTyp redundant ?? ''). Trivial fix
  när någon ändå rör filen.

## Pågående arbete
- Stanford2010-dokumentation KLAR — alla
  fyra filtyper pushade på main (commit
  02a63df + 16f38fd). hpr_filer-reparation
  körd 2026-05-07 via MCP — 544 rader
  fix:ade till 0 utan maskin_id, 245 av
  248 stammar_count uppdaterade. Datat var
  intakt hela tiden i detalj_stam +
  hpr_stammar — bara summary-tabellen var
  fel.

## Redigeringsvy — parkerat (2026-05-07)

Steg 1-5 av designöversynen klara på /redigering
(prisscenario, designkonsistens, 56px-knappar,
gruppering av egenskaper, UX-förbättringar).
Följande togs explicit ur scope och behöver göras
separat:

- Auth-gate på /redigering. Vyn ändrar dim_objekt
  (inkl. nya prisscenario_id). Bör vara chef/admin-
  only, server-page.tsx-wrapper enligt mönstret i
  app/ekonomi/page.tsx.
- Migrera ovrigt_info JSON till riktiga kolumner:
  extern_skotning, extern_foretag, extern_pris_typ,
  extern_pris, extern_antal. Schema-läckage som
  bör brytas ut för att kunna queryjas och räknas
  in av ekonomi-vyer.
- Stavfel "stubbbehandling" → "stubbehandling".
  Kräver migration på dim_objekt-kolumn.
- Lyfta ut EditSheet-komponent. Modal-wrappern
  dupliceras på två ställen (ObjektRedigering +
  AllaObjektVy). Refaktor.
- TypeScript-typer på app/redigering/page.tsx.
  Filen är .tsx men skriven som JS, inga typer
  på Objekt/Scenario/state.
- Städa DEMO-arrayer. DEMO_OBJEKT är död kod,
  DEMO_BOLAG/DEMO_INKOPARE används som initial
  state men borde komma från databas.
- Inställnings-CRUD för fler scenarier i
  /ekonomi/installningar. Tills den finns visas
  ingen "Skapa nytt"-länk i PrisscenarioPicker.
- Hardcoded SUPABASE_URL/SUPABASE_KEY på rad 34-35
  i app/redigering/page.tsx. Bör bytas till
  import { supabase } from '@/lib/supabase' (för
  konsekvens + RLS-policies som baseras på
  auth.uid()).

INTE konsolidera: dim_objekt.timpeng (uppföljnings-
statistik) och objekt_ekonomi.rakna_som_timpeng
(ekonomi-beräkning) är medvetet skilda saker
enligt Martin.

## Redigeringsvy — Steg H/I/J/K (2026-05-08)

EndDate-koppling klar:
- H: Info-rad i Avslut-sektionen visar
  dim_objekt.end_date från StanForD-filen
- I: Snabbfix-knapp sätter skordning_avslutad
  (Harvester) eller skotning_avslutad
  (Forwarder) till YYYY-MM-DD från end_date
- J: Varning "Maskinen rapporterar X avslutad —
  ej markerad" när end_date finns men fältet är
  tomt
- K: 14-dagars-heuristik som plan B —
  "Skördning/skotning verkar klar (startade för
  N dagar sedan)" när end_date saknas och
  start_date >= 14 dagar tillbaka

Parkerat:
- Dedup per vo_nummer i listvyn. Idag visas
  fysiska objekt med två maskiner som två kort
  med samma object_name (en harvester-rad,
  en forwarder-rad). Filtret "Bara fel" och
  varningsräknaren räknar dim_objekt-rader,
  inte unika vo_nummer. Konsekvens: samma
  fysiska objekt kan synas dubbelt i räknaren.
  Att dedupa kräver beslut om hur kort ska
  rendera när två maskiner har olika data
  (t.ex. olika huvudtyp), och om varningar
  ska aggregeras eller delas. Egen omgång.

- Steg K-tröskeln (14 dagar) är pragmatisk men
  trubbig — den triggar på långa pågående
  gallringar. Bättre signal vore "tid sedan
  senaste fakt_produktion/fakt_lass-rad", men
  det kräver extra query per objekt. Senare.

## UPSERT-koreografi-fix (2026-05-09)

Steg 2 verifierad på Korpalycke 14 april PONS20SDJAA270231:
stammar 414 → 577 (PDF-facit) och m³sub 163.595 → 233.956
(PDF 233.957). UPSERT-koreografi-strategin (rensa →
flytta tillbaka MOM-filer i alfabetisk ordning →
omimportera) bevisad fungera för Bugg A.

Sidofynd som inte är blockerande:

- G15h-allokering: 4.6 min totaldiff per skift mellan
  PDF och fakt_tid. Inte blockerande. Möjlig orsak:
  fallback-objekt 20250731 (~16 min) som inte mappas
  mot vo_nummer plus 4 min Stanford2010-formel-diff.

## KRITISKT — buggar i fakt_produktion / fakt_sortiment (2026-05-09 → 2026-05-10)

### Bugg A — UPSERT-koreografi (FIXAD)
- Symptom: senaste MOM-fil förlorar mot tidigare i UPSERT
- Fix: kör om alla MOM-filer i sorterad ordning
- 3 dagar fixade, +316 m³ återhämtat:
  - Korpalycke 14/4 (Steg 2): 414→577 stammar
  - Kättorp 17/3 (Steg 3): +95 stammar / +79.5 m³
  - Jeppshoka 31/3 (Steg 3): +205 stammar / +165.8 m³

### Bugg B — HPR-datum-allokering (FIX I AFFÄRSUPPFÖLJNING)
- Symptom: fakt_sortiment har sessions-slut-datum för
  multi-dag-sessioner, inte stam-kapningens faktiska
  datum.
- Rotorsak: Ponsse Scorpion Giant 8W skriver INTE
  ProcessingDate per stam i HPR. Vår parser faller
  tillbaka på filnamnet — alla stammar i en
  multi-dag-kumulativ HPR får sessions-slut-datum.
- Bevis 19 januari 2026 obj 11109556: HPR säger
  919 m³ för 19/1, MOM säger 305 m³ för 19/1 +
  287 m³ för 15/1 + 326 m³ för 16/1 (totalt 918 m³).
  MOM:s per-arbetsdag-fördelning är korrekt.
- Frontend-impact (kartlagd 2026-05-10):
  ENDAST app/affarsuppfoljning/page.tsx läser
  fakt_sortiment.volym_m3sub med datum-filter och
  per-period-aggregering. Övriga vyer (uppfoljning,
  ekonomi, markägare, maskinvy m.fl.) använder
  fakt_produktion (MOM, korrekt) eller fakt_sortiment
  utan datum (totaler per objekt, korrekt).
- Liten fix tillämpad: ta bort datum-filter på
  fakt_sortiment-läsningen i affärsuppfoljning,
  så sortiment-fördelning baseras på trakt-totalen
  (vilket är korrekt — fördelning är en egenskap av
  objektet, inte en period-statistik). Per-period-
  volymerna kommer fortfarande från fakt_produktion.

### Bugg C — skuggobjekt (KVAR — separat utredning)
- Symptom: objekt med datum-baserade ID (20250731,
  20260105 etc) finns i fakt_sortiment men inte
  fakt_produktion
- Konkret 19 jan 2026: objekt 20250731 har
  115.399 m³sub i fakt_sortiment, 0 i fakt_produktion
- Påverkar: G15h-allokering, produktivitetsstatistik
- Inte fix:at — separat utredning, inte akut

### REGEL FRAMÅT
- Per-dag-volymer/stammar/tid → fakt_produktion (MOM)
- Per-objekt-totaler → fakt_sortiment (HPR)
- Markägar-rapport → hpr_filer/hpr_stammar (totaler)
- Lön/ackord → fakt_produktion per period
- Datum-filter på fakt_sortiment är felaktig användning

### Pausat läge — vad finns kvar i worktreen
- _steg1_backup.sql (kört, backup-tabeller existerar)
- _steg2_test_14april.py (kört, fix:ade Korpalycke)
- _steg3_batch.py (kört på 17/3 + 31/3, sen pausat —
  resterande "drabbade" är troligen Bugg B-fall där
  fakt_produktion redan är korrekt)
- _steg3_constraints.md (anteckningar för Steg 3)
- backup_*_20260509-tabeller i Supabase intakta
- auto_import_watch.bat behöver återstartas manuellt

## HPR-import buggar (kvarstår)
Kommer skapa trasiga rader vid varje ny
HPR-import tills patchad:

- import_hpr.py rad 372-374: fil_row
  saknar 'maskin_id' och 'stammar_count'
  — lägg till 'maskin_id':
  parsed['maskin_id'] och
  'stammar_count': len(parsed['stammar'])
- import_hpr.py rad 391: föråldrad
  kommentar om "tom maskiner-tabell" —
  ta bort
- skogsmaskin_import_version_6.py
  _save_hpr_tables: fil_row saknar
  'maskin_id' — lägg till 'maskin_id':
  maskin_id (variabeln finns redan
  deklarerad)

Repair-strategier för redan-skapade
rader finns i docs/stanford2010/
hpr-harvester-production.md.

## Körvy 2D — beslut och fallgropar

### 1. 3D bor i Cesium, inte i Körvy 2D

Försökte bygga 3D-extrusion (pelare, stake-nålar,
outline-ringar) för markörer i Körvy 2D men kom
fram till att det inte fungerar visuellt. På 100m+
avstånd från kameran blir pelare suddiga prickar
oavsett radius. Apple Maps använder 2D-symboler +
text på det avståndet, inte 3D.

Beslut: Körvy 2D = platta symboler + tre färger
(severity) + text-labels under faror inom 100m.
3D bor i Cesium-vyn (/korvy) där kameran är nära
och 3D faktiskt passar.

### 2. Pulse/nearby icon-size-boost var trasigt sedan dag 1

Pre-existing case-expression med zoom-input som
är ogiltig per MapLibre style spec, men try/catch
svalde felet tyst. Upptäcktes när vi flippade
pitch-alignment runtime — MapLibre 5 re-validerar
hela layout vid setLayoutProperty och kraschade.
Fixat i bd25b1d med case INUTI varje
interpolate-stop, multiplikationsmodell.

### 3. MapLibre 5 re-validerar hela layout vid setLayoutProperty

Att flippa en enskild layout-property triggar
re-validering av hela layerns layout-objekt. Tysta
pre-existing buggar i andra properties blir
blockerande. Inför MapLibre-uppgradering: öppna
konsolen i Körvy 2D och kolla efter
validation-errors innan du säger "funkar".

### 4. Tre färger som severity-baserad palett

markerIconDefs har konsoliderats från ~8 färger
till tre:
- danger (#ff453a):  powerline, manualfelling,
                     warning, steep
- protect (#30d158): eternitytree, naturecorner,
                     culturemonument
- info (mörk grå #1c1c1e med vit ikon): alla
                     övriga 13 typer

Distinktion mellan info-typer ligger i SVG-formerna.
Om "havsa av grå" blir ett problem i fält —
differentiera SVG-formerna eller acceptera
permanent text-labels för info-typer i
planeringsvyn.

### 5. Två parallella position-stacks

Larm-pipelinen (System A: getActiveWarnings)
använder effectiveUserPos = simulatedPos ??
gpsPosition. Körvy-pipelinen (System B: korvyPos,
korvyNextItems, korvyAcuteWarning) använde tidigare
currentPosition direkt — utan SIM-stöd. Det gjorde
att SIM kunde trigga larm men inte text-labels eller
nästa-kö i Körvy.

Fixat i 8c77ef4 via ny useMemo korvyEffectivePos
(simulatedPos ?? currentPosition, normaliserad till
{lat, lon}). Använd den variabeln för all
avstånds-beräkning till markörer i Körvy. Kamera/
GPS-prick/maskin-source ska däremot följa riktig
GPS — inte SIM.

Property-konvention att vara medveten om:
- currentPosition: { lat, lon }
- simulatedPos:    { lat, lng }
Inkonsekvensen finns kvar — normalisera vid varje
gränsövergång.

## Cesium 3D — kartval och risker

### Vald baskarta-strategi: två topo-alternativ

Cesium 3D Körvy har två topografiska baskartor
för olika syften:

- "Topo" (default) = OpenTopoMap (XYZ tiles
  från tile.opentopomap.org). Rik kartstil med
  gula vägar, höjdkurvor, trädsymboler. Matchar
  planeringsvyns "Terräng"-bas. Bästa läget för
  "läsa landskapet".

- "Topo nedtonad" = Lantmäteriet topowebbkartan_
  nedtonad (WMS från minkarta.lantmateriet.se).
  Gråskala, designed av Lantmäteriet specifikt
  som bakgrund för annat innehåll. Bästa läget
  för "fokus på markörer" — röda/gröna pelare
  får maximal kontrast mot grå.

Plus Satellite (Lantmäteriet ortofoto) och
Cockpit (hillshade) som specialalternativ.

### Risk 1: OpenTopoMap-licens

OpenTopoMap är CC-BY-SA + tile usage policy.
Sammanfattning:
- Måttlig privat/icke-kommersiell användning OK
- Storskalig kommersiell användning kräver kontakt
  med dem eller egen hosting
- Attribution alltid krävd (visas i Cesium credit)

Skogsystem just nu (1 företag, 4 operatörer)
ligger inom "måttlig privat". Om appen säljs till
andra forestry-bolag eller får många samtidiga
användare behöver migrationsväg planeras:
egen OpenTopoMap-hosting (free, kräver server-
setup) eller Mapbox/MapTiler (kommersiell licens).

Lantmäteriet topowebbkartan_nedtonad har INGEN
sådan licensrisk — Lantmäteriets öppna data är
fri för kommersiell användning.

### Risk 2: OpenTopoMap maxzoom 17

OpenTopoMap har inga tiles djupare än zoom 17.
Vid Cesium pitch 78° och kameran nära marken kan
tiles bli suddiga. Lantmäteriet topowebbkartan_
nedtonad har högre zoom-kapacitet — användaren
kan välja den vid behov om OpenTopoMap pixlar.

Uppdatera denna fil vid varje commit.
