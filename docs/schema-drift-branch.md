# Databasens schema går inte att bygga om från repot — och vad vi gör åt det

**Status: KRITISKT fynd, 2026-08-12.** Upptäckt när en Supabase-branch
(`dev-testmiljo`, ref `clbjqotxhiocongpwgqs`) skulle byggas för att kunna ta
skärmdumpar mot en isolerad test-DB. Branchen fick **0 tabeller**. Grävningen
visade varför — och att det är ett större problem än skärmdumparna.

## Vad vi hittade

| Mätpunkt | Värde |
|----------|-------|
| Tabeller i prod (`public`, base tables) | **158** |
| Migrationer i prods historik (`supabase_migrations.schema_migrations`) | **144** |
| Migrationsfiler i repot (`supabase/migrations/`) | **66** |
| Migrationer i historiken som innehåller `CREATE TABLE` | 43 |
| Migrationer i historiken som innehåller `ALTER TABLE` | 96 |
| Sekvenser / identity-kolumner | 28 / 4 |
| Första migrationen i historiken | `20260402074440_add_objekt_id_to_arbetsdag` |

Den **allra första** registrerade migrationen är:

```sql
ALTER TABLE arbetsdag ADD COLUMN IF NOT EXISTS objekt_id text;
```

En `ALTER` på en tabell (`arbetsdag`) som **aldrig skapats i någon migration**.

## Vad det betyder

Basschemat — `arbetsdag`, `gps_tracks`, alla `dim_*`- och `fakt_*`-tabeller —
byggdes ad hoc via Supabase-dashboarden / SQL-editorn **innan** migrationer
började användas (2026-04-02) och fångades aldrig som kod. Migrationerna som
finns är inkrementella ändringar *ovanpå* en bas som bara existerar i den
levande databasen.

Konsekvenser:

1. **Prod går inte att återskapa från noll.** Kör man migrationerna mot en tom
   databas kraschar migration #1 direkt (ALTER på icke-existerande tabell).
   Det var precis det som hände branchen → 0 tabeller.
2. **Repot är dessutom inte ens synkat med prods egen historik.** 66 filer i
   repot vs 144 i prod, med olika namn. Prod migreras i praktiken via
   dashboard/MCP `apply_migration` (namn som `helikopter_oversikt_ovrigt`,
   `add_objekt_id_to_arbetsdag`) vars SQL aldrig committats till repot.
3. **Enda kopian av basschemat är den levande databasen.** Försvinner den —
   eller korrumperas — finns ingen väg tillbaka via koden. Det är en
   single-point-of-failure på hela systemets struktur.

Det här är den största av de tysta felkällor vi jobbat på att bygga bort.
En tabbe i dashboarden, en felaktig `DROP`, en trasig restore — och strukturen
är borta utan backup i versionshanteringen.

## Åtgärd (det här arbetets huvudresultat)

1. **Baseline-migration.** Ett `--schema-only`-dump av prod (noll rader, bara
   struktur) läggs in i `supabase/migrations/` som en grundmigration —
   `<timestamp>_baseline_prod_schema.sql`. Den fångar de 158 tabellerna +
   sekvenser + constraints + funktioner + vyer + RLS som aldrig migrerats.
2. **Verifiering.** Beviset på att vi är klara: en färsk branch/databas ska gå
   att bygga **från migrationerna ensamt** (baseline + efterföljande) utan
   handpåläggning. Testas genom att skapa om branchen och bekräfta 158 tabeller.
3. **Skärmdumpsmiljön** (test-branch, seed, test-admin, `.env`-omkoppling,
   `/korvy`-stängning) byggs ovanpå — men är bonusen, inte poängen.

## Regel framåt — icke förhandlingsbar

**Varje schemaändring ska gå via en migrationsfil i `supabase/migrations/`,
committad till repot. Aldrig direkt i dashboarden eller SQL-editorn.**

- Ändring i dashboarden/SQL-editorn utan motsvarande committad migration =
  ett nytt tyst gap som gör prod oåterskapbar igen.
- `apply_migration` via MCP är OK **bara** om samma SQL committas som fil i
  `supabase/migrations/` i samma veva.
- När det är praktiskt: koppla Supabase↔GitHub-integrationen så migrationer i
  repot driver prod (och drift upptäcks automatiskt), i stället för tvärtom.

## Funna luckor (utöver hela basschemat)

Loggas här allt eftersom, för spårbarhet. Kända sedan tidigare
(minnesanteckningar), bekräftas mot dumpen när den är på plats:

| Objekt | Typ | Status |
|--------|-----|--------|
| Hela basschemat (tabeller före 2026-04-02) | tabeller | fångas av baseline-dumpen |
| Larmkoordinat-kolumnerna (objekt/dim_objekt) | kolumner | verifieras mot dump |
| Storage-policyer (kartbilder privat, utbildningsbevis) | policyer | separat pass (storage-schema) |
| Unik-constraint på `vo_nummer` | constraint | verifieras mot dump |
| `skotare_objekt_manuell` | tabell | ingår i baseline |
| Fällningsradie-debug-loggtabell | tabell | ingår i baseline |

## Byggstenar (för trogen återuppbyggnad)

- **Inga** PostGIS/geometrityper — geometri lagras som `text`/`jsonb`/`float8`.
- Bara standardtyper (text, int4, numeric, timestamptz, uuid, date, bool,
  float8, jsonb, int8, time, text[], int4[], int2).
- Extensions i prod: `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`,
  `uuid-ossp`, `supabase_vault`.
- 28 sekvenser (nextval-defaults) + 4 identity-kolumner.
