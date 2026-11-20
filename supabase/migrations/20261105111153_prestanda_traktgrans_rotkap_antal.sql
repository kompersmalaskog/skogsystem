-- Prestanda 2026-11-05 (Martin: "appen är seg och hänger sig ibland").
--
-- 1. objekt_traktgrans: planeringens objektlista läste HELA objekt_geometri vid varje öppning
--    (36 rader, 6,4 MB JSON, i snitt 209 ms, upp till 8 s, 27 000 anrop) men använder bara
--    traktdelarna (_lager = L_TRAKTDEL, lib/objektPlats traktgransRingar). Vyn ger samma
--    FeatureCollection med bara de features och bara _lager i properties: 66 kB.
--    security_invoker: objekt_geometris RLS gäller som förut (utgången session = tomma rader).
create or replace view public.objekt_traktgrans
with (security_invoker = true) as
select g.objekt_id,
       jsonb_build_object(
         'type', 'FeatureCollection',
         'features', coalesce((
           select jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'geometry', f -> 'geometry',
                    'properties', jsonb_build_object('_lager', f -> 'properties' -> '_lager')))
           from jsonb_array_elements(g.geometri -> 'features') f
           where f -> 'properties' ->> '_lager' = 'L_TRAKTDEL'), '[]'::jsonb)
       ) as geometri
from public.objekt_geometri g;

revoke all on public.objekt_traktgrans from anon, authenticated;
grant select on public.objekt_traktgrans to authenticated;

-- 2. rotkap_stockar_antal: berakna_rotkap.py räknade joinbara stockar med EN fråga per objekt
--    vid varje efterberäkning (250 000 anrop, mest använd databastid av alla frågor).
--    Samma villkor, alla objekt i ett anrop (~0,2 s för 66 objekt). Objekt utan stockar saknas i svaret = 0.
create or replace function public.rotkap_stockar_antal(p_objekt_ids text[])
returns table (objekt_id text, antal bigint)
language sql stable
set search_path = public
as $$
  select d.objekt_id, count(*)
  from public.detalj_stock d
  where d.objekt_id = any (p_objekt_ids)
    and d.stem_key is not null
    and d.log_key is not null
  group by d.objekt_id
$$;

revoke all on function public.rotkap_stockar_antal(text[]) from public, anon, authenticated;
grant execute on function public.rotkap_stockar_antal(text[]) to service_role;

-- 3. Redan körda i prod 2026-11-05 med CONCURRENTLY (utan lås) — här bara för att repot ska stämma.
--    Index för import_diameterserie.py finns_i_tabellen (filnamn = …, 163 000 anrop, läste hela tabellen).
create index if not exists idx_stam_diameter_filnamn on public.detalj_stam_diameter (filnamn);
--    Dubblett: detalj_gps_spar_objekt_id_idx (objekt_id, id) täcker samma uppslag. GPS-datan rörs inte.
drop index if exists public.idx_gps_objekt;
