-- Historikvyer (steg 11): regler flyttas från hist_objekt till hist_korrigering. atgard_kalla i vyn ger samma värden som förut:
--   orsak 'regel: rottne_gallring_bekraftad'     -> 'maskinstandard_bekraftad'
--   orsak 'regel: arvd_fran_skordare'            -> 'arvd_fran_skordare'
--   orsak 'regel: arvd_fran_skordare_fuzzy'      -> 'arvd_fran_skordare_fuzzy'
--   övriga korrigeringar (manuella beslut)       -> 'korrigering'
-- Bara CREATE OR REPLACE VIEW vy_hist_objekt_bas (samma kolumner, samma ordning, samma typer). Inget annat rörs.

create or replace view vy_hist_objekt_bas with (security_invoker = true) as
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
  coalesce(k.nytt_varde, o.atgard) as atgard,
  case
    when k.nytt_varde is null then o.atgard_kalla
    when k.orsak = 'regel: rottne_gallring_bekraftad' then 'maskinstandard_bekraftad'
    when k.orsak like 'regel: arvd_fran_skordare%' then substring(k.orsak from 8)
    else 'korrigering'
  end as atgard_kalla,
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
left join hist_korrigering k on k.sha256 = o.sha256 and k.falt = 'atgard'
where o.raknas and m.agare = 'egen';
