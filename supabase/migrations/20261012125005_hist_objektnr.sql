-- Historik steg 14, DEL B: objektnummer ur rapporterna + G15 per timräknare.
--  * hist_objekt: objektnr_normaliserat (6 siffror, primärt), virkesordernr_normaliserat (8 siffror, primärt), objektnr_alla text[] (alla 6- och 8-siffriga nummer
--    rapporten har, tvillingar delar) med GIN-index så att koppling på delat nummer (objektnr_alla && ...) går snabbt. Utesluts: datum, 12-siffriga tidsstämplar, 12345
--    och nummer som förekommer i fler än 25 rapporter. Värden skrivs separat (efter ja), den här migrationen skapar bara kolumnerna.
--  * vy_hist_maskin_ar: ny sista kolumn g15_per_timraknare (NULL om räknare saknas; bara rader för alla åtgärder och ett bestämt år, urval 'alla').
-- Rör bara hist_objekt (tre nya kolumner utan default) och vyn vy_hist_maskin_ar.

alter table hist_objekt add column if not exists objektnr_normaliserat text;
alter table hist_objekt add column if not exists virkesordernr_normaliserat text;
alter table hist_objekt add column if not exists objektnr_alla text[];
create index if not exists hist_objekt_objektnr_alla_gin on hist_objekt using gin (objektnr_alla);

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
       then (select rak.kvot from rak where rak.maskin = o.maskin and rak.ar = o.ar) end as g15_per_timraknare
from o
join v on (v.urval = 'alla' or o.urval = 'namn')
group by grouping sets (
  (o.maskin, o.typ, o.atgard, o.ar, v.urval),
  (o.maskin, o.typ, o.atgard, v.urval),
  (o.maskin, o.typ, o.ar, v.urval),
  (o.maskin, o.typ, v.urval)
);
