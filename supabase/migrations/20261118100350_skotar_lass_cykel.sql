-- SKOTNINGSAVSTÅNDET UR HYTTSPÅRET, inte ur lassets egen spårkopia.
--
-- VARFÖR (mätt i prod 2026-11-18, inget antaget)
--
-- `skotar_lass.spar` ska enligt sin egen dokumentation vara "spårdelen sedan
-- förra lossningen". Den är det inte: utturen fattas. Avståndet från varje
-- lossning till nästa lass FÖRSTA spårpunkt, snitt per trakt:
--
--   Skälviken   279 m    (75 av 84 lass fattar mer än 50 m)
--   Arvidstorp  131 m    (12 av 21)
--   Ljuvadal     82 m    (6 av 9)
--   Steglehylte  71 m    (5 av 15)
--   Mölleryd     43 m    (9 av 37)
--
-- Punkterna FINNS — i `hyttspar`. Kontrollerat på Skälvikens lass 4: lossning
-- 2026-10-27 08:30:09, nästa spår börjar 08:37:13 redan 246 m ut, och
-- hyttspåret har 21 punkter i exakt det glappet, 73–241 m från avlägget.
-- Varför klientens buffert tappar dem är inte utrett (Steglehylte har inget
-- bortfall alls — samma kod), och den här funktionen behöver inte veta det:
-- den läser källan som har punkterna, och lagar därmed historiken också.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CYKEL ÷ 2 ÄR INTE EN GISSNING — DET ÄR FÖRETAGETS EGEN PRAXIS
--
-- Optis `DistanceFromLastUnloading` (fakt_lass.korstracka_m) är hela cykeln:
-- ut, kryssa medan lasset fylls, hem, och sortera vid avlägget. Martins två
-- handinskrivna avstånd ligger på exakt halva den:
--
--   Brokamåla   handinskrivet 450 m   Opti volymviktat 909 / 2 = 455   (−5 m)
--   Tjuvön      handinskrivet 200 m   Opti 431 / 2 = 215               (−15 m)
--
-- Och Brokamåla fakturerades på 450 m = 12 kr/m³fub, faktura 2026140, som
-- stämmer exakt mot vad Vida betalat. Vida har alltså redan betalt en faktura
-- byggd på cykel ÷ 2.
--
-- Funktionen returnerar därför HELA cykeln. Halveringen sker vid användning,
-- i lib/skotningsavstand `skotningsavstandM` — aldrig här, aldrig två gånger.
-- ─────────────────────────────────────────────────────────────────────────
--
-- DELARNA är granskningsinfo, inte pris. `vid_avlagget_m` är Martins
-- förhandlingsunderlag mot Vida: körning inom AVLAGG_ZON_M från lossningen är
-- sortering och läggning, inte skotning, och den är 138–250 m per lass (på
-- Mölleryd 180 av 453 m, alltså 40 % av hela cykeln). Priset räknas ändå på
-- hela cykeln, eftersom Opti gör det och Vida har betalt det.
--
-- INGEN CYKEL är ärligare än en gissad: `skal` säger varför.
--   forsta_lasset      — inget föregående lass att mäta från
--   fonster_for_langt  — över MAX_FONSTER_H sedan förra lossningen (natt, rast,
--                        maskinflytt). Dagens första lass hamnar här.
--   inga_punkter       — hyttspåret har inget i fönstret (appen loggade inte)
--   saknar_lossning    — lasset har ingen lossningstid eller -position
-- Sådana lass bidrar med 0 kr, vilket gör talet försiktigt, inte fel.

-- MÅSTE vara STRICT. `least(1, NULL)` är 1 i Postgres, inte NULL: least och
-- greatest hoppar över NULL-argument. Utan strict gav ett anrop med en
-- NULL-koordinat — lag() på första raden i en partition — asin(1) = π/2,
-- alltså π × jordradien = 20 015 114 m. Ett halvt jordomlopp per lass, och
-- `where d is not null` fångade det INTE, för resultatet var inte null.
-- Uppmätt i prod 2026-11-18 innan talet nådde något pris. Ta aldrig bort strict.
--
-- Samma jordradie som lib/geoMat.metersBetween (6371008.8), så SQL och TS ger
-- samma meter för samma punkter.
create or replace function public.skotar_hav_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable strict parallel safe
as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

comment on function public.skotar_hav_m is
  'Haversine i meter, samma jordradie (6371008.8) som lib/geoMat.metersBetween. STRICT: NULL in ger NULL ut — least(1, NULL) är 1 i Postgres och gav annars π × jordradien.';

create or replace function public.skotar_lass_cykel(p_vo text[])
returns table (
  lass_id uuid,
  vo_nummer text,
  maskin_id text,
  datum date,
  volym numeric,
  cykel_m double precision,
  punkter integer,
  vid_avlagget_m double precision,
  hem_med_lass_m double precision,
  ytterst_m double precision,
  skal text
)
language sql
stable
security invoker
set search_path = public
as $$
with konst as (
  -- Rörelse inom så här nära lossningen är arbete VID avlägget, inte skotning.
  -- Måste stämma med CYKEL.AVLAGG_ZON_M i lib/faktura/lassCykel.ts.
  select 60::double precision as avlagg_zon_m,
         interval '3 hours'   as max_fonster
),
lass as (
  select sl.id, sl.vo_nummer, sl.objekt_id, sl.maskin_id, sl.datum,
    coalesce((select sum(ls.m3_forare) from skotar_lass_sortiment ls where ls.lass_id = sl.id), 0)::numeric v,
    (select max(d.lossad_tid) from skotar_lass_del d where d.lass_id = sl.id) losstid,
    (select avg(d.lat) from skotar_lass_del d where d.lass_id = sl.id) dla,
    (select avg(d.lng) from skotar_lass_del d where d.lass_id = sl.id) dlo
  from skotar_lass sl
  where sl.vo_nummer = any(p_vo)
    and sl.status = 'bekraftat'
    and sl.bekraftad_av is distinct from 'auto'
),
fonster as (
  select l.*,
    lag(l.losstid) over (partition by l.vo_nummer, l.maskin_id order by l.losstid, l.id) fran
  from lass l
),
bedomt as materialized (
  select f.*, k.avlagg_zon_m, k.max_fonster,
    case
      when f.losstid is null or f.dla is null or f.dlo is null then 'saknar_lossning'
      when f.fran is null then 'forsta_lasset'
      when f.losstid - f.fran > k.max_fonster then 'fonster_for_langt'
      else 'ok'
    end as grund
  from fonster f cross join konst k
),
-- Hyttspåret expanderas EN gång per objekt och maskin, inte en gång per lass:
-- Skälviken har 12 000 punkter och 85 lass, och en expansion per lass är en
-- miljon rader genom jsonb_array_elements. Dagsfiltret kapar spår som inte kan
-- ligga i något fönster. MATERIALIZED så planeraren inte inlinar den i pt.
hp as materialized (
  select hs.objekt_id, hs.maskin_id, p.la, p.lo, p.tid
  from hyttspar hs
  cross join lateral (
    select (q.p->>'lat')::double precision la,
           (q.p->>'lng')::double precision lo,
           (q.p->>'tid')::timestamptz      tid
    from jsonb_array_elements(hs.points) q(p)
  ) p
  where hs.roll = 'skotare'
    and exists (
      select 1 from bedomt b
      where b.grund = 'ok' and b.objekt_id = hs.objekt_id and b.maskin_id = hs.maskin_id
        and hs.datum between b.datum - 1 and b.datum + 1
    )
),
pt as materialized (
  select b.id, b.avlagg_zon_m, hp.tid, hp.la, hp.lo,
    skotar_hav_m(hp.la, hp.lo, b.dla, b.dlo) fran_loss,
    row_number() over (partition by b.id order by hp.tid) rn
  from bedomt b
  join hp on hp.objekt_id = b.objekt_id and hp.maskin_id = b.maskin_id
  where b.grund = 'ok' and hp.tid > b.fran and hp.tid <= b.losstid
),
-- VÄNDPUNKTEN ÄR ETT FÖNSTER, INTE EN JOIN. Den låg förut i en egen CTE som
-- `seg` joinade mot, och planeraren — som tror pt har 1 rad, eftersom estimatet
-- för hp är 11 mot 11 998 faktiska — valde en nested loop och räknade om
-- vändpunkten EN GÅNG PER PUNKT: 9 245 varv à 4 800 sorterade rader, 43
-- miljoner rader, 24 s för en enda trakt. Med fönstret: 237 ms för fem trakter
-- och 123 lass, och samma tal på varje rad (0 avvikelser av 70 lass, kontrollerat
-- mot självjoinen i prod 2026-11-18). Bygg aldrig tillbaka joinen.
--   first_value(rn) order by fran_loss desc, rn  ==  min(rn) där rank() = 1
--   max(fran_loss) over (partition by id)        ==  max(fran_loss) där rank() = 1
seg as (
  select pt.id, pt.rn, pt.avlagg_zon_m, pt.fran_loss,
    skotar_hav_m(lag(pt.la) over tidsordning, lag(pt.lo) over tidsordning, pt.la, pt.lo) d,
    lag(pt.fran_loss) over tidsordning fore_fran_loss,
    max(pt.fran_loss) over (partition by pt.id) ytterst,
    first_value(pt.rn) over (partition by pt.id order by pt.fran_loss desc, pt.rn) brytrn
  from pt
  window tidsordning as (partition by pt.id order by pt.rn)
),
summa as (
  select id,
    sum(d) cykel,
    count(*) + 1 punkter,
    coalesce(sum(d) filter (where fran_loss <= avlagg_zon_m and fore_fran_loss <= avlagg_zon_m), 0) vid_avlagget,
    coalesce(sum(d) filter (where rn > brytrn and not (fran_loss <= avlagg_zon_m and fore_fran_loss <= avlagg_zon_m)), 0) hem,
    max(ytterst) ytterst
  from seg
  where d is not null
  group by id
)
select
  b.id, b.vo_nummer, b.maskin_id, b.datum, b.v,
  s.cykel, s.punkter::integer, s.vid_avlagget, s.hem, s.ytterst,
  case when b.grund <> 'ok' then b.grund
       when s.cykel is null or s.cykel <= 0 then 'inga_punkter'
       else 'ok' end
from bedomt b
left join summa s on s.id = b.id
$$;

comment on function public.skotar_lass_cykel is
  'Per app-lass: hela den körda cykeln ur hyttspåret mellan förra lossningen och lassets lossning, plus delarna. '
  'Halvera vid användning (lib/skotningsavstand), aldrig här. skal <> ok betyder ingen cykel — läs aldrig det som 0 m.';

revoke all on function public.skotar_lass_cykel(text[]) from public;
grant execute on function public.skotar_lass_cykel(text[]) to authenticated, service_role;
revoke all on function public.skotar_hav_m(double precision, double precision, double precision, double precision) from public;
grant execute on function public.skotar_hav_m(double precision, double precision, double precision, double precision) to authenticated, service_role;
