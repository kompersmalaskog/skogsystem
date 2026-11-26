-- Maskinvyn: skotarens lass ur BÅDA källorna — Opti-filerna (fakt_lass) och appens egna lass (skotar_lass).
--
-- Felet (Martin 2026-11-26): maskinvyn läste bara fakt_lass via maskindata_lass / maskindata_lass_senaste. Elefant 26 och 810E
-- rapporterar lass direkt i appen (skotar_lass + skotar_lass_del + skotar_lass_sortiment) och sidolistan stod på "Senast 2 nov /
-- 10 okt · Ingen körning idag" fast Elefant hade 13 lass / 300 m³ den dagen.
--
-- REGELN för dubbelräkning (Martin 2026-11-26, samma som helikopter_lass och fakturan): per MASKIN + OBJEKT + DAG räknas den
-- källa som har mest volym (appens skalade volym mot Optis volym_m3sub; lika → Opti). Källorna summeras ALDRIG. Det som returneras
-- är enskilda lass ur den källa som vann, så vyerna kan räkna lass, tid på dagen, förare och avstånd.
--   · Appens objekt (uuid + vo_nummer) kopplas till dim_objekt med SAMMA uppslag som helikopter_lass (exakt objekt_id eller
--     vo_nummer, maskinens eget maskinobjekt `<maskin>_…` före övriga). Ett lass som inte går att koppla behålls med objekt_id
--     NULL (helikoptern tappar dem) — hellre ett lass på "okänt objekt" än ett som försvinner ur lasstalen.
--   · Appens lass räknas bara när de är KLARA: status 'bekraftat' och inte automatiskt skapade (vyn skotar_lass_sortiment_skalat
--     har redan det villkoret — EN regel, `raknasSomSkotat` i lib/skotarLass/lassModell.ts).
--   · Volym per app-lass = m3_skalat (förarens m³ × faktorn ur Färdigskotad, 1 när trakten inte avslutats), volym_forare = det
--     föraren själv skrev, `skalad` = true när de skiljer sig (klienten visar "skalad" respektive "uppskattad").
--   · Lassets tid = tidigaste lossningen bland delarna (lossad_tid), dagen = svensk dag; ett lass med flera delar är ETT lass.
--   · skotar_trakt_avslut.tillagg (volym utan lass) tas INTE med — det är volym utan lass och utan tid. Helikoptern lägger den på
--     avslutsdagen; maskinvyn räknar lass.
-- Opti-rader har lass_id/medarbetare_id NULL, app-rader operator_id/korstracka_m NULL (klienten räknar avstånd bara på lass som har
-- ett mått och kopplar förare via operator_medarbetare resp. medarbetare_id).
-- Ordningen är total (datum, tid, maskin, källa, id) så PostgREST-pagineringen (.range) aldrig tappar eller dubblar rader.
--
-- Additiv: två nya funktioner, inget befintligt rörs (maskindata_lass / maskindata_lass_senaste finns kvar för övriga läsare).

create or replace function public.maskindata_lass_alla(
  p_maskin_ids  text[],
  p_datum_start date default null,
  p_datum_slut  date default null
)
returns table(
  datum          date,
  maskin_id      text,
  operator_id    text,
  lossnings_tid  timestamptz,
  volym_m3sub    numeric,
  korstracka_m   numeric,
  objekt_id      text,
  kalla          text,
  lass_id        uuid,
  medarbetare_id uuid,
  volym_forare   numeric,
  skalad         boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with app_lass as (
    select l.id as lass_id, l.maskin_id, l.vo_nummer, l.medarbetare_id,
           min(r.lossad_tid) as lossad_tid,
           sum(r.m3_forare)  as m3_forare,
           sum(r.m3_skalat)  as m3_skalat
    from skotar_lass_sortiment_skalat r
    join skotar_lass l on l.id = r.lass_id
    where l.maskin_id = any(p_maskin_ids) and r.lossad_tid is not null
    group by l.id, l.maskin_id, l.vo_nummer, l.medarbetare_id
  ),
  app as (
    select a.*,
           (a.lossad_tid at time zone 'Europe/Stockholm')::date as dag,
           (select d.objekt_id
              from dim_objekt d
             where d.objekt_id = a.vo_nummer or btrim(d.vo_nummer) = btrim(a.vo_nummer)
             order by (d.objekt_id = a.vo_nummer) desc,
                      (d.objekt_id like a.maskin_id || '\_%') desc,
                      d.objekt_id
             limit 1) as objekt_id
    from app_lass a
  ),
  app_f as (
    select * from app
    where (p_datum_start is null or dag >= p_datum_start)
      and (p_datum_slut  is null or dag <= p_datum_slut)
  ),
  opti as (
    select f.id, f.datum, f.maskin_id, f.operator_id, f.lossnings_tid, f.volym_m3sub,
           f.korstracka_m::numeric as korstracka_m, f.objekt_id
    from fakt_lass f
    where f.maskin_id = any(p_maskin_ids)
      and (p_datum_start is null or f.datum >= p_datum_start)
      and (p_datum_slut  is null or f.datum <= p_datum_slut)
  ),
  -- Nyckeln är text (NULL-objekt → '~'): en FULL JOIN kräver hash-/merge-bara villkor, och IS NOT DISTINCT FROM är inget av dem.
  opti_sum as (
    select maskin_id, coalesce(objekt_id, '~') as okey, datum, sum(volym_m3sub) as m3
    from opti group by 1, 2, 3
  ),
  app_sum as (
    select maskin_id, coalesce(objekt_id, '~') as okey, dag as datum, sum(m3_skalat) as m3
    from app_f group by 1, 2, 3
  ),
  vinnare as (
    select coalesce(o.maskin_id, a.maskin_id) as maskin_id,
           coalesce(o.okey, a.okey)           as okey,
           coalesce(o.datum, a.datum)         as datum,
           case when o.m3 is null then 'app'
                when a.m3 is null then 'opti'
                when a.m3 > o.m3  then 'app'
                else 'opti' end               as kalla
    from opti_sum o
    full join app_sum a on a.maskin_id = o.maskin_id and a.okey = o.okey and a.datum = o.datum
  )
  select x.datum, x.maskin_id, x.operator_id, x.lossnings_tid, x.volym_m3sub, x.korstracka_m, x.objekt_id,
         x.kalla, x.lass_id, x.medarbetare_id, x.volym_forare, x.skalad
  from (
    select o.datum, o.maskin_id, o.operator_id, o.lossnings_tid, o.volym_m3sub, o.korstracka_m, o.objekt_id,
           'opti'::text as kalla, null::uuid as lass_id, null::uuid as medarbetare_id,
           o.volym_m3sub as volym_forare, false as skalad, o.id::text as sortid
    from opti o
    join vinnare v on v.kalla = 'opti' and v.maskin_id = o.maskin_id and v.okey = coalesce(o.objekt_id, '~') and v.datum = o.datum
    union all
    select a.dag, a.maskin_id, null::text, a.lossad_tid, a.m3_skalat, null::numeric, a.objekt_id,
           'app'::text, a.lass_id, a.medarbetare_id,
           a.m3_forare, (abs(a.m3_skalat - a.m3_forare) > 0.0005), a.lass_id::text
    from app_f a
    join vinnare v on v.kalla = 'app' and v.maskin_id = a.maskin_id and v.okey = coalesce(a.objekt_id, '~') and v.datum = a.dag
  ) x
  order by x.datum, x.lossnings_tid nulls last, x.maskin_id, x.kalla, x.sortid
$function$;

-- Senaste lossningen över båda källorna: dagen med senast lass (båda källorna), sedan det senaste lasset den dagen ur det som
-- räknas (efter regeln ovan). Inga lass alls → inga rader (INTE alla rader: NULL som datumgräns betyder "obegränsat").
create or replace function public.maskindata_lass_senaste_alla(p_maskin_ids text[])
returns table(datum date, lossnings_tid timestamptz, kalla text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with d as (
    select greatest(
      (select max(f.datum) from fakt_lass f where f.maskin_id = any(p_maskin_ids)),
      (select max((r.lossad_tid at time zone 'Europe/Stockholm')::date)
         from skotar_lass_sortiment_skalat r
         join skotar_lass l on l.id = r.lass_id
        where l.maskin_id = any(p_maskin_ids) and r.lossad_tid is not null)
    ) as dag
  )
  select x.datum, x.lossnings_tid, x.kalla
  from d, lateral public.maskindata_lass_alla(p_maskin_ids, d.dag, d.dag) x
  where d.dag is not null
  order by x.lossnings_tid desc nulls last
  limit 1
$function$;

revoke execute on function public.maskindata_lass_alla(text[], date, date) from public, anon;
revoke execute on function public.maskindata_lass_senaste_alla(text[])     from public, anon;
grant  execute on function public.maskindata_lass_alla(text[], date, date) to authenticated, service_role;
grant  execute on function public.maskindata_lass_senaste_alla(text[])     to authenticated, service_role;
