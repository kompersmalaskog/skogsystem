-- Historik steg 14: Wisent-volym döljs efter FLAGGA, inte efter datum. volym_saknas_lass = Wisent med volym_kvalitet 'laster_x_1m3' (lass x 1 m3) eller 'schablon_10m3'
-- (lass x 10 m3), flaggan tas från lastcertifikat-tvillingen när den finns. Lastcertifikat med enheten m3_ej_angivet utan flagga (t.ex. alla från 2026-01) visas.
-- Bara CREATE OR REPLACE VIEW vy_hist_objekt_bas (samma kolumner, samma ordning); vy_hist_objekt_lista och vy_hist_maskin_ar läser redan volym_saknas_lass.

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
  (case when (m.namn = 'Ponsse Wisent' and coalesce(case when t.sha256 is not null then t.volym_kvalitet else o.volym_kvalitet end, '') in ('laster_x_1m3', 'schablon_10m3')) then null else coalesce(t.volym_m3fub, o.volym_m3fub) end)::numeric(12,3) as volym,
  coalesce(t.volym_enhet, o.volym_enhet) as volym_enhet,
  o.g15_h,
  o.g0_h,
  o.motortid_h,
  o.bransle_l,
  o.avbrott_reparation_min,
  o.avbrott_service_min,
  o.avbrott_storning_min,
  o.avbrott_registrerade,
  case when o.stammar > 0 and not (m.namn = 'Ponsse Wisent' and coalesce(case when t.sha256 is not null then t.volym_kvalitet else o.volym_kvalitet end, '') in ('laster_x_1m3', 'schablon_10m3')) then coalesce(t.volym_m3fub, o.volym_m3fub) / o.stammar::numeric else null::numeric end as medelstam,
  case when o.g15_h > 0::numeric and not (m.namn = 'Ponsse Wisent' and coalesce(case when t.sha256 is not null then t.volym_kvalitet else o.volym_kvalitet end, '') in ('laster_x_1m3', 'schablon_10m3')) then coalesce(t.volym_m3fub, o.volym_m3fub) / o.g15_h else null::numeric end as m3_per_g15,
  (m.namn = 'Ponsse Wisent' and coalesce(case when t.sha256 is not null then t.volym_kvalitet else o.volym_kvalitet end, '') in ('laster_x_1m3', 'schablon_10m3')) as volym_saknas_lass,
  t.sha256 as tvilling_sha,
  coalesce(t.skift_lass, t.antal_lass) as tvilling_lass,
  t.volym_kvalitet as tvilling_volym_kvalitet
from hist_objekt o
join hist_rapport r on r.sha256 = o.sha256
join hist_maskin m on m.id = r.hist_maskin_id
left join hist_korrigering k on k.sha256 = o.sha256 and k.falt = 'atgard'
left join lateral (
  select d.sha256, d.volym_m3fub, d.volym_enhet, d.volym_kvalitet, d.antal_lass,
         (select sum(s.antal_lass) from hist_skift s where s.sha256 = d.sha256) as skift_lass
  from hist_objekt d
  join hist_rapport dr on dr.sha256 = d.sha256
  where d.dubblett_av = o.sha256 and dr.format = 'lastcertifikat'
  order by d.sha256
  limit 1
) t on true
where o.raknas and m.agare = 'egen';

