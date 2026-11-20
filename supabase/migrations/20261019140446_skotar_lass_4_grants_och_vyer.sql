revoke execute on function skotar_lass_del_spara(uuid, jsonb), skotar_lass_rad_spara(uuid, jsonb), skotar_lass_rensa_delar(uuid), skotar_avslut_berakna(uuid) from public, anon, authenticated;
grant execute on function skotar_lass_spara(jsonb), skotar_skordat(uuid), skotar_farduskotat(uuid) to authenticated;
revoke execute on function skotar_lass_spara(jsonb), skotar_skordat(uuid), skotar_farduskotat(uuid) from anon;

create or replace view skotar_lass_sortiment_skalat with (security_invoker = true) as
select l.id as lass_id, l.objekt_id, l.maskin_id, l.lass_nummer, l.datum, l.status,
       d.del_nr, d.avlagg_id, d.avlagg_nummer, d.lossad_tid,
       r.sortiment_nyckel, r.sortiment_namn, r.m3_forare,
       r.m3_forare * coalesce((a.faktorer ->> r.sortiment_nyckel)::numeric, 1) as m3_skalat
from skotar_lass l
join skotar_lass_del d on d.lass_id = l.id
join skotar_lass_sortiment r on r.lass_id = d.lass_id and r.del_nr = d.del_nr
left join skotar_trakt_avslut a on a.objekt_id = l.objekt_id
where l.status <> 'struket';

create or replace view skotar_lass_mot_opti with (security_invoker = true) as
with app as (
  select l.objekt_id, l.vo_nummer, l.maskin_id,
         count(distinct l.id) as app_lass,
         coalesce(sum(r.m3_forare), 0) as app_m3
  from skotar_lass l
  left join skotar_lass_sortiment r on r.lass_id = l.id
  where l.status <> 'struket' and ar_admin()
  group by l.objekt_id, l.vo_nummer, l.maskin_id
),
opti as (
  select f.objekt_id as vo_nummer, f.maskin_id, count(*) as opti_lass, coalesce(sum(f.volym_m3sub), 0) as opti_m3
  from fakt_lass f
  where ar_admin()
  group by f.objekt_id, f.maskin_id
)
select coalesce(app.vo_nummer, opti.vo_nummer) as vo_nummer,
       coalesce(app.maskin_id, opti.maskin_id) as maskin_id,
       coalesce(app.app_lass, 0) as app_lass, coalesce(app.app_m3, 0) as app_m3,
       coalesce(opti.opti_lass, 0) as opti_lass, coalesce(opti.opti_m3, 0) as opti_m3
from app
full join opti on opti.vo_nummer = app.vo_nummer and opti.maskin_id = app.maskin_id
where app.app_lass is not null;

grant select on skotar_lass_sortiment_skalat, skotar_lass_mot_opti to authenticated;
