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

Uppdatera denna fil vid varje commit.
