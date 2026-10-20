# RLS och anon-nyckeln — granskning av `public` (2026-10-20)

**Allt nedan är läsande SQL mot prod (`mxydghzfacbenbgpodex`) och läsning av koden 2026-10-20. Inget är ändrat.** Anon-nyckeln ligger i webbläsarbundeln,
så "anon" betyder "vem som helst som öppnar appens JavaScript".

## 0. STOPP — bekräfta backup/PITR innan något policy-arbete börjar

`anon` har **DELETE** på `objekt` och på 10 tabeller till (avsnitt 1), och databasen går **inte att återskapa ur migrationerna** (de är additiva, innehållet
saknas). Alltså:

1. Bekräfta i Supabase-konsolen att **Point-in-Time Recovery** är på, och vilket fönster som gäller.
2. Ta en **manuell backup** (eller `pg_dump` av de tabeller som rörs) och kontrollera att den går att läsa tillbaka.
3. Först därefter: någon ändring i avsnitt 4. Varje steg körs som en `DO`-körning som slutar i `RAISE EXCEPTION` först (rullas tillbaka), därefter på riktigt.

Så länge hålen står öppna är risken densamma som före den här granskningen — att nu veta om dem ändrar inte det.

## 1. Tabeller UTAN radsäkerhet och med full anon-åtkomst (11 st)

`pg_class.relrowsecurity = false` och `has_table_privilege('anon', …)` är sant för select, insert, update OCH delete:

| Tabell | Innehåll | Obs |
|---|---|---|
| **`objekt`** | alla trakter, markägarnamn, telefon, e-post, adress, inköpare | Har fyra policies (`insert/read/update_objekt`, `auth.role() = 'authenticated'`) som är **verkningslösa** — RLS är avstängt. Ingen DELETE-policy finns. |
| `markering_delete_logg` | 395 rader (borttagna kartmarkeringar) | |
| `arbetsdag_backup_13jun`, `arbetsdag_backup_operator_20260714` | arbetsdagar per förare | personuppgifter |
| `backup_km_dalarna_20260814`, `backup_km_stefan_juli_20260812` | körsträckor per förare | personuppgifter |
| `backup_ledighet_testrader_20260812` | ledighetsrader | |
| `fakt_tid_test`, `kontroll_baslinje`, `kravprofil`, `normalisering_karta` | | |

## 2. Policies som släpper in anon (RLS på, men villkoret är `true`) — 23 tabeller enligt min lista

Roll `public` omfattar `anon`. Villkor `true` = ingen begränsning. Min lista ger 23 tabeller (20 med `ALL`, 3 med bara `SELECT`); Martin räknade 21 —
**räkna om från `pg_policies` före arbetet**, siffran ska vara rätt i checklistan.

| Tabell | Policy | Kommando |
|---|---|---|
| `bestallningar` | `Allow anonymous read` (roll `anon`) | SELECT — läser alla beställningsvolymer från Vida |
| `planering_markeringar` | `Anon full access` | ALL |
| `maskiner`, `maskin_ko`, `maskin_service`, `service_paminnelser` | `Allow all …`, `maskin_service_all`, `service_paminnelser_all` | ALL |
| `feedback`, `briefing_status`, `kvittering_status`, `kvittering_reset_logg`, `objekt_kvittering` | `Allow all …` | ALL |
| `brand_brandvakt`, `brand_efterkontroll`, `brand_kontakter`, `brand_samrad`, `brand_tillbud` | `Allow all for anon` | ALL (`brand_kontakter`: kontaktuppgifter) |
| `tma_assessments`, `avlagg_assessments` | `Allow all for anon` | ALL |
| `detalj_kontroll_stam`, `detalj_kontroll_stock_matpunkt` | `*_read`, `*_write` | SELECT + ALL |
| `gps_tracks` | `Allow all access to gps_tracks` (+ en korrekt authenticated-policy) | ALL |
| `objekt_vagdata` | `vagdata_select` (roller `anon,authenticated`) | SELECT |
| `dim_objekt_sortiment_fonster` | `…_select` | SELECT (skrivning kräver `ar_admin()`, rätt) |

`insert_/update_bestallningar` är **inte** hålet: villkoret är `auth.role() = 'authenticated'`.

## 3. Kontroll: kör något MEDVETET på anon-nyckeln? (avgör om tätningen är säker)

Sökt i koden (2026-10-20): alla `createClient(`, `createServerClient(`, `createBrowserClient(`, alla träffar på `ANON_KEY`, `middleware.ts`, `public/`, python/ps1/yml/mjs.

**Webbappen kör aldrig anon utan session.**
- `lib/supabase.ts` är `createBrowserClient(url, anonKey)` — nyckeln är bara "apikey"; frågorna går med den inloggades JWT (`authenticated`).
- Alla `createServerClient(url, anonKey, { cookies })` (admin-sidor, `lib/auth/server.ts`, `/api/*`) läser sessionen ur cookien → `authenticated`.
- Ingen `createClient(url, ANON)` (supabase-js utan session) finns i `app/`, `lib/` eller `components/` (flerradssökt). Alla fristående `createClient(` använder `SUPABASE_SERVICE_ROLE_KEY` och omgår RLS.
- `middleware.ts`: **alla sidor utom `/login` kräver session** (annars redirect), och `/api/*` är stängt som default. Undantag utan session: `/api/version`, `/api/fortnox/auth`, `/api/fortnox/callback`, `/api/auth/*`, samt Bearer `CRON_SECRET` / `IMPORT_SECRET`. Ingen av dem rör tabellerna i avsnitt 1–2: `/api/version` och `/api/fortnox/auth|callback` använder inte Supabase alls (verifierat), `/api/auth/callback` byter bara en kod mot en session.
- Ingen publik kartlänk, QR-vy eller statusskärm hittades: inga rutter utanför middleware, inga delade token-länkar, ingen edge function (`supabase/functions` saknas), `public/` har bara ikoner, manifest, `sw.js` (anropar inte Supabase) och `forest-height.geojson`.
- Importen (`skogsmaskin_import_version_6.py` m.fl.) kör med `SUPABASE_SERVICE_ROLE_KEY`.

**Medvetna anon-användare som FINNS och måste fortsätta fungera:**
| Vem | Vad | Konsekvens av tätning |
|---|---|---|
| `scripts/migrationskontroll.mjs`, `scripts/vad-slapps.mjs`, CI-jobbet `.github/workflows/migrationskontroll.yml` | RPC `public.jamfor_migrationer` med anon-nyckeln (SECURITY DEFINER, anon har EXECUTE — verifierat) | Rör inga tabellpolicies. **Får inte förlora anon-EXECUTE** när funktionerna i avsnitt 5 stängs. Faller den, fallerar release-kontrollen stängt (felkod 2). |
| `scripts/link-hpr-data.py`, `scripts/backfill-grot.py`, `scripts/tag-hpr-format.py` | använder `SUPABASE_SERVICE_KEY` och faller **tillbaka på anon-nyckeln** om den saknas | Efter tätningen får de 0 rader utan fel, om service-nyckeln saknas. Ändra fallbacken till ett tydligt fel. |
| `scripts/historik/sb_las.py` | läser `fakt_tid`, `fakt_produktion`, `dim_objekt`, `dim_maskin`, `fakt_lass` med anon-nyckeln (Martins lokala datorn) | Dessa tabeller finns inte i avsnitt 1–2 — påverkas inte nu, men verifiera deras policies. |
| `.github/workflows/vitest.yml` | platshållarnyckel (`ci-platshallare`) | ingen |

**Det som inte går att utesluta med kodsökning** (måste frågas till Martin innan avsnitt 4 körs): något på en annan enhet eller i en extern tjänst som anropar REST/Realtime direkt med anon-nyckeln (t.ex. en maskindator-genväg, en Power Automate/Zapier-koppling, en gammal PWA-version som cachat en tidigare auth-väg). Test: slå av ett steg i taget i en provkörning och titta i Supabase API-loggen efter `anon`-anrop på de berörda tabellerna **före** ändringen — loggen visar vem som faktiskt använder hålet.

## 4. Föreslagen ordning (INTE körd, inte en migration)

Texten ligger här, inte i `supabase/migrations`, så att `scripts/vad-slapps.mjs` inte räknar den som väntande. Förutsättning: avsnitt 0 och 3 klara.

**Steg 1 — backup-/testtabellerna** (11 − `objekt` − `markering_delete_logg` = 9 tabeller). Minst risk: inget i appen läser dem.
Antingen `drop table` (efter att innehållet säkrats), eller flytta till ett eget schema utan anon-grants:
```sql
create schema if not exists arkiv;
revoke all on schema arkiv from anon, authenticated;
alter table public.arbetsdag_backup_13jun set schema arkiv;   -- … samma för de övriga åtta
```
**Steg 2 — `objekt`.** Policies skrivs FÖRE att RLS slås på, och provas först i en rollback-körning:
```sql
-- 2a. DELETE för admin saknas idag; utan den slutar "Ta bort" i Objekt-vyn (#845) att fungera när RLS slås på.
create policy objekt_delete_admin on public.objekt for delete to authenticated using (ar_admin());
-- 2b. Granska de befintliga insert/read/update-policies (auth.role()='authenticated') — avgör om update ska begränsas till planerare/admin.
-- 2c. SIST:
alter table public.objekt enable row level security;
revoke all on public.objekt from anon;   -- belt and braces: anon behöver ingenting här
```
Kontrollera efteråt med en session som förare och en som admin: öppna `/planering`, `/objekt`, `/oversikt`, starta ett jobb (`/starta-jobb`).
**Steg 3 — `true`-policies, en tabell i taget** (avsnitt 2), i den ordning som minst berör förarna: `brand_*`, `tma_assessments`, `avlagg_assessments`, `feedback`, `bestallningar` (anon read), … och sist `planering_markeringar`, `gps_tracks`, `maskiner`, `maskin_*` (används av förarna dagligen). För varje tabell:
```sql
drop policy "<namn>" on public.<tabell>;
create policy <tabell>_authenticated on public.<tabell> for all to authenticated using (true) with check (true);
```
`using (true)` för `authenticated` är fortfarande vidöppet *inom* företaget; skärp (per roll, per ägare) i ett eget steg efter att anon är stängt.
**Steg 4 — funktioner** (avsnitt 5).

## 5. Inte täckt av tabellgranskningen: funktioner (RPC) som anon kan köra

Verifierat: av 324 funktioner i `public` kan **272 köras av `anon`**, varav **26 är `SECURITY DEFINER`** (de omgår RLS):

`aktuell_medarbetare_id, ar_admin, ar_godkannare, avtal_kör_notify, flytt_ar_last, fordon_kör_notify, fortnox_kör_sync, fyll_dim_fran_trakt, handle_new_user, jamfor_migrationer, koppla_konto_till_medarbetare, koppla_medarbetare_till_konto, kö_ledighet_notis, logg_raderad_markering, maskin_har_manuell_datakalla, maskindata_avbrott, maskindata_lass, maskindata_lass_senaste, maskindata_produktion, maskindata_produktion_senaste, maskindata_tid, min_maskin_id, mina_operator_ids, ratta_flytt, skapa_fakturaunderlag_flytt, stryk_flytt`

Det är **inte** verifierat att de är utnyttjningsbara — flera kontrollerar `ar_admin()` internt (t.ex. `ratta_flytt`, `stryk_flytt`) — men `maskindata_*`, `koppla_*`, `fortnox_kör_sync` och `*_notify` måste läsas en och en. En tätning av tabellerna stänger **inte** det här: en DEFINER-funktion som anon får köra läser och skriver förbi RLS. Åtgärd: `revoke execute on function … from anon, public;` för alla utom `jamfor_migrationer` (se avsnitt 3), efter att varje funktions egen kontroll lästs.

## 6. Ej granskat

- `storage.objects` (buckets `kartbilder`, `utbildningsbevis`, `trakt-inbox`).
- Realtime-publikationer.
- Policies i andra scheman än `public`.
