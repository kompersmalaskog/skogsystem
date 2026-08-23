-- Kontroll 2 får en övergångskontroll.
--
-- Utgångsläget avslöjade något: av 236 sortiment med grupp kom ALLA från
-- dim_sortiment_grupp. Namnhärledningen svarade för noll. Kedjan har tre led
-- men bara ett bär — och då är den inte tre gånger säkrare, den är ett led
-- med två reserver som aldrig testats.
--
-- Konsekvensen: lämnar ett sortiment tabell-ledet ska det ha gått till
-- FIL-ledet. Glider det i stället ner till namnhärledningen har det bytt en
-- starkare källa mot en svagare. Det syns INTE i med_grupp, för gruppen
-- finns kvar — bara källan blev sämre.
--
--   tapp = (antal som lämnat tabell-ledet) - (antal som tillkommit fil-ledet)
--
-- tapp > 0 är en avvikelse. Baslinjen (fil 0 / tabell 236 / namn 0) fryses
-- separat, före första importen genom nya parsern.

INSERT INTO kontroll_baslinje (nyckel, varde, anteckning)
SELECT 'produktfalt_grupp_kalla_fore',
       jsonb_build_object(
         'fran_fil',    COUNT(*) FILTER (WHERE grupp_kalla = 'fil'),
         'fran_tabell', COUNT(*) FILTER (WHERE grupp_kalla = 'dim_sortiment_grupp'),
         'fran_namn',   COUNT(*) FILTER (WHERE grupp_kalla = 'namn')),
       'Fördelning per led före deploy av #452. Hela grupplagret vilade på dim_sortiment_grupp — kedjan har tre led men bara ett bar.'
FROM vy_sortiment_klass
ON CONFLICT (nyckel) DO NOTHING;

CREATE OR REPLACE FUNCTION kontroll_produktfalt()
RETURNS jsonb LANGUAGE sql STABLE AS $k$
WITH bas AS (SELECT varde FROM kontroll_baslinje WHERE nyckel='produktfalt_fore_deploy'),
     bask AS (SELECT varde FROM kontroll_baslinje WHERE nyckel='produktfalt_grupp_kalla_fore'),
falt AS (
  SELECT COUNT(*) FILTER (WHERE produktgrupp     IS NOT NULL) AS produktgrupp,
         COUNT(*) FILTER (WHERE destination_namn IS NOT NULL) AS destination_namn,
         COUNT(*) FILTER (WHERE destination_id   IS NOT NULL) AS destination_id,
         COUNT(*) FILTER (WHERE kundkod          IS NOT NULL) AS kundkod,
         COUNT(*) AS sortiment_totalt
  FROM dim_sortiment
),
kalla AS (
  SELECT COUNT(*) FILTER (WHERE grupp_kalla='fil')                 AS fran_fil,
         COUNT(*) FILTER (WHERE grupp_kalla='dim_sortiment_grupp') AS fran_tabell,
         COUNT(*) FILTER (WHERE grupp_kalla='namn')                AS fran_namn,
         COUNT(*) FILTER (WHERE grupp IS NOT NULL)                 AS med_grupp
  FROM vy_sortiment_klass
),
overgang AS (
  SELECT GREATEST(0, ((SELECT varde FROM bask)->>'fran_tabell')::int - k.fran_tabell) AS lamnat_tabell,
         GREATEST(0, k.fran_fil - ((SELECT varde FROM bask)->>'fran_fil')::int)       AS tillkommit_fil,
         GREATEST(0, ((SELECT varde FROM bask)->>'fran_tabell')::int - k.fran_tabell)
           - GREATEST(0, k.fran_fil - ((SELECT varde FROM bask)->>'fran_fil')::int)   AS tapp
  FROM kalla k
),
luckor AS (
  SELECT COUNT(*) AS antal,
         COALESCE(jsonb_agg(jsonb_build_object('doman',doman,'ra_varde',ra_varde,
                            'sortiment',sortiment,'maskiner',maskiner)), '[]'::jsonb) AS rader
  FROM vy_normalisering_luckor
),
nu AS (
  SELECT (sortimentsutfall_manad('2026-08-01','Allt','Vida')->>'total_volym')::numeric AS aug_total,
         (sortimentsutfall_manad('2026-08-01','Allt','Vida')->>'antal_objekt')::int    AS aug_objekt
)
SELECT jsonb_build_object(
  'kord', now(),
  'status', CASE
    WHEN (SELECT produktgrupp FROM falt) = 0 THEN 'väntar'
    WHEN (SELECT antal FROM luckor) > 0
      OR (SELECT aug_total FROM nu) < ((SELECT varde FROM bas)->>'aug_total')::numeric
      OR (SELECT med_grupp FROM kalla) < ((SELECT varde FROM bas)->>'sortiment_med_grupp')::int
      OR (SELECT fran_fil FROM kalla) = 0
      OR (SELECT tapp FROM overgang) > 0
    THEN 'avvikelse' ELSE 'ok' END,
  'kontroll_1_falt_fylls', jsonb_build_object(
     'status', CASE WHEN (SELECT produktgrupp FROM falt) > 0 THEN 'ok' ELSE 'väntar' END,
     'produktgrupp', (SELECT produktgrupp FROM falt),
     'destination_namn', (SELECT destination_namn FROM falt),
     'destination_id', (SELECT destination_id FROM falt),
     'kundkod', (SELECT kundkod FROM falt),
     'av_totalt', (SELECT sortiment_totalt FROM falt),
     'not', 'Massaved saknar normalt ProductDestination — destination_namn < produktgrupp är väntat.'),
  'kontroll_2_grupp_kalla', jsonb_build_object(
     'status', CASE WHEN (SELECT tapp FROM overgang) > 0 THEN 'AVVIKELSE'
                    WHEN (SELECT fran_fil FROM kalla) > 0 THEN 'ok' ELSE 'väntar' END,
     'fran_fil', (SELECT fran_fil FROM kalla),
     'fran_dim_sortiment_grupp', (SELECT fran_tabell FROM kalla),
     'fran_namnharledning', (SELECT fran_namn FROM kalla),
     'fore', (SELECT varde FROM bask),
     'lamnat_tabell', (SELECT lamnat_tabell FROM overgang),
     'tillkommit_fil', (SELECT tillkommit_fil FROM overgang),
     'tapp', (SELECT tapp FROM overgang),
     'not', 'Hela grupplagret vilade på dim_sortiment_grupp före ändringen (236 av 236) — kedjan har tre led men bara ett bar. Sjunker tabell-ledet utan att fil-ledet stiger lika mycket är det ett TAPP, inte en övergång: sortimentet har fallit till en svagare källa. Det syns inte i med_grupp, för gruppen finns kvar.'),
  'kontroll_3_luckor', jsonb_build_object(
     'status', CASE WHEN (SELECT antal FROM luckor)=0 THEN 'ok' ELSE 'AVVIKELSE' END,
     'antal', (SELECT antal FROM luckor),
     'rader', (SELECT rader FROM luckor),
     'atgard', 'Lägg in värdet i normalisering_karta med en INSERT. Ignorera aldrig — volymen redovisas som Ej klassad tills dess.'),
  'kontroll_4_volym', jsonb_build_object(
     'status', CASE WHEN (SELECT aug_total FROM nu) < ((SELECT varde FROM bas)->>'aug_total')::numeric
                      OR (SELECT med_grupp FROM kalla) < ((SELECT varde FROM bas)->>'sortiment_med_grupp')::int
                    THEN 'AVVIKELSE' ELSE 'ok' END,
     'aug_fore',  ((SELECT varde FROM bas)->>'aug_total')::numeric,
     'aug_nu',    (SELECT aug_total FROM nu),
     'differens', (SELECT aug_total FROM nu) - ((SELECT varde FROM bas)->>'aug_total')::numeric,
     'objekt_fore', ((SELECT varde FROM bas)->>'aug_objekt')::int,
     'objekt_nu', (SELECT aug_objekt FROM nu),
     'sortiment_med_grupp_fore', ((SELECT varde FROM bas)->>'sortiment_med_grupp')::int,
     'sortiment_med_grupp_nu', (SELECT med_grupp FROM kalla),
     'not', 'Ökning är normal — nya HPR-filer bär ny produktion. MINSKNING är larmet: då har något ersatts i stället för kompletterats.')
);
$k$;
