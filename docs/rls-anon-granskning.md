# RLS och anon-nyckeln — granskning av `public` (2026-10-20)

**Allt nedan är läsande SQL mot prod (`mxydghzfacbenbgpodex`) och läsning av koden 2026-10-20. Inget är ändrat, ingen migration ingår.** Anon-nyckeln
ligger i webbläsarbundeln, så "anon" betyder "vem som helst som öppnar appens JavaScript". Två läsningar kördes som roll `anon` (`set local role anon`,
bara SELECT resp. ett anrop som avvisades) för att bevisa, inte anta.

## Metod: grant + RLS + policy måste stämma samtidigt

Att läsa `pg_policies` ensamt ger fel svar åt båda hållen. En tabell är öppen för anon först när **alla tre** gäller:
1. `has_table_privilege('anon', tabell, <kommando>)` — anon har en table-GRANT för kommandot (utan den hjälper ingen policy),
2. radsäkerheten är **av** (`pg_class.relrowsecurity = false`) **eller** en policy ger `anon`/`public` kommandot med ett villkor som är sant för anon,
3. för funktioner: `has_function_privilege('anon', funktion, 'execute')` — **och var rättigheten kommer ifrån**: `proacl` med `=X/postgres` är EXECUTE för
   **PUBLIC**, som anon ärver. `revoke … from anon` ensamt gör då ingenting.

Exempel åt båda hållen i den här databasen: `bestallningar` har policyn `Allow anonymous read` (ser öppen ut) men anon har **ingen** table-GRANT, så den är
verkningslös; `objekt` har fyra policies som ser stängda ut (`authenticated`) men RLS är **av**, så de gör ingenting och anon har full CRUD.

## 0. STOPP — bekräfta backup/PITR innan något arbete börjar

`anon` har **DELETE** på `objekt` och 10 tabeller till (avsnitt 3 och 2), och databasen går **inte att återskapa ur migrationerna** (de är additiva, innehållet
saknas). Alltså:
1. Bekräfta i Supabase-konsolen att **Point-in-Time Recovery** är på, och vilket fönster som gäller.
2. Ta en **manuell backup** (eller `pg_dump` av de tabeller som rörs) och kontrollera att den går att läsa tillbaka.
3. Först därefter någon ändring nedan. Varje steg körs först som en `DO`-körning som slutar i `RAISE EXCEPTION` (rullas tillbaka), därefter på riktigt.

## Läget (verifierat)

| | Antal | Anon kan |
|---|---|---|
| Tabeller med RLS **av** och anon-grant | 11: `objekt`, `markering_delete_logg` (395 rader), 9 backup-/testtabeller | select, insert, update, delete (alla fyra, verifierat) |
| Tabeller med policy `true` för `public`/`anon` | **23** | |
| …varav med anon table-GRANT (alla fyra kommandon) | **22** | 20 med `ALL`-policy: full CRUD · 2 (`dim_objekt_sortiment_fonster`, `objekt_vagdata`) har bara SELECT-policy (skrivning kräver `ar_admin()` resp. saknar policy): **bara läsning** |
| …varav utan anon-GRANT | 1: **`bestallningar`** | **inget** — "Allow anonymous read" är verkningslös. **Läcker inte.** (Ett tidigare utkast av det här dokumentet påstod motsatsen; det var fel.) |
| Funktioner i `public` som anon kan köra | 272 av 324 (`security invoker` räknas inte som hål: de lyder RLS) | |
| …varav `SECURITY DEFINER` | 26 | se avsnitt 1 och 5 |

## 1. De fyra funktionerna (hålet: volatila, anropbara, ingen kontroll av anroparen)

Verifierat per funktion: `prosecdef`, `provolatile`, `proacl` och om källan alls kontrollerar anroparen (`ar_admin()`, `auth.uid()` …).

| Funktion | Returnerar | Vad den gör |
|---|---|---|
| `fortnox_kör_sync()` | bigint | startar Fortnox-synk (pg_cron jobb 1, 02:00, kör som `postgres`) |
| `avtal_kör_notify()` | bigint | skickar avtalspåminnelser (pg_cron jobb 3, 06:05, kör som `postgres`) |
| `fordon_kör_notify()` | bigint | skickar fordonspåminnelser |
| `fyll_dim_fran_trakt(p_objekt_id uuid)` | integer | skriver dim-rader ur en trakt (ingen anropare i appens kod hittad — kontrollera triggrar) |

Alla fyra har `=X/postgres` i `proacl`, alltså EXECUTE via **PUBLIC**. Därför:
```sql
revoke execute on function public.fortnox_kör_sync()          from public, anon;
revoke execute on function public.avtal_kör_notify()          from public, anon;
revoke execute on function public.fordon_kör_notify()         from public, anon;
revoke execute on function public.fyll_dim_fran_trakt(uuid)   from public, anon;
```
`authenticated` och `service_role` har egna, explicita grants i `proacl` och berörs inte; pg_cron kör som `postgres` (ägaren) och berörs inte. Kontrollera
efteråt med `has_function_privilege('anon', …)` (ska vara falskt) och `has_function_privilege('authenticated', …)` (ska vara sant).

**Inte utnyttjbara, trots sina namn.** Sex funktioner returnerar `trigger`; Postgres vägrar att anropa en triggerfunktion som RPC. De är alltså inte ett hål och
ska inte röras: `koppla_konto_till_medarbetare`, `koppla_medarbetare_till_konto`, `skapa_fakturaunderlag_flytt`, `handle_new_user`, `logg_raderad_markering`,
`kö_ledighet_notis`.

**Redan täta.** `ratta_flytt` och `stryk_flytt` börjar med `if not ar_admin() then raise exception … errcode 42501`. Provat som anon: `stryk_flytt(…)` avvisades med
`42501 Bara admin kan stryka en flytt` innan något skrevs. Täta — rör inte.

## 2. Backup-/testtabellerna (9 st, RLS av, anon CRUD)

`arbetsdag_backup_13jun`, `arbetsdag_backup_operator_20260714` (arbetsdagar per förare), `backup_km_dalarna_20260814`, `backup_km_stefan_juli_20260812` (km per förare),
`backup_ledighet_testrader_20260812`, `fakt_tid_test`, `kontroll_baslinje`, `kravprofil`, `normalisering_karta`. Inget i appen läser dem (sökt i koden). Minst risk — görs först av tabellerna.
Antingen `drop table` (efter att innehållet säkrats), eller flytta till ett schema utan anon-grants:
```sql
create schema if not exists arkiv;
revoke all on schema arkiv from anon, authenticated;
alter table public.arbetsdag_backup_13jun set schema arkiv;   -- … samma för de övriga åtta
```

## 3. `objekt` (och `markering_delete_logg`): policies FÖRE att RLS slås på

`objekt`: alla trakter, markägarnamn, telefon, e-post, adress, inköpare. Fyra verkningslösa policies (`insert/read/update_objekt`, `auth.role() = 'authenticated'`); ingen DELETE-policy.
Ordning, i en rollback-provad körning:
```sql
-- 3a. DELETE för admin FÖRE enable. Utan den slutar "Ta bort" i Objekt-vyn (#845) att fungera när RLS slås på.
create policy objekt_delete_admin on public.objekt for delete to authenticated using (ar_admin());
-- 3b. Granska de befintliga insert/read/update-policies — avgör om update ska begränsas till planerare/admin.
-- 3c. SIST:
alter table public.objekt enable row level security;
revoke all on public.objekt from anon;
```
Kontrollera efteråt med en session som förare och en som admin: `/planering`, `/objekt`, `/oversikt`, `/starta-jobb`, och en import (service-nyckeln omgår RLS).
`markering_delete_logg` (395 rader) skrivs av triggern `logg_raderad_markering` (DEFINER, ägaren omgår RLS): `enable row level security` utan policies räcker; kontrollera vem som läser den.

## 4. De 22 `true`-tabellerna, en i taget

Alla har anon table-GRANT (avsnittet "Läget"). Ordning från minst till mest dagligt använda av förarna: `brand_brandvakt`, `brand_efterkontroll`, `brand_kontakter`,
`brand_samrad`, `brand_tillbud`, `tma_assessments`, `avlagg_assessments`, `feedback`, `briefing_status`, `kvittering_status`, `kvittering_reset_logg`, `objekt_kvittering`,
`service_paminnelser`, `detalj_kontroll_stam`, `detalj_kontroll_stock_matpunkt`, `objekt_vagdata`\*, `dim_objekt_sortiment_fonster`\*, `maskin_ko`, `maskin_service`, `maskiner`,
`gps_tracks`, och sist `planering_markeringar` (\* = bara läsning i dag). För varje tabell:
```sql
drop policy "<namn>" on public.<tabell>;
create policy <tabell>_authenticated on public.<tabell> for all to authenticated using (true) with check (true);
revoke all on public.<tabell> from anon;      -- grant är det som faktiskt öppnar; policyn är andra låset
```
`using (true)` för `authenticated` är fortfarande vidöppet *inom* företaget; skärp (per roll, per ägare) i ett eget steg efter att anon är stängt.
`bestallningar`: släpp den verkningslösa policyn `Allow anonymous read` som städning (ingen risk, ingen effekt).

## 5. `maskindata_*` (läsläckan) och release-grinden

**Sex** `SECURITY DEFINER`-funktioner läser produktionsdata förbi RLS och är anropbara av anon utan kontroll av anroparen: `maskindata_avbrott`, `maskindata_lass`, `maskindata_lass_senaste`,
`maskindata_produktion`, `maskindata_produktion_senaste`, `maskindata_tid`. **Bevisat:** som roll `anon` gav `maskindata_tid(array['R64428','PONS20SDJAA270231','R64101'], 2026-09-01, 2026-10-19)`
**102 rader** (tid per dag och maskin). (Martin räknade sju; sjunde är troligen `maskindata_flertrad_period`, som inte syns bland anon-körbara DEFINER-funktioner — kontrollera `prosecdef` på den.)
Appen anropar dem som inloggad (`supabase.rpc(...)` i `app/maskinvy/*`), så `authenticated` måste behålla sin explicita grant:
```sql
revoke execute on function public.maskindata_tid(text[], date, date)        from public, anon;   -- … samma för de övriga fem, med sina signaturer
```
Övriga 14 stable-funktioner är ofarliga: `aktuell_medarbetare_id`, `ar_admin`, `ar_godkannare`, `min_maskin_id`, `mina_operator_ids` returnerar anroparens egen identitet (null för anon),
`flytt_ar_last` och `maskin_har_manuell_datakalla` returnerar ett boolean.

### Haken: `jamfor_migrationer` är release-grinden och är anon-körbar
`public.jamfor_migrationer(jsonb)` är `SECURITY DEFINER` med en **explicit** anon-grant (ingen PUBLIC). Den används av `scripts/migrationskontroll.mjs`, `scripts/vad-slapps.mjs` och
`.github/workflows/migrationskontroll.yml` med anon-nyckeln. En bred `revoke … from anon` på alla DEFINER-funktioner skulle döda deploy-grinden (felkod 2, "kör inte release").
**Förslag: flytta grinden till service-nyckeln i stället för att undanta funktionen**, och sedan stänga den som alla andra:
- `scripts/vad-slapps.mjs` körs på Martins dator där `SUPABASE_SERVICE_ROLE_KEY` redan finns i `.env.local`.
- `scripts/migrationskontroll.mjs` vägrar i dag uttryckligen en servicenyckel ("ser ut som en servicenyckel — ska köras med anon/publishable") och har ett test för det; den spärren och dess test ska ändras medvetet.
- CI-jobbet (varnar bara, ändrar inget) behöver en repository-secret i stället för variabel. **Avvägning:** en service-nyckel i CI är en större hemlighet att skydda än anon-nyckeln (loggar, PR:er från forkar får den inte). Alternativ: kör kontrollen bara lokalt och låt CI-jobbet utgå.
- Först därefter: `revoke execute on function public.jamfor_migrationer(jsonb) from anon;` (och bekräfta att `vad-slapps.mjs` fortfarande går igenom).

## 6. Kontroll av medveten anon-användning (avgör om tätningen är säker)

Sökt i koden: alla `createClient(`, `createServerClient(`, `createBrowserClient(`, alla träffar på `ANON_KEY`, `middleware.ts`, `public/`, python/ps1/yml/mjs.
- **Webbappen kör aldrig anon utan session.** `lib/supabase.ts` (`createBrowserClient`) och alla `createServerClient(…, { cookies })` kör med den inloggades JWT. Ingen `createClient(url, ANON)` finns; alla fristående `createClient(` använder `SUPABASE_SERVICE_ROLE_KEY`.
- `middleware.ts`: alla sidor utom `/login` kräver session; `/api/*` är stängt som default. Undantag: `/api/version`, `/api/fortnox/auth|callback`, `/api/auth/*`, Bearer `CRON_SECRET`/`IMPORT_SECRET` — ingen av dem rör tabellerna ovan som anon.
- Ingen publik kartlänk, QR-vy eller statusskärm; inga edge functions; `public/` har bara ikoner, manifest, `sw.js` (anropar inte Supabase) och en geojson.
- Importen kör med `SUPABASE_SERVICE_ROLE_KEY`.
- Medvetna anon-användare som FINNS: `jamfor_migrationer` (avsnitt 5) och tre lokala skript (`link-hpr-data.py`, `backfill-grot.py`, `tag-hpr-format.py`) som faller tillbaka på anon-nyckeln om `SUPABASE_SERVICE_KEY` saknas (efter tätning får de 0 rader utan fel — ändra fallbacken till ett tydligt fel); `scripts/historik/sb_las.py` läser `fakt_*`/`dim_*` med anon (inte de tabeller som rörs här).
- **Kan inte uteslutas med kodsökning:** något på en annan enhet eller i en extern tjänst som anropar REST/Realtime med anon-nyckeln. Kontrollera Supabase API-loggen efter `anon`-anrop mot de berörda tabellerna och funktionerna **före** varje steg.

## 7. Ej granskat
`storage.objects` (buckets `kartbilder`, `utbildningsbevis`, `trakt-inbox`), Realtime-publikationer, andra scheman än `public`.
