-- G15 PER ARBETSDAG PER MASKIN för helikopterns kapacitet (/helikopter och /helikopter-v2).
-- Körd i prod 2026-10-17 (version 20261017095851) och verifierad: Wisent 6,36 · Giant 7,09 · H8E -26 7,36 · Elefant 26 7,59. Idempotent (create or replace). Läser bara — ändrar ingen data.
--
-- Varför: prognosfälten är G15-timmar (Klar med trakten?), så kapaciteten måste vara uppmätt G15 per arbetsdag — inte "8 h dagtid". Uppmätt G15 per arbetsdag ligger på
-- 6,4–7,6 h/dag (12 mån), inte 8: 8 h överskattade kapaciteten med 5–20 % (Wisent 6,4).
--
-- DEFINITION. Fönstret är de senaste p_manader månaderna före p_idag. Nämnaren är maskinens ARBETSDAGAR i helikopterns egen mening (helikopter_ny_ar_arbetsdag:
-- vardagar utan röda dagar), minus dagar maskinen har registrerat maskinstopp, och bara från och med maskinens första G15-dag (en ny maskin straffas inte för tiden före).
-- Täljaren är all uppmätt G15 de dagarna (processing + terräng + övrigt arbete, samma definition som lib/g15.ts). Alltså G15 per ARBETSDAG, inte per körd dag:
-- flyttdagar, service, regn och glapp mellan trakter ligger redan i talet. Dra INTE av flyttid separat — det vore dubbelräkning.
-- Maskiner utan fakt_tid (810E, manuell) finns inte i svaret; klienten räknar dem som "ej mätt" (8 h).
--
-- Verifierat mot prod 2026-10-17 (SELECT-kroppen körd, p_idag = 2026-10-17, 12 mån): Wisent 6,36 (237 dagar) · Elefant 26 7,59 (47) · Giant 7,09 (237) · H8E -26 7,36 (134, från 2026-03-12).

create or replace function public.helikopter_ny_g15_per_arbetsdag(p_idag date default current_date, p_manader integer default 12)
returns table (
  maskin_id    text,
  g15_tim      numeric,
  dagar        integer,
  g15_per_dag  numeric,
  fran         date,
  till         date
)
language sql
stable
security invoker
set search_path = public
as $$
  with fonster as (
    select (p_idag - make_interval(months => p_manader))::date as fran, (p_idag - 1) as till
  ),
  m as (
    select ft.maskin_id, min(ft.datum) as forsta
    from fakt_tid ft
    join dim_maskin dm on dm.maskin_id = ft.maskin_id
    where dm.maskin_typ in ('Harvester', 'Forwarder')
    group by ft.maskin_id
  ),
  dag as (
    select d::date as datum
    from fonster f, generate_series(f.fran, f.till, interval '1 day') d
    where helikopter_ny_ar_arbetsdag(d::date)
  ),
  g as (
    select ft.maskin_id, ft.datum,
           sum(coalesce(ft.processing_sek, 0) + coalesce(ft.terrain_sek, 0) + coalesce(ft.other_work_sek, 0)) / 3600.0 as g15
    from fakt_tid ft
    group by ft.maskin_id, ft.datum
  ),
  stoppad as (
    select sm.maskin_id, dg.datum
    from stopp s
    join stopp_maskin sm on sm.stopp_id = s.id
    join dag dg on dg.datum between s.fran_datum and s.till_datum
  )
  select m.maskin_id,
         coalesce(sum(g.g15), 0)::numeric,
         count(*)::int,
         (coalesce(sum(g.g15), 0) / nullif(count(*), 0))::numeric,
         min(dag.datum),
         max(dag.datum)
  from m
  cross join dag
  left join g on g.maskin_id = m.maskin_id and g.datum = dag.datum
  where dag.datum >= m.forsta
    and not exists (select 1 from stoppad st where st.maskin_id = m.maskin_id and st.datum = dag.datum)
  group by m.maskin_id
$$;

grant execute on function public.helikopter_ny_g15_per_arbetsdag(date, integer) to authenticated;

-- Kvitto (kör efter migrationen):
--   select * from public.helikopter_ny_g15_per_arbetsdag(current_date, 12);   -- Wisent ≈ 6,4 · Giant ≈ 7,1 · H8E -26 ≈ 7,4 · Elefant 26 ≈ 7,6
