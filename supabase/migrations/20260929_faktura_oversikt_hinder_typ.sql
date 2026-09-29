-- faktura_oversikt(): hinder_typ, så listan kan skilja två sorters väntan.
-- Martin kör i Supabase SQL editor. Idempotent (create or replace).
--
-- ─────────────────────────────────────────────────────────────────────────
-- VARFÖR: 49 trakter låg i "Behöver åtgärd" och 44 av dem saknade bara
-- kontraktsnummer. De fem som FAKTISKT inte går att prissätta — traillerflytt
-- utan ifyllda timmar — gick upp i mängden.
--
-- Två saker som kräver olika handling ska inte se likadana ut. Samma princip
-- som de tre åtskilda felstillstånden i faktura_rad: ett gemensamt "något är
-- fel" gör de mindre vanliga osynliga.
--
--   'traillertimmar'  raden går inte att prissätta alls
--   'kontraktsnr'     numret är inte ifyllt än, och fylls i direkt i listan
--   'kund'            bolaget saknar kundnummer (eget tillstånd sedan tidigare)
--
-- ⚠️ 44 OFYLLDA KONTRAKTSNUMMER ÄR INTE ETT ARBETSSÄTT.
-- Martin fakturerar ALLTID med kontraktsnummer; fältet har bara inte hunnit
-- fyllas i medan appen byggts. Att läsa tomma kolumner som ett val har vi
-- gjort fel fem gånger i det här spåret — det här är inte den sjätte.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function faktura_oversikt()
returns table (
  vo_nummer        text,
  namn             text,
  bolag            text,
  fortnox_kundnr   integer,
  avtalsform       text,
  tillstand        text,
  avrakningsdatum  date,
  objekt_antal     integer,
  volym_m3fub      numeric,
  g15h             numeric,
  hinder           text,
  hinder_typ       text,
  -- true = trakten har ingen rad i objekt-tabellen. Att fylla i ett
  -- kontraktsnummer LÄGGER DÅ UPP TRAKTEN (med saknar_planering), och det
  -- ska synas i vyn innan någon trycker.
  saknar_objektrad boolean
)
language sql
stable
as $$
  with vo as (
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
  berikad as (
    select v.*,
           b.fortnox_kundnr,
           coalesce(p.volym, 0)::numeric          as volym,
           round(coalesce(t.g15h, 0)::numeric, 1) as g15h,
           k.kontrakt,
           k.finns_rad,
           fl.flytt_utan_timmar,
           -- KONTRAKTSNUMMER ÄR ETT VIDA-BEGREPP. Privata markägare har inga,
           -- och Karl Hedin har aldrig haft något: av 36 slutavräknade
           -- icke-Vida-objekt har INGET någonsin haft ett nummer.
           -- Uteslutningen var tidigare en SLUMP — Privat saknar kundnummer,
           -- så kund-kontrollen fyrade först. Ger Martin Privat ett
           -- kundnummer hade 21 trakter plötsligt krävt ett nummer de aldrig
           -- kan ha. Regeln står nu på bolaget, inte på ordningen.
           -- ATA ÄR OBESVARAT: ett enda slutavräknat objekt, utan nummer.
           -- ATA är inte Vida, så regeln släpper det. Visar det sig att ATA
           -- har kontraktsnummer läggs bolaget till här.
           (v.bolag in ('Vida', 'Vida Energi')) as kraver_kontraktsnr
      from vo v
      left join bolag b on b.namn = v.bolag
      left join lateral (
        select sum(fp.volym_m3sub) as volym
          from fakt_produktion fp
          join dim_objekt d2 on d2.objekt_id = fp.objekt_id
         where d2.vo_nummer = v.vo_nummer
      ) p on true
      left join lateral (
        select sum(coalesce(ft.processing_sek, 0)
                 + coalesce(ft.terrain_sek, 0)
                 + coalesce(ft.other_work_sek, 0)) / 3600.0 as g15h
          from fakt_tid ft
          join dim_objekt d3 on d3.objekt_id = ft.objekt_id
         where d3.vo_nummer = v.vo_nummer
      ) t on true
      left join lateral (
        select max(o.kontraktsnummer) as kontrakt,
               count(*) > 0           as finns_rad
          from objekt o
         where o.vo_nummer = v.vo_nummer
      ) k on true
      left join lateral (
        select exists (
          select 1
            from fakturaunderlag_flytt f
            join objekt o
              on o.id::text = coalesce(f.faktura_objekt_id, f.till_objekt_id)
           where o.vo_nummer = v.vo_nummer
             and f.status = 'aktiv'
             and f.fakturerad_tid is null
             and coalesce(f.km, 0) > 30
             and f.traillertimmar is null
        ) as flytt_utan_timmar
      ) fl on true
  ),
  med_hinder as (
    select e.*,
           case when e.alla_klara and e.fortnox_kundnr is null then true else false end
             as ingen_gemensam_kund,
           -- ORDNINGEN ÄR INTE GODTYCKLIG. Traillertimmarna först: den raden
           -- går inte att prissätta alls, medan ett kontraktsnummer bara är
           -- ofyllt. Den som stoppar hårdast ska synas.
           case
             when not e.alla_klara         then null
             when e.fortnox_kundnr is null then 'kund'
             when e.flytt_utan_timmar      then 'traillertimmar'
             when e.kraver_kontraktsnr
              and e.kontrakt is null       then 'kontraktsnr'
             else null
           end as h_typ
      from berikad e
  )
  select m.vo_nummer,
         m.namn,
         m.bolag,
         m.fortnox_kundnr,
         case when m.timpeng then 'timpeng' else 'ackord' end as avtalsform,
         case
           when m.alla_klara and m.h_typ is null  then 'klar'
           when m.ingen_gemensam_kund             then 'ingen_gemensam_kund'
           when m.alla_klara                      then 'atgard'
           when m.nagot_paborjat                  then 'pagar'
           else 'ej_paborjad'
         end as tillstand,
         m.avr,
         m.objekt_antal,
         m.volym,
         m.g15h,
         case m.h_typ
           when 'kund'           then 'Bolaget ' || coalesce(m.bolag, '(saknas)')
                                        || ' faktureras inte på vo-nummer'
           when 'traillertimmar' then 'Traillerflytt utan ifyllda timmar'
           when 'kontraktsnr'    then 'Kontraktsnummer saknas'
           else null
         end as hinder,
         m.h_typ,
         not coalesce(m.finns_rad, false) as saknar_objektrad
    from med_hinder m
   order by m.avr desc nulls last, m.namn;
$$;

comment on function faktura_oversikt() is
  'Fakturaunderlagets lista: ett vo-nummer per rad med tillstånd, volym och '
  'G15-timmar. INGA PRISER — beloppet kräver hela prisformeln, och den får '
  'finnas på ETT ställe (lib/ekonomi/prisPerM3). hinder_typ skiljer det som '
  'inte går att prissätta (traillertimmar) från det som bara är ofyllt '
  '(kontraktsnr). KONTRAKTSNUMMER KRÄVS BARA AV VIDA och Vida Energi. '
  'saknar_objektrad = trakten har ingen rad i objekt, och att '
  'fylla i ett kontraktsnummer lägger då upp den. Hindren är en delmängd av '
  'radbyggarens: "klar" betyder inget KÄNT hinder.';

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: fem traillertimmar, 44 kontraktsnr, 31 kund, resten utan hinder.
select coalesce(hinder_typ, '(inget)') as hinder_typ,
       count(*) as antal,
       count(*) filter (where saknar_objektrad) as utan_objektrad
from faktura_oversikt() group by 1 order by 2 desc;
