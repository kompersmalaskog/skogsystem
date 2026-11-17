-- Uttaget mäts på trakten (lib/skogsdata/uttag): skördarens stammar mot laserns volym där skördaren gått.
-- 1) kolumnen objekt_skogsdata.uttag (det uträknade, läses av prognosen),
-- 2) skogsdata_stammar: en trakts stammar med position, volym och tid i ETT svar (PostgREST kapar annars vid 1 000 rader).
--    Bara service_role (timjobbet /api/cron/skogsdata).

alter table public.objekt_skogsdata add column if not exists uttag jsonb;

create or replace function public.skogsdata_stammar(p_ids text[])
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'stammar', coalesce(jsonb_agg(jsonb_build_array(latitude, longitude, coalesce(total_volym, 0), extract(epoch from tidpunkt)::bigint) order by tidpunkt, id)
                 filter (where latitude is not null and longitude is not null), '[]'::jsonb),
    'utan', jsonb_build_object(
      'antal', count(*) filter (where latitude is null or longitude is null),
      'vol', coalesce(sum(total_volym) filter (where latitude is null or longitude is null), 0))
  )
  from detalj_stam
  where objekt_id = any(p_ids)
$$;

revoke all on function public.skogsdata_stammar(text[]) from public, anon, authenticated;
grant execute on function public.skogsdata_stammar(text[]) to service_role;
