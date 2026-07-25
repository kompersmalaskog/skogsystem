-- ============================================================================
-- vy_objekt_utfall — faktiskt utfall per objekt och roll (skördare/skotare).
--
-- KRITISKT — RÖR INTE dag_h-aggregeringen:
-- g0_h summeras per (maskin_id, datum) i CTE:t dag_h FÖRE join mot volymen.
-- vy_daglig_sammanfattning har FLERA rader per (maskin, datum) (skift/operatörer).
-- En direkt join fakt_produktion/fakt_lass × vy_daglig MULTIPLICERAR tiden.
-- Tas dag_h bort flerdubblas takten (t.ex. 34 -> 96 m3/h, omöjligt).
-- Timmar attribueras per objektets volymandel av maskinens dagsvolym × dagens g0_h.
-- ============================================================================
create or replace view vy_objekt_utfall as
with dag_h as (
  select maskin_id, datum, sum(g0_h) as g0_h
  from vy_daglig_sammanfattning group by maskin_id, datum
),
prod_dag as (
  select maskin_id, datum, sum(volym_m3sub) as dag_vol
  from fakt_produktion group by maskin_id, datum
),
prod_obj as (
  select maskin_id, datum, objekt_id, sum(volym_m3sub) as vol, sum(stammar) as stammar
  from fakt_produktion group by maskin_id, datum, objekt_id
),
skordare as (
  select po.objekt_id, 'skordare'::text as roll, max(po.maskin_id) as maskin_id,
         count(distinct po.datum) as dagar, sum(po.vol) as vol_m3sub, sum(po.stammar) as stammar,
         sum(dh.g0_h * po.vol / nullif(pd.dag_vol, 0)) as timmar
  from prod_obj po
  join prod_dag pd on pd.maskin_id = po.maskin_id and pd.datum = po.datum
  join dag_h    dh on dh.maskin_id = po.maskin_id and dh.datum = po.datum
  group by po.objekt_id
),
lass_dag as (
  select maskin_id, datum, sum(volym_m3sub) as dag_vol from fakt_lass group by maskin_id, datum
),
lass_obj as (
  select maskin_id, datum, objekt_id, sum(volym_m3sub) as vol from fakt_lass group by maskin_id, datum, objekt_id
),
lass_skotvag as (
  select objekt_id, avg(korstracka_m) as skotvag_m from fakt_lass group by objekt_id
),
skotare as (
  select lo.objekt_id, 'skotare'::text as roll, max(lo.maskin_id) as maskin_id,
         count(distinct lo.datum) as dagar, sum(lo.vol) as vol_m3sub, null::bigint as stammar,
         sum(dh.g0_h * lo.vol / nullif(ld.dag_vol, 0)) as timmar
  from lass_obj lo
  join lass_dag ld on ld.maskin_id = lo.maskin_id and ld.datum = lo.datum
  join dag_h    dh on dh.maskin_id = lo.maskin_id and dh.datum = lo.datum
  group by lo.objekt_id
)
select s.objekt_id, s.roll, s.maskin_id, s.dagar, s.vol_m3sub, s.stammar, s.timmar,
       s.vol_m3sub / nullif(s.timmar,0) as takt, s.vol_m3sub / nullif(s.stammar,0) as medelstam, null::numeric as skotvag_m
from skordare s
union all
select k.objekt_id, k.roll, k.maskin_id, k.dagar, k.vol_m3sub, k.stammar, k.timmar,
       k.vol_m3sub / nullif(k.timmar,0) as takt, null::numeric as medelstam, sv.skotvag_m
from skotare k left join lass_skotvag sv on sv.objekt_id = k.objekt_id;
