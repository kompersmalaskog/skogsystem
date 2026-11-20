-- Lastbilens körning per månad, uppdelad på lastad / tom / okänd ur bilens bruttovikt (Uppföljning, steg 3, 2026-10-20).
--
-- Källa: lastbil_logg (en mätpunkt var ~8:e minut). Per punkt: odometer_m (mätare, meter), bransle_ml (ackumulerat, ml) och
-- radata->rfms->grossCombinationVehicleWeight (kg; 0 eller saknad = okänd).
--
-- SEGMENT = två på varandra följande mätpunkter för samma bil där mätaren har ÖKAT. Ett segment som inte rört sig (parkerad bil,
-- samma avläsning två gånger) och ett där mätaren gått bakåt räknas inte.
--
-- KLASS PER PUNKT: lastad om vikten ≥ 34 000 kg, tom om 0 < vikten < 34 000, annars okänd. 34 000 är samma gräns som
-- lassdetekteringen (LASS.LASTAD_KG i lib/lastbil/lass/detektera.ts; testet lastbilVikt.vakt.test.ts håller dem ihop).
--
-- KLASS PER SEGMENT (det som skiljer den här funktionen från "bara startpunktens vikt"):
--   • båda ändpunkterna kända och SAMMA klass  → den klassen
--   • bara EN ändpunkt känd                    → den klassen (en okänd ändpunkt motsäger ingenting)
--   • båda kända men OLIKA (lastat eller lossat inom segmentet) → okänd
--   • ingen känd                                → okänd
-- Skälet: vikten ändras bara när bilen står still (lastning, lossning). Är vikten densamma i båda ändar har segmentet körts i det
-- läget. Skiljer den sig har det hänt en lastning eller lossning någonstans i segmentet, och hur många km som kördes före och
-- efter går inte att veta — att lägga alltihop på start- eller slutvikten vore att gissa. Viktgivaren svajar ±5 t, så en punkt
-- som ligger precis över eller under 34 t i ett lass som annars väger 35–37 t hamnar också här (okänd) i stället för att
-- tyst räknas som tom.
--
-- MÅNAD = månaden (svensk tid) då segmentet BÖRJADE, som rundorna (en runda hör till den dag den startade).
--
-- LITER: skillnaden i bransle_ml mellan punkterna, bara när båda har värde och skillnaden inte är negativ (annars okänd för
-- segmentet). km_diesel_* är km för just de segment som har liter — l/mil ska räknas som liter / km_diesel * 10, aldrig mot
-- alla km, annars drar ett segment utan bränslevärde ner snittet.
--
-- Funktionen är security definer: lastbil_logg är inte öppen för förare, men månadssummorna ska kunna visas för alla inloggade
-- (Förbrukning och Körsträcka är samma för förare och admin). Ingen rad per månad utan segment. Läser bara, skriver inget.
create or replace function public.lastbil_vikt_manad(p_ar integer)
returns table (
  man integer,
  km_lastad numeric, liter_lastad numeric, km_diesel_lastad numeric,
  km_tom numeric, liter_tom numeric, km_diesel_tom numeric,
  km_okand numeric, liter_okand numeric, km_diesel_okand numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with punkt as (
    select vin, tidpunkt, odometer_m, bransle_ml,
           case when v ~ '^[0-9]+(\.[0-9]+)?$' then v::numeric end as vikt_kg
      from (select vin, tidpunkt, odometer_m, bransle_ml,
                   radata->'rfms'->>'grossCombinationVehicleWeight' as v
              from public.lastbil_logg
             where odometer_m is not null) x
  ),
  par as (
    select lag(tidpunkt) over w as fran_tid,
           odometer_m - lag(odometer_m) over w as d_m,
           case when bransle_ml is not null and lag(bransle_ml) over w is not null and bransle_ml >= lag(bransle_ml) over w
                then bransle_ml - lag(bransle_ml) over w end as d_ml,
           lag(vikt_kg) over w as vikt0,
           vikt_kg as vikt1
      from punkt
    window w as (partition by vin order by tidpunkt)
  ),
  klassad as (
    select fran_tid, d_m, d_ml,
           case when vikt0 >= 34000 then 'lastad' when vikt0 > 0 then 'tom' end as k0,
           case when vikt1 >= 34000 then 'lastad' when vikt1 > 0 then 'tom' end as k1
      from par
     where d_m > 0 and fran_tid is not null
  ),
  segment as (
    select extract(year  from fran_tid at time zone 'Europe/Stockholm')::int as ar,
           extract(month from fran_tid at time zone 'Europe/Stockholm')::int as man,
           d_m, d_ml,
           case when k0 is null and k1 is null then 'okand'
                when k0 is null then k1
                when k1 is null then k0
                when k0 = k1 then k0
                else 'okand' end as klass
      from klassad
  )
  select s.man,
         round(coalesce(sum(s.d_m) filter (where s.klass = 'lastad'), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_ml) filter (where s.klass = 'lastad'), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_m) filter (where s.klass = 'lastad' and s.d_ml is not null), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_m) filter (where s.klass = 'tom'), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_ml) filter (where s.klass = 'tom'), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_m) filter (where s.klass = 'tom' and s.d_ml is not null), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_m) filter (where s.klass = 'okand'), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_ml) filter (where s.klass = 'okand'), 0) / 1000.0, 3),
         round(coalesce(sum(s.d_m) filter (where s.klass = 'okand' and s.d_ml is not null), 0) / 1000.0, 3)
    from segment s
   where s.ar = p_ar
   group by s.man
   order by s.man;
$$;

comment on function public.lastbil_vikt_manad(integer) is
  'Lastbilens körning per månad ur lastbil_logg, delad på lastad (≥ 34 t) / tom / okänd. Segment = två mätpunkter där mätaren ökat; segmentets klass = ändpunkternas gemensamma klass, olika klasser = okänd. km_diesel_* = km för segment med bränslevärde (l/mil = liter / km_diesel * 10).';

revoke all on function public.lastbil_vikt_manad(integer) from public;
revoke all on function public.lastbil_vikt_manad(integer) from anon;
grant execute on function public.lastbil_vikt_manad(integer) to authenticated;
