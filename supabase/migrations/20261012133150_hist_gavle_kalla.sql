-- Historik steg 15: Gävle-regeln (Elephant King-volym = Giants volym på samma objekt) har egen orsak 'regel: gavle_volym_fran_giant'; visas som 'Från skördare'.
-- vy_hist_objekt_bas: volym_harledd_kalla = 'giant' för den orsaken. Övrigt oförändrat. Rör bara vyn vy_hist_objekt_bas.

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
  case when kh.sha256 is null then null when kh.orsak like 'regel: gavle_volym_fran_giant%' then 'giant' else substring(kh.orsak from 'volym_fran_skordare_(.*)$') end as volym_harledd_kalla
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
