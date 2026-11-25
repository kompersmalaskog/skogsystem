-- Som Supabase: nya funktioner får execute för anon/authenticated som standard (migrationen ska själv dra tillbaka det).
alter default privileges in schema public grant execute on functions to anon, authenticated;
create table public.objekt (id uuid primary key);
create table public.medarbetare (id uuid primary key, roll text);
create table public.objekt_geometri (id serial primary key, objekt_id uuid references public.objekt(id) on delete cascade, geometri jsonb not null, skapad timestamptz default now());
alter table public.objekt_geometri enable row level security;
create policy las on public.objekt_geometri for select to authenticated using (true);
grant select on public.objekt_geometri to authenticated;
create or replace function public.aktuell_medarbetare_id() returns uuid language sql stable as $$ select nullif(current_setting('test.jag', true), '')::uuid $$;
create or replace function public.ar_admin() returns boolean language sql stable as $$ select exists (select 1 from medarbetare where id = aktuell_medarbetare_id() and roll = 'admin') $$;
grant usage on schema public to authenticated, anon;
grant select on public.objekt, public.medarbetare to authenticated;
insert into public.medarbetare values ('00000000-0000-0000-0000-00000000000d', 'forare'), ('00000000-0000-0000-0000-00000000000e', 'admin');
insert into public.objekt values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');
-- Objekt a1: TRDEL 100 är en MultiPolygon med två delar (100:0, 100:1), TRDEL 200 en Polygon (200:0), en del utan nyckel, plus andra lager som aldrig ska med.
insert into public.objekt_geometri (objekt_id, geometri) values ('00000000-0000-0000-0000-0000000000a1', $j$
{"type":"FeatureCollection","features":[
 {"type":"Feature","properties":{"_lager":"L_TRAKTDEL","TRDEL_ID":100,"TRDEL_NR_K":"0130","FLBESKR":"Gallring"},"geometry":{"type":"MultiPolygon","coordinates":[
   [[[14.470,56.300],[14.472,56.300],[14.472,56.302],[14.470,56.302],[14.470,56.300]]],
   [[[14.474,56.300],[14.476,56.300],[14.476,56.302],[14.474,56.302],[14.474,56.300]]]]}},
 {"type":"Feature","properties":{"_lager":"L_TRAKTDEL","TRDEL_ID":200},"geometry":{"type":"Polygon","coordinates":[[[14.480,56.300],[14.482,56.300],[14.482,56.302],[14.480,56.302],[14.480,56.300]]]}},
 {"type":"Feature","properties":{"_lager":"L_TRAKTDEL","TRDEL_NR_K":" 0777 "},"geometry":{"type":"Polygon","coordinates":[[[14.490,56.300],[14.492,56.300],[14.492,56.302],[14.490,56.302],[14.490,56.300]]]}},
 {"type":"Feature","properties":{"_lager":"L_TRAKTDEL"},"geometry":{"type":"Polygon","coordinates":[[[14.500,56.300],[14.502,56.300],[14.502,56.302],[14.500,56.302],[14.500,56.300]]]}},
 {"type":"Feature","properties":{"_lager":"SV_FASTIGHET","FASTIGHET":"x"},"geometry":{"type":"Polygon","coordinates":[[[14.0,56.0],[14.1,56.0],[14.1,56.1],[14.0,56.0]]]}},
 {"type":"Feature","properties":{"_lager":"L_TILLAGGSYTOR","TYP":24},"geometry":{"type":"Polygon","coordinates":[[[14.0,56.0],[14.1,56.0],[14.1,56.1],[14.0,56.0]]]}}
]}$j$::jsonb);
insert into public.objekt_geometri (objekt_id, geometri) values ('00000000-0000-0000-0000-0000000000a2', '{"type":"FeatureCollection","features":[]}'::jsonb);
