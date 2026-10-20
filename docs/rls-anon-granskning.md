# RLS och anon-nyckeln — granskning av `public` (2026-10-20)

**Allt nedan är läsande SQL mot prod (`mxydghzfacbenbgpodex`) 2026-10-20. Inget är ändrat.** Anon-nyckeln ligger i webbläsarbundeln, så "anon" betyder
"vem som helst som öppnar appens JavaScript". Appen kör inloggade användare med session-JWT (`authenticated`); importskripten använder
`SUPABASE_SERVICE_ROLE_KEY` (omgår RLS). Det finns alltså ingen känd legitim användare av `anon`.

## 1. Värst: tabeller UTAN radsäkerhet och med full anon-åtkomst

`pg_class.relrowsecurity = false` och `has_table_privilege('anon', …)` är sant för select, insert, update OCH delete på:

| Tabell | Innehåll | Obs |
|---|---|---|
| **`objekt`** | alla trakter, markägarnamn, telefon, e-post, adress, inköpare | Har fyra policies (`insert/read/update_objekt`, `auth.role() = 'authenticated'`) som är **verkningslösa** — RLS är avstängt. Förut felaktigt rapporterat som "oberörd". |
| `arbetsdag_backup_13jun`, `arbetsdag_backup_operator_20260714` | arbetsdagar per förare | personuppgifter |
| `backup_km_dalarna_20260814`, `backup_km_stefan_juli_20260812` | körsträckor per förare | personuppgifter |
| `backup_ledighet_testrader_20260812` | ledighetsrader | |
| `fakt_tid_test`, `kontroll_baslinje`, `kravprofil`, `markering_delete_logg`, `normalisering_karta` | | |

## 2. Policies som släpper in anon (RLS på, men villkoret är `true`)

Roll `public` omfattar `anon`. Villkor `true` = ingen begränsning.

| Tabell | Policy | Kommando |
|---|---|---|
| `bestallningar` | `Allow anonymous read` (roll `anon`) | SELECT — läser alla beställningsvolymer från Vida |
| `planering_markeringar` | `Anon full access` | ALL |
| `maskiner`, `maskin_ko`, `maskin_service`, `service_paminnelser` | `Allow all …`, `maskin_service_all`, `service_paminnelser_all` | ALL |
| `feedback`, `briefing_status`, `kvittering_status`, `kvittering_reset_logg`, `objekt_kvittering` | `Allow all …` | ALL |
| `brand_brandvakt`, `brand_efterkontroll`, `brand_kontakter`, `brand_samrad`, `brand_tillbud` | `Allow all for anon` | ALL (brand_kontakter: kontaktuppgifter) |
| `tma_assessments`, `avlagg_assessments` | `Allow all for anon` | ALL |
| `detalj_kontroll_stam`, `detalj_kontroll_stock_matpunkt` | `*_read`, `*_write` | SELECT + ALL |
| `gps_tracks` | `Allow all access to gps_tracks` (+ en korrekt authenticated-policy) | ALL |
| `objekt_vagdata` | `vagdata_select` (roller `anon,authenticated`) | SELECT |
| `dim_objekt_sortiment_fonster` | `…_select` | SELECT (skrivning kräver `ar_admin()`, rätt) |

`insert_/update_bestallningar` är **inte** hålet: villkoret är `auth.role() = 'authenticated'`.

## 3. Förslag (INTE körd, inte en migration)

Lagt som text här så att `scripts/vad-slapps.mjs` inte räknar den som väntande. Körs först efter att Martin bekräftat vad som läser dessa tabeller utan inloggning.

```sql
-- A. objekt: slå på RLS så att de befintliga policies börjar gälla. NB: det finns ingen DELETE-policy — Objekt-vyns "Ta bort" (PR #845)
--    kommer då att få 0 rader tillbaka och visa ett fel. Lägg en admin-policy samtidigt:
alter table public.objekt enable row level security;
create policy objekt_delete_admin on public.objekt for delete to authenticated using (ar_admin());

-- B. backup-/testtabellerna: slå på RLS utan policies (= endast service_role), eller ta bort dem.
alter table public.arbetsdag_backup_13jun enable row level security;   -- … samma för de övriga tio tabellerna i avsnitt 1

-- C. För varje tabell i avsnitt 2: byt villkoret true mot authenticated.
drop policy "Allow anonymous read" on public.bestallningar;
-- exempel för en ALL-policy:
--   drop policy "Allow all for anon" on public.tma_assessments;
--   create policy tma_authenticated on public.tma_assessments for all to authenticated using (true) with check (true);
```

## 4. Kontrollera före körning

1. Att ingen sida eller server-route läser dessa tabeller med anon-nyckeln utan session (grep på `createClient(` utan service-nyckel och på publika sidor).
2. Att Vercel-cron och API-routes som behöver skriva använder service-nyckeln (`app/api/*`).
3. Kör `select * from pg_policies` före och efter och spara skillnaden; provkör varje ändring med en `DO`-körning som slutar i `RAISE EXCEPTION`.
4. Upprepa granskningen för `storage.objects` (buckets `kartbilder`, `utbildningsbevis`, `trakt-inbox`) — den här granskningen täcker bara `public`.
