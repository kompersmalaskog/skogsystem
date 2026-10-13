-- Historikvyer (steg 10): åtgärden läses från hist_korrigering först (falt = 'atgard'), annars från hist_objekt. hist_objekt.atgard skrivs aldrig över.
-- Bara CREATE OR REPLACE VIEW för vy_hist_objekt_bas (samma kolumner i samma ordning och med samma typer; atgard/atgard_kalla får bara ett nytt uttryck).
-- Övriga vyer (normkurva, objekt_index, index_ar, forare_maskin, tid_ar) bygger på vy_hist_objekt_bas och får korrigeringarna automatiskt.
-- Åtgärden 'special' och 'skada' ingår varken i normkurvan (som bara tar gallring/slutavverkning) eller får index (kurvan saknas) -> visas för sig.
-- atgard_kalla = 'korrigering' för korrigerade rader; urval i vy_hist_index_ar/forare_maskin räknar det som 'namn'.

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
  case when k.nytt_varde is not null then 'korrigering' else o.atgard_kalla end as atgard_kalla,
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
