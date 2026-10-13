-- Historikvyer för appen (steg 11): vy_hist_maskin_ar och vy_hist_objekt_lista. Bara CREATE VIEW vy_hist_*, security_invoker = true => bara admin ser rader
-- (RLS på hist_* kräver public.ar_admin()). Läser bara rader med raknas = true och hist_maskin.agare = 'egen' (via vy_hist_objekt_bas).
-- Inget lagras; allt räknas när vyn läses. Åtgärden kommer ur vy_hist_objekt_bas (hist_korrigering först, annars hist_objekt).
--
-- vy_hist_maskin_ar: en rad per maskin, åtgärd, år och urval.
--   urval = 'namn'  objekt vars åtgärd INTE är obekräftad maskinstandard (namn, mejlämne, rapportkategori, korrigering, regler)
--   urval = 'alla'  alla objekt (= 'namn' + obekräftad maskinstandard). "+N antagna" = antal_objekt('alla') - antal_objekt('namn').
-- Alla kvoter är viktade summor (summa täljare / summa nämnare), aldrig snitt av snitt. Kvoter räknas bara över objekt som har båda leden:
--   m3_per_g15 och stammar_per_g15 kräver G15 > 0; medelstam kräver stammar > 0 och volym > 0; bransle_l_per_m3 kräver bränsle > 0 och volym > 0;
--   lass_per_g15 kräver lass > 0 och G15 > 0 (lass ur hist_skift.antal_lass, annars hist_objekt.antal_lass).
--   viktat_index (bara skördare, gallring/slutavverkning) = summa volym / summa (G15 * förväntad m3/G15) * 100 över objekt med index (G15 >= 2 h).
--   tu, reparationsgrad, servicegrad, storningsgrad räknas över rapporter med avbrott_registrerade = 'ja' (TU = G15 / (G15 + reparation + service + störning)).
--   andel_rapporter_med_stopp = rapporter med registrerade avbrott av de som redovisar avbrott (ja / (ja + nej + osaker)).
--   antal_volym_osaker = objekt vars volym rapporten själv markerat som osäker (lass x 1 m3, schablon 10 m3).
-- Saknad data är NULL (aldrig 0): sidan visar det som ord.

create view vy_hist_maskin_ar with (security_invoker = true) as
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
    case when coalesce(ho.volym_kvalitet, '') <> '' then 1 else 0 end as volym_osaker,
    i.forvantad_m3_per_g15 as forv
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
  (sum(o.volym_osaker))::int as antal_volym_osaker
from o
join v on (v.urval = 'alla' or o.urval = 'namn')
group by o.maskin, o.typ, o.atgard, o.ar, v.urval;

-- vy_hist_objekt_lista: objekten bakom ett år, med sökväg till originalrapporten i bucketen historik (öppnas med createSignedUrl, bara admin).
-- antal_andra_utskrifter = rapporter som är dubbletter av just den här (kumulativa utskrifter, Mätbevis av samma objekt) och som inte räknas.
create view vy_hist_objekt_lista with (security_invoker = true) as
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
  i.index as index,
  i.forare,
  i.forare_andel,
  i.andel_kalla as forare_andel_kalla,
  b.avbrott_registrerade,
  ho.volym_kvalitet,
  r.storage_path,
  r.filtyp,
  r.format,
  r.filnamn,
  r.mejldatum,
  (select count(*) from hist_objekt d where d.dubblett_av = b.sha256)::int as antal_andra_utskrifter
from vy_hist_objekt_bas b
join hist_rapport r on r.sha256 = b.sha256
join hist_objekt ho on ho.sha256 = b.sha256
left join vy_hist_objekt_index i on i.sha256 = b.sha256;
