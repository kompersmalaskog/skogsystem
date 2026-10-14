-- Historik steg 15: volym från skördare till skotare (DEL 3). Härledd volym lagras i hist_korrigering (falt = 'volym_harledd', nytt_varde = m3,
-- orsak 'regel: volym_fran_skordare_skogsystem' eller 'regel: volym_fran_skordare_pdf'), aldrig i hist_objekt. Vyn använder den härledda volymen när den finns
-- (och ersätter då 'lass utan storlek'-markering för just den raden). vy_hist_objekt_bas: nya sista kolumner volym_harledd, volym_harledd_kalla.
-- vy_hist_objekt_lista: volym_kvalitet = 'fran_skordare_<källa>'. vy_hist_maskin_ar: nya sista kolumner antal_volym_harledd, volym_harledd_m3, g15_med_volym
-- (G15 för objekt som har volym; m3/G15 räknas redan bara på objekt med volym); härledd volym räknas inte som osäker.
-- Rör bara vyerna vy_hist_*.

create or replace view vy_hist_objekt_bas with (security_invoker = true) as
select
  o.sha256,
  m.id as hist_maskin_id,
  m.namn as maskin,
  m.typ as maskin_typ,
  (extract(year from o.rapportdatum))::integer as ar,
  o.rapportdatum,
  o.startdatum,
  o.slutdatum,
  o.objekt,
  coalesce(k.nytt_varde, o.atgard) as atgard,
  case
    when k.nytt_varde is null then o.atgard_kalla
    when k.orsak = 'regel: rottne_gallring_bekraftad' then 'maskinstandard_bekraftad'
    when k.orsak like 'regel: arvd_fran_skordare%' then substring(k.orsak from 8)
    when k.orsak like 'regel: kopplad_till_skordare_%' then substring(k.orsak from 8)
    else 'korrigering'
  end as atgard_kalla,
  o.stammar,
  (case when f.saknas then null else e.vol end)::numeric(12,3) as volym,
  coalesce(t.volym_enhet, o.volym_enhet) as volym_enhet,
  o.g15_h,
  o.g0_h,
  o.motortid_h,
  o.bransle_l,
  o.avbrott_reparation_min,
  o.avbrott_service_min,
  o.avbrott_storning_min,
  o.avbrott_registrerade,
  case when o.stammar > 0 and not f.saknas and not g.osaker then e.vol / o.stammar::numeric else null::numeric end as medelstam,
  case when o.g15_h > 0::numeric and not f.saknas and not g.osaker then e.vol / o.g15_h else null::numeric end as m3_per_g15,
  f.saknas as volym_saknas_lass,
  t.sha256 as tvilling_sha,
  coalesce(t.skift_lass, t.antal_lass) as tvilling_lass,
  t.volym_kvalitet as tvilling_volym_kvalitet,
  g.osaker as volym_osaker_lasstorlek,
  e.lass as lass_eff,
  (kh.sha256 is not null) as volym_harledd,
  case when kh.sha256 is not null then substring(kh.orsak from 'volym_fran_skordare_(.*)$') end as volym_harledd_kalla
from hist_objekt o
join hist_rapport r on r.sha256 = o.sha256
join hist_maskin m on m.id = r.hist_maskin_id
left join hist_korrigering k on k.sha256 = o.sha256 and k.falt = 'atgard'
left join hist_korrigering kv on kv.sha256 = o.sha256 and kv.falt = 'volym_kvalitet'
left join hist_korrigering kh on kh.sha256 = o.sha256 and kh.falt = 'volym_harledd'
left join lateral (
  select d.sha256, d.volym_m3fub, d.volym_enhet, d.volym_kvalitet, d.antal_lass,
         (select sum(s.antal_lass) from hist_skift s where s.sha256 = d.sha256) as skift_lass
  from hist_objekt d
  join hist_rapport dr on dr.sha256 = d.sha256
  where d.dubblett_av = o.sha256 and dr.format = 'lastcertifikat'
  order by d.sha256
  limit 1
) t on true
cross join lateral (
  select coalesce(kv.nytt_varde, case when t.sha256 is not null then t.volym_kvalitet else o.volym_kvalitet end) as kvalitet,
         coalesce((select sum(s.antal_lass) from hist_skift s where s.sha256 = o.sha256), t.skift_lass, t.antal_lass, o.antal_lass) as lass,
         coalesce(kh.nytt_varde::numeric, t.volym_m3fub, o.volym_m3fub) as vol
) e
cross join lateral (
  select (m.namn = 'Ponsse Wisent' and coalesce(e.kvalitet, '') in ('laster_x_1m3', 'schablon_10m3') and kh.sha256 is null) as saknas
) f
cross join lateral (
  select (m.namn = 'Ponsse Wisent' and not f.saknas and kh.sha256 is null and e.vol > 0 and e.lass > 0 and (e.vol / e.lass < 6 or e.vol / e.lass > 18)) as osaker
) g
where o.raknas and m.agare = 'egen';

create or replace view vy_hist_objekt_lista with (security_invoker = true) as
select
  b.sha256,
  b.maskin,
  b.maskin_typ as typ,
  b.ar,
  b.atgard,
  b.atgard_kalla,
  case when coalesce(b.atgard_kalla, '') <> 'maskinstandard' then 'namn' else 'standard' end as urval,
  b.objekt,
  b.startdatum,
  b.slutdatum,
  b.rapportdatum,
  b.stammar,
  b.volym as volym_m3fub,
  b.g15_h,
  b.medelstam,
  b.m3_per_g15,
  i.forvantad_m3_per_g15,
  i.index,
  i.forare,
  i.forare_andel,
  i.andel_kalla as forare_andel_kalla,
  b.avbrott_registrerade,
  case when b.volym_harledd then 'fran_skordare_' || b.volym_harledd_kalla when b.volym_saknas_lass then 'lass_utan_storlek' when b.volym_osaker_lasstorlek then 'osaker_lasstorlek' when b.tvilling_sha is not null then b.tvilling_volym_kvalitet else ho.volym_kvalitet end as volym_kvalitet,
  r.storage_path,
  r.filtyp,
  r.format,
  r.filnamn,
  r.mejldatum,
  (select count(*) from hist_objekt d where d.dubblett_av = b.sha256)::integer as antal_andra_utskrifter
from vy_hist_objekt_bas b
join hist_rapport r on r.sha256 = b.sha256
join hist_objekt ho on ho.sha256 = b.sha256
left join vy_hist_objekt_index i on i.sha256 = b.sha256;

create or replace view vy_hist_maskin_ar with (security_invoker = true) as
with lass as (
  select sha256, sum(antal_lass) as lass
  from hist_skift
  where antal_lass is not null
  group by sha256
),
o as (
  select
    b.maskin, b.maskin_typ as typ, b.atgard, b.ar,
    case when coalesce(b.atgard_kalla, '') <> 'maskinstandard' then 'namn' else 'standard' end as urval,
    b.volym, case when b.volym_osaker_lasstorlek then null else b.volym end as volym_rakn, b.g15_h, b.stammar, b.bransle_l, b.avbrott_registrerade,
    coalesce(b.avbrott_reparation_min, 0) as rep_min,
    coalesce(b.avbrott_service_min, 0) as serv_min,
    coalesce(b.avbrott_storning_min, 0) as stor_min,
    b.lass_eff as lass,
    case when not b.volym_harledd and (coalesce(case when b.tvilling_sha is not null then b.tvilling_volym_kvalitet else ho.volym_kvalitet end, '') <> '' or b.volym_saknas_lass or b.volym_osaker_lasstorlek) then 1 else 0 end as volym_osaker,
    b.volym_harledd as harledd,
    i.forvantad_m3_per_g15 as forv,
    ho.arbetstid_h, ho.tu_rapporterad
  from vy_hist_objekt_bas b
  join hist_objekt ho on ho.sha256 = b.sha256
  left join lass l on l.sha256 = b.sha256
  left join vy_hist_objekt_index i on i.sha256 = b.sha256
),
rak as (
  -- G15 / timräknare per maskin och år (bara Ponsse, som har livstid_h): G15 från räknade rapporter efter årets första och till och med årets sista räknarvärde,
  -- delat med räknarens skillnad samma år. NULL om färre än två räknarvärden finns det året.
  select l.maskin, l.ar,
         round((select sum(b.g15_h) from vy_hist_objekt_bas b where b.maskin = l.maskin and b.rapportdatum > l.d0 and b.rapportdatum <= l.d1)
               / nullif(l.liv1 - l.liv0, 0), 2) as kvot
  from (
    select m.namn as maskin, extract(year from o.rapportdatum)::int as ar,
           min(o.rapportdatum) as d0, max(o.rapportdatum) as d1, min(o.livstid_h) as liv0, max(o.livstid_h) as liv1, count(distinct o.rapportdatum) as n
    from hist_objekt o
    join hist_rapport r on r.sha256 = o.sha256
    join hist_maskin m on m.id = r.hist_maskin_id
    where o.livstid_h is not null and m.agare = 'egen'
    group by 1, 2
  ) l
  where l.n >= 2
),
v(urval) as (
  values ('namn'), ('alla')
)
select
  o.maskin,
  o.typ,
  o.atgard,
  o.ar,
  v.urval,
  count(*)::int as antal_objekt,
  (count(*) filter (where o.g15_h > 0))::int as antal_med_g15,
  round(sum(o.volym), 1) as volym_m3fub,
  round(sum(o.g15_h), 1) as g15_h,
  round(sum(o.volym_rakn) filter (where o.g15_h > 0 and o.volym_rakn > 0) / nullif(sum(o.g15_h) filter (where o.g15_h > 0 and o.volym_rakn > 0), 0), 2) as m3_per_g15,
  round(sum(o.stammar) filter (where o.g15_h > 0 and o.stammar > 0) / nullif(sum(o.g15_h) filter (where o.g15_h > 0 and o.stammar > 0), 0), 1) as stammar_per_g15,
  round(sum(o.volym_rakn) filter (where o.stammar > 0 and o.volym_rakn > 0) / nullif(sum(o.stammar) filter (where o.stammar > 0 and o.volym_rakn > 0), 0), 3) as medelstam,
  (count(*) filter (where o.forv is not null))::int as antal_med_index,
  case when o.typ = 'skördare' and o.atgard in ('gallring', 'slutavverkning')
       then round(((sum(o.volym_rakn) filter (where o.forv is not null))::float8 / nullif(sum(o.g15_h::float8 * o.forv) filter (where o.forv is not null), 0) * 100)::numeric, 1) end as viktat_index,
  (count(*) filter (where o.avbrott_registrerade = 'ja'))::int as antal_rapporter_med_stopp,
  round((count(*) filter (where o.avbrott_registrerade = 'ja'))::numeric
        / nullif(count(*) filter (where o.avbrott_registrerade in ('ja', 'nej', 'osaker')), 0), 3) as andel_rapporter_med_stopp,
  round((sum(o.g15_h) filter (where o.avbrott_registrerade = 'ja'))
        / nullif((sum(o.g15_h) filter (where o.avbrott_registrerade = 'ja'))
                 + (sum(o.rep_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.serv_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.stor_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0, 0), 3) as tu,
  round((sum(o.rep_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
        / nullif((sum(o.g15_h) filter (where o.avbrott_registrerade = 'ja'))
                 + (sum(o.rep_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.serv_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.stor_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0, 0), 3) as reparationsgrad,
  round((sum(o.serv_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
        / nullif((sum(o.g15_h) filter (where o.avbrott_registrerade = 'ja'))
                 + (sum(o.rep_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.serv_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.stor_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0, 0), 3) as servicegrad,
  round((sum(o.stor_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
        / nullif((sum(o.g15_h) filter (where o.avbrott_registrerade = 'ja'))
                 + (sum(o.rep_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.serv_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0
                 + (sum(o.stor_min) filter (where o.avbrott_registrerade = 'ja')) / 60.0, 0), 3) as storningsgrad,
  round(sum(o.bransle_l) filter (where o.bransle_l > 0 and o.volym_rakn > 0) / nullif(sum(o.volym_rakn) filter (where o.bransle_l > 0 and o.volym_rakn > 0), 0), 3) as bransle_l_per_m3,
  round(sum(o.lass) filter (where o.lass > 0 and o.g15_h > 0) / nullif(sum(o.g15_h) filter (where o.lass > 0 and o.g15_h > 0), 0), 2) as lass_per_g15,
  (count(*) filter (where o.lass > 0))::int as antal_med_lass,
  (sum(o.volym_osaker))::int as antal_volym_osaker,
  round((sum(o.arbetstid_h * o.tu_rapporterad) filter (where o.arbetstid_h > 0 and o.tu_rapporterad is not null))
        / nullif(sum(o.arbetstid_h) filter (where o.arbetstid_h > 0 and o.tu_rapporterad is not null), 0), 3) as tu_rapporterad,
  (count(*) filter (where o.arbetstid_h > 0 and o.tu_rapporterad is not null))::int as antal_med_tu_rapporterad,
  round(sum(o.bransle_l) filter (where o.bransle_l > 0 and o.g15_h > 0) / nullif(sum(o.g15_h) filter (where o.bransle_l > 0 and o.g15_h > 0), 0), 1) as bransle_l_per_g15,
  case when o.atgard is null and o.ar is not null and v.urval = 'alla'
       then (select rak.kvot from rak where rak.maskin = o.maskin and rak.ar = o.ar) end as g15_per_timraknare,
  (count(*) filter (where o.harledd))::int as antal_volym_harledd,
  round(sum(o.volym) filter (where o.harledd), 1) as volym_harledd_m3,
  round(sum(o.g15_h) filter (where o.volym_rakn > 0 and o.g15_h > 0), 1) as g15_med_volym
from o
join v on (v.urval = 'alla' or o.urval = 'namn')
group by grouping sets (
  (o.maskin, o.typ, o.atgard, o.ar, v.urval),
  (o.maskin, o.typ, o.atgard, v.urval),
  (o.maskin, o.typ, o.ar, v.urval),
  (o.maskin, o.typ, v.urval)
);
