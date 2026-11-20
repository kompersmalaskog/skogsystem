-- Skotarlass: BARA lass där en människa tryckt Klar räknas som skotat (Martin 2026-10-26).
--
-- Före: allt som inte var struket och inte 'auto' räknades — också lass som låg kvar obesvarade (status vantar_forare / foreslaget). Appen skapade förut ett förifyllt lass vid
-- varje upptäckt lossning (Elefanten i Mölleryd 26/10: 11 obesvarade, ifyllda som förra lasset) och de drog ner Kvar. Efter: bara status 'bekraftat' (föraren i appen, eller en
-- planerare via granskningen) — strukna, obesvarade och det den gamla automatiken skapade ('auto') räknas aldrig. Inget raderas; raderna ligger kvar och syns som obesvarade_* i
-- admin-jämförelsen. Klienten gör samma sak i lib/skotarLass/lassModell.ts (raknasSomSkotat).
--
-- Rör: vyn skotar_lass_sortiment_skalat (läses av Besök på trakten/besok_volymer och skotat per avlägg), funktionen skotar_avslut_berakna (Färdigskotad) och vyn skotar_lass_mot_opti.
-- Additiv (nya kolumner sist). KÖRS INTE av kodsessionen — Martin kör via apply_migration; sedan döps filen om till versionen prod stämplat.

create or replace view skotar_lass_sortiment_skalat with (security_invoker = true) as
select l.id as lass_id, l.objekt_id, l.maskin_id, l.lass_nummer, l.datum, l.status,
       d.del_nr, d.avlagg_id, d.avlagg_nummer, d.lossad_tid,
       r.sortiment_nyckel, r.sortiment_namn, r.m3_forare,
       r.m3_forare * coalesce((a.faktorer ->> r.sortiment_nyckel)::numeric, 1) as m3_skalat
from skotar_lass l
join skotar_lass_del d on d.lass_id = l.id
join skotar_lass_sortiment r on r.lass_id = d.lass_id and r.del_nr = d.del_nr
left join skotar_trakt_avslut a on a.objekt_id = l.objekt_id
where l.status = 'bekraftat' and l.bekraftad_av is distinct from 'auto';

-- Admin-jämförelsen: app_* räknar bara bekräftade lass (det som räknas som skotat); gammal_* är det den gamla automatiken skapade (bekraftad_av 'auto'); obesvarade_* är lass som
-- väntar på föraren eller bara är förslag — de räknas aldrig. objekt_id sist, de nya kolumnerna sist av allt (en vy som ersätts får nya kolumner bara sist).
create or replace view skotar_lass_mot_opti with (security_invoker = true) as
with app as (
  select l.objekt_id, l.vo_nummer, l.maskin_id,
         count(distinct l.id) filter (where l.status = 'bekraftat' and l.bekraftad_av is distinct from 'auto') as app_lass,
         coalesce(sum(r.m3_forare) filter (where l.status = 'bekraftat' and l.bekraftad_av is distinct from 'auto'), 0) as app_m3,
         count(distinct l.id) filter (where l.bekraftad_av = 'auto') as gammal_lass,
         coalesce(sum(r.m3_forare) filter (where l.bekraftad_av = 'auto'), 0) as gammal_m3,
         count(distinct l.id) filter (where l.status in ('foreslaget', 'vantar_forare') and l.bekraftad_av is distinct from 'auto') as obesvarade_lass,
         coalesce(sum(r.m3_forare) filter (where l.status in ('foreslaget', 'vantar_forare') and l.bekraftad_av is distinct from 'auto'), 0) as obesvarade_m3
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
       coalesce(opti.opti_lass, 0) as opti_lass, coalesce(opti.opti_m3, 0) as opti_m3,
       coalesce(app.gammal_lass, 0) as gammal_lass, coalesce(app.gammal_m3, 0) as gammal_m3,
       app.objekt_id as objekt_id,
       coalesce(app.obesvarade_lass, 0) as obesvarade_lass, coalesce(app.obesvarade_m3, 0) as obesvarade_m3
from app
full join opti on opti.vo_nummer = app.vo_nummer and opti.maskin_id = app.maskin_id
where app.app_lass is not null;

grant select on skotar_lass_sortiment_skalat, skotar_lass_mot_opti to authenticated;

-- Färdigskotad: appens rapporterade volym per sortiment (nämnaren i skalfaktorn) = bara bekräftade lass.
create or replace function skotar_avslut_berakna(p_objekt uuid, p_opti jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_skordat jsonb;
  v_rapp jsonb;
  v_opti jsonb := '{}'::jsonb;
  v_fakt jsonb := '{}'::jsonb;
  v_till jsonb := '{}'::jsonb;
  v_skillnad numeric := 0;
  k text;
  s numeric;
  r numeric;
  o numeric;
  t numeric;
begin
  select coalesce(jsonb_object_agg(nyckel, m3), '{}'::jsonb) into v_skordat from skotar_skordat(p_objekt);
  select coalesce(jsonb_object_agg(sortiment_nyckel, m3), '{}'::jsonb) into v_rapp
  from (
    select rs.sortiment_nyckel, sum(rs.m3_forare) as m3
    from skotar_lass l
    join skotar_lass_sortiment rs on rs.lass_id = l.id
    where l.objekt_id = p_objekt and l.status = 'bekraftat' and l.bekraftad_av is distinct from 'auto'
    group by rs.sortiment_nyckel
  ) x;
  for k in select jsonb_object_keys(v_skordat) union select jsonb_object_keys(v_rapp) loop
    s := coalesce((v_skordat ->> k)::numeric, 0);
    r := coalesce((v_rapp ->> k)::numeric, 0);
    o := least(greatest(coalesce((coalesce(p_opti, '{}'::jsonb) ->> k)::numeric, 0), 0), s);
    t := s - o;
    if o > 0 then v_opti := v_opti || jsonb_build_object(k, o); end if;
    if r > 0 then v_fakt := v_fakt || jsonb_build_object(k, t / r);
    elsif t > 0 then v_till := v_till || jsonb_build_object(k, t);
    end if;
    v_skillnad := v_skillnad + greatest(t - r, 0);
  end loop;
  return jsonb_build_object('skordat', v_skordat, 'rapporterat', v_rapp, 'opti', v_opti, 'faktorer', v_fakt, 'tillagg', v_till, 'skillnad_m3', v_skillnad);
end;
$$;
