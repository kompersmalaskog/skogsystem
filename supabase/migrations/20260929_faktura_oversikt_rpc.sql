-- faktura_oversikt() — hela listan i EN fråga.
-- Martin kör i Supabase SQL editor. Idempotent (create or replace).
--
-- ─────────────────────────────────────────────────────────────────────────
-- VARFÖR: listan körde radbyggaren per trakt och blev aldrig klar.
--
-- Mätt: 362 ms per trakt genom hamtaVoUnderlag, alltså ~24 sekunder för de
-- 64 som låg i 90-dagarsfönstret. Routen svarade 200 till slut lokalt, men i
-- produktion slog den i Vercels förvalda gräns och 504:ade — utan att något
-- syntes, eftersom gränsen aldrig var satt.
--
-- Samma urval med aggregeringen i databasen: 122 ms för ALLA 123 vo-nummer.
-- Tvåhundra gånger, och utan fönster.
--
-- ⚠️ INGA PRISER HÄR, OCH DET ÄR ETT VAL.
-- Beloppet skulle kräva medelstam, klassuppslag, tillägg, fördelning och
-- avstånd — alltså hela prisformeln, en gång till, i SQL. Två implementationer
-- av samma pris är exakt den felklass acord_flyttkostnad var mot Fortnox, och
-- som skotningsavståndets två generationer och taxornas giltig_fran var.
-- En kolumn i en lista är inte värd att öppna den igen.
--
-- Listan visar VOLYM och TIMMAR, som kommer gratis ur samma fråga. Beloppet
-- räknas av lib/faktura/radbyggare när en trakt öppnas, och kommer tillbaka
-- till listan den dag status finns — då är "klara att fakturera" en handfull
-- och inte 64, och byggaren kostar ingenting för dem.
--
-- ⚠️ fakt_produktion OCH fakt_tid AGGREGERAS VAR FÖR SIG i två laterala
-- delfrågor. En direkt join multiplicerar tiden med antalet produktionsrader
-- per dag — se CLAUDE.md.
--
-- ETT SAKNAT KUNDNUMMER ÄR INTE ETT HINDER ATT ÅTGÄRDA. Privat faktureras
-- per markägare och Karl Hedin behövs inte framåt — 31 trakter som annars
-- hade legat som en uppgift som inte finns, och dränkt de fem riktiga.
-- De får ett eget tillstånd, 'ingen_gemensam_kund'.
--
-- HINDREN HÄR ÄR EN DELMÄNGD AV radbyggarens, aldrig en egen bedömning.
-- Kundnummer, kontraktsnummer och traillertimmar är de tre som går att se
-- utan att räkna. Säger listan "behöver åtgärd" säger trakten det också.
-- Säger listan "klar" betyder det "inget KÄNT hinder" — en saknad prissats
-- upptäcks först när trakten öppnas, och det ska vyn skriva ut.
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
  hinder           text
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
           -- HELA gruppen måste vara klar. Jätsbygd har två objektrader och
           -- en saknar skördningsdatum; räckte det att NÅGON var klar hade
           -- listan och trakten sagt olika om samma VO.
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
           fl.flytt_utan_timmar
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
        select max(o.kontraktsnummer) as kontrakt
          from objekt o
         where o.vo_nummer = v.vo_nummer
           and o.kontraktsnummer is not null
      ) k on true
      left join lateral (
        -- Flytten bärs av till-objektet, om den inte pekats om vid granskning.
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
           -- ETT SAKNAT KUNDNUMMER ÄR INTE EN ÅTGÄRD.
           -- Privat faktureras per markägare och Karl Hedin behövs inte
           -- framåt — båda har NULL med flit (se bolag.fortnox_kundnr).
           -- Att lägga dem bland "behöver åtgärd" gör 31 trakter till en
           -- uppgift som inte finns, och dränker de fem som är riktiga.
           case when e.alla_klara and e.fortnox_kundnr is null then true else false end
             as ingen_gemensam_kund,
           case
             when not e.alla_klara             then null
             when e.fortnox_kundnr is null     then 'Bolaget ' || coalesce(e.bolag, '(saknas)')
                                                    || ' faktureras inte på vo-nummer'
             when e.kontrakt is null           then 'Kontraktsnummer saknas'
             when e.flytt_utan_timmar          then 'Traillerflytt utan ifyllda timmar'
             else null
           end as hinder
      from berikad e
  )
  select m.vo_nummer,
         m.namn,
         m.bolag,
         m.fortnox_kundnr,
         case when m.timpeng then 'timpeng' else 'ackord' end as avtalsform,
         case
           when m.alla_klara and m.hinder is null then 'klar'
           when m.ingen_gemensam_kund             then 'ingen_gemensam_kund'
           when m.alla_klara                      then 'atgard'
           when m.nagot_paborjat                  then 'pagar'
           else 'ej_paborjad'
         end as tillstand,
         m.avr,
         m.objekt_antal,
         m.volym,
         m.g15h,
         m.hinder
    from med_hinder m
   order by m.avr desc nulls last, m.namn;
$$;

comment on function faktura_oversikt() is
  'Fakturaunderlagets lista: ett vo-nummer per rad med tillstånd, volym och '
  'G15-timmar. INGA PRISER — beloppet kräver hela prisformeln, och den får '
  'finnas på ETT ställe (lib/ekonomi/prisPerM3). Hindren är en delmängd av '
  'radbyggarens: kundnummer, kontraktsnummer och traillertimmar går att se '
  'utan att räkna. "klar" betyder inget KÄNT hinder, inte att trakten är '
  'garanterat prissättbar.';

-- SECURITY INVOKER (förvalet). Funktionen läser bara tabeller som redan har
-- sin RLS; den ska inte kunna visa mer än anroparen får se. Routen kör med
-- service-nyckel och ser allt, vilket är rätt för en admin-vy.

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: ~123 rader, en per vo-nummer, på långt under en sekund.
select tillstand, count(*) as antal, round(sum(volym_m3fub)) as volym
from faktura_oversikt() group by tillstand order by 2 desc;
