-- Utfallet bakom G15-förslaget, med skotarens maskin (2026-11-17).
-- Samma rader och tal som prognos_utfall() plus vilken skotare som gjorde jobbet: modellen på den skotare som lade flest G15-timmar
-- på trakten och hur stor del av skotartimmarna den stod för. Provet på 27 avslutade slutavverkningar visade att maskinen förklarar
-- mest av skotarens takt (Wisent ca 15 m3 per G15-timme, Elephant King ca 24) — snittet över alla maskiner låg 27 % fel, per maskin 17 %.
-- prognos_utfall() står kvar orörd (äldre appversioner läser den).
create or replace function public.prognos_utfall_2()
returns table(objekt_id uuid, typ text, volym_objekt numeric, skordad_m3 numeric, stammar bigint, skordare_g15 numeric, skotare_g15 numeric, skotare_modell text, skotare_andel numeric)
language sql stable set search_path to 'public'
as $function$
  with f as (
    select o.id, dm.modell, sum(coalesce(ft.processing_sek, 0) + coalesce(ft.terrain_sek, 0) + coalesce(ft.other_work_sek, 0)) / 3600.0 as h
    from objekt o
    join dim_objekt d on d.vo_nummer = o.vo_nummer
    join fakt_tid ft on ft.objekt_id = d.objekt_id
    join dim_maskin dm on dm.maskin_id = ft.maskin_id
    where o.status = 'avslutat' and dm.maskin_typ = 'Forwarder'
    group by o.id, dm.modell
  ),
  b as (
    select distinct on (id) id, modell, h / nullif(sum(h) over (partition by id), 0) as andel
    from f where h > 0
    order by id, h desc, modell
  )
  select u.objekt_id, u.typ, u.volym_objekt, u.skordad_m3, u.stammar, u.skordare_g15, u.skotare_g15, b.modell, round(b.andel, 3)
  from prognos_utfall() u
  left join b on b.id = u.objekt_id
$function$;

revoke all on function public.prognos_utfall_2() from public, anon;
grant execute on function public.prognos_utfall_2() to authenticated, service_role;
