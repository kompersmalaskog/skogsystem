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
