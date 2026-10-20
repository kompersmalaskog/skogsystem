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

## 0. Ordning och förutsättningar

**Steg 1 (de fyra funktionerna) är KÖRT 2026-10-20 08:30 UTC** och krävde inte PITR: en `revoke` är reversibel med en `grant`. Migration `20261020083010_rls_steg1_revoke_fyra_funktioner`
(filen i `supabase/migrations/`, byte-identisk med det som kördes). Före/efter står i avsnitt 1.

**Steg 2–5 väntar på att Martin bekräftar backup/PITR.** De är inte reversibla på samma sätt (droppa backup-tabeller, slå på RLS, byta policies) och `anon` har **DELETE** på `objekt` och 10 tabeller
till (avsnitt 2 och 3). Databasen går **inte att återskapa ur migrationerna** (de är additiva, innehållet saknas). Alltså, innan steg 2:
1. Bekräfta i Supabase-konsolen att **Point-in-Time Recovery** är på, och vilket fönster som gäller.
2. Ta en **manuell backup** (eller `pg_dump` av de tabeller som rörs) och kontrollera att den går att läsa tillbaka.
3. Varje steg körs först som en `DO`-körning som slutar i `RAISE EXCEPTION` (rullas tillbaka), därefter på riktigt.

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

Alla fyra hade `=X/postgres` i `proacl`, alltså EXECUTE via **PUBLIC**, plus en explicit grant till anon. Därför `from public, anon`:
```sql
revoke execute on function public.fortnox_kör_sync()          from public, anon;
revoke execute on function public.avtal_kör_notify()          from public, anon;
revoke execute on function public.fordon_kör_notify()         from public, anon;
revoke execute on function public.fyll_dim_fran_trakt(uuid)   from public, anon;
```
**Körd.** `proacl` före, identisk på alla fyra: `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
`proacl` efter, identisk på alla fyra: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. Verifierat efteråt: `has_function_privilege` för `anon` = **false**, för `authenticated`,
`service_role` och `postgres` = **true** på alla fyra. Anon-körbara funktioner i `public`: 272 → 268, varav DEFINER 26 → 22. pg_cron (jobb 1 och 3, kör som `postgres`) och alla fem cron-jobb är fortsatt aktiva.
`fyll_dim_fran_trakt(uuid)` anropas av två INVOKER-triggerfunktioner (`objekt_autofyll_dim` på `objekt`, `dim_objekt_autofyll_fran_trakt` på `dim_objekt`) som körs som den som skriver; skrivarna är
`authenticated` (appen) och `service_role` (importen), som behåller sina grants. Återställning om något oväntat visar sig: `grant execute on function … to public, anon;` med samma signaturer.

**Inte utnyttjbara, trots sina namn.** Sex funktioner returnerar `trigger`; Postgres vägrar att anropa en triggerfunktion som RPC. De är alltså inte ett hål och
ska inte röras: `koppla_konto_till_medarbetare`, `koppla_medarbetare_till_konto`, `skapa_fakturaunderlag_flytt`, `handle_new_user`, `logg_raderad_markering`,
`kö_ledighet_notis`.

**Redan täta (rörs inte).** `ratta_flytt` och `stryk_flytt` börjar med `if not ar_admin() then raise exception … errcode 42501`. Provat som anon: `stryk_flytt(…)` avvisades med
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

## 5. Maskindata-gruppen: ÅTTA funktioner (läsläckan)

Alla åtta har `=X/postgres` + explicit anon-grant + `authenticated` + `service_role`, och `search_path=public`. De skiljer sig i *skälet* till revoken — skriv inte fel skäl:

| Funktion | SECURITY DEFINER | Skäl till revoke |
|---|---|---|
| `maskindata_avbrott(text[],date,date)` | **ja** | omgår RLS och saknar kontroll av anroparen — **bevisad läsläcka** (se nedan) |
| `maskindata_lass(text[],date,date)` | **ja** | samma |
| `maskindata_lass_senaste(text[])` | **ja** | samma |
| `maskindata_produktion(text[],date,date)` | **ja** | samma |
| `maskindata_produktion_senaste(text[])` | **ja** | samma |
| `maskindata_tid(text[],date,date)` | **ja** | samma |
| `maskin_har_manuell_datakalla(text)` | **ja** | DEFINER + anon-körbar; matchar inte prefixet `maskindata_` men hör i samma revoke (returnerar ett boolean per maskin) |
| `maskindata_flertrad_period(text[],date,date)` | **nej** (INVOKER) | **grant-skälet, inte definer-skälet:** anon har EXECUTE (via PUBLIC och explicit) utan att behöva det. Som INVOKER lyder den RLS; inte visat att den läcker något — revokas för att grant-ytan ska stämma |

**Bevisat för de sex DEFINER-funktionerna:** som roll `anon` gav `maskindata_tid(array['R64428','PONS20SDJAA270231','R64101'], 2026-09-01, 2026-10-19)` **102 rader** (tid per dag och maskin) — produktion, tid och lass till anon.
Appen anropar dem som inloggad (`supabase.rpc(...)` i `app/maskinvy/*`), så `authenticated` behåller sin explicita grant:
```sql
revoke execute on function public.maskindata_avbrott(text[], date, date)            from public, anon;
revoke execute on function public.maskindata_lass(text[], date, date)               from public, anon;
revoke execute on function public.maskindata_lass_senaste(text[])                   from public, anon;
revoke execute on function public.maskindata_produktion(text[], date, date)        from public, anon;
revoke execute on function public.maskindata_produktion_senaste(text[])             from public, anon;
revoke execute on function public.maskindata_tid(text[], date, date)                from public, anon;
revoke execute on function public.maskin_har_manuell_datakalla(text)                from public, anon;
revoke execute on function public.maskindata_flertrad_period(text[], date, date)    from public, anon;
```
Övriga stable DEFINER-funktioner är ofarliga och rörs inte: `aktuell_medarbetare_id`, `ar_admin`, `ar_godkannare`, `min_maskin_id`, `mina_operator_ids` returnerar anroparens egen identitet (null för anon), `flytt_ar_last` returnerar ett boolean.

### Namngivet undantag: `jamfor_migrationer` behåller anon-körning
`public.jamfor_migrationer(jsonb)` är release-grinden (`scripts/migrationskontroll.mjs`, `scripts/vad-slapps.mjs`, `.github/workflows/migrationskontroll.yml`, alla med anon-nyckeln). **Den behåller `anon=X`.** Skälet:
- Dess ACL är `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` — **PUBLIC är redan borttaget** och rollerna explicit grantade. Det är det mönster alla funktionerna ovan ska få efter revoke; funktionen är alltså redan i önskat läge.
- Den är `stable` och jämför bara migrationslistor mot de (version, namn) som anroparen själv skickar in; den läcker inget som är värt att skydda.
- Alternativen är sämre: en service-nyckel som CI-secret är en större hemlighet än den den skulle skydda (och skriptet vägrar den med flit, med ett test), och att köra kontrollen bara lokalt gör att grinden slutar grinda.
En bred `revoke … from anon` över alla DEFINER-funktioner får därför **aldrig** inkludera `jamfor_migrationer`; använd funktionslistorna ovan, inte en loop över `pg_proc`.

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
