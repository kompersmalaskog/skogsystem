-- Samma förare på olika maskiner, per åtgärd. En rad per förare × åtgärd × maskin.
-- Bara skördare med index (gallring, slutavverkning), bara egna maskiner, aldrig tekniska förare (vy_hist_objekt_index släpper dem redan),
-- bara objekt där föraren kört minst 80 % (samma urval som vy_hist_forare_maskin) och bara åtgärd ur namn/rapport, aldrig antagen maskinstandard.
-- Siffrorna räknas som i vy_hist_maskin_ar, men på förarens objekt. G15 är objektens G15 (inte förarens exakta timmar).
-- Läser bara vy_hist_ och hist_. security_invoker: RLS (public.ar_admin()) på hist_* gäller för den som läser.
-- Urvalet "minst 2 maskiner" och gränsen 200 h ligger i appen (lib/historik/sammaForare.ts), inte här.
create or replace view public.vy_hist_forare_maskin_jamfor with (security_invoker = true) as
with o as (
  select i.forare, i.maskin, i.atgard, i.ar,
         b.g15_h, b.volym,
         case when b.volym_osaker_lasstorlek then null else b.volym end as volym_rakn,
         b.avbrott_registrerade,
         coalesce(b.avbrott_reparation_min, 0) as rep_min,
         coalesce(b.avbrott_service_min, 0)    as serv_min,
         coalesce(b.avbrott_storning_min, 0)   as stor_min,
         i.forvantad_m3_per_g15 as forv,
         ho.arbetstid_h, ho.tu_rapporterad
  from vy_hist_objekt_index i
  join vy_hist_objekt_bas b on b.sha256 = i.sha256
  join hist_objekt ho on ho.sha256 = i.sha256
  where i.index is not null
    and i.forare is not null
    and i.forare_andel >= 0.8
    and i.andel_kalla in ('g15', 'tid')
    and coalesce(b.atgard_kalla, '') <> 'maskinstandard'
)
select forare, atgard, maskin,
       count(*) over (partition by forare, atgard)::integer as antal_maskiner,
       min(ar) as ar_fran,
       max(ar) as ar_till,
       count(*)::integer as antal_objekt,
       round(sum(g15_h), 1) as g15_h,
       round((sum(volym_rakn) filter (where forv is not null)::double precision
              / nullif(sum(g15_h::double precision * forv) filter (where forv is not null), 0) * 100)::numeric, 1) as viktat_index,
       round(sum(g15_h) filter (where avbrott_registrerade = 'ja')
             / nullif(sum(g15_h) filter (where avbrott_registrerade = 'ja')
                      + sum(rep_min) filter (where avbrott_registrerade = 'ja')::numeric / 60.0
                      + sum(serv_min) filter (where avbrott_registrerade = 'ja')::numeric / 60.0
                      + sum(stor_min) filter (where avbrott_registrerade = 'ja')::numeric / 60.0, 0), 3) as tu,
       (count(*) filter (where avbrott_registrerade = 'ja'))::integer as antal_med_tu,
       round(sum(arbetstid_h * tu_rapporterad) filter (where arbetstid_h > 0 and tu_rapporterad is not null)
             / nullif(sum(arbetstid_h) filter (where arbetstid_h > 0 and tu_rapporterad is not null), 0), 3) as tu_rapporterad,
       round(sum(volym_rakn) filter (where g15_h > 0 and volym_rakn > 0)
             / nullif(sum(g15_h) filter (where g15_h > 0 and volym_rakn > 0), 0), 2) as m3_per_g15
from o
group by forare, atgard, maskin;
