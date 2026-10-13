-- ─────────────────────────────────────────────────────────────────────────────
-- ARBETSTID — KONTROLL MOT PROD (bara SELECT, ändrar ingenting).
-- Kör i Supabase SQL editor eller via planeringschattens SQL. Skriven OBEROENDE av lib/arbetstidsgranser.ts: samma frågor,
-- ett annat sätt att räkna, så att en avvikelse mellan siffrorna här och kortet Arbetstid (Admin → Översikt → tryck på förare)
-- betyder att något av de två har fel. Idag = current_date. Jämför per förare, en fråga i taget.
--
-- 0  Underlaget: dubbla rader, saknade klockslag, restid (luckorna som kortet säger att det har)
-- 1  Gräns 4: timmar per vecka i snitt, de senaste fyra månaderna  → "Arbetstid per vecka"
-- 2  Gräns 1–3: arbetade timmar per ISO-vecka                      → jämför med periodernas övertid (genomsnitt över 40 − bas)
-- 3  Gräns 6: dygnsvila, lägsta de senaste 28 dagarna              → "Dygnsvila"
-- 4  Gräns 5: veckovila, lägsta dag de senaste 28 dagarna          → "Veckovila"
-- 5  Restid: finns den, och finns körtid för maskinflytt utanför underlaget?
--
-- FÖRBEHÅLL (samma som kortet): frånvaro (semester, sjuk) likställs i kortet med 8 tim/vardag i 48-timmarssnittet; här visas den
-- delen separat (fråga 1, kolumn `semester_sjuk_h`) så att man kan lägga ihop själv. Röda dagar och deldagar är förenklade här.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 0a. Dubbla arbetsdag-rader per (medarbetare, datum). Förväntat: 0 rader (kontrollerat 2026-10-13). ═══
select medarbetare_id, datum, count(*) as antal
from arbetsdag
group by medarbetare_id, datum
having count(*) > 1
order by datum desc
limit 50;

-- ═══ 0b. Rader som saknar klockslag (räknas i timmar men inte i vilan), per förare, senaste fyra månaderna. ═══
select m.namn,
       count(*) filter (where a.start_tid is null or a.slut_tid is null)  as rader_utan_klockslag,
       count(*)                                                            as rader_totalt
from arbetsdag a join medarbetare m on m.id = a.medarbetare_id
where a.datum > current_date - interval '4 months'
group by m.namn
order by rader_utan_klockslag desc;

-- ═══ 1. GRÄNS 4 — timmar per vecka i snitt, senaste fyra månaderna ═══
-- Fönstret: startdagen exklusive (tomDatum − 4 månader + 1 dag), aldrig före förarens första registrerade tid; minst 28 dagar.
-- arbetad_min är (slut − start) minus rast; extra_tid.minuter läggs till (perioddagar, planering, restid, manuellt arbete).
with fonster as (select (current_date - interval '4 months')::date + 1 as fran),
tid as (
  select medarbetare_id, datum, sum(min) as min from (
    select medarbetare_id, datum, coalesce(arbetad_min, 0) as min from arbetsdag
    union all
    select medarbetare_id, datum, coalesce(minuter, 0) from extra_tid
  ) u group by medarbetare_id, datum
),
per_forare as (
  select t.medarbetare_id,
         greatest(min(t.datum) filter (where t.min > 0), (select fran from fonster)) as fran,
         sum(t.min) filter (where t.datum >= (select fran from fonster)) / 60.0 as arbetade_h
  from tid t
  where t.datum >= (select fran from fonster) and t.datum <= current_date
  group by t.medarbetare_id
),
franvaro as (   -- bara semester och sjuk, heldagar, vardagar som inte är arbetade; röda dagar ingår här (förenkling)
  select l.medarbetare_id,
         count(*) * 8.0 as semester_sjuk_h
  from ledighet_ansokningar l
  cross join lateral generate_series(greatest(l.startdatum, (select fran from fonster)), least(l.slutdatum, current_date), interval '1 day') d
  where l.typ in ('semester', 'sjuk') and l.status in ('godkänd', 'registrerad')
    and extract(isodow from d) < 6
    and not exists (select 1 from tid t where t.medarbetare_id = l.medarbetare_id and t.datum = d::date and t.min >= 60)
  group by l.medarbetare_id
)
select m.namn,
       p.fran,
       (current_date - p.fran + 1)                                                    as dagar,
       round(p.arbetade_h::numeric, 1)                                                as arbetade_h,
       coalesce(f.semester_sjuk_h, 0)                                                 as semester_sjuk_h,
       round(((p.arbetade_h + coalesce(f.semester_sjuk_h, 0)) / ((current_date - p.fran + 1) / 7.0))::numeric, 1) as snitt_tim_per_vecka,
       case when (current_date - p.fran + 1) < 28 then 'för kort underlag — kortet visar inget snitt' end as anm
from per_forare p join medarbetare m on m.id = p.medarbetare_id
left join franvaro f on f.medarbetare_id = p.medarbetare_id
order by snitt_tim_per_vecka desc nulls last;

-- ═══ 2. GRÄNS 1–3 — arbetade timmar per ISO-vecka i år (underlag för övertiden) ═══
-- Övertid enligt avtalet = (summa timmar − summa bas) per beräkningsperiod, bas = 40 − 8 per frånvaro-/röd vardag. Jämför med
-- periodernas övertid i kortets API (/api/lon/arbetstid) eller Lön → Löneunderlag. Utjämningsperioderna:
select startdatum, slutdatum, medarbetare_id, left(anteckning, 60) as anteckning from utjamningsperiod order by startdatum;

select m.namn,
       extract(isoyear from t.datum)::int as isoar,
       extract(week from t.datum)::int    as vecka,
       round(sum(t.min) / 60.0, 1)        as timmar
from (
  select medarbetare_id, datum, coalesce(arbetad_min, 0) as min from arbetsdag
  union all
  select medarbetare_id, datum, coalesce(minuter, 0) from extra_tid
) t join medarbetare m on m.id = t.medarbetare_id
where t.datum >= date_trunc('year', current_date) and t.datum <= current_date
group by m.namn, isoar, vecka
order by m.namn, isoar, vecka;

-- Övertid per KALENDERMÅNAD som ren summa timmar minus 8 tim per arbetad dag — en grov övre gräns att jämföra "Övertid per månad" mot
-- (kortets tal kan vara LÄGRE eftersom utjämningsperioder jämnar ut; aldrig högre än detta när alla veckor är arbetade):
select m.namn, to_char(t.datum, 'YYYY-MM') as manad,
       round(sum(t.min) / 60.0, 1) as timmar,
       count(*) filter (where t.min >= 60) as arbetade_dagar,
       round(greatest(0, sum(t.min) / 60.0 - 8 * count(*) filter (where t.min >= 60)), 1) as grov_overtid
from (
  select medarbetare_id, datum, sum(min) as min from (
    select medarbetare_id, datum, coalesce(arbetad_min, 0) as min from arbetsdag
    union all select medarbetare_id, datum, coalesce(minuter, 0) from extra_tid
  ) u group by medarbetare_id, datum
) t join medarbetare m on m.id = t.medarbetare_id
where t.datum >= date_trunc('year', current_date)
group by m.namn, manad
order by m.namn, manad;

-- ═══ 3 + 4. VILA — passen som tidsintervall (maskinpass + perioddagar utan maskinpass) ═══
-- Pass kortare än 30 min räknas inte (som i lib/vilobrott). Pass över midnatt: slut ≤ start betyder nästa dygn.
-- Perioddag (arbetsdag utan klockslag, tiden i extra_tid): första start → SISTA slut, glappen emellan är inte vila.
create temp view _pass as
with maskin as (
  select medarbetare_id, datum,
         (datum + start_tid)::timestamp as s,
         (datum + slut_tid)::timestamp + case when slut_tid <= start_tid then interval '1 day' else interval '0' end as e
  from arbetsdag
  where start_tid is not null and slut_tid is not null and datum >= current_date - 90
),
period as (
  select x.medarbetare_id, x.datum,
         (x.datum + min(x.start_tid))::timestamp as s,
         (x.datum + max(x.slut_tid))::timestamp  as e
  from extra_tid x
  where x.start_tid is not null and x.slut_tid is not null and x.datum >= current_date - 90
    and not exists (select 1 from maskin mk where mk.medarbetare_id = x.medarbetare_id and mk.datum = x.datum)
  group by x.medarbetare_id, x.datum
)
select * from maskin union all select * from period;

create temp view _luckor as
select medarbetare_id, e as luck_start, lead(s) over (partition by medarbetare_id order by s) as luck_slut, datum
from _pass
where e - s >= interval '30 minutes';

-- ═══ 3. GRÄNS 6 — dygnsvila: lägsta vila mellan två pass (≤ 7 dagar isär), senaste 28 dagarna ═══
-- Kortet: röd under 11 tim, gul under 12 tim. (Brottets datum = dagen då passet före vilan började.)
select m.namn,
       round(min(extract(epoch from (l.luck_slut - l.luck_start)) / 3600.0)::numeric, 1) as lagsta_dygnsvila_h,
       (array_agg(l.datum order by (l.luck_slut - l.luck_start)))[1]                        as datum,
       case when min(extract(epoch from (l.luck_slut - l.luck_start)) / 3600.0) < 11 then 'RÖD'
            when min(extract(epoch from (l.luck_slut - l.luck_start)) / 3600.0) < 12 then 'GUL' else 'lugn' end as nivå
from _luckor l join medarbetare m on m.id = l.medarbetare_id
where l.luck_slut > l.luck_start and l.luck_slut - l.luck_start <= interval '7 days'
  and l.datum >= current_date - 28
group by m.namn
order by lagsta_dygnsvila_h;

-- ═══ 4. GRÄNS 5 — veckovila: för varje dag N de senaste 28 dagarna, längsta vila som överlappar [N−6 dagar 00:00, N 23:59:59] ═══
-- Kortet visar LÄGSTA av dessa dagsvärden (röd under 36 tim, gul under 40 tim). 0/inget gap = inget att bedöma.
with dagar as (select d::date as n from generate_series(current_date - 28, current_date, interval '1 day') d),
mx as (
  select l.medarbetare_id, d.n,
         max(extract(epoch from (l.luck_slut - l.luck_start)) / 3600.0) as max_h
  from _luckor l cross join dagar d
  where l.luck_slut > l.luck_start
    and l.luck_slut > (d.n - 6)::timestamp
    and l.luck_start < (d.n + 1)::timestamp
  group by l.medarbetare_id, d.n
)
select m.namn,
       round(min(mx.max_h)::numeric, 1)                          as lagsta_veckovila_h,
       (array_agg(mx.n order by mx.max_h))[1]                    as dag,
       case when min(mx.max_h) < 36 then 'RÖD' when min(mx.max_h) < 40 then 'GUL' else 'lugn' end as nivå
from mx join medarbetare m on m.id = mx.medarbetare_id
where mx.max_h > 0
group by m.namn
order by lagsta_veckovila_h;

-- ═══ 5. RESTID ═══
-- 5a. Restid i underlaget (extra_tid, aktivitet 'restid') per förare, senaste fyra månaderna. 0 rader/0 tim → kortet säger "Restid ingår inte".
select m.namn, count(*) as antal_poster, round(sum(x.minuter) / 60.0, 1) as restid_h
from extra_tid x join medarbetare m on m.id = x.medarbetare_id
where x.aktivitet_typ = 'restid' and x.datum > current_date - interval '4 months'
group by m.namn
order by restid_h desc;

-- 5b. Körtid vid maskinflytt (flyttdag / maskin_flytt) — räknas den som arbetstid, och finns den då i arbetsdag/extra_tid? Kortet
-- läser BARA arbetsdag och extra_tid. Först: vilka tidskolumner finns? (Kolumnnamnen avgör hur 5c skrivs.)
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('flyttdag', 'maskin_flytt')
  and (column_name ilike '%tid%' or column_name ilike '%start%' or column_name ilike '%slut%' or column_name ilike '%min%')
order by table_name, ordinal_position;

-- 5c. Mall: förarens flyttdagar de senaste fyra månaderna jämförda med deras arbetsdag-/extra_tid-timmar samma datum. Anpassa
-- kolumnnamnen efter 5b. En flyttdag där arbetsdag + extra_tid är mycket kortare än flyttens körtid betyder att körtiden saknas i
-- kortets underlag (och att gränserna 4–6 då kan vara för snälla).
--   select f.datum, f.<förare-kolumn>, f.<start>, f.<slut>,
--          (select coalesce(sum(arbetad_min), 0) from arbetsdag a where a.medarbetare_id = f.<förare-kolumn> and a.datum = f.datum) as arbetsdag_min,
--          (select coalesce(sum(minuter), 0)      from extra_tid  x where x.medarbetare_id = f.<förare-kolumn> and x.datum = f.datum) as extra_min
--   from flyttdag f where f.datum > current_date - interval '4 months' order by f.datum desc;
