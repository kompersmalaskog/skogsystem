-- Maskinen som maskin, del 2: spärren sitter i DATABASEN (Martin: "inte bara att knappar göms").
--
-- Ett maskinkonto (medarbetare.roll = 'maskin') kan aldrig läsa eller skriva: timmar, arbetsrapporter, lön, ledigheter, personaluppgifter
-- eller ekonomi (kronor). Det görs med en RESTRICTIVE policy per tabell — den läggs OVANPÅ alla policyer som redan finns (de förblir
-- oförändrade och ger fortfarande åtkomst åt alla andra), så en framtida ny "för alla inloggade"-policy aldrig kan öppna tabellen för
-- maskinkontot. Förare och admin berörs inte alls: ar_maskinkonto() är falskt för dem.
--
-- Listan nedan är ALLA tabeller som bär sådant som ett maskinkonto aldrig ska se. Tabeller som inte finns hoppas över (migrationen går att
-- köra på en äldre databas). En ny tabell med personal- eller ekonomidata ska läggas på listan — testet i
-- supabase/tests/maskinkonto_lokal listar den och kontrollerar den mot databasen.

do $$
declare
  t text;
  tabeller text[] := array[
    -- timmar, arbetsrapporter, ledighet
    'arbetsdag', 'arbetsdag_objekt', 'arbetsdag_segment', 'arbetsdag_flytt_borta', 'extra_tid', 'fakt_timmar', 'franvaro', 'vilobrott', 'atk_val',
    'arbetsrapporter', 'ledighet_ansokningar', 'utjamningsperiod', 'gs_avtal',
    -- lön
    'loneunderlag', 'lon_kvittering', 'lonesystem_artikelmappning', 'lonesystem_koppling', 'medarbetare_lonesystem', 'medarbetare_saldo',
    'fortnox_export_logg', 'fortnox_invoice_rows', 'fortnox_sync_state', 'fortnox_voucher_rows', 'km_nattjobb_logg',
    -- personuppgifter
    'medarbetare_certifikat', 'medarbetare_mat', 'utbildning_bevis', 'utbildning_krav', 'utbildning_typ', 'utbildning_pamin_skickad',
    'cert_krav', 'cert_se', 'cert_se_krav', 'anvandare',
    -- ekonomi (kronor)
    'acord_flyttkostnad', 'acord_ovrigt', 'acord_priser', 'acord_skotningsavstand', 'acord_sortiment_tillagg', 'acord_terrang', 'acord_traktstorlek',
    'arbete_timpris', 'maskin_timpris', 'maskin_kostnadsstalle', 'dim_sortiment_pris', 'objekt_ekonomi', 'objekt_priser', 'objekt_prisscenario',
    'ekonomi_rad_override', 'faktura_manuell_rad', 'faktura_rad', 'faktura_rad_val', 'faktura_underlag', 'faktura_vo', 'fakturaunderlag_flytt',
    'bolag', 'inkopare', 'avtal', 'avtal_pamin_skickad', 'bestallningar_historik',
    'hist_forare', 'hist_forare_objekt', 'hist_korrigering', 'hist_maskin', 'hist_objekt', 'hist_rapport', 'hist_skift', 'hist_skotare_koppling', 'hist_stopp'
  ];
begin
  foreach t in array tabeller loop
    if to_regclass('public.' || t) is null then continue; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'maskinkonto_nekar') then continue; end if;
    execute format(
      'create policy maskinkonto_nekar on public.%I as restrictive for all to authenticated using (not (select public.ar_maskinkonto())) with check (not (select public.ar_maskinkonto()))', t);
  end loop;
end $$;

-- medarbetare: ett maskinkonto läser sin EGEN rad (som alla andra, så appen vet vem den är) men ändrar, lägger till och tar aldrig bort något —
-- inte ens sin egen roll. (Maskinens kartlager sparas via RPC:n satt_kartlager, som är en definer-funktion och inte påverkas.)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'medarbetare' and policyname = 'maskinkonto_nekar_ins') then
    create policy maskinkonto_nekar_ins on public.medarbetare as restrictive for insert to authenticated with check (not (select public.ar_maskinkonto()));
    create policy maskinkonto_nekar_upd on public.medarbetare as restrictive for update to authenticated using (not (select public.ar_maskinkonto())) with check (not (select public.ar_maskinkonto()));
    create policy maskinkonto_nekar_del on public.medarbetare as restrictive for delete to authenticated using (not (select public.ar_maskinkonto()));
  end if;
end $$;

-- Lagrade filer: bucketarna avtal och utbildningsbevis läses idag av alla inloggade. storage.objects ägs inte av migrationsrollen i alla
-- projekt — då hoppas raden över med en NOTICE och supabase/manuell/maskinkonto_storage.sql körs i Supabase (Storage › Policies).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'maskinkonto_nekar_filer') then
    create policy maskinkonto_nekar_filer on storage.objects as restrictive for all to authenticated
      using (bucket_id not in ('avtal', 'utbildningsbevis') or not (select public.ar_maskinkonto()))
      with check (bucket_id not in ('avtal', 'utbildningsbevis') or not (select public.ar_maskinkonto()));
  end if;
exception when insufficient_privilege then
  raise notice 'storage.objects: saknar rättighet — kör supabase/manuell/maskinkonto_storage.sql separat';
end $$;
