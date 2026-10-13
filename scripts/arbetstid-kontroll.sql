-- ─────────────────────────────────────────────────────────────────────────────
-- ARBETSTID — KONTROLL MOT PROD (bara SELECT, ändrar ingenting).
-- Kör i Supabase SQL editor eller via planeringschattens SQL. Skriven OBEROENDE av lib/arbetstidsgranser.ts: samma frågor,
-- ett annat sätt att räkna, så att en avvikelse mellan siffrorna här och kortet Arbetstid (Admin → Översikt → tryck på förare)
-- betyder att något av de två har fel. Idag = current_date. Jämför per förare, en fråga i taget.
--
-- 0  Underlaget: dubbla rader, saknade klockslag, flyttdagar som inte går att räkna
-- 1  Gräns 4: timmar per vecka i snitt, de senaste fyra månaderna  → "Arbetstid per vecka"
-- 2  Gräns 1–3: arbetade timmar per ISO-vecka                      → jämför med periodernas övertid (genomsnitt över 40 − bas)
-- 3  Gräns 6: dygnsvila, lägsta de senaste 28 dagarna              → "Dygnsvila"
-- 4  Gräns 5: veckovila, lägsta dag de senaste 28 dagarna          → "Veckovila"
-- 5  Restid och maskinflytt i underlaget
--
-- REGLER (samma som kortet, ändrade 2026-10-13 efter prod-kontrollen):
--   • MASKINFLYTT (flyttdag) är arbetstid och räknas i fråga 1, 3 och 4: mätt tid = total_tid_min (starttid → "Kör hem";
--     hemresan ingår inte), tiderna är timestamptz och räknas om till Stockholmstid. En pågående dag (sluttid null, ingen mätt
--     tid) räknas t.o.m. nu. Dagar utan mätt tid, med 0 min eller över 16 tim (960 min, klientens skräpskydd) räknas inte.
--     I tim-summan räknas bara det som inte redan ligger i arbetsdag/extra_tid med klockslag samma dag; för vilan förlänger flytten
--     dagens pass (första start → sista slut) eller blir dagens pass.
--   • VECKOVILA: tiden från fönstrets start fram till förarens första pass räknas som vila (nyanställd), och vilan från sista
--     passet fram till nu räknas (öppen lucka = slutar nu). Visas aldrig över 168 tim. Dagar bedöms t.o.m. förarens sista passdatum.
--   • DYGNSVILA: ett pass vars slut ligger före starten (22:00–02:00) slutar nästa dygn.
--   • Frånvaro (semester, sjuk) likställs i kortet med 8 tim/vardag i 48-timmarssnittet; här visas den delen separat
--     (fråga 1, kolumn `semester_sjuk_h`). Röda dagar och deldagar är förenklade här.
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

-- ═══ 0c. Flyttdagar som kortet inte kan räkna, senaste fyra månaderna: utan förare, utan mätt tid, över 16 tim, pågående. ═══
select count(*)                                                                             as flyttdagar,
       count(*) filter (where medarbetare_id is null)                                       as utan_medarbetare_id,
       count(*) filter (where total_tid_min is null and sluttid is not null)                as avslutade_utan_mattid,
       count(*) filter (where total_tid_min > 960)                                          as over_16_tim,
       count(*) filter (where total_tid_min = 0)                                            as noll_min,
       count(*) filter (where total_tid_min is null and sluttid is null)                    as pagaende
from flyttdag
where starttid > now() - interval '4 months';

-- ═══ 1. GRÄNS 4 — timmar per vecka i snitt, senaste fyra månaderna ═══
-- Fönstret: startdagen exklusive (tomDatum − 4 månader + 1 dag), aldrig före förarens första registrerade tid; minst 28 dagar.
-- arbetad_min är (slut − start) minus rast; extra_tid.minuter läggs till; maskinflytt läggs till (netto, se REGLER).
with fonster as (select (current_date - interval '4 months')::date + 1 as fran),
befintliga as (   -- tidsrader med klockslag per förare och dag (arbetsdag och extra_tid), för att inte räkna flytten två gånger
  select medarbetare_id, datum,
         tsrange((datum + start_tid)::timestamp, (datum + slut_tid)::timestamp + case when slut_tid <= start_tid then interval '1 day' else interval '0' end) as r
  from arbetsdag where start_tid is not null and slut_tid is not null
  union all
  select medarbetare_id, datum,
         tsrange((datum + start_tid)::timestamp, (datum + slut_tid)::timestamp + case when slut_tid <= start_tid then interval '1 day' else interval '0' end)
  from extra_tid where start_tid is not null and slut_tid is not null
),
befintliga_per_dag as (select medarbetare_id, datum, range_agg(r) as mr from befintliga group by 1, 2),
flytt as (
  select f.medarbetare_id,
         (f.starttid at time zone 'Europe/Stockholm')::date as datum,
         tsrange((f.starttid at time zone 'Europe/Stockholm'),
                 (f.starttid at time zone 'Europe/Stockholm') + coalesce(f.total_tid_min, extract(epoch from (now() - f.starttid)) / 60) * interval '1 minute') as rng,
         coalesce(f.total_tid_min, extract(epoch from (now() - f.starttid)) / 60) as min_brutto
  from flyttdag f
  where f.medarbetare_id is not null
    and (f.total_tid_min is not null or f.sluttid is null)
    and coalesce(f.total_tid_min, extract(epoch from (now() - f.starttid)) / 60) between 1 and 960
),
flytt_netto as (
  select f.medarbetare_id, f.datum,
         coalesce((select sum(extract(epoch from upper(x) - lower(x))) / 60
                   from unnest(tsmultirange(f.rng) - coalesce(b.mr, '{}'::tsmultirange)) x), 0) as min_netto
  from flytt f left join befintliga_per_dag b on b.medarbetare_id = f.medarbetare_id and b.datum = f.datum
),
tid as (
  select medarbetare_id, datum, sum(min) as min from (
    select medarbetare_id, datum, coalesce(arbetad_min, 0)::numeric as min from arbetsdag
    union all
    select medarbetare_id, datum, coalesce(minuter, 0) from extra_tid
    union all
    select medarbetare_id, datum, min_netto from flytt_netto
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
       round((select coalesce(sum(min_netto), 0) from flytt_netto fn where fn.medarbetare_id = p.medarbetare_id and fn.datum >= p.fran) / 60.0, 1) as varav_flytt_h,
       coalesce(f.semester_sjuk_h, 0)                                                 as semester_sjuk_h,
       round(((p.arbetade_h + coalesce(f.semester_sjuk_h, 0)) / ((current_date - p.fran + 1) / 7.0))::numeric, 1) as snitt_tim_per_vecka,
       case when (current_date - p.fran + 1) < 28 then 'för kort underlag — kortet visar inget snitt' end as anm
from per_forare p join medarbetare m on m.id = p.medarbetare_id
left join franvaro f on f.medarbetare_id = p.medarbetare_id
order by snitt_tim_per_vecka desc nulls last;

-- ═══ 2. GRÄNS 1–3 — arbetade timmar per ISO-vecka i år (underlag för övertiden) ═══
-- Övertid enligt avtalet = (summa timmar − summa bas) per beräkningsperiod, bas = 40 − 8 per frånvaro-/röd vardag. Jämför med
-- periodernas övertid i kortets API (/api/lon/arbetstid) eller Lön → Löneunderlag. Utjämningsperioderna:
-- (Övertiden räknas av kortet på arbetsdag + extra_tid; maskinflytten ingår INTE i övertiden, bara i gräns 4–6.)
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

-- ═══ 3 + 4. VILA — ETT pass per förare och dag (första start → sista slut över maskinpass, perioddag och maskinflytt) ═══
-- Pass kortare än 30 min räknas inte (som i lib/vilobrott). Pass över midnatt: slut ≤ start betyder nästa dygn.
-- Perioddag (arbetsdag utan klockslag, tiden i extra_tid): första start → SISTA slut, glappen emellan är inte vila.
-- Maskinflytt (flyttdag, mätt tid, Stockholmstid) förlänger dagens pass eller blir dagens pass.
create temp view _pass as
with maskin as (
  select medarbetare_id, datum,
         (datum + start_tid)::timestamp as s,
         (datum + slut_tid)::timestamp + case when slut_tid <= start_tid then interval '1 day' else interval '0' end as e
  from arbetsdag
  where start_tid is not null and slut_tid is not null and datum >= current_date - 100
),
period as (
  select x.medarbetare_id, x.datum,
         (x.datum + min(x.start_tid))::timestamp as s,
         (x.datum + max(x.slut_tid))::timestamp  as e
  from extra_tid x
  where x.start_tid is not null and x.slut_tid is not null and x.datum >= current_date - 100
    and not exists (select 1 from maskin mk where mk.medarbetare_id = x.medarbetare_id and mk.datum = x.datum)
  group by x.medarbetare_id, x.datum
),
flytt as (
  select f.medarbetare_id,
         (f.starttid at time zone 'Europe/Stockholm')::date as datum,
         (f.starttid at time zone 'Europe/Stockholm') as s,
         (f.starttid at time zone 'Europe/Stockholm') + coalesce(f.total_tid_min, extract(epoch from (now() - f.starttid)) / 60) * interval '1 minute' as e
  from flyttdag f
  where f.medarbetare_id is not null
    and (f.total_tid_min is not null or f.sluttid is null)
    and coalesce(f.total_tid_min, extract(epoch from (now() - f.starttid)) / 60) between 1 and 960
    and f.starttid >= now() - interval '101 days'
)
select medarbetare_id, datum, min(s) as s, max(e) as e
from (select * from maskin union all select * from period union all select * from flytt) u
group by medarbetare_id, datum
having max(e) - min(s) >= interval '30 minutes';

create temp view _luckor as
select medarbetare_id, e as luck_start, lead(s) over (partition by medarbetare_id order by s) as luck_slut, datum
from _pass;

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
-- Kortet visar LÄGSTA av dessa dagsvärden (röd under 36 tim, gul under 40 tim), högst 168. Dagarna bedöms från förarens första till
-- hens sista passdatum. Tre slags luckor: mellan pass, FÖRE första passet (från fönstrets start) och EFTER sista passet (till nu).
with person as (select medarbetare_id, min(datum) as forsta_datum, max(datum) as sista_datum, min(s) as forsta_s, max(e) as sista_e from _pass group by 1),
dagar as (
  select p.medarbetare_id, d::date as n
  from person p cross join lateral generate_series(greatest(p.forsta_datum, current_date - 28), p.sista_datum, interval '1 day') d
),
luckor as (   -- (förare, luckans start, luckans slut): mellan pass
  select medarbetare_id, luck_start, luck_slut from _luckor where luck_slut > luck_start
),
mx as (
  select d.medarbetare_id, d.n,
         greatest(
           coalesce((select max(extract(epoch from (l.luck_slut - l.luck_start)) / 3600.0) from luckor l
                     where l.medarbetare_id = d.medarbetare_id
                       and l.luck_slut > (d.n - 6)::timestamp and l.luck_start < (d.n + 1)::timestamp), 0),
           -- före första passet: från fönstrets start (N−6 00:00) till första passet
           (select case when p.forsta_s > (d.n - 6)::timestamp
                        then extract(epoch from (least(p.forsta_s, (d.n + 1)::timestamp) - (d.n - 6)::timestamp)) / 3600.0 else 0 end
              from person p where p.medarbetare_id = d.medarbetare_id),
           -- efter sista passet: från sista passets slut till nu (Stockholmstid), om den luckan överlappar fönstret
           (select case when (now() at time zone 'Europe/Stockholm') > p.sista_e and (now() at time zone 'Europe/Stockholm') > (d.n - 6)::timestamp and p.sista_e < (d.n + 1)::timestamp
                        then extract(epoch from ((now() at time zone 'Europe/Stockholm') - p.sista_e)) / 3600.0 else 0 end
              from person p where p.medarbetare_id = d.medarbetare_id)
         ) as max_h
  from dagar d
)
select m.namn,
       round(least(min(mx.max_h), 168)::numeric, 1)              as lagsta_veckovila_h,
       (array_agg(mx.n order by mx.max_h))[1]                    as dag,
       case when min(mx.max_h) < 36 then 'RÖD' when min(mx.max_h) < 40 then 'GUL' else 'lugn' end as nivå
from mx join medarbetare m on m.id = mx.medarbetare_id
group by m.namn
order by lagsta_veckovila_h;

-- ═══ 5. RESTID OCH MASKINFLYTT ═══
-- 5a. Restid i underlaget (extra_tid, aktivitet 'restid') per förare, senaste fyra månaderna.
select m.namn, count(*) as antal_poster, round(sum(x.minuter) / 60.0, 1) as restid_h
from extra_tid x join medarbetare m on m.id = x.medarbetare_id
where x.aktivitet_typ = 'restid' and x.datum > current_date - interval '4 months'
group by m.namn
order by restid_h desc;

-- 5b. Maskinflytt (flyttdag) per förare, senaste fyra månaderna: det kortet nu räknar. "Maskinflytt ingår: N flyttdagar, X tim"
-- i förarens detalj ska stämma med antal_flyttdagar och flytt_h här (flyttdagar utan mätt tid, med 0 min och över 16 tim ingår inte).
select m.namn,
       count(*)                                                     as antal_flyttdagar,
       round(sum(f.total_tid_min) / 60.0, 1)                        as flytt_h,
       count(*) filter (where f.total_tid_min is null)              as utan_mattid,
       count(*) filter (where f.total_tid_min > 960)                as over_16_tim
from flyttdag f join medarbetare m on m.id = f.medarbetare_id
where f.starttid > now() - interval '4 months'
  and (f.total_tid_min between 1 and 960 or f.total_tid_min is null or f.total_tid_min > 960)
group by m.namn
order by flytt_h desc nulls last;

-- 5c. Flyttdag jämförd med underlaget samma dag (lokalt datum): 2026-09-25 hade 400 min flytt och 0 min i arbetsdag/extra_tid.
select (f.starttid at time zone 'Europe/Stockholm')::date as datum, m.namn,
       f.total_tid_min as flytt_min,
       (select coalesce(sum(arbetad_min), 0) from arbetsdag a where a.medarbetare_id = f.medarbetare_id and a.datum = (f.starttid at time zone 'Europe/Stockholm')::date) as arbetsdag_min,
       (select coalesce(sum(minuter), 0)     from extra_tid  x where x.medarbetare_id = f.medarbetare_id and x.datum = (f.starttid at time zone 'Europe/Stockholm')::date) as extra_min
from flyttdag f join medarbetare m on m.id = f.medarbetare_id
where f.starttid > now() - interval '4 months'
order by datum desc
limit 40;
