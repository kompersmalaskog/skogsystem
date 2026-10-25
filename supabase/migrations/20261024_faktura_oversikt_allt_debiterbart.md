# faktura_oversikt() — allt debiterbart, inte bara maskindata

Motiveringen bakom `20261024173902_20261024_faktura_oversikt_allt_debiterbart.sql` (körd i
prod 2026-10-24). SQL-filen är byte-identisk med `schema_migrations.statements`
och pekar hit; den här filen är `.md` så att Supabase-CLI:n aldrig försöker köra
den.

## Varför (utredning mot prod 2026-10-24)

`faktura_oversikt()` byggde sitt universum ur `dim_objekt`, alltså ur
MASKINDATA. Tre konsekvenser, alla med pengar i:

1. **En trakt utan maskinrad finns inte i vyn.** Arvidstorp RP J-Hus -25
   (`objekt.vo_nummer` 11277905) har 533 debiterbara minuter i `extra_tid` och
   ingen `dim_objekt`-rad — 8,88 timmar som ingen vy kunde visa.
2. **Tillståndet är maskinens avslut.** Skälviken RP J-Hus -25 har 988
   debiterbara minuter och låg som `ej_paborjad` eftersom ingen maskin
   rapporterat; Mölleryd RP J-Hus -25 har 94 minuter under `pagar`. Båda i
   dämpade högar som ingen fakturerar ur.
3. **Skotarens timmar har TVÅ källor.** `g15h` summerar bara `fakt_tid`, medan
   `skotare_objekt_manuell.g15_timmar` bär de handinknappade: Krokshult AU 2026
   25 tim (810E, timpris 950 = 23 750 kr), Bjällerhult au + ga 22 tim, Åbogen RP
   2026 32 tim. Krokshult och Bjällerhult är timpeng och låg som klara att
   fakturera.

## Vad migrationen gör — bara LÄGGER TILL

Inget befintligt tal ändrar värde.

* universumet blir `dim_objekt`-VO UNION trakter med debiterbart arbete
  (vid körningen exakt ett tillskott: 11277905);
* fyra nya kolumner: `har_maskindata`, `debiterbart_arbete_tim`,
  `debiterbart_arbete_poster`, `manuell_skotartid_tim`.

Bevis före körning (läsning, ingen skrivning): 136 → 137 rader, 1 tillskott,
0 borttappade, 0 skillnader på de tolv gamla kolumnerna. Antalet klara stod
kvar på 23.

## Vad den INTE gör, med flit

* **Den ändrar inte `tillstand`.** `klar` betyder fortfarande "maskinerna är
  klara och inget hinder". Att väga in debiterbart arbete i tillståndet hade
  gjort ordet tvetydigt — listan grupperar på de nya fälten i stället.
* **Den lägger inte de manuella skotartimmarna i `g15h`.** Radbyggaren
  (`lib/faktura/radbyggare.ts`) prissätter ur `fakt_tid`; skrev vyn 33,8 tim där
  fakturan säger 8,8 hade de två varit oense om samma trakt, och det är värre än
  en trakt som får vänta. Fältet finns för att GAPET ska syna, tills radbyggaren
  läser båda källorna med objektöversiktens regel: den manuella raden räknas
  bara när maskinen saknar mätt tid på objektet.

## Teknik

Returtypen växer, så funktionen måste DROP:as och skapas om. DDL är
transaktionellt i Postgres, så bytet är atomärt. En DROP tar grants med sig — de
återställs explicit sist (gamla ACL: PUBLIC, anon, authenticated, service_role;
SECURITY INVOKER, oförändrat).

## Kopplingen till arbetsrapporten är en fälla

`extra_tid.objekt_id` är TEXT och bär ett VO-nummer, men inte alltid traktens
eget: 11166440 → Bågskyttebanan (11271849), 11161397 → Skälviken (11271860),
11166477 → Mölleryd (11271883). En koppling på `objekt.vo_nummer` ensamt tappar
2 034 av 2 687 debiterbara minuter TYST — samma felklass som `dim_objekt_id`,
`fran_objekt_id` och `matched_objekt_id`. Funktionen löser därför numret via
`objekt.vo_nummer` ELLER `objekt_alt_nummer`, med direkt träff först.
