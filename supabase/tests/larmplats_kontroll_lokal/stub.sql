create extension if not exists pgcrypto;
create table public.objekt (id uuid primary key);
create table public.medarbetare (id uuid primary key, roll text);
create or replace function public.aktuell_medarbetare_id() returns uuid language sql stable as $$ select nullif(current_setting('test.jag', true), '')::uuid $$;
create or replace function public.ar_admin() returns boolean language sql stable as $$ select exists (select 1 from medarbetare where id = aktuell_medarbetare_id() and roll = 'admin') $$;
insert into objekt values ('00000000-0000-0000-0000-0000000000a1');
insert into medarbetare values ('00000000-0000-0000-0000-00000000000d', 'forare'), ('00000000-0000-0000-0000-00000000000e', 'admin');
grant usage on schema public to authenticated, anon;
grant select on objekt, medarbetare to authenticated;
