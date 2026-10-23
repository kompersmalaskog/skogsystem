-- Minimal efterbildning av prod för att prova säkerhetsmigrationerna med RIKTIGA roller och RLS (inte Supabase själv).
-- Policyerna är kopierade ur pg_policies i prod 2026-10-23. Körs av run.sh mot en tom databas.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema auth;
create function auth.uid()  returns uuid language sql stable as $$ select nullif(current_setting('test.uid',  true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.medarbetare (
  id uuid primary key default gen_random_uuid(), user_id uuid, namn text not null, epost text not null, telefon text,
  hemadress text, bt_bil text, maskin_id text, roll text default 'förare', aktiv boolean default true,
  timlon_kr numeric, manadslon_kr numeric, anstallningsdatum date, hem_lat numeric, hem_lng numeric,
  pamin_obekraftad_min int default 30, pamin_pagaende_min int default 180, daglig_pamin_aktiv boolean default true,
  daglig_pamin_tid time default '18:00', push_aktiv boolean default true,
  friskvard_budget_total numeric, friskvard_budget_anvant numeric default 0,
  anhorig_namn text, anhorig_telefon text, anhorig_relation text, partner_user_id uuid,
  foretagsledare boolean not null default false, ledighet_sett_at timestamptz not null default now(), kartlager text
);
create function public.aktuell_medarbetare_id() returns uuid language sql stable security definer set search_path = public
  as $$ select id from medarbetare where user_id = auth.uid() limit 1 $$;
create function public.ar_admin() returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from medarbetare where user_id = auth.uid() and roll = 'admin') $$;

alter table public.medarbetare enable row level security;
create policy medarbetare_admin_delete on public.medarbetare for delete to authenticated using (ar_admin());
create policy medarbetare_admin_insert on public.medarbetare for insert to authenticated with check (ar_admin());
create policy medarbetare_select on public.medarbetare for select to authenticated using ((user_id = (select auth.uid())) or (select ar_admin()));
create policy medarbetare_update on public.medarbetare for update to authenticated using ((user_id = (select auth.uid())) or (select ar_admin()))
  with check ((user_id = (select auth.uid())) or (select ar_admin()));
grant select, insert, update, delete on public.medarbetare to authenticated, service_role;

-- Prods två triggrar (förenklade): hemadress nollar punkten, koppla sätter user_id ur en "auth.users"-uppslagning.
create function public.hemadress_andrad() returns trigger language plpgsql as $$
begin if tg_op = 'UPDATE' and new.hemadress is distinct from old.hemadress then new.hem_lat := null; new.hem_lng := null; end if; return new; end $$;
create trigger hemadress_andrad before insert or update of hemadress on public.medarbetare for each row execute function public.hemadress_andrad();
create function public.koppla_konto_till_medarbetare() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger koppla_konto_vid_medarbetare before insert or update of epost on public.medarbetare for each row execute function public.koppla_konto_till_medarbetare();

-- Prods DEFINER-funktioner som en förare anropar och som skriver på sin egen rad.
create function public.ledighet_markera_sett(p_till timestamptz) returns void language sql security definer set search_path = public
  as $$ update medarbetare set ledighet_sett_at = p_till where user_id = auth.uid() $$;
create function public.satt_kartlager(p_lager text) returns void language sql security definer set search_path = public
  as $$ update medarbetare set kartlager = p_lager where user_id = auth.uid() $$;
grant execute on function public.ledighet_markera_sett(timestamptz), public.satt_kartlager(text) to authenticated;

-- Storage
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
insert into storage.buckets (id, name, public) values ('audio', 'audio', true), ('ytfoto', 'ytfoto', true);
-- Prods publika audio-policyer (de som ska bort) + ytfoto som kontroll att annat inte rörs.
create policy "Allow public delete from audio" on storage.objects for delete to public using (bucket_id = 'audio');
create policy "Allow public read from audio"   on storage.objects for select to public using (bucket_id = 'audio');
create policy "Allow public upload to audio"   on storage.objects for insert to public with check (bucket_id = 'audio');
create policy "storage_las_publik"             on storage.objects for select to public using (bucket_id = 'audio');
create policy "storage_uppdatera_publik"       on storage.objects for update to public using (bucket_id = 'audio');
create policy "ytfoto_las_publik"              on storage.objects for select to public using (bucket_id = 'ytfoto');

insert into storage.objects (bucket_id, name, owner) values ('audio', 'gammal/ljud.webm', null), ('ytfoto', 'yta/foto.jpg', null);

-- Personer: admin A, förare F1 och F2, och en inloggad UTAN medarbetarrad (U).
insert into public.medarbetare (id, user_id, namn, epost, roll, timlon_kr, hemadress, hem_lat) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Admin',  'admin@x.se',  'admin',  300, 'Hem 1', 56.1),
  ('f0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Förare1', 'f1@x.se',    'forare', 200, 'Hem 2', 56.2),
  ('f0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Förare2', 'f2@x.se',    'forare', 210, 'Hem 3', 56.3);

create schema test;
create function test.forvanta(namn text, villkor boolean) returns void language plpgsql as $$
begin if villkor is not true then raise exception 'FEL: %', namn; end if; raise notice 'ok: %', namn; end $$;
-- Kör en sats som den som anropar (roll + uid) och svarar med antal berörda rader, eller 'fel:<sqlstate>'.
create function test.som(vem text, sats text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('test.uid',  case vem when 'admin' then '11111111-1111-1111-1111-111111111111' when 'f1' then '22222222-2222-2222-2222-222222222222'
                                   when 'f2' then '33333333-3333-3333-3333-333333333333' when 'u' then '99999999-9999-9999-9999-999999999999' else '' end, true);
  perform set_config('test.role', case vem when 'anon' then 'anon' when 'service' then 'service_role' when 'sql' then '' else 'authenticated' end, true);
  execute 'set local role ' || case vem when 'anon' then 'anon' when 'service' then 'service_role' when 'sql' then 'postgres' else 'authenticated' end;
  begin
    execute sats;
    get diagnostics n = row_count;
    reset role;
    return n::text;
  exception when others then
    reset role;
    return 'fel:' || sqlstate;
  end;
end $$;
grant usage on schema test to public;
