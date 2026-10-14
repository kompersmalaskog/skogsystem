-- Historik steg 14: Wisent-volym.
--  * Flaggregel i stället för datumregel: volym döljs (NULL) för Wisent när volym_kvalitet är 'laster_x_1m3' eller 'schablon_10m3'. Flaggan tas i ordning från
--    hist_korrigering (falt = 'volym_kvalitet', orsak 'regel: wisent_lass_x_1m3_utan_flagga'), lastcertifikat-tvillingen, rapporten själv.
--  * Lasstorlek: Wisent med synlig volym och m3/lass utanför 6-18 behåller volymen men märks volym_kvalitet = 'osaker_lasstorlek' och räknas inte med i
--    m3/G15, medelstam, index eller bränsle per m3 (väl i volymsumman). lass_eff = skiftlass, annars tvillingens lass, annars rapportens lass.
--  * vy_hist_objekt_bas får två nya sista kolumner (volym_osaker_lasstorlek, lass_eff). vy_hist_objekt_lista och vy_hist_maskin_ar följer med.
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
  e.lass as lass_eff
from hist_objekt o
join hist_rapport r on r.sha256 = o.sha256
join hist_maskin m on m.id = r.hist_maskin_id
left join hist_korrigering k on k.sha256 = o.sha256 and k.falt = 'atgard'
left join hist_korrigering kv on kv.sha256 = o.sha256 and kv.falt = 'volym_kvalitet'
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
         coalesce(t.volym_m3fub, o.volym_m3fub) as vol
) e
cross join lateral (
  select (m.namn = 'Ponsse Wisent' and coalesce(e.kvalitet, '') in ('laster_x_1m3', 'schablon_10m3')) as saknas
) f
cross join lateral (
  select (m.namn = 'Ponsse Wisent' and not f.saknas and e.vol > 0 and e.lass > 0 and (e.vol / e.lass < 6 or e.vol / e.lass > 18)) as osaker
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
  case when b.volym_saknas_lass then 'lass_utan_storlek' when b.volym_osaker_lasstorlek then 'osaker_lasstorlek' when b.tvilling_sha is not null then b.tvilling_volym_kvalitet else ho.volym_kvalitet end as volym_kvalitet,
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
    case when coalesce(case when b.tvilling_sha is not null then b.tvilling_volym_kvalitet else ho.volym_kvalitet end, '') <> '' or b.volym_saknas_lass or b.volym_osaker_lasstorlek then 1 else 0 end as volym_osaker,
    i.forvantad_m3_per_g15 as forv,
    ho.arbetstid_h, ho.tu_rapporterad
  from vy_hist_objekt_bas b
  join hist_objekt ho on ho.sha256 = b.sha256
  left join lass l on l.sha256 = b.sha256
  left join vy_hist_objekt_index i on i.sha256 = b.sha256
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
  round(sum(o.bransle_l) filter (where o.bransle_l > 0 and o.g15_h > 0) / nullif(sum(o.g15_h) filter (where o.bransle_l > 0 and o.g15_h > 0), 0), 1) as bransle_l_per_g15
from o
join v on (v.urval = 'alla' or o.urval = 'namn')
group by grouping sets (
  (o.maskin, o.typ, o.atgard, o.ar, v.urval),
  (o.maskin, o.typ, o.atgard, v.urval),
  (o.maskin, o.typ, o.ar, v.urval),
  (o.maskin, o.typ, v.urval)
);
