-- AVVIKELSE SOM BEVIS (Martin 2026-11-04): alla med inloggning (planerare, skördare, skotare) tar ett foto av en skada på trakten —
-- överkörd stenmur, körskador, skadad hänsyn — så att det är dokumenterat VEM som såg den, NÄR och VAR. "Ärlighet lönar sig alltid":
--   • tiden och fotografen sätts av SERVERN, aldrig av klienten (tagen_at är telefonens tid för själva kortet och kan bara ligga bakåt);
--   • raden kan aldrig ändras eller raderas (ingen UPDATE/DELETE-policy + trigger som spärrar), fotot inte heller (bucket utan update/delete);
--   • fotots SHA-256 sparas på raden, så ett utbytt foto syns;
--   • servern räknar själv ut om våra maskiners körspår (hyttspar) gick inom 15 m från platsen FÖRE kortet — appen visar bara det,
--     och påstår aldrig "fanns innan vi kom" (inget spår = appen såg inget, inte att ingen körde där).
-- Additiv: ny tabell, ny bucket, inga ändringar i befintliga tabeller.

create table if not exists public.avvikelse (
  id uuid primary key,                              -- skapas i klienten → kön kan skicka om utan dubbletter
  objekt_id uuid not null references public.objekt(id),
  typ text not null check (typ in ('korskada', 'stenmur', 'hansyn', 'fornlamning', 'annat')),
  kommentar text check (kommentar is null or char_length(kommentar) <= 1000),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  noggrannhet_m double precision,
  foto_sokvag text not null,
  foto_sha256 text not null check (foto_sha256 ~ '^[0-9a-f]{64}$'),
  tagen_at timestamptz not null,                    -- när kortet togs (telefonens tid, aldrig i framtiden)
  skapad_at timestamptz not null default now(),     -- när servern tog emot raden
  skapad_av uuid not null references public.medarbetare(id),
  korspar_fore jsonb not null default '{}'::jsonb   -- servern: våra maskiners körspår inom 15 m före tagen_at
);
create index if not exists avvikelse_objekt_idx on public.avvikelse(objekt_id, tagen_at);

-- Avstånd i meter (haversine) — samma som appens.
create or replace function public.avvikelse_meter(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Våra maskiners körspår vid platsen före en tidpunkt: en post per maskin och roll med första och senaste punkten inom radien.
create or replace function public.avvikelse_korspar_fore(p_objekt uuid, p_lat double precision, p_lng double precision, p_fore timestamptz, p_radie double precision default 15)
returns jsonb language sql stable security definer set search_path = public as $$
  with trakt as (
    select p_objekt as id
    union select o.hor_till_objekt_id from objekt o where o.id = p_objekt and o.hor_till_objekt_id is not null
  ), rader as (
    select h.roll, h.maskin_id, h.points from hyttspar h where h.objekt_id in (select id from trakt)
  ), punkter as (
    select r.roll, r.maskin_id, (p->>'tid')::timestamptz as tid, (p->>'lat')::double precision as lat, (p->>'lng')::double precision as lng
    from rader r, jsonb_array_elements(r.points) p
    where p ? 'tid' and p ? 'lat' and p ? 'lng'
  ), fore as (
    select * from punkter where tid < p_fore
  ), traffar as (
    select roll, maskin_id, min(tid) as forsta, max(tid) as senaste
    from fore
    where lat between p_lat - 0.001 and p_lat + 0.001
      and avvikelse_meter(p_lat, p_lng, lat, lng) <= p_radie
    group by roll, maskin_id
  )
  select jsonb_build_object(
    'radie_m', p_radie,
    'kontrollerat_fore', p_fore,
    'spar_pa_trakten_fore', (select count(*) from fore),
    'traffar', coalesce((select jsonb_agg(jsonb_build_object('roll', roll, 'maskin_id', maskin_id, 'forsta', forsta, 'senaste', senaste) order by forsta) from traffar), '[]'::jsonb)
  )
$$;

-- Servern sätter tid, fotograf och körspårskontrollen. Klienten kan inte påverka dem.
create or replace function public.avvikelse_fore_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_jag uuid := aktuell_medarbetare_id();
begin
  new.skapad_at := now();
  if auth.role() = 'service_role' then
    if new.skapad_av is null then raise exception 'skapad_av krävs' using errcode = '23502'; end if;
  else
    if v_jag is null then raise exception 'Bara medarbetare kan rapportera en avvikelse' using errcode = '42501'; end if;
    new.skapad_av := v_jag;
  end if;
  -- Kortets tid kan aldrig ligga i framtiden (felställd klocka): då gäller serverns tid.
  if new.tagen_at is null or new.tagen_at > now() then new.tagen_at := now(); end if;
  new.korspar_fore := avvikelse_korspar_fore(new.objekt_id, new.lat, new.lng, new.tagen_at);
  return new;
end $$;

create or replace trigger avvikelse_fore_insert before insert on public.avvikelse for each row execute function public.avvikelse_fore_insert();

-- Ett bevis ändras aldrig. Medvetet underhåll: select set_config('app.avvikelse_tillat_andring','on',true); i samma transaktion.
create or replace function public.avvikelse_last()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.avvikelse_tillat_andring', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'En avvikelse kan inte ändras eller tas bort' using errcode = '42501';
end $$;

create or replace trigger avvikelse_last before update or delete on public.avvikelse for each row execute function public.avvikelse_last();

alter table public.avvikelse enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avvikelse' and policyname = 'avvikelse_las') then
    create policy avvikelse_las on public.avvikelse for select to authenticated using (aktuell_medarbetare_id() is not null);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avvikelse' and policyname = 'avvikelse_skapa') then
    create policy avvikelse_skapa on public.avvikelse for insert to authenticated with check (aktuell_medarbetare_id() is not null);
  end if;
end $$;
revoke update, delete, truncate on public.avvikelse from authenticated, anon;
grant select, insert on public.avvikelse to authenticated;
revoke execute on function public.avvikelse_korspar_fore(uuid, double precision, double precision, timestamptz, double precision) from public, anon;
grant execute on function public.avvikelse_korspar_fore(uuid, double precision, double precision, timestamptz, double precision) to authenticated;

-- Fotona: privat bucket, bara ladda upp och läsa — aldrig byta ut eller radera.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avvikelse-foto', 'avvikelse-foto', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avvikelse_foto_ladda_upp') then
    create policy avvikelse_foto_ladda_upp on storage.objects for insert to authenticated
  with check (bucket_id = 'avvikelse-foto' and public.aktuell_medarbetare_id() is not null);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avvikelse_foto_las') then
    create policy avvikelse_foto_las on storage.objects for select to authenticated
  using (bucket_id = 'avvikelse-foto' and public.aktuell_medarbetare_id() is not null);
  end if;
end $$;
