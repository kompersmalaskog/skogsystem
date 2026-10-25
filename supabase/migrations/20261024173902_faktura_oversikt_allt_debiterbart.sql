-- Universum: dim_objekt-VO UNION trakter med debiterbart arbete i extra_tid.
-- Fyra nya, additiva kolumner. Inget befintligt tal ändrar värde (bevisat mot
-- prod 2026-10-24: 136 -> 137 rader, 1 tillskott (11277905 Arvidstorp),
-- 0 borttappade, 0 skillnader på de tolv gamla kolumnerna).
-- Full motivering i supabase/migrations/20261024_faktura_oversikt_allt_debiterbart.sql.
drop function if exists public.faktura_oversikt();

create function public.faktura_oversikt()
returns table(
  vo_nummer text, namn text, bolag text, fortnox_kundnr integer,
  avtalsform text, tillstand text, avrakningsdatum date, objekt_antal integer,
  volym_m3fub numeric, g15h numeric, hinder text, hinder_typ text,
  saknar_objektrad boolean,
  har_maskindata boolean, debiterbart_arbete_tim numeric,
  debiterbart_arbete_poster integer, manuell_skotartid_tim numeric
)
language sql
stable
as $function$
  with dim as (
    select d.vo_nummer,
           min(d.object_name)                                    as namn,
           max(d.bolag)                                          as bolag,
           bool_or(coalesce(d.timpeng, false)
                   or coalesce(d.huvudtyp, '') = 'Gallring')     as timpeng,
           bool_and(case when coalesce(d.egen_skotning, false)
                         then d.skordning_avslutad is not null
                         else d.skordning_avslutad is not null
                          and d.skotning_avslutad  is not null
                    end)                                         as alla_klara,
           bool_or(d.skordning_avslutad is not null
                   or d.skotning_avslutad is not null)           as nagot_paborjat,
           max(coalesce(d.skotning_avslutad, d.skordning_avslutad)) as avr,
           count(*)::int                                         as objekt_antal
      from dim_objekt d
     where not coalesce(d.exkludera, false)
       and d.vo_nummer is not null
     group by d.vo_nummer
  ),
  resolv as (
    select e.id, e.minuter,
           coalesce(
             (select o.vo_nummer from objekt o where o.vo_nummer = e.objekt_id limit 1),
             (select o2.vo_nummer from objekt_alt_nummer a
                join objekt o2 on o2.id = a.objekt_id
               where a.nummer = e.objekt_id limit 1)
           ) as vo_nummer
      from extra_tid e
     where e.debiterbar and e.objekt_id is not null
  ),
  arbete as (
    select r.vo_nummer, sum(r.minuter)::numeric as minuter, count(*)::int as poster
      from resolv r where r.vo_nummer is not null group by r.vo_nummer
  ),
  nycklar as (
    select vo_nummer from dim
    union
    select vo_nummer from arbete
  ),
  berikad as (
    select n.vo_nummer,
           coalesce(d.namn,  ob.namn)              as namn,
           coalesce(d.bolag, ob.bolag)             as bolag,
           coalesce(d.timpeng, false)              as timpeng,
           d.alla_klara, d.nagot_paborjat, d.avr,
           coalesce(d.objekt_antal, 0)             as objekt_antal,
           (d.vo_nummer is not null)               as har_maskindata,
           b.fortnox_kundnr,
           coalesce(p.volym, 0)::numeric           as volym,
           round(coalesce(t.g15h, 0)::numeric, 1)  as g15h,
           round(coalesce(ms.tim, 0)::numeric, 2)  as manuell_skotartid,
           round(coalesce(a.minuter, 0) / 60.0, 2) as arbete_tim,
           coalesce(a.poster, 0)                   as arbete_poster,
           k.kontrakt, k.finns_rad, fl.flytt_utan_timmar,
           (coalesce(d.bolag, ob.bolag) in ('Vida', 'Vida Energi')) as kraver_kontraktsnr
      from nycklar n
      left join dim d on d.vo_nummer = n.vo_nummer
      left join lateral (
        select o.namn, o.bolag from objekt o where o.vo_nummer = n.vo_nummer limit 1
      ) ob on true
      left join arbete a on a.vo_nummer = n.vo_nummer
      left join bolag b on b.namn = coalesce(d.bolag, ob.bolag)
      left join lateral (
        select sum(fp.volym_m3sub) as volym
          from fakt_produktion fp
          join dim_objekt d2 on d2.objekt_id = fp.objekt_id
         where d2.vo_nummer = n.vo_nummer
      ) p on true
      left join lateral (
        select sum(coalesce(ft.processing_sek, 0)
                 + coalesce(ft.terrain_sek, 0)
                 + coalesce(ft.other_work_sek, 0)) / 3600.0 as g15h
          from fakt_tid ft
          join dim_objekt d3 on d3.objekt_id = ft.objekt_id
         where d3.vo_nummer = n.vo_nummer
      ) t on true
      left join lateral (
        select sum(s.g15_timmar) as tim
          from skotare_objekt_manuell s
          join dim_objekt d5 on d5.objekt_id = s.objekt_id
         where d5.vo_nummer = n.vo_nummer
           and not coalesce(d5.exkludera, false)
           and s.g15_timmar is not null
      ) ms on true
      left join lateral (
        select max(o.kontraktsnummer) as kontrakt, count(*) > 0 as finns_rad
          from objekt o where o.vo_nummer = n.vo_nummer
      ) k on true
      left join lateral (
        select exists (
          select 1
            from fakturaunderlag_flytt f
            join objekt o on o.id::text = coalesce(f.faktura_objekt_id, f.till_objekt_id)
           where o.vo_nummer = n.vo_nummer
             and f.status = 'aktiv'
             and f.fakturerad_tid is null
             and f.godkand_tid is not null
             and coalesce(f.km, 0) > 30
             and f.traillertimmar is null
        ) as flytt_utan_timmar
      ) fl on true
  ),
  med_hinder as (
    select e.*,
           case when e.alla_klara and e.fortnox_kundnr is null then true else false end
             as ingen_gemensam_kund,
           case
             when not coalesce(e.alla_klara, false) then null
             when e.fortnox_kundnr is null then 'kund'
             when e.flytt_utan_timmar      then 'traillertimmar'
             when e.kraver_kontraktsnr and e.kontrakt is null then 'kontraktsnr'
             else null
           end as h_typ
      from berikad e
  )
  select m.vo_nummer, m.namn, m.bolag, m.fortnox_kundnr,
         case when m.timpeng then 'timpeng' else 'ackord' end as avtalsform,
         case
           when coalesce(m.alla_klara, false) and m.h_typ is null then 'klar'
           when m.ingen_gemensam_kund                            then 'ingen_gemensam_kund'
           when coalesce(m.alla_klara, false)                    then 'atgard'
           when coalesce(m.nagot_paborjat, false)                then 'pagar'
           else 'ej_paborjad'
         end as tillstand,
         m.avr, m.objekt_antal, m.volym, m.g15h,
         case m.h_typ
           when 'kund'           then 'Bolaget ' || coalesce(m.bolag, '(saknas)')
                                        || ' faktureras inte på vo-nummer'
           when 'traillertimmar' then 'Traillerflytt utan ifyllda timmar'
           when 'kontraktsnr'    then 'Kontraktsnummer saknas'
           else null
         end as hinder,
         m.h_typ,
         not coalesce(m.finns_rad, false) as saknar_objektrad,
         m.har_maskindata, m.arbete_tim, m.arbete_poster, m.manuell_skotartid
    from med_hinder m
   order by m.avr desc nulls last, m.namn;
$function$;

grant execute on function public.faktura_oversikt() to anon, authenticated, service_role;

comment on function public.faktura_oversikt() is
  'Faktureringsvyns lista. Universum: dim_objekt-VO UNION trakter med debiterbart arbete i extra_tid (upplost via objekt.vo_nummer eller objekt_alt_nummer). tillstand speglar MASKINERNAS avslut; debiterbart_arbete_tim och manuell_skotartid_tim ar egna falt och bakas aldrig in i g15h - radbyggaren prissatter ur fakt_tid, och tva tal for samma trakt far inte skilja sig.';
