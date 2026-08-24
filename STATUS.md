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
- ~~Lyfta ut EditSheet-komponent~~ KLAR i PR #203
  (2026-07-17): en delad ObjektEditor äger sheet/
  spara/dirty-logik för båda listvyerna; sheeten
  omstrukturerad (obligatoriskt först, undersidor,
  dirty-Spara med ändringsräknare).
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

### Bugg D — fakt_tid multi-dag UPSERT-överskrivning (FIXAD 2026-05-10 e.m.)
- Symptom: fakt_tid underrapporterar G15h för dagar
  där MOM-sessioner spänner över dygn. Per-datum-
  omimport via Steg 3 ger cyklisk regression: 13/4-fix
  → 14/4 regressar, 14/4-fix → 13/4 regressar.
- Rotorsak: kumulativa MOM-filer innehåller carryover-
  data från föregående dygn. Vid per-datum-import
  importeras inte alla relaterade filer i samma pass
  → `_GLOBAL_TID_ENTRIES` får bara delmängd → UPSERT
  på fakt_tid (4-kols unique-key) skriver över annan
  dags rader med partial-värden.
- Lösning: nytt scratch-script `_steg3b_multi_datum.py`
  som identifierar UNION av MOM-filer för alla berörda
  datum (via fakt_produktion + fakt_skift + fakt_tid),
  rensar alla berörda dagar samtidigt, importerar alla
  filer i ETT pass.
- Resultat (PONS20SDJAA270231 13-15 april 2026):
  - Korpalycke 13/4: 3.74h → 6.64h (PDF 6.63h ✅)
  - Korpalycke 14/4: 6.29h ≈ PDF 6.27h ✅
  - Krokshult 14/4:  2.17h ≈ PDF 2.17h ✅
  - Krokshult 15/4:  3.10h → 6.60h (PDF 6.58h ✅)
  - Total återhämtning: +7h G15
  - Bonusfix Bugg A: +74 stammar / +38 m³ på 15/4
    Krokshult (samma multi-dag-pass)
- Inga ändringar i skogsmaskin_import_version_6.py.
  Alla skydd höll: backup intakt, arbetsdag bekraftad
  =true 48 → 48, fakt_sortiment oförändrat alla 3 dagar.

### REGEL FRAMÅT (uppdaterad 2026-05-10 e.m.)
- Per-dag-volymer/stammar/tid → fakt_produktion (MOM)
- Per-objekt-totaler → fakt_sortiment (HPR)
- Markägar-rapport → hpr_filer/hpr_stammar (totaler)
- Lön/ackord → fakt_produktion per period
- Datum-filter på fakt_sortiment är felaktig användning
- **Multi-dag MOM-sessioner** kräver
  `_steg3b_multi_datum.py` (alla berörda datum
  samtidigt), inte `_steg3_batch.py` (per datum).
  Per-datum-batch fungerar bara för 1-dags-sessioner.

### KVAR
- **Bugg C** (skuggobjekt) — separat utredning
- **Andra Bugg D-fall** — multi-dag-sessioner i andra
  perioder. `_steg3b_multi_datum.py` fungerar för dem
  också, men varje period kräver manuell körning med
  rätt --datum-lista.
- **Strukturell fix av import-script** — sikt-projekt.
  T.ex. ändra _GLOBAL_TID_ENTRIES till MAX-merge eller
  införa monitoring_start i fakt_tid:s unique-key.
- **Watchdog + statussida** — sikt-projekt.

### Pausat läge — vad finns kvar i worktreen
- _steg1_backup.sql (kört, backup-tabeller existerar)
- _steg2_test_14april.py (kört, fix:ade Korpalycke 14/4)
- _steg3_batch.py (kört på 17/3 + 31/3, fungerar för
  1-dags-sessioner)
- _steg3b_multi_datum.py (kört på 13-15/4, fungerar
  för multi-dag-sessioner)
- _steg3_constraints.md (anteckningar)
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

## Gallringsvyn — steg 1 (2026-08-22)

/gallring (lista) + /gallring/[vo] (trakt) byggd på
uttagsdata som redan finns importerad. Ingen ny
import.

Gallring identifieras på dim_objekt.huvudtyp via
lib/objekt/typ.ts. Fältet fanns redan — 37 objekt
har huvudtyp Gallring, 25 av dem har uttag.

Källorna hålls isär (lib/gallring.ts):
- m³fub, stammar, datum, maskin, förare, trädslag
  → fakt_produktion (MOM)
- sortiment → fakt_sortiment (per objekt, aldrig
  med datumfilter)
- diameter (Dgv, histogram) → detalj_stam.dbh_mm

fakt_produktion är sanningen om ANTALET stammar.
detalj_stam har LUCKOR. Diametermåtten redovisar
därför öppet hur många stammar de bygger på.
Kompermåla Ga, Lars Norberg Dunshultt och
Midingstorp gallring 2025 saknar stamrader helt och
visar "Dgv saknas".

Maskin och förare läses ur produktionen, inte ur
dim_objekt.maskin_id — det fältet pekar ut skotaren
A030353 på Svinhult, Hössjömåla och Bastaremåla.

Verifierat mot Hålabäck gallring 2026 (VO 11219961,
R64428, Oskar Nilsson, 21 aug 2026) genom att köra
vyns egna funktioner mot databasen: 254 stammar,
DBH medel 157,5 / median 155 / min 69 / max 276 mm,
Tall 139, Gran 63, Björk 34, Övrigt löv 18 —
samtliga exakt enligt facit. Uttag 32,685 m³fub,
identiskt i fakt_produktion, fakt_sortiment och
detalj_stock.

### Dgv-formeln — FASTSTÄLLD 2026-08-22
Dgv = Sum(d^3)/Sum(d^2), grundytevägd medeldiameter
(varje träd vägs med sin egen grundyta). Det är INTE
sqrt(Sum(d^2)/n) — den formeln är Dg, grundyte-
medeldiametern, där alla träd väger lika.

Hålabäck, 254 stammar: Dgv 178,09 mm mot Dg 162,73
mm mot aritmetiskt medel 157,52 mm. Skillnaden är
inte avrundning utan tre olika mått.

Frågan har ställts en gång och besvarats. Ändra inte
formeln som en "rättning" — det kräver beslut, och
etiketten i vyn måste följa med.

### Medvetet uteslutet — lägg inte till
Stickvägsandel, gallringskvot och skattat
kvarvarande bestånd. Alla tre bygger på att
stickvägsträden representerar beståndet före
gallring. Verifierat på Hålabäck att det inte
håller för beståndsgående drivning. Areal skattas
aldrig ur rutnät eller körspår — utan uppmätt areal
visas inget per-hektar-tal (bara 4 av 25 trakter
har areal i objekt.areal; dim_objekt.areal_ha står
på 0 för samtliga).

### BLOCKERARE FÖR STEG 2 — luckor i detalj_stam
Sjöaryd: stam_key löper 489741-490139 = 399 platser,
men bara 379 rader finns. 20 nycklar mitt i en
löpande serie saknas. Samma mönster på nästan alla
gallringstrakter (fakt_produktion 399 stammar mot
detalj_stam 379, genomgående 2-10 % färre).

Detta är INTE ett urval och får inte behandlas som
ett. Hål i en löpande nyckelserie är exakt samma
mönster som MOM-importbuggarna A och D ovan —
sannolikt tappad data vid import. Orsaken är
outredd.

Varför det blockerar steg 2: trädpositionerna i
steg 2 kommer ur detalj_stam. Varje saknad stam blir
ett falskt hål i kartan — ett område ser ogallrat ut
fast det är gallrat. Till skillnad från steg 1, där
luckan bara gör Dgv marginellt osäker och skrivs ut
i klartext, blir samma lucka i steg 2 en kartbild
som ljuger. Utred luckorna INNAN steg 2 byggs.

Startpunkt för utredningen: jämför stam_key-serien i
HPR/MOM-källfilen mot detalj_stam för Sjöaryd
(objekt_id 85893, R64101, 24 jan 2026) och se om de
20 nycklarna finns i filen. Gör de det ligger felet
i importen; gör de det inte ligger det i maskinens
export.

### TODO — aggregera diametrarna i databasen
Dgv och histogrammet läser idag ~91 000 rader ur
detalj_stam (3,3 MB, ~2,6 s på fast nät). Det är
inte acceptabelt i hytt på mobilt nät. Listan laddas
därför i två steg som en nödlösning, inte som en
design.

Rätt lösning: aggregera per objekt_id i databasen —
count(*), sum(dbh_mm^2), sum(dbh_mm^3) räcker för
Dgv (sum(d^3)/sum(d^2)), plus en klassindelning för
histogrammet. Då blir listan ett anrop i stället för
91, och tvåstegsladdningen kan tas bort helt.

Martin fixar MCP-auktoriseringen. Ingenting skapas i
databasen innan dess.

### EGEN GREN (ej nu) — migrera inline-trädslagspaletter
lib/tradslag.ts är nu EN palett för trädslag (gran
grön, tall orange, björk vit, övrigt löv grå) plus
namnregeln som slår ihop OVR_LOV och OVR LOV.
Gallringsvyn pekar dit. Fem andra ställen gör det
INTE och har egna färger inline:

1. app/admin/markagarrapport/[objekt_id]/page.tsx
   rad 305-307 - gran #34c759, tall #ff9500, bjork
   #d4c5a0. VIKTIGAST: markagarrapporten gar ut till
   KUND. En rapport dar bjorken har en farg och
   appen en annan ser slarvig ut utat, och det ar
   den enda av de fem som nagon utanfor foretaget
   ser. Ta den forst.
2. app/maskinvy/IdagNy.tsx rad 50-52 - bjork #ffd60a
3. app/maskinvy/VolymDeepView.tsx rad 29-31 - dito
4. app/oversikt/OversiktKarta.tsx rad 232 - gran
   #66BB6A, tall #FFA726, bjork #FFF176, plus ek/
   bok/contorta
5. app/affarsuppfoljning/page.tsx rad 381 och 410 -
   rgba-varianter, bjork BLA och ovr lov orange

Samma tradslag har alltsa fyra olika farger i appen
idag. Da slutar fargen vara en genvag for ogat och
blir en gissning.

Att tanka pa vid migreringen: kartlagren (punkt 4
och planeringsvyns HPR-hogar) ritar mot LJUS
bakgrund i vissa baskartor. Vit bjork behover da
konturen ur TradslagStil.kontur - fyllningen ensam
racker inte. Det ar darfor stilen bar bade fyll och
kontur i stallet for en enkel farg.

### Öppna punkter
- Specialavv Uggleboda (Dgv 368 mm) och Kompersmåla
  Lövhuggning mm (Dgv 322 mm) är körda med
  slutavverkningsskördaren PONS20SDJAA270231 men
  har huvudtyp Gallring. Beslut 2026-08-22: vyn ska
  spegla dim_objekt.huvudtyp utan undantag. Är typen
  fel rättas den i objektdetaljerna, inte i vyn.

### Okulärbesiktigad 2026-08-22
Inloggad på dev-servern, 375x812 (mobil). Listan och
Hålabäck-vyn visar rätt siffror mot facit, konsolen
är ren. Fyra fel hittades och rättades i samma
omgång:
- TopBar visade "Gallring/11219961" som sidtitel —
  saknade post i pageNames + prefixregel.
- Detaljvyn ritade en egen header under den fasta
  TopBar:en = dubbel chrome. Borttagen; bakåtlänken
  "Alla gallringar" ligger i innehållet i stället
  och finns i alla tillstånd, även fel och tomt.
- Punkt i stället för komma i medelstam (0.129) och
  areal (9.17). Egen fmtDecimal med sv-SE.
- "Tall 0 %" och "0,0 m3fub" på värden som finns men
  avrundas till noll. Skrivs nu "<1 %" och "<0,1" —
  en post som existerar får aldrig renderas som
  frånvarande.

## IMPORTUTREDNING 2026-08-23 — RAPPORT

Utredning, ingen kodandring. Fyra SEPARATA fel.
Tre orsaker faststallda, ett delvis.

### Hypotesen om brytdatum — FALSIFIERAD
Avvikelserna ar INTE historiska. De uppstar med
nuvarande kod, varje dag.

  Rossmala Ga    importerad 2026-08-05   -0,49 %
  Raveboda       importerad 2026-08-20   -1,84 %
  Halabaeck      importerad 2026-08-21    0,00 %

Raveboda importerades DAGEN FORE Halabaeck, med
samma kod, och avviker. Det finns inget brytdatum
och en omimport hjalper inte — den skulle reproducera
felet. Billigaste utfallet ar bortfall.

### FEL 1 — MultiTreeProcessedStem hoppas over (AKTIVT)
ORSAK FASTSTALLD. Detta ar huvudfyndet och forklarar
bade Sjoaryds 20 saknade stammar och hela den
systematiska HPR-lagre-an-MOM-avvikelsen.

Bevis, Sjoaryd (objekt 85893, R64101, 24 jan 2026),
fil "Oskar Nilsson Sjoaryd 2026-01-24.hpr":
- Filen innehaller 399 StemKey, UNIKA, UTAN luckor.
- Samtliga 20 nycklar som saknas i detalj_stam FINNS
  i filen. Felet ligger alltsa i IMPORTEN, inte i
  maskinens export.
- Varje tappad stam bar <MultiTreeProcessedStem>.
  Varje behallen bar <SingleTreeProcessedStem>.
- De tappade kommer i par och tripletter med samma
  DBH (67/67, 86/86, 61/61/61 mm) — flertradshantering
  av klena stammar, precis vad gallring gor.

Koden, fyra stallen:
  skogsmaskin_import_version_6.py:1335  (HPR)
  skogsmaskin_import_version_6.py:1669  (HQC)
  import_hpr.py:263
  scripts/backfill-grot.py:106
  scripts/tag-hpr-format.py:136
Alla gor: single = find_element(stem,
'SingleTreeProcessedStem'); if single is None: continue
MultiTreeProcessedStem hanteras INGENSTANS i kodbasen.

Korrelationen ar entydig — andel flertradsstammar mot
volymavvikelse:

  Halabaeck        0,0 % multi    0,00 % avvikelse
  Rossmala         2,8 %         -0,49 %
  Sjoaryd          5,0 %         -0,76 %
  Raveboda         7,2 %         -1,84 %
  Johan Svensson  23,9 %         -9,36 %
  Steglehylte     24,5 %         -5,85 %

detalj_stam-antalet ar EXAKT lika med antalet
SingleTreeProcessedStem i filen pa alla kontrollerade
trakter. Halabaeck stammer pa 0,00 % av ett enda skal:
det ar den enda trakten utan flertradshantering.

Volymavvikelsen ar mindre an stamavvikelsen darfor att
flertradsstammar ar klena.

ATGARD: parsern maste lasa MultiTreeProcessedStem.
Notera att elementet bar FLERA trad per Stem —
volym och stamantal maste summeras, inte kopieras.

### BEVISKEDJA — kalla till databas, Sjoaryd
Bada kallfilerna ar overens om 399. Talet blir 379
forst i importen.

  Led                          Antal   Volym m3sub
  -------------------------------------------------
  MOM NumberOfHarvestedStems     399        25,530
  HPR unika StemKey              399        25,5315
    varav SingleTreeProcessed    379        25,3379
    varav MultiTreeProcessed      20         0,1936
  -------------------------------------------------
  fakt_produktion (MOM)          399        25,530   OK
  fakt_sortiment (HPR)            --        25,334   -20 stammar
  detalj_stam                    379          --     -20 stammar

Filens SUMMA 25,5315 mot MOM 25,5300 = +0,0015.
Filens ENTRAD 25,3379 mot fakt_sortiment 25,3340.
Bada stammer inom avrundning. Det finns alltsa inget
ytterligare bortfall — flertradsstammarna ar HELA
forklaringen for Sjoaryd.

Bara en HPR och en MOM finns for Sjoaryd i hela
Behandlade. Inga dubbletter.

### VAD MultiTreeProcessedStem BAR — svar fore kodning
Undersokt i skarp fil, inte bara i schemat.

STRUKTUR: varje trad i bunten far en EGEN <Stem> med
egen StemKey, egna StemCoordinates, egen HarvestDate,
eget SpeciesGroupKey, egen BoomPositioning
(BoomAngle + BoomExtension) och egen <Log>.
De delar <StemBunchKey>.

  <Stem><StemKey>489995</StemKey>
    <ProcessingCategory>MultiTreeProcessing</...>
    <StemCoordinates>...</StemCoordinates>
    <BoomPositioning boomPositioningCategory="Felling">
    <MultiTreeProcessedStem>
      <StemBunchKey>5</StemBunchKey>
      <DBH>61</DBH>
      <ReferenceDiameter referenceDiameterHeight="20">
      <Log>...</Log>

VOLYM ar PER TRAD, inte delad. Bunt 5 har tre stammar
a 0,009735 m3sub. Att summera rakt av ger filens
total 25,5315 = MOM:s 25,5300. Ingen dubbelrakning.

DBH ar DELAD inom bunten. Alla tre i bunt 5 har
DBH 61; paren har 67/67 och 86/86. Diametern ar matt
EN gang for bunten, inte per trad.

SLUTSATS FOR LAGRING: de kan lagras som separata
rader i detalj_stam. Ingen ny struktur behovs. Men
dbh_mm ar da inte en individuell matning — tre rader
med 61 mm ar EN matning, inte tre. Dgv och
diameterhistogrammet skulle vikta bunten tre ganger.
Behover en kolumn for StemBunchKey, eller en flagga,
sa statistiken kan skilja dem at. Kolumn = migration
= egen gren, fraga forst.

### VARNING — m3subEstimated ar den tysta fallan
Detta ar den miss som SER UT SOM EN LYCKAD FIX.

Entrad skriver  logVolumeCategory="m3sub"
Flertrad skriver logVolumeCategory="m3subEstimated"

En parser som slutar hoppa over MultiTreeProcessedStem
men fortsatter leta enbart "m3sub" far RATT STAMANTAL
och NOLL VOLYM for flertradsstammarna.

Verifierar man da bara stamantalet ser fixen ut att
fungera: detalj_stam gar fran 488 till 641 pa Johan
Svensson. Men fakt_sortiment star kvar pa 23,187 i
stallet for att na 25,583, och avvikelsen mot MOM
kvarstar oforandrad.

Verifiera darfor ALLTID bada talen, stamantal OCH
volym, mot MOM. I filen finns 705 "m3sub" och 20
"m3subEstimated" pa Sjoaryd — samma 20 som ar
flertradsstammarna.

### KALIBRERINGSVYN — vagen finns i koden, inte i datan
Kontrollerat pa begaran, eftersom kalibreringen ar
kvalitetsregelverk mot Vida och delad DBH som
individuella matningar skulle forvanga std.

LAGET IDAG: ofarligt. Samtliga 629 HQC-filer for
R64101, R64428 och PONS20SDJAA270231 ar genomsokta —
1039 kontrollstammar, NOLL MultiTreeProcessedStem.
Kontrollmatning kraver att en enskild stam klavas, sa
buntade stammar dyker inte upp som kontrollstammar.
detalj_kontroll_stock och fakt_kalibrering ar alltsa
opaverkade av fel 1.

MEN VAGEN FINNS I KODEN. HQC-parsern har samma skip:
  skogsmaskin_import_version_6.py:1669
    single_tree = find_element(stem,
        'SingleTreeProcessedStem', ns)
    if single_tree is None: continue

Tar fix-grenen bort skippet MEKANISKT pa alla fem
stallen oppnas en vag for buntdelad DBH in i
detalj_kontroll_stock -> fakt_kalibrering -> kravet
mot Vida. Tre rader med samma DBH skulle da rakans
som tre oberoende matningar och krympa
standardavvikelsen artificiellt — precis den sortens
fel som far en kalibrering att se battre ut an den ar.

ATGARD I FIX-GRENEN: HQC-stallet ska INTE behandlas
som de fyra andra. Antingen star skippet kvar med en
kommentar om varfor det ar avsiktligt just dar, eller
sa laggs en explicit sparr. Beslutet ska vara
medvetet och skrivet, inte en foljd av att nagon
sokte och ersatte.

### BORTFALLET VAR KANT OCH DOKUMENTERAT
docs/stanford2010/hpr-harvester-production.md rad 220
beskriver redan MultiTreeProcessedStem som "IGNORERAS
HELT" och kallar det "en kand Lucka (Hog) for
gallring". Dokumentet noterar ocksa korrekt att
MOM-parsern hanterar MTH pa fakt_produktion-niva.

Det var alltsa inget okant fel — det var en kand
lucka vars konsekvens ingen hade matt. Uppdatera
dokumentet nar parsern ar lagad.

### HALABAECK DUGER INTE SOM FACIT FRAMAT
Halabaeck har 0 % flertradshantering och ar darfor
den ENDA trakt dar den trasiga och den lagade
parsern ger samma svar. Att verifiera en parserfix
mot Halabaeck bevisar ingenting.

Anvand i stallet, facit fore fix:

  Johan Svensson Brandeborg (objekt_id 9955)
    MOM          641 stammar   25,583 m3sub
    detalj_stam  488 stammar   (-153, 23,9 % flertrad)
    fakt_sortiment            23,187 m3sub

  Steglehylte gallring 2025 (objekt_id 11086334)
    MOM        10393 stammar  486,863 m3sub
    detalj_stam 8578 stammar   (-1815, 24,5 % flertrad)
    fakt_sortiment           458,392 m3sub

Efter fix ska detalj_stam matcha MOM:s stamantal och
fakt_sortiment matcha MOM:s volym, bada inom
avrundning. Kontrollera ocksa att Halabaeck fortfarande
ger 254 / 32,7 — den far inte forandras.

### ORDNING PA ATGARDERNA — TRE FEL, TRE GRENAR
Fel 1 (MultiTree) ar EN gren. Ta inte fel 2
(Kompersmala-dubbelrakningen) eller fel 4
(4000-stammarstaket) i samma session. De har olika
orsaker, olika risk och olika verifiering, och en
gemensam gren gor det omojligt att se vilken andring
som flyttade vilket tal.

### FEL 2 — Kompersmala Lovhuggning +81,5 % (AKTIVT)
ORSAK FASTSTALLD: dubbelraknade kumulativa filer i
fakt_sortiment.

20 av 22 sortiment har exakt 2 rader pa 2 olika datum.
detalj_stam for samma objekt har bara 1 fil.

Asymmetrin ar poangen: detalj_stam och detalj_stock
har UNIQUE-nycklar och UPSERT:ar, sa kumulativa filer
skriver over varandra korrekt. fakt_sortiment saknar
motsvarande dedupe och har datum i nyckeln. Eftersom
Ponsse inte skriver ProcessingDate per stam (Bugg B
ovan) far varje kumulativ fil sitt eget sessions-
slutdatum — och da ADDERAS de i stallet for att
skriva over.

+81,5 % och inte +100 % darfor att den forsta filen
var en delmangd av den andra.

ATGARD: dedupe i fakt_sortiment enligt samma princip
som detalj_stock, eller ta bort datum ur nyckeln for
per-objekt-totaler.

### FEL 3 — tre trakter utan fakt_sortiment (INTE IMPORTFEL)
Midingstorp, Kompermala Ga och Lars Norberg Dunshultt
har NOLL HPR-filer under Behandlade. Kompermala har
14 MOM-filer men ingen HPR.

Det finns alltsa inget att importera. Ingen bugg —
men det betyder att sortimentsfordelning och all
stamdata saknas for de tre, och att kvitto eller
markagarrapport inte kan utfardas for dem.

ATGARD: ta reda pa varfor maskinen inte producerade
HPR for de tre. Ingen kodatgard.

### FEL 4 — slutavverkningens stora avvikelser (EJ KLAR)
ORSAK EJ FASTSTALLD. Annan mekanism an fel 1.

  Anna Karin Swerup  MOM 4984  detalj_stam 4076  -18,2 %
  Lonsbygd AU 2025   MOM 1079  detalj_stam  893  -17,2 %

Anna Karin Swerups senaste HPR har 0 % flertrads-
stammar, sa fel 1 forklarar det inte. Filerna ar
DELADE: ...20260525174917.hpr och ...174917_1.hpr.
Det pekar mot 4000-stammarstaket (se project-minnet
om Scorpion) och att bara en del importerats — men
det ar inte verifierat.

ATGARD: egen utredning. Rakna StemKey per delfil och
jamfor mot detalj_stam for objektet.

### OMFATTNING — inte bara gallring
                exakt lika   utan fakt_sortiment
  gallring        1 av 22          3 av 25
  slutavverkning  2 av 58          7 av 65
  grot            0 av 1           0 av 1

56 av 58 slutavverkningstrakter avviker pa volym.
14 av 58 avviker pa stamantal. Detta ar ett app-brett
problem, inte ett gallringsproblem.

### EXTRA KONTROLL — trakt_data.areal
Premissen stammer inte. INGEN vy laser
trakt_data.areal. Planeringsvyn hamtar hela
trakt_data-objektet for restriktioner men laser
arealen ur objekt.areal, precis som alla andra.
Gallringsvyn laser objekt.areal (lib/gallring.ts).

28 stammar/ha pa Halabaeck ar alltsa INTE en bugg.
Det ar sant: 254 stammar pa 9,17 ha, for att bara en
dag av trakten ar kord. Talet beskriver en pagaende
trakt, inte en fardig.

### OPALITLIG DATA TILLS ATGARD
Allt HPR-harlett ar underskattat med andelen
flertradshantering — 0 till 9 % pa volym, upp till
25 % pa stamantal:
  detalj_stam, detalj_stock, fakt_sortiment,
  hpr_stammar, hpr_filer.stammar_count

fakt_produktion (MOM) ar KORREKT och opaverkad. Allt
som raknas darifran — volym, stammar, medelstam,
gallringsvyns huvudtal — star kvar.

Dgv och diameterhistogram i gallringsvyn ar berak-
nade pa de enkeltradade stammarna. De klenaste
saknas systematiskt, sa Dgv ar for HOGT. Halabaeck ar
opaverkad (0 % multi).

### KONSEKVENS FOR DET SOM VANTAR
Tradpositioner i gallringsvyn steg 2, kartan pa
kvittot och punktvalet i matappen bygger alla pa
detalj_stam. Med fel 1 okorrigerat blir varje
flertradshanterad grupp ett hal i kartan — och i
gallring ar det just de klena partierna som saknas.
Kartan skulle visa gles gallring dar det gallrats
hardast.

Kranvinkeldata samlas dagligen. Varje dag med
flertradshantering samlar ofullstandig data, och det
gar inte att rekonstruera i efterhand utan
omimport ur HPR-filerna.
## Gallringskvitto — steg 1 (2026-08-22)

/gallring/[vo]/kvitto — dokumentet markägaren
far efter utford gallring. A4, @media print,
ingen PDF-generator och inget nytt beroende.
Anvandaren skriver ut till PDF fran webblasaren.

Sidan ar LJUS medan resten av appen ar mork.
Den ska pa vitt papper, och renderas den mork pa
skarmen vet ingen vad de far forran det ligger i
facket.

### Grinden
Knappen i objektvyn och sjalva dokumentet ar
bada gejtade pa dim_objekt.skordning_avslutad.

objekt.avslutad_timestamp vore det naturliga
valet men ar satt pa NOLL av 34 gallringstrakter
(faktisk_slut likasa) — en grind pa det faltet
hade gomt funktionen helt. skordning_avslutad ar
maskinens eget slutdatum ur StanForD och finns
pa 26 av 37.

Dokumentet skriver ut att det avser avslutad
SKORDNING. Skotningen kan paga, och en markagare
som ser virke kvar vid vag ska forsta varfor.

Halabaeck har inget avslutsdatum — den startade
21 aug och ar inte klar. Verifieringsobjektet far
alltsa ingen knapp, och kvittosidan visar
sparrtexten i stallet for dokument. Det ar ratt
beteende: 254 stammar pa 9,17 ha ar 28 st/ha och
0,58 m2/ha uttag, alltsa en dags gallring pa en
trakt som inte ar fardig.

### KRITISKT — MOM och HPR sager olika om samma trakt
Kvittots huvudtal far ALDRIG vara summan av
sortimenten. Sortimenten kommer ur fakt_sortiment
(HPR), traktens uttag ur fakt_produktion (MOM).
De ar identiska pa 1 av 25 gallringstrakter.

  Halabaeck        32,7 mot 32,7   0,00 %
  Rossmala        651,1 mot 647,9  -0,49 %
  Steglehylte     486,9 mot 458,4  -5,85 %
  Johan Svensson   25,6 mot  23,2  -9,36 %
  Kompersmala L.  541,8 mot 983,6 +81,53 %  <-- !
  Midingstorp     309,3   fakt_sortiment SAKNAS
  Kompermala Ga   384,1   fakt_sortiment SAKNAS
  Lars Norberg     90,7   fakt_sortiment SAKNAS

Forsta bygget lat huvudtalet vara
sortimentssumman for att kolumnen skulle addera.
Det hade tryckt 0,0 m3fub pa Midingstorps kvitto
— en trakt som avverkat 309 m3. Nu ar huvudtalet
fakt_produktion (samma tal som gallringsvyn) och
dokumentet skriver ut i klartext nar sortimenten
inte tacker uttaget.

HPR ligger systematiskt lagre, vilket luktar
kumulativ-fil-dedupe (jfr CLAUDE.md: anvand bara
filen med hogst stammar_count per objekt).
Kompersmala Lovhuggning ligger 81 % for HOGT och
ser ut som dubbelraknade kumulativa filer. Bada
ar OUTREDDA och egen uppgift.

### KVAR — grundyteblocket
Plan fore / uttag / kvar gar inte att bygga.
Planens ingangsvarde finns inte lagrat:
objekt.trakt_data bar bara areal/volym/beraknad,
och lib/skoglig-berakning.ts raknar visserligen
grundyta m2/ha ur SLU:s laserdata (band 2) men
resultatet lever bara i React-state i
planeringsvyn.

Beslut 2026-08-22: ny kolumn
objekt.grundyta_fore_m2ha, fylls MANUELLT ur
stamplingslangd eller traktdirektiv. SLU-vardet
duger inte — det ar fran skanningsdatum, bar
tillvaxt sedan dess och ar inte markagarens eget
tal. Kvittots poang ar att utga fran siffran i
hans plan som han redan accepterat.

Migration + block gors i EGEN GREN. Inget skapat
i databasen i den har sessionen.

### FALLA — trakt_data.areal ar en platshallare
objekt.trakt_data.areal ar 2 for SAMTLIGA 51
objekt. Riktig areal ligger i objekt.areal
(Halabaeck 9,17 ha, Rossmala 23,2 ha). Laser man
fel falt blir varje per-hektar-tal fel med en
faktor fyra till femton.

### Saknas i schemat
"Avdelning" finns inte som begrepp nagonstans i
kodbasen — utelamnat ur kvittot. vo_nummer och
kontraktsnummer bar SAMMA varde pa Halabaeck
(11219961), sa kontraktsraden trycks bara nar den
skiljer sig fran VO. traktnr ar 886311.

### Verifierat
Dataskiktet mot facit (Halabaeck): 254 stammar,
Dgv 178 mm, 32,7 m3fub, stamandel Tall 55 / Gran
25 / Bjork 13 / Ovrigt lov 7 % — samtliga exakt.
Volymandelen 61/24/10/5 skiljer sig som den ska,
och basen star utskriven i bada dokumenten.

Renderat inloggat pa Rossmala Ga 2026: hela
dokumentet, ratt farger (gran gron, bjork VIT med
kontur, ovrigt lov gra, tall orange), tackningsrad
nar sortimenten inte gar ihop, ren konsol.

INTE okulargranskad: sjalva A4-layouten och
utskriftsresultatet. Browser-panelen komponerade
inte (innerWidth 0), sa matten gick inte att lasa.
Behover ett oga pa print preview.

## PAGINERINGSBUGGEN 2026-08-24

.range()-paginering med en sorteringsnyckel som inte
ar unik ger DUBBLETTER och SAKNADE rader samtidigt.
Radantalet blir ratt, innehallet fel — darfor syns
det inte som ett uppenbart fel.

Upptackt i gallringsvyn: Bjorn Martinsson visades som
21 817 stammar / 941,3 m3 mot MOM:s 22 023 / 950,4.
Matning av vyns egen hamtning:

  1044 rader hamtade · 1028 unika id
  16 DUBBLETTER som maskerade 16 SAKNADE rader

lib/gallring.ts sorterade fakt_produktion pa
(objekt_id, datum). 62 rader delar samma datum, och
objektet passerar sidgransen vid 1000. Vid gransen
returneras vissa rader tva ganger medan andra hoppas
over. Det slog till forst nar flertradsstammarna kom
in och gallringsdatat passerade 1000 rader.

### INVENTERING — hela appen
67 .range()-anrop i 31 filer. Efter avdrag for
engangsanrop och de som redan har unik nyckel:

  41 direkta .from(tabell)     FIXADE
   4 RPC-paginering            KVAR, kraver beslut
  10 generiska hjalpare        KVAR, kraver beslut

Fixen: tabellens unika nyckel laggs SIST i
sorteringen, sa befintlig ordning behalls och bara
oavgjorda lagen bryts. dim_*-tabellerna saknar id men
har egna unika nycklar (objekt_id, operator_id,
maskin_id, sortiment_id).

Varst drabbad var markagarrapporten:
lib/markagarrapport/aggregate.ts paginerade
hpr_stammar, detalj_stock OCH detalj_stam HELT UTAN
.order(). Utan ORDER BY ger Postgres ingen
ordningsgaranti alls. Det ar kunddokumentet.

### KVAR — kraver beslut per anropare
RPC-paginering (4): .rpc(...).range(...) kan inte fa
en tiebreaker utifran pa samma satt. Sorteringen
maste in i SQL-funktionen eller anropet gores om.
  lib/maskinvy/skotarvolym.ts:49
  app/maskinvy/IdagNy.tsx:167
  app/maskinvy/OversiktShared.tsx:264 och :280

Generiska hjalpare (10): tar en fardig query eller
ett tabellnamn som parameter, sa nyckeln maste komma
fran anroparen. fetchAllRows i lib/ekonomi/period.ts
ar den mest anvanda.
  lib/ekonomi/period.ts:55, lib/hpr/objekt-data.ts:12
  och :38, app/datahalsa/useDatahalsa.ts:144,
  app/maskinvy/OversiktShared.tsx:260 och :261,
  app/oversikt/page.tsx:55,
  app/redigering/hooks/useFildata.ts:174,
  app/redigering/hooks/useMatchning.ts:74,
  app/uppfoljning/hooks/useUppfoljningList.ts:42

### VERIFIERAT
Bjorn Martinsson i gallringsvyn: 21 817 -> 22 023
stammar och 941,3 -> 950,4 m3fub, exakt MOM:s facit.
Listans huvudtal 6 638,0 -> 6 647,1.

tsc: 551 fel bade fore och efter, radagnostisk
jamforelse ger NOLL nya. (Forsta korningen svarade
"0 fel" — worktreen saknade node_modules och npx
korde en stub, inte tsc. Se minnet om det.)

Bygget gront. Samtliga 41 andrade queries testade
direkt mot databasen. Fetch-falla genom hela flodet
hem -> gallring: noll misslyckade anrop.

## HPR_STAMMAR-BUGGEN 2026-08-24 — FIXAD

_save_hpr_tables byggde raderna med VILLKORLIGA
nycklar: dbh, lat, lng, antal_stockar och total_volym
lades bara till nar de fanns. En batch som blandade
stammar med och utan de falten avvisades av PostgREST
med 400 PGRST102 "All object keys must match", och
HELA batchen foll — 500 rader per traff.

Syntes inte forran skala. Vid pilotens 641 stammar
rymdes allt i tva likformiga batchar. Vid Bjorn
Martinssons 12 936 slog det till 19 ganger:
hpr_stammar fick 21 286 rader mot 21 786 forvantade.

FIX: nyckeln skrivs alltid, saknat varde blir NULL.
Vardesemantiken ar oforandrad — falsy lat/lng/
antal_stockar (inklusive 0) blev tidigare utelamnade
och blir nu NULL, vilket ar samma sak for lasaren.

VERIFIERAT mot filen som fallde importen (Bjorn
Martinsson, 11 402 stammar, 23 batchar):
  gammal kod: 1 av 23 batchar blandade nycklar
  ny kod:     0 av 23
  varden som skiljer: 0

### KVAR — hpr_stammar for Bjorn Martinsson ar ofullstandig
De 500 tappade raderna kom aldrig in. Objektet har
21 286 rader dar det ska ha 21 786. En omkorning av
HPR-sparningen for objektet behovs, men ar INTE gjord.

## MARKAGARRAPPORTEN — SPARBARHET FORE #466

lib/markagarrapport/aggregate.ts paginerade
hpr_stammar, detalj_stock OCH detalj_stam HELT UTAN
.order() fram till #466 (mergad 2026-08-24).

Utan ORDER BY ger Postgres INGEN ordningsgaranti.
Konsekvensen ar inte bara "fel ordning" — sidorna kan
overlappa och hoppa fritt, sa en rapport kan ha
innehallit GODTYCKLIGA rader: samma stam raknad tva
ganger, andra stammar helt utelamnade. Volym,
stamantal, sortimentsfordelning och virkesvarde kan
alla vara fel, at bada hallen.

Objekt storre an 1000 rader i nagon av de tre
tabellerna ar berorda — det ar de flesta. Halabaeck
har 704 stockar och klarade sig; Husjonas har 1 349
stammar och gjorde det inte.

ATGARD: om nagon markagarrapport har GATT UT till en
markagare bor den kunna spåras och rakans om mot
nuvarande kod. Det ar ett kunddokument med
virkesvarde i kronor. Vi vet inte idag vilka rapporter
som genererats eller skickats — det finns ingen logg
over utfardade rapporter. Bor utredas.

Facit att stamma av mot finns hogre upp i filen:
Husjonas (objekt_id 11124938) = 1 349 stammar,
678 m3sub, 433 163 kr.

Uppdatera denna fil vid varje commit.
