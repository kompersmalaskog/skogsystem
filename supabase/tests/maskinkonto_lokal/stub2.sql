-- Tillägg till #1215:s stub (stub.sql i forare_fran_opti_lokal): auth-funktioner, RLS på medarbetare, hjälpfunktionerna och ALLA spärrade
-- tabeller. Varje spärrad tabell får den VÄRSTA tänkbara tillåtande policyn (öppen för alla inloggade, läsa och skriva) — nekar spärren då
-- ändå, nekar den under varje verklig policy. Seed: en rad per tabell, inlagd som superanvändare.
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
grant usage on schema auth to authenticated, service_role, anon;
grant execute on function auth.uid(), auth.role() to authenticated, service_role, anon;
grant usage on schema public to authenticated, service_role, anon;

create table dim_maskin (maskin_id text primary key, visningsnamn text);
insert into dim_maskin values ('R64428', 'H8E -26'), ('A130743', 'Elefant 26');

alter table ledighet_ansokningar add column typ text;  -- prodens kolumn; behövs av maskin_ledighet (del 4)
alter table medarbetare add column user_id uuid unique;
alter table medarbetare add column epost text;
alter table medarbetare add column timlon_kr numeric;
alter table medarbetare add column telefon text;
alter table medarbetare add column kartlager text;
create function ar_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from medarbetare where user_id = auth.uid() and roll = 'admin') $$;
create function aktuell_medarbetare_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from medarbetare where user_id = auth.uid() limit 1 $$;
create function korvy_min_medarbetare() returns uuid language sql stable security definer set search_path = public as $$
  select id from medarbetare where user_id = auth.uid() limit 1 $$;
grant execute on all functions in schema public to authenticated, service_role;

-- medarbetare: exakt prodens policyer.
alter table medarbetare enable row level security;
create policy medarbetare_admin_delete on medarbetare for delete to authenticated using (ar_admin());
create policy medarbetare_admin_insert on medarbetare for insert to authenticated with check (ar_admin());
create policy medarbetare_select on medarbetare for select to authenticated using (user_id = (select auth.uid()) or (select ar_admin()));
create policy medarbetare_update on medarbetare for update to authenticated using (user_id = (select auth.uid()) or (select ar_admin()))
  with check (user_id = (select auth.uid()) or (select ar_admin()));
grant select, insert, update, delete on medarbetare to authenticated;

-- Skrivtabellerna maskinen SKA kunna skriva (som i prod: öppna för inloggade).
create table hyttspar (id uuid primary key default gen_random_uuid(), objekt_id uuid, maskin_id text, roll text, datum date default current_date);
alter table skotar_lass add column objekt_id uuid, add column registrerad_av uuid, add column forare_kalla text;
alter table korvy_kvittens_forare add column utford_av uuid, add column utford_kalla text, add column maskin_id text;
alter table kommentar_sett_forare add column utford_av uuid, add column utford_kalla text, add column maskin_id text;
alter table objekt_besok_kvittens add column registrerad_av uuid, add column forare_kalla text;
create table objekt (id uuid primary key default gen_random_uuid(), namn text);
create table planering_markeringar (id uuid primary key default gen_random_uuid(), objekt_id uuid, data jsonb);
create table dim_objekt (objekt_id text primary key, object_name text);
create table fakt_produktion (id serial primary key, maskin_id text, volym numeric);
create table fakt_tid (id serial primary key, maskin_id text, processing_sek int);
create table maskin_ko (id serial primary key, maskin_id text);
do $$ declare t text; begin
  foreach t in array array['hyttspar','skotar_lass','korvy_kvittens_forare','kommentar_sett_forare','objekt','planering_markeringar','dim_objekt','fakt_produktion','fakt_tid','maskin_ko','dim_maskin'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy oppen on %I for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;

-- Spärrade tabeller (samma lista som migrationen — testet kontrollerar att migrationen ger exakt dem).
create table sparrade (tabell text primary key);
insert into sparrade values
 ('arbetsdag'),('arbetsdag_objekt'),('arbetsdag_segment'),('arbetsdag_flytt_borta'),('extra_tid'),('fakt_timmar'),('franvaro'),('vilobrott'),('atk_val'),
 ('arbetsrapporter'),('ledighet_ansokningar'),('utjamningsperiod'),('gs_avtal'),
 ('loneunderlag'),('lon_kvittering'),('lonesystem_artikelmappning'),('lonesystem_koppling'),('medarbetare_lonesystem'),('medarbetare_saldo'),
 ('fortnox_export_logg'),('fortnox_invoice_rows'),('fortnox_sync_state'),('fortnox_voucher_rows'),('km_nattjobb_logg'),
 ('medarbetare_certifikat'),('medarbetare_mat'),('utbildning_bevis'),('utbildning_krav'),('utbildning_typ'),('utbildning_pamin_skickad'),
 ('cert_krav'),('cert_se'),('cert_se_krav'),('anvandare'),
 ('acord_flyttkostnad'),('acord_ovrigt'),('acord_priser'),('acord_skotningsavstand'),('acord_sortiment_tillagg'),('acord_terrang'),('acord_traktstorlek'),
 ('arbete_timpris'),('maskin_timpris'),('maskin_kostnadsstalle'),('dim_sortiment_pris'),('objekt_ekonomi'),('objekt_priser'),('objekt_prisscenario'),
 ('ekonomi_rad_override'),('faktura_manuell_rad'),('faktura_rad'),('faktura_rad_val'),('faktura_underlag'),('faktura_vo'),('fakturaunderlag_flytt'),
 ('bolag'),('inkopare'),('avtal'),('avtal_pamin_skickad'),('bestallningar_historik'),
 ('hist_forare'),('hist_forare_objekt'),('hist_korrigering'),('hist_maskin'),('hist_objekt'),('hist_rapport'),('hist_skift'),('hist_skotare_koppling'),('hist_stopp');
do $$ declare t text; begin
  for t in select tabell from sparrade loop
    execute format('create table if not exists %I (id serial primary key, medarbetare_id uuid, data text)', t);
    execute format('alter table %I add column if not exists data text', t);
    execute format('alter table %I add column if not exists medarbetare_id uuid', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy varsta on %I for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('insert into %I (medarbetare_id, data) values (gen_random_uuid(), %L)', t, 'rad');
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;

-- Lagrade filer: bucketarna avtal och utbildningsbevis läses i prod av alla inloggade.
create schema storage;
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create policy las_alla on storage.objects for select to authenticated using (true);
create policy skriv_alla on storage.objects for insert to authenticated with check (true);
grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated; grant usage on all sequences in schema storage to authenticated;
insert into storage.objects (bucket_id, name) values ('avtal', 'a.pdf'), ('utbildningsbevis', 'b.pdf'), ('audio', 'c.webm');
