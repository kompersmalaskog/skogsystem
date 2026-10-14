-- Historikvyer (steg 9): läsvyer över hist_*-tabellerna. Bara CREATE VIEW vy_hist_*, och bara över hist_* / vy_hist_*.
-- Inget befintligt rörs. Alla vyer: security_invoker = true => RLS på hist_* gäller för den som frågar (inloggade läser, anon ser inget).
-- Alla vyer läser bara rader med raknas = true och hist_maskin.agare = 'egen' (hist_stopp saknar raknas, se vy_hist_stopp_topp).
-- Inget lagras: index, normkurvor och jämförelser räknas när vyn läses.
--
-- Beroenden: vy_hist_objekt_bas -> vy_hist_normkurva -> vy_hist_objekt_index -> vy_hist_index_ar / vy_hist_forare_maskin.
-- Enheter: volym = m3 under bark (volym_enhet 'fub'), G15 i timmar, medelstam = m3fub/stam, m3_per_g15 = m3fub per G15-timme.

-- ------------------------------------------------------------------------------------------------ hjälpvy: ett objekt per rad (raknas, egen maskin)
create view vy_hist_objekt_bas with (security_invoker = true) as
select
  o.sha256,
  m.id as hist_maskin_id,
  m.namn as maskin,
  m.typ as maskin_typ,
  extract(year from o.rapportdatum)::int as ar,
  o.rapportdatum,
  o.startdatum,
  o.slutdatum,
  o.objekt,
  o.atgard,
  o.atgard_kalla,
  o.stammar,
  o.volym_m3fub as volym,
  o.volym_enhet,
  o.g15_h,
  o.g0_h,
  o.motortid_h,
  o.bransle_l,
  o.avbrott_reparation_min,
  o.avbrott_service_min,
  o.avbrott_storning_min,
  o.avbrott_registrerade,
  case when o.stammar > 0 then o.volym_m3fub / o.stammar end as medelstam,
  case when o.g15_h > 0 then o.volym_m3fub / o.g15_h end as m3_per_g15
from hist_objekt o
join hist_rapport r on r.sha256 = o.sha256
join hist_maskin m on m.id = r.hist_maskin_id
where o.raknas and m.agare = 'egen';

-- ------------------------------------------------------------------------------------------------ 1. normkurva per åtgärd
-- ln(m3fub/G15) = a + b * ln(medelstam). Bara skördare, åtgärd ur objektnamn/mejlämne/rapportkategori (inte maskinstandard),
-- G15 >= 2 h, stammar > 0, volym i m3fub. Två varianter: oviktad och viktad med G15.
create view vy_hist_normkurva with (security_invoker = true) as
with d as (
  select
    atgard,
    ln(medelstam::float8) as x,
    ln(m3_per_g15::float8) as y,
    g15_h::float8 as w
  from vy_hist_objekt_bas
  where maskin_typ = 'skördare'
    and atgard in ('gallring', 'slutavverkning')
    and coalesce(atgard_kalla, '') <> 'maskinstandard'
    and volym_enhet = 'fub'
    and g15_h >= 2
    and stammar > 0
    and volym > 0
),
oviktad as (
  select atgard, 'oviktad'::text as variant,
         regr_intercept(y, x) as a, regr_slope(y, x) as b, count(*)::int as n, regr_r2(y, x) as r2
  from d
  group by atgard
),
s as (
  select atgard, count(*)::int as n, sum(w) as sw, sum(w * x) as swx, sum(w * y) as swy, sum(w * x * x) as swxx, sum(w * x * y) as swxy
  from d
  group by atgard
),
vb as (
  select atgard, n, sw, swy / sw as ybar,
         (swxy - swx * swy / sw) / (swxx - swx * swx / sw) as b,
         (swy - ((swxy - swx * swy / sw) / (swxx - swx * swx / sw)) * swx) / sw as a
  from s
),
viktad as (
  select vb.atgard, 'g15-viktad'::text as variant, vb.a, vb.b, vb.n,
         1 - sum(d.w * power(d.y - vb.a - vb.b * d.x, 2)) / sum(d.w * power(d.y - vb.ybar, 2)) as r2
  from vb
  join d on d.atgard = vb.atgard
  group by vb.atgard, vb.a, vb.b, vb.n
)
select atgard, variant, a, b, n, r2 from oviktad
union all
select atgard, variant, a, b, n, r2 from viktad;

-- ------------------------------------------------------------------------------------------------ 2. ett skördarobjekt per rad, med index
-- forare = föraren med störst andel av objektets G15 (andel_kalla: g15 = G15 per förare, tid = inloggad tid när G15 saknas,
-- volym = volym per förare, lika = enda/likadelad). Förväntad m3/G15 och index (= verklig / förväntad * 100) mot den G15-viktade kurvan,
-- bara för objekt med känd åtgärd, G15 >= 2 h och stammar > 0. Filtrera på atgard_kalla om maskinstandard-åtgärder inte ska ingå.
create view vy_hist_objekt_index with (security_invoker = true) as
with fs as (
  select s.sha256, s.hist_forare_id,
         sum(coalesce(s.g15_h, 0)) as g15,
         sum(extract(epoch from (case
               when s.ut_tid is null then interval '0'
               when s.ut_tid >= s.in_tid then s.ut_tid - s.in_tid
               else s.ut_tid - s.in_tid + interval '24 hours' end)) / 3600.0) as tid,
         0::numeric as vol
  from hist_skift s
  where s.sha256 is not null
  group by s.sha256, s.hist_forare_id
),
fo as (
  select sha256, hist_forare_id, coalesce(g15_h, 0) as g15, 0::numeric as tid, coalesce(volym, 0) as vol
  from hist_forare_objekt
),
f as (
  select u.sha256, u.hist_forare_id, sum(u.g15) as g15, sum(u.tid) as tid, sum(u.vol) as vol
  from (select * from fs union all select * from fo) u
  join hist_forare hf on hf.id = u.hist_forare_id and not hf.teknisk
  group by u.sha256, u.hist_forare_id
),
t as (
  select sha256, sum(g15) as tg, sum(tid) as td, sum(vol) as tv, count(*) as nf
  from f
  group by sha256
),
a0 as (
  select f.sha256, f.hist_forare_id,
         case when t.tg > 0 then f.g15 / t.tg
              when t.td > 0 then f.tid / t.td
              when t.tv > 0 then f.vol / t.tv
              else 1.0 / t.nf end as andel,
         case when t.tg > 0 then 'g15' when t.td > 0 then 'tid' when t.tv > 0 then 'volym' else 'lika' end as andel_kalla
  from f
  join t on t.sha256 = f.sha256
),
topp as (
  select sha256, hist_forare_id, andel, andel_kalla,
         row_number() over (partition by sha256 order by andel desc, hist_forare_id) as rn
  from a0
),
k as (
  select atgard, a, b from vy_hist_normkurva where variant = 'g15-viktad'
)
select
  b.sha256,
  b.maskin,
  b.ar,
  b.rapportdatum,
  b.objekt,
  b.atgard,
  b.atgard_kalla,
  hf.namn as forare,
  tp.andel as forare_andel,
  tp.andel_kalla,
  b.stammar,
  b.volym as volym_m3fub,
  b.g15_h,
  b.medelstam,
  b.m3_per_g15,
  case when k.a is not null then exp(k.a + k.b * ln(b.medelstam::float8)) end as forvantad_m3_per_g15,
  case when k.a is not null then b.m3_per_g15::float8 / exp(k.a + k.b * ln(b.medelstam::float8)) * 100 end as index
from vy_hist_objekt_bas b
left join topp tp on tp.sha256 = b.sha256 and tp.rn = 1
left join hist_forare hf on hf.id = tp.hist_forare_id
left join k on k.atgard = b.atgard and b.g15_h >= 2 and b.stammar > 0 and b.volym > 0
where b.maskin_typ = 'skördare';

-- ------------------------------------------------------------------------------------------------ 3. index per maskin, år och åtgärd
-- urval = 'namn' när åtgärden kommer ur objektnamn/mejlämne/rapportkategori, 'standard' när den kommer från maskinstandard.
-- viktat_index = summa volym / summa (G15 * förväntad m3/G15) * 100 (G15-viktat).
create view vy_hist_index_ar with (security_invoker = true) as
select
  maskin,
  ar,
  atgard,
  case when coalesce(atgard_kalla, '') <> 'maskinstandard' then 'namn' else 'standard' end as urval,
  count(*)::int as antal_objekt,
  round(sum(g15_h), 1) as summa_g15_h,
  round((percentile_cont(0.5) within group (order by medelstam::float8))::numeric, 3) as median_medelstam,
  round((percentile_cont(0.5) within group (order by index))::numeric, 1) as medianindex,
  round((sum(volym_m3fub)::float8 / sum(g15_h::float8 * forvantad_m3_per_g15) * 100)::numeric, 1) as viktat_index
from vy_hist_objekt_index
where index is not null
group by maskin, ar, atgard, case when coalesce(atgard_kalla, '') <> 'maskinstandard' then 'namn' else 'standard' end;

-- ------------------------------------------------------------------------------------------------ 4. index per förare och maskin
-- Bara objekt där föraren kört minst 80 % av G15 (andel_kalla g15, eller tid där G15 per förare saknas i rapporten).
create view vy_hist_forare_maskin with (security_invoker = true) as
select
  forare,
  maskin,
  ar,
  atgard,
  case when coalesce(atgard_kalla, '') <> 'maskinstandard' then 'namn' else 'standard' end as urval,
  count(*)::int as antal_objekt,
  round(sum(g15_h), 1) as summa_g15_h,
  round((percentile_cont(0.5) within group (order by g15_h::float8))::numeric, 1) as median_g15_h_per_objekt,
  round((percentile_cont(0.5) within group (order by medelstam::float8))::numeric, 3) as median_medelstam,
  round((percentile_cont(0.5) within group (order by index))::numeric, 1) as medianindex,
  round((sum(volym_m3fub)::float8 / sum(g15_h::float8 * forvantad_m3_per_g15) * 100)::numeric, 1) as viktat_index
from vy_hist_objekt_index
where index is not null
  and forare is not null
  and forare_andel >= 0.8
  and andel_kalla in ('g15', 'tid')
group by forare, maskin, ar, atgard, case when coalesce(atgard_kalla, '') <> 'maskinstandard' then 'namn' else 'standard' end;

-- ------------------------------------------------------------------------------------------------ 5. tid och avbrott per maskin och år
-- Alla egna maskiner (även skotare). andel_rapporter_med_avbrott = rapporter med avbrott_registrerade 'ja' av de som redovisar avbrott (ja/nej/osaker).
-- TU och graderna räknas bara över rapporter med avbrott_registrerade = 'ja':  TU = G15 / (G15 + reparation + service + störning);
-- reparationsgrad, servicegrad, storningsgrad = respektive tid / (G15 + reparation + service + störning). Bränsle: liter per G15-timme (rapporter med både).
create view vy_hist_tid_ar with (security_invoker = true) as
select
  maskin,
  ar,
  count(*)::int as antal_rapporter,
  round(sum(g15_h), 1) as g15_h,
  round(sum(motortid_h), 1) as motortid_h,
  count(*) filter (where avbrott_registrerade = 'ja')::int as antal_rapporter_med_avbrott,
  round((count(*) filter (where avbrott_registrerade = 'ja'))::numeric
        / nullif(count(*) filter (where avbrott_registrerade in ('ja', 'nej', 'osaker')), 0), 3) as andel_rapporter_med_avbrott,
  round((sum(g15_h) filter (where avbrott_registrerade = 'ja'))
        / nullif((sum(g15_h) filter (where avbrott_registrerade = 'ja'))
                 + (sum(coalesce(avbrott_reparation_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_service_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_storning_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0, 0), 3) as tu,
  round((sum(coalesce(avbrott_reparation_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
        / nullif((sum(g15_h) filter (where avbrott_registrerade = 'ja'))
                 + (sum(coalesce(avbrott_reparation_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_service_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_storning_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0, 0), 3) as reparationsgrad,
  round((sum(coalesce(avbrott_service_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
        / nullif((sum(g15_h) filter (where avbrott_registrerade = 'ja'))
                 + (sum(coalesce(avbrott_reparation_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_service_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_storning_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0, 0), 3) as servicegrad,
  round((sum(coalesce(avbrott_storning_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
        / nullif((sum(g15_h) filter (where avbrott_registrerade = 'ja'))
                 + (sum(coalesce(avbrott_reparation_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_service_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0
                 + (sum(coalesce(avbrott_storning_min, 0)) filter (where avbrott_registrerade = 'ja')) / 60.0, 0), 3) as storningsgrad,
  round((sum(bransle_l) filter (where bransle_l > 0 and g15_h > 0))
        / nullif(sum(g15_h) filter (where bransle_l > 0 and g15_h > 0), 0), 1) as bransle_l_per_g15_h
from vy_hist_objekt_bas
group by maskin, ar;

-- ------------------------------------------------------------------------------------------------ 6. de 10 felkoder med flest minuter per maskin (Komatsu MaxiXplorer)
-- hist_stopp är redan deduplicerad på (maskin, datum, tid, felkod) och har inget raknas-fält, så ingen raknas-filtrering här.
create view vy_hist_stopp_topp with (security_invoker = true) as
with s as (
  select m.namn as maskin, st.felkod,
         mode() within group (order by st.beskrivning) as beskrivning,
         count(*)::int as antal,
         sum(st.minuter)::int as minuter
  from hist_stopp st
  join hist_maskin m on m.id = st.hist_maskin_id
  where m.agare = 'egen'
  group by m.namn, st.felkod
),
r as (
  select s.*,
         row_number() over (partition by maskin order by minuter desc nulls last, felkod) as rang,
         sum(minuter) over (partition by maskin) as totalt_minuter
  from s
)
select maskin, rang::int as rang, felkod, beskrivning, antal, minuter,
       round(100.0 * minuter / nullif(totalt_minuter, 0), 1) as andel_av_maskinens_stopptid_procent
from r
where rang <= 10;
