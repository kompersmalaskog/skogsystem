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
- Stanford2010-dokumentation pågår — MOM och
  HPR klara, HQC och FPR återstår. Filer
  ligger untracked i docs/stanford2010/.
  Pushas som samlad PR när alla fyra klara.
- Viktig upptäckt under HPR-arbetet:
  hpr_filer-tabellen har 538 rader med
  maskin_id=NULL och 248 med stammar_count=0
  pga buggar i import_hpr.py (rad 372-374,
  391) och _save_hpr_tables. Datat finns
  intakt i detalj_stam + hpr_stammar.
  Repair-query förberedd i
  hpr-harvester-production.md. Kör SQL-
  reparation när dokumentationen är klar.

Uppdatera denna fil vid varje commit.
