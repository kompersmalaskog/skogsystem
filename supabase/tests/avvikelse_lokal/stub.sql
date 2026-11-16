-- Stubbar för det migrationen bygger på (lokal Postgres, inte Supabase).
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth; create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create table public.medarbetare (id uuid primary key);
create table public.objekt (id uuid primary key, hor_till_objekt_id uuid);
create table public.hyttspar (id uuid primary key default gen_random_uuid(), objekt_id uuid, maskin_id text, roll text, datum date, points jsonb);
create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('test.roll', true), 'authenticated') $$;
create function public.aktuell_medarbetare_id() returns uuid language sql stable as $$ select nullif(current_setting('test.jag', true), '')::uuid $$;
