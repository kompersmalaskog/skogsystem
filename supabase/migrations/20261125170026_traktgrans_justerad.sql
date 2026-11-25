-- En sanning för traktgränsen (2026-11-25, Martin: "justerad gräns ska gälla överallt").
--
-- Förut: "Justera gräns" / "Redigera hörn" i planeringsvyn sparar en KOPIA av Vidas traktdel som en boundary-markör i planering_markeringar
-- (fromVidaTd = delens nyckel, path = SVG-x/y mot objektets origo). Allt som läste Vidas gräns via vyn objekt_traktgrans
-- (objektlistans "Här", servrarnas traktanalys och skogsdata) såg därför ALLTID Vidas original — aldrig den justerade gränsen.
--
-- Nu: planeringsvyn skriver de justerade delarnas ring i lng/lat (efter sin egen omräkning av x/y) till objekt_traktgrans_justerad via RPC:n
-- satt_justerad_traktgrans (bara admin). Vyn objekt_traktgrans byter ut precis de Vida-delar som har en justerad kopia (nyckel <TRDEL_ID>:<delindex>,
-- samma som appens partKey) och låter övriga Vida-delar vara. Finns ingen rad är vyn BYTE FÖR BYTE som förut. Radera kopiorna → RPC:n tar bort raden → Vidas gräns gäller igen.
-- Konsumenterna ändras inte i sak: de läser fortfarande objekt_traktgrans. Traktanalys och skogsdata ser en ny gräns (gransAvtryck) och räknar om vid nästa körning.

create table if not exists public.objekt_traktgrans_justerad (
  objekt_id     uuid primary key references public.objekt(id) on delete cascade,
  -- [{ "partKey": "126218:0", "ring": [[lng,lat], …] }] — öppna ringar (utan dubblett-slutpunkt), minst 3 hörn
  delar         jsonb not null check (jsonb_typeof(delar) = 'array' and jsonb_array_length(delar) > 0),
  uppdaterad_at timestamptz not null default now(),
  uppdaterad_av uuid
);

alter table public.objekt_traktgrans_justerad enable row level security;
drop policy if exists traktgrans_justerad_las on public.objekt_traktgrans_justerad;
create policy traktgrans_justerad_las on public.objekt_traktgrans_justerad for select to authenticated using (true);
-- Ingen insert/update/delete-policy: skrivning går bara via satt_justerad_traktgrans (admin) och service_role.
revoke all on public.objekt_traktgrans_justerad from anon, authenticated;
grant select on public.objekt_traktgrans_justerad to authenticated;

create or replace function public.satt_justerad_traktgrans(p_objekt uuid, p_delar jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  p jsonb;
  n int;
begin
  if not public.ar_admin() then
    raise exception 'Bara admin får ändra traktgränsen' using errcode = '42501';
  end if;
  if p_objekt is null then
    raise exception 'objekt saknas' using errcode = '22023';
  end if;
  -- Tom lista (eller null) = inga justerade delar: Vidas gräns gäller igen.
  if p_delar is null or jsonb_typeof(p_delar) <> 'array' or jsonb_array_length(p_delar) = 0 then
    delete from public.objekt_traktgrans_justerad where objekt_id = p_objekt;
    return;
  end if;
  for d in select * from jsonb_array_elements(p_delar) loop
    if jsonb_typeof(d) <> 'object' or coalesce(btrim(d ->> 'partKey'), '') = '' or jsonb_typeof(d -> 'ring') <> 'array' then
      raise exception 'ogiltig del: %', left(d::text, 80) using errcode = '22023';
    end if;
    n := jsonb_array_length(d -> 'ring');
    if n < 3 then
      raise exception 'en yta behöver minst tre hörn (%)', d ->> 'partKey' using errcode = '22023';
    end if;
    for p in select * from jsonb_array_elements(d -> 'ring') loop
      if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2
         or jsonb_typeof(p -> 0) <> 'number' or jsonb_typeof(p -> 1) <> 'number'
         or (p ->> 0)::numeric not between 3 and 32 or (p ->> 1)::numeric not between 50 and 72 then
        raise exception 'orimligt hörn i %: %', d ->> 'partKey', left(p::text, 40) using errcode = '22023';
      end if;
    end loop;
  end loop;
  insert into public.objekt_traktgrans_justerad (objekt_id, delar, uppdaterad_at, uppdaterad_av)
  values (p_objekt, p_delar, now(), public.aktuell_medarbetare_id())
  on conflict (objekt_id) do update
    set delar = excluded.delar, uppdaterad_at = now(), uppdaterad_av = excluded.uppdaterad_av;
end;
$$;

revoke all on function public.satt_justerad_traktgrans(uuid, jsonb) from public, anon;
grant execute on function public.satt_justerad_traktgrans(uuid, jsonb) to authenticated;

-- Vyn: samma form som förut (FeatureCollection med bara L_TRAKTDEL-features och bara _lager i properties).
create or replace view public.objekt_traktgrans
with (security_invoker = true) as
select g.objekt_id,
       jsonb_build_object(
         'type', 'FeatureCollection',
         'features',
         case when j.objekt_id is null then
           -- Ingen justerad kopia: exakt som förut (Vidas features oförändrade).
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'type', 'Feature',
                      'geometry', f -> 'geometry',
                      'properties', jsonb_build_object('_lager', f -> 'properties' -> '_lager')))
             from jsonb_array_elements(g.geometri -> 'features') f
             where f -> 'properties' ->> '_lager' = 'L_TRAKTDEL'), '[]'::jsonb)
         else
           -- Vidas delar (en Polygon per MultiPolygon-del) utom de som har en justerad kopia, plus de justerade delarna.
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'type', 'Feature',
                      'geometry', jsonb_build_object('type', 'Polygon', 'coordinates', p.poly),
                      'properties', jsonb_build_object('_lager', 'L_TRAKTDEL'))
                    order by t.fi, p.idx)
             from jsonb_array_elements(g.geometri -> 'features') with ordinality as t(f, fi)
             cross join lateral (
               select e.poly, e.idx - 1 as idx
               from jsonb_array_elements(
                      case t.f -> 'geometry' ->> 'type'
                        when 'MultiPolygon' then t.f -> 'geometry' -> 'coordinates'
                        when 'Polygon' then jsonb_build_array(t.f -> 'geometry' -> 'coordinates')
                        else '[]'::jsonb end
                    ) with ordinality as e(poly, idx)
             ) p
             where t.f -> 'properties' ->> '_lager' = 'L_TRAKTDEL'
               and not exists (
                 select 1 from jsonb_array_elements(j.delar) jd
                 where jd ->> 'partKey' =
                       coalesce(nullif(btrim(t.f -> 'properties' ->> 'TRDEL_ID'), ''), nullif(btrim(t.f -> 'properties' ->> 'TRDEL_NR_K'), ''))
                       || ':' || p.idx::text)
           ), '[]'::jsonb)
           ||
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'type', 'Feature',
                      'geometry', jsonb_build_object(
                        'type', 'Polygon',
                        'coordinates', jsonb_build_array((jd -> 'ring') || jsonb_build_array((jd -> 'ring') -> 0))),
                      'properties', jsonb_build_object('_lager', 'L_TRAKTDEL'))
                    order by jd ->> 'partKey')
             from jsonb_array_elements(j.delar) jd), '[]'::jsonb)
         end
       ) as geometri
from public.objekt_geometri g
left join public.objekt_traktgrans_justerad j on j.objekt_id = g.objekt_id;

revoke all on public.objekt_traktgrans from anon, authenticated;
grant select on public.objekt_traktgrans to authenticated;
