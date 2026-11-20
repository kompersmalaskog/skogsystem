# RLS och anon-nyckeln — granskning av `public` (2026-10-20)

**Dokumentet beskriver läget i prod (`mxydghzfacbenbgpodex`) 2026-10-20 och vad som gjorts.** Steg 1, 3, 3b, 4 och 5 är KÖRDA (migrationerna ligger i `supabase/migrations/20261020*`, byte-identiska med
det som kördes, versionerna stämplade av prod). Steg 2 och avsnitten 8–11 är förslag som inte är körda. Anon-nyckeln ligger i webbläsarbundeln, så "anon" betyder "vem som helst som öppnar appens JavaScript".
Bevisen kördes som roll `anon` och `authenticated` (`set local role …` i `DO`-block som slutar i `RAISE EXCEPTION`, alltså rullade tillbaka) — inte antaganden.

## Metod: grant + RLS + policy måste stämma samtidigt

Att läsa `pg_policies` ensamt ger fel svar åt båda hållen. En tabell är öppen för anon först när **alla tre** gäller:
1. `has_table_privilege('anon', tabell, <kommando>)` — anon har en table-GRANT för kommandot (utan den hjälper ingen policy),
2. radsäkerheten är **av** (`pg_class.relrowsecurity = false`) **eller** en policy ger `anon`/`public` kommandot med ett villkor som är sant för anon,
3. för funktioner: `has_function_privilege('anon', funktion, 'execute')` — **och var rättigheten kommer ifrån**: `proacl` med `=X/postgres` är EXECUTE för
   **PUBLIC**, som anon ärver. `revoke … from anon` ensamt gör då ingenting.

Exempel åt båda hållen i den här databasen: `bestallningar` har policyn `Allow anonymous read` (ser öppen ut) men anon har **ingen** table-GRANT, så den är
verkningslös; `objekt` har fyra policies som ser stängda ut (`authenticated`) men RLS är **av**, så de gör ingenting och anon har full CRUD.

## 0. Ordning, status och kvitto

**Backup/PITR är verifierat PÅ av Martin, inifrån databasen:** `archive_mode=on`, `archive_command` via wal-g, `wal_level=logical`, 5 351 arkiverade WAL-segment, 0 misslyckade, senast arkiverad två minuter före kontrollen.
Kontinuerlig WAL-push är PITR-maskineriet. Fönstrets längd syns bara i dashboarden. **Steg 2 är omskrivet så att fönstret inte behövs:** inget raderas, tabellerna flyttas till ett eget schema.

| Steg | Vad | Status |
|---|---|---|
| 1 | Fyra volatila DEFINER-funktioner: `revoke … from public, anon` (avsnitt 1) | **KÖRD** `20261020083010` |
| 2 | Backup-/testtabeller: sex flyttade till schemat `arkiv` (INTE drop), tre levande referenstabeller fick RLS + läs-policy (avsnitt 2) | **KÖRD** `20261020100110` … `100148` (10 migrationer) |
| 3 | `objekt`: `enable row level security` + `revoke all from anon` (avsnitt 3) | **KÖRD** `20261020090625` |
| 3b | `markering_delete_logg`: samma (avsnitt 3) | **KÖRD** `20261020090646` |
| 4 | De 22 `true`-tabellerna, en migration per tabell, `20261020090743` … `090831` (avsnitt 4) | **KÖRD** |
| 5 | Åtta maskindata-funktioner: `revoke … from public, anon` (avsnitt 5) | **KÖRD** `20261020090856` |
| 8 | Nio SECURITY DEFINER-vyer: åtta `security_invoker` + anon-läsrätten borttagen (`planering_vy` först); `medarbetare_namn` lämnas medvetet (avsnitt 8) | **KÖRD** `20261020100210` … `100232` (8 migrationer) |
| 9 | `search_path` på de fyra DEFINER-funktionerna som saknar det | ej körd |
| 10 | Läckta lösenord (HaveIBeenPwned) i Auth: en kryssruta | ej gjord |
| 11 | Tre cron-funktioner (`fortnox_kör_sync`, `avtal_kör_notify`, `fordon_kör_notify`): `revoke … from authenticated`. De tre andra som avsnittet nämnde lämnades (se avsnitt 11); resten av de 37 ej genomgångna | **KÖRD för tre** `20261020115603` |

**Linterns egna lint-namn är kvittot** (`get_advisors` type `security`; kör om efter varje steg). Före → efter 2026-10-20:

| Lint | Före | Efter | Vad som återstår |
|---|---|---|---|
| `rls_disabled_in_public` (ERROR) | 11 | **0** | — (efter steg 3, 3b och 2) |
| `policy_exists_rls_disabled` (ERROR) | 1 (`objekt`) | **0** | — |
| `anon_security_definer_function_executable` (WARN) | 22 | **16** (15 av våra + `korvy_min_medarbetare()` som ett annat spår la till 09:13, en identitetshjälpare som returnerar null för anon) | sex triggerfunktioner (kan inte anropas som RPC), fem identitetshjälpare (`aktuell_medarbetare_id`, `ar_admin`, `ar_godkannare`, `min_maskin_id`, `mina_operator_ids`), `flytt_ar_last`, `jamfor_migrationer` (namngivet undantag), `ratta_flytt`/`stryk_flytt` (kontrollerar `ar_admin()`) |
| `rls_enabled_no_policy` (INFO) | 6 | 7 | de sex som service-nyckeln ensam läser, plus `markering_delete_logg` (avsiktligt: bara triggern skriver) |
| `security_definer_view` (ERROR) | 9 | **1** | `medarbetare_namn`, medvetet (avsnitt 8) |
| `function_search_path_mutable` (WARN) | 87 | 89 | avsnitt 9: 4 DEFINER + 83 INVOKER, plus två nya INVOKER-funktioner från ett annat spår (`egenkontroll_stickprov_las`, `egenkontroll_fagelvag_km`) |
| `authenticated_security_definer_function_executable` (WARN) | 37 | 39 | avsnitt 11; +2 från ett annat spår (`korvy_min_medarbetare`, `egenkontroll_stickprov`) |
| `auth_leaked_password_protection` (WARN) | 1 | 1 | avsnitt 10 |
| `extension_in_public` (WARN) | 2 (`btree_gist`, `pg_net`) | 2 | ej granskat |

Siffrorna stämmer med vårt eget arbete: 11 RLS-avstängda tabeller → 0, 22 anon-körbara DEFINER-funktioner → 15 av våra (efter steg 1 och 5), 9 DEFINER-vyer → 1, och `objekt` var den enda `policy_exists_rls_disabled`.

## Läget FÖRE stegen (verifierat 2026-10-20 morgon; efterläget står i tabellen i avsnitt 0)

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

## 2. Backup-/testtabellerna: flytta, radera inte — och tre av nio är INTE backuper — KÖRD

Nio tabeller utan RLS och med anon CRUD: `arbetsdag_backup_13jun`, `arbetsdag_backup_operator_20260714` (arbetsdagar per förare), `backup_km_dalarna_20260814`, `backup_km_stefan_juli_20260812` (km per förare),
`backup_ledighet_testrader_20260812`, `fakt_tid_test`, `kontroll_baslinje`, `kravprofil`, `normalisering_karta`. **Appens TypeScript läser inga av dem, men SQL-funktioner gör det** (sökt i `pg_proc`-källorna 2026-10-20):

| Tabell | Läses av | Konsekvens |
|---|---|---|
| `normalisering_karta` | `normalisera(text,text)`, `kontroll_produktfalt()` | **levande referenstabell** (sortimentsnormalisering) |
| `kravprofil` | `massaved_mal()` | **levande referenstabell** |
| `kontroll_baslinje` | `kontroll_produktfalt()` | **levande referenstabell** |
| övriga sex | ingen funktion, vy, främmande nyckel eller trigger | riktiga backuper/testdata (`backup_km_dalarna_20260814` 106 rader, `fakt_tid_test` 1 rad) |

Det tidigare förslaget (drop eller flytta alla nio) hade brutit tre funktioner. Därför två delar:

**2a (körd `20261020100110` … `100127`, en migration per tabell). De sex backuperna flyttas till ett eget schema utan anon-grants. Inget raderas, inget behöver återskapas.**
```sql
create schema if not exists arkiv;
revoke all on schema arkiv from anon, authenticated;
alter table public.arbetsdag_backup_13jun               set schema arkiv;
alter table public.arbetsdag_backup_operator_20260714   set schema arkiv;
alter table public.backup_km_dalarna_20260814           set schema arkiv;
alter table public.backup_km_stefan_juli_20260812       set schema arkiv;
alter table public.backup_ledighet_testrader_20260812   set schema arkiv;
alter table public.fakt_tid_test                        set schema arkiv;
revoke all on all tables in schema arkiv from anon, authenticated;   -- tabellerna behåller annars sina gamla grants
```
`arkiv` exponeras inte av PostgREST om projektets exponerade scheman är standard (`public`, `graphql_public`) — kontrollera i Settings → API före körning; `revoke … from anon, authenticated` ovan gäller ändå. Återställning: `alter table arkiv.<t> set schema public;`.

**2b (körd `20261020100144` … `100148`, en migration per tabell). De tre referenstabellerna stannar i `public` men får RLS** (policyer FÖRE `enable`, annars slutar `normalisera()` att fungera för inloggade):
```sql
create policy normalisering_karta_las on public.normalisering_karta for select to authenticated using (true);
alter table public.normalisering_karta enable row level security;
revoke all on public.normalisering_karta from anon;
-- samma för kravprofil och kontroll_baslinje
```
Skrivning går bara via service-nyckeln/migrationer. Kontrollera före: vilka som anropar `normalisera`/`massaved_mal`/`kontroll_produktfalt` och med vilken roll (de tre anropas av vyer med ägare `postgres`, som omgår RLS, och av importen med service-nyckeln).

**Bevis efter (rullade `DO`-block):** de sex tabellerna ligger i `arkiv`, `anon` och `authenticated` har inget (varken schema eller tabell); inga tabeller utan RLS återstår i `public`. Som `anon`: `kravprofil` och `arkiv.*` ger `42501`. Som förare: `kravprofil` 13 rader, `normalisering_karta` 28, `kontroll_baslinje` 3, och **`massaved_mal()` (som appen anropar från `/affarsuppfoljning`) ger sin rad** — utan läs-policyn hade den gett tomt. En INSERT i `kravprofil` som förare avvisas (`42501`): de tre tabellerna är nu läs-only för inloggade, skrivning går via service-nyckeln. PostgREST-schemalistan (`db_schemas`) syns inte via SQL; `arkiv` är dessutom stängt för både `anon` och `authenticated` (schema-USAGE), så en exponering ger ändå ingen åtkomst. Återställning: `alter table arkiv.<t> set schema public;` + `grant` efter behov.

## 3. `objekt` och `markering_delete_logg` — KÖRDA

`objekt`: alla trakter, markägarnamn, telefon, e-post, adress, inköpare. **Rättelse mot förra utkastet: DELETE-policyn fanns redan** — `objekt_admin` (`ALL`, `to authenticated`, `ar_admin()`) — så steg 3a ("skapa admin-DELETE före enable") behövdes inte. Övriga policies: `insert_objekt`, `read_objekt`, `update_objekt` (`auth.role() = 'authenticated'`). De var verkningslösa så länge RLS var av.
```sql
alter table public.objekt enable row level security;       -- 20261020090625
revoke all on public.objekt from anon;
alter table public.markering_delete_logg enable row level security;   -- 20261020090646
revoke all on public.markering_delete_logg from anon;
```
**Bevis, före körning (rullad tillbaka):** med RLS på gav `anon` `42501`, en förare (Max) såg 67 rader och kunde uppdatera, `ar_admin()` gav false för föraren och true för Martin, som såg 67 rader.
**Efter:** `relrowsecurity=true`, `anon` kan inget (select/delete false), `authenticated` select true, `service_role` delete true.
**Ej provat:** DELETE som admin/förare. Ett `DELETE`-prov i `execute_sql` hängde i 60 s (samma verktygsbeteende som `DROP`, se CLAUDE.md); läst ur policyn gäller: admin får, förare får inte. Konsekvens: `deleteObj` i gamla `app/objekt/page.tsx` (webbläsarens klient) fungerar nu bara för admin; `lib/slaIhopJobb.ts` raderar med service-nyckeln och påverkas inte; importen använder `SUPABASE_SERVICE_ROLE_KEY`.
`markering_delete_logg` (395 rader) skrivs av `logg_raderad_markering` (DEFINER, ägare `postgres` med `bypassrls`); inget i koden läser den. Ingen policy skapad, avsiktligt (INFO-lintet `rls_enabled_no_policy` hör ihop med detta).

## 4. De 22 `true`-tabellerna — KÖRDA, en migration per tabell

Migrationerna `20261020090743` … `090831` (`rls_steg4_01_brand_brandvakt` … `rls_steg4_22_planering_markeringar`). Per tabell:
```sql
alter policy "<namn>" on public.<tabell> to authenticated;   -- villkoret oförändrat (true); bara rollen byts från public/anon
revoke all on public.<tabell> from anon;                      -- grant är det som faktiskt öppnar; policyn är andra låset
```
**`alter policy` i stället för `drop policy` + `create policy`**: `DROP` hänger i Supabase-MCP:n (se CLAUDE.md), och `alter policy … to` ger samma slutläge med en sats utan fönster där tabellen saknar policy. Tabeller med flera policies fick alla ändrade (`detalj_kontroll_stam`, `detalj_kontroll_stock_matpunkt`, `dim_objekt_sortiment_fonster`, `maskiner`, `gps_tracks`); `objekt_vagdata` hade `{anon,authenticated}` och blev `{authenticated}`.
**Bevis efter:** för alla 22 tabeller `relrowsecurity=true`, `anon` har ingen table-privilege, alla policies har rollen `{authenticated}`. I ett rullat `DO`-block gav `select count(*)` som `authenticated` (förare) rader på alla 22 (t.ex. `planering_markeringar` 480, `detalj_kontroll_stock_matpunkt` 6 859, `dim_objekt_sortiment_fonster` 1 131) och som `anon` `42501` på alla 22.
**Kontrollerat före:** server-routrarna som rör tabellerna (`cron/stada-markering-foton`, `vagdata-cron`, `kalibrering/*`) använder `SUPABASE_SERVICE_ROLE_KEY`; markeringskön (`lib/markeringSynkKo.ts`, `lib/markeringSynk.ts`, `lib/fotoKo.ts`) har ingen särbehandling av 401/42501 (sökt), så ett avvisat skrivförsök ligger kvar i kön och görs om; en förare med utgången session fördröjer men tappar inte — inte provat med en riktigt utgången session.
`using (true)` för `authenticated` är fortfarande vidöppet *inom* företaget; skärp (per roll, per ägare) i ett eget steg. `bestallningar`: den verkningslösa policyn `Allow anonymous read` är kvar (ingen anon-grant, ingen effekt); att släppa den kräver `DROP` och är städning, inte säkerhet.

## 5. Maskindata-gruppen: ÅTTA funktioner (läsläckan) — KÖRD `20261020090856`

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
**Körd.** `proacl` före, identisk på alla åtta: `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; efter: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. `has_function_privilege`: `anon` false, `authenticated` true, `service_role` true på alla åtta. Anon-körbara funktioner i `public`: 268 → **260**, varav DEFINER 22 → **15**.
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

## 8. Nio SECURITY DEFINER-vyer (lint `security_definer_view`, ERROR) — KÖRD för åtta

Frågan var om vyerna är en medveten genväg runt de sex tabellerna med RLS på och noll policies (`handelse`, `kontroll`, `resurs`, `detalj_stam_diameter`, `stamplings_cell`, `stamplings_rapport`), eller om appen läser vyerna för att policies saknas. **Svar: nej, och nej.** Ingen av de nio vyerna läser någon av de sex tabellerna (beroenden ur `pg_depend`); appen läser de sex bara med service-nyckeln (`app/api/stampling/*` via `adminKlient()`, `app/api/fordon/notify-pamin`). Och appen läser **åtta av nio vyer inte alls** (sökt i `app`, `lib`, `components`, `scripts`, `*.py`); den nionde, `medarbetare_namn`, läses av `app/planering/page.tsx:3316`. Inga policies behövde skrivas före vyerna ändrades.

| Vy | Läser | Läses av appen? | Anon fick före (provat) | Efter |
|---|---|---|---|---|
| `planering_vy` | `objekt`, `dim_objekt`, `bestallningar` | nej | **100 rader** — namn, `inkopare`, `skogsagare`, lat/long, volymer | anon `42501`, förare 102 = ägare 102 |
| `vy_daglig_sammanfattning` | `fakt_produktion`, `fakt_tid`, `dim_maskin` | nej | **1 460 rader** — produktion och tid per maskin och dag | anon `42501`, förare 1 460 = ägare |
| `vy_sortiment_klass` | `dim_sortiment`, `dim_sortiment_grupp` | nej | 296 rader | anon `42501`, förare 296 = ägare |
| `vy_normalisering_luckor` | `dim_sortiment`, `vy_sortiment_klass` | nej | 9 rader | anon `42501`, förare 9 = ägare |
| `vy_kalibrering_status` | `fakt_kalibrering` | nej | 3 rader | anon `42501`, förare 3 = ägare |
| `vy_virke_karta` | `detalj_stam`, `detalj_stock`, `dim_objekt` | nej | 0 rader (tom just nu, men öppen) | anon `42501`, förare 0 = ägare |
| `produktion_per_dag` | `mom_produktion`, `maskiner` | nej | 0 rader | anon `42501`, förare 0 = ägare |
| `lager_varningar` | `lager_artiklar` | nej | 0 rader | anon `42501`, förare 0 = ägare |
| `medarbetare_namn` | `medarbetare` | **ja**, `app/planering/page.tsx:3316` (`id, fornamn`) | `42501` redan | oförändrad (förare 7) — **lämnad som DEFINER** |

**Gjort per vy, en migration var, `planering_vy` först** (`20261020100210` … `100232`):
```sql
alter view public.<vy> set (security_invoker = true);   -- vyn lyder anroparens RLS i stället för ägarens (postgres)
revoke all on public.<vy> from anon;
```
Inget i appen påverkas (ingen läsare), och som förare ger varje vy samma antal rader som ägaren — alltså inga rader som RLS tar bort. PostgreSQL 17.6 (security_invoker kräver 15+).

**`medarbetare_namn` lämnas medvetet som DEFINER.** `medarbetare` har en deliberat snäv select-policy (`user_id = auth.uid() OR ar_admin()`: du ser dig själv, admin ser alla) eftersom tabellen bär `timlon_kr`, `manadslon_kr`, hemadress, telefon, `anhorig_namn`/`anhorig_telefon` och hemkoordinater (kolumnlista ur `information_schema`, 2026-10-20). Vyn är en kolumnbegränsad projektion (`id`, `fornamn`) som låter alla inloggade se förnamn i planeringsvyn. Med `security_invoker` skulle förare bara se sitt eget namn; att i stället öppna tabellen för alla rader för att vyn ska bli invoker skulle läcka alla kolumner. Det är alltså inte en saknad policy utan en avsiktlig genväg. Lintet `security_definer_view` kvarstår på just den (1 st) som dokumenterad avvikelse; anon har redan inget. Vill man bli av med lintet är vägen en `SECURITY DEFINER`-funktion som returnerar bara `id, fornamn` (och vyn tas bort) — en egen ändring i `app/planering/page.tsx`.

## 9. `search_path` på funktioner (lint `function_search_path_mutable`, WARN, 87 st)

**Rättelse mot uppgiften "22 är DEFINER": det är 4.** De 22 var antalet anon-körbara DEFINER-funktioner (annan mängd, nu 15). Av de 87 saknar **4 DEFINER-funktioner och 83 INVOKER-funktioner** `search_path` (extensionsfunktioner exkluderade):
- **DEFINER (kapningsvägen):** `fortnox_kör_sync`, `avtal_kör_notify`, `fordon_kör_notify` (de tre cron-funktionerna) och `handle_new_user`.
- **INVOKER (83):** bl.a. `helikopter_ny_*`, `massaved_*`, `opti_tid_*`, `fpr_*`, `egenkontroll_*_last_nar_klar`, `rebuild_fakt_sortiment`, `affar_oversikt`. Lägre risk (de körs med anroparens rättigheter).

`set search_path = ''` är säkert för de fyra DEFINER-funktionerna: läst i fulltext är varje referens kvalificerad (`vault.decrypted_secrets`, `net.http_post`, `public.anvandare`; `jsonb_build_object`/`now()` ligger i `pg_catalog`, som alltid söks).
```sql
alter function public."fortnox_kör_sync"()  set search_path = '';
alter function public."avtal_kör_notify"()  set search_path = '';
alter function public."fordon_kör_notify"() set search_path = '';
alter function public.handle_new_user()     set search_path = '';
```
**För de 83 INVOKER-funktionerna är `''` inte säkert utan genomgång:** de refererar tabeller okvalificerat och slutar fungera. Använd `public, pg_temp` (som de övriga 15 DEFINER-funktionerna använder `public`), eller kvalificera först. Eget steg, efter de fyra. Kvitto: `function_search_path_mutable` 87 → 83 efter de fyra.

## 10. Läckta lösenord i Auth (lint `auth_leaked_password_protection`, WARN)

Skyddet mot lösenord som finns i läckor (HaveIBeenPwned) är av. Det är en kryssruta i dashboarden (Authentication → Sign In / Providers → Password), inte SQL, och kan inte göras av migrationerna. Kvitto: lintet försvinner. Påverkar bara nya lösenord och lösenordsbyten.

## 11. Inloggade kan köra 37 SECURITY DEFINER-funktioner (lint `authenticated_security_definer_function_executable`, WARN)

Steg 1 och 5 tog bara bort `anon` (Martins instruktion: "rör `authenticated` inte alls"). **Kvar för en inloggad förare, via `/rest/v1/rpc/…`:** bl.a. de tre funktionerna `fortnox_kör_sync`, `avtal_kör_notify` och `fordon_kör_notify`
(de anropar Vercel med hemligheten ur Vault, så vilken inloggad som helst kan trigga en Fortnox-synk eller ett utskick), `fyll_dim_fran_trakt`, och `helikopter_notis_manad`/`helikopter_notis_vecka` (köar notiser).
**Sökt i appens kod 2026-10-20:** appen anropar `avvisa_lass`, `besvara_lass`, `next_privat_vo`, `tilldela_vo_maskinobjekt`, `satt_kartlager` och `skotar_farduskotat` — men **ingen** av de sju ovan (de tre cron-funktionerna, `fyll_dim_fran_trakt`, de två `helikopter_notis_*`). `pg_cron` kör jobb 1 (`fortnox_kör_sync`) och 3 (`avtal_kör_notify`) som `postgres`; `fordon_kör_notify` har inget cron-jobb.
**KÖRD för tre av de sex (2026-10-20, `20261020115603`, Martins ok att köra sist).** `revoke execute … from authenticated` på `fortnox_kör_sync`, `avtal_kör_notify` och `fordon_kör_notify`: de kontrollerar inte anroparen, bara `pg_cron` (som `postgres`) anropar dem (jobb `fortnox-nightly-sync` 02:00 och `avtal-daily-notify` 06:05), och ingen funktion i databasen anropar dem. **Efter:** `has_function_privilege` = false för `authenticated` och `anon`, true för `postgres` och `service_role`; ACL `{postgres=X, service_role=X}`; lintens lista över inloggade-körbara funktioner innehåller dem inte längre.
**Avsnittets första förslag var fel för tre av de sex, och därför är de INTE med:**
- `helikopter_notis_vecka`: appen anropar den (`app/helikopter/_lib/queries.ts:444`, knappen "Onsdagsnotisen nu", `rpc('helikopter_notis_vecka', { p_manuell: true })`). Sökningen ovan ("ingen av de sju") missade den. Funktionen kontrollerar dessutom själv `roll = 'admin'` ur JWT-claims och kastar 42501 annars, så en inloggad förare kan inte köa notisen. En revoke hade brutit adminknappen för ingenting.
- `helikopter_notis_manad`: samma adminkontroll i kroppen. Ingen app-anropare, men inget hål att täppa.
- `fyll_dim_fran_trakt`: anropas av de två INVOKER-triggerfunktionerna `objekt_autofyll_dim` och `dim_objekt_autofyll_fran_trakt`, alltså **som den inloggade som skriver `objekt`/`dim_objekt`**. En revoke hade fått varje objektskrivning från appen att falla med "permission denied for function". Vill man ändå stänga den: gör först de två triggerfunktionerna till SECURITY DEFINER med `set search_path`, och prova en objektskrivning som `authenticated` i ett rollback-block.
- Avsnittets text sa "sju", men namnger sex (de tre, `fyll_dim_fran_trakt` och de två `helikopter_notis_*`). Jag har inte gissat en sjunde; `kö_ledighet_notis` är en triggerfunktion (kan inte anropas som RPC) och rördes inte.
**Kvar:** resten av de 37 (nu 39 med andra spårs tillägg) kräver en funktion-för-funktion-genomgång; de flesta kontrollerar anroparen själva (`ar_admin()`, JWT-roll) eller är identitetshjälpare som policyer använder.
