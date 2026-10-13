-- Historik steg 13 (del 2): skotare-skördare-koppling, Wisent-volym efter 2024-09 och åtgärdskälla för kopplade skotare.
--  * hist_skotare_koppling: länkar skotarrapport -> skördarrapport (metod a = samma objekt i Skogsystem, b = samma objektnr, c = namn >= 0,9 och 0-120 dagar). Många-till-många.
--    Kopplingen används ALDRIG för volym, bara för skotarens åtgärd (regel i hist_korrigering: "regel: kopplad_till_skordare_<metod>").
--  * vy_hist_objekt_bas: ny sista kolumn volym_saknas_lass. Ponsse Wisent från 2024-09-01 har lass utan storlek: volymen nollställs (NULL) och märks. atgard_kalla får
--    värdet kopplad_till_skordare_<metod> för de nya reglerna.
--  * vy_hist_objekt_lista: volym_kvalitet = 'lass_utan_storlek' för sådana rader. vy_hist_maskin_ar: räknar dem som osäker volym.
-- Rör bara nya hist_skotare_koppling och vyerna vy_hist_*. Inget annat.

create table hist_skotare_koppling (
  skotare_sha256 text not null references hist_rapport(sha256),
  skordare_sha256 text not null references hist_rapport(sha256),
  metod text not null check (metod in ('a', 'b', 'c')),
  sakerhet numeric not null,
  primary key (skotare_sha256, skordare_sha256)
);

create index hist_skotare_koppling_skordare on hist_skotare_koppling (skordare_sha256);

alter table hist_skotare_koppling enable row level security;

create policy hist_skotare_koppling_las on hist_skotare_koppling for select to authenticated using ((select public.ar_admin()));

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
  (case when m.namn = 'Ponsse Wisent' and coalesce(o.startdatum, o.rapportdatum) >= date '2024-09-01' then null else o.volym_m3fub end)::numeric(12,3) as volym,
  o.volym_enhet,
  o.g15_h,
  o.g0_h,
  o.motortid_h,
  o.bransle_l,
  o.avbrott_reparation_min,
  o.avbrott_service_min,
  o.avbrott_storning_min,
  o.avbrott_registrerade,
  case when o.stammar > 0 and not (m.namn = 'Ponsse Wisent' and coalesce(o.startdatum, o.rapportdatum) >= date '2024-09-01') then o.volym_m3fub / o.stammar::numeric else null::numeric end as medelstam,
  case when o.g15_h > 0::numeric and not (m.namn = 'Ponsse Wisent' and coalesce(o.startdatum, o.rapportdatum) >= date '2024-09-01') then o.volym_m3fub / o.g15_h else null::numeric end as m3_per_g15,
  (m.namn = 'Ponsse Wisent' and coalesce(o.startdatum, o.rapportdatum) >= date '2024-09-01') as volym_saknas_lass
from hist_objekt o
join hist_rapport r on r.sha256 = o.sha256
join hist_maskin m on m.id = r.hist_maskin_id
left join hist_korrigering k on k.sha256 = o.sha256 and k.falt = 'atgard'
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
  case when b.volym_saknas_lass then 'lass_utan_storlek' else ho.volym_kvalitet end as volym_kvalitet,
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
    b.volym, b.g15_h, b.stammar, b.bransle_l, b.avbrott_registrerade,
    coalesce(b.avbrott_reparation_min, 0) as rep_min,
    coalesce(b.avbrott_service_min, 0) as serv_min,
    coalesce(b.avbrott_storning_min, 0) as stor_min,
    coalesce(l.lass, ho.antal_lass) as lass,
    case when coalesce(ho.volym_kvalitet, '') <> '' or b.volym_saknas_lass then 1 else 0 end as volym_osaker,
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
  round(sum(o.volym) filter (where o.g15_h > 0 and o.volym > 0) / nullif(sum(o.g15_h) filter (where o.g15_h > 0 and o.volym > 0), 0), 2) as m3_per_g15,
  round(sum(o.stammar) filter (where o.g15_h > 0 and o.stammar > 0) / nullif(sum(o.g15_h) filter (where o.g15_h > 0 and o.stammar > 0), 0), 1) as stammar_per_g15,
  round(sum(o.volym) filter (where o.stammar > 0 and o.volym > 0) / nullif(sum(o.stammar) filter (where o.stammar > 0 and o.volym > 0), 0), 3) as medelstam,
  (count(*) filter (where o.forv is not null))::int as antal_med_index,
  case when o.typ = 'skördare' and o.atgard in ('gallring', 'slutavverkning')
       then round(((sum(o.volym) filter (where o.forv is not null))::float8 / nullif(sum(o.g15_h::float8 * o.forv) filter (where o.forv is not null), 0) * 100)::numeric, 1) end as viktat_index,
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
  round(sum(o.bransle_l) filter (where o.bransle_l > 0 and o.volym > 0) / nullif(sum(o.volym) filter (where o.bransle_l > 0 and o.volym > 0), 0), 3) as bransle_l_per_m3,
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
