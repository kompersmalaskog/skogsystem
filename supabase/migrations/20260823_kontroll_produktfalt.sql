-- Kontrollpunkt 3 för #452: verifierar att de nya ProductDefinition-fälten
-- fylls korrekt efter första HPR-importen genom nya parsern.
--
-- Körs schemalagt (dagligen 18:04, task "kontroll-produktfalt") och
-- rapporterar till Martin. Den RÄTTAR ingenting — en avvikelse ska en
-- människa besluta om.
--
-- Fyra kontroller:
--   1. fylls de fyra kolumnerna alls
--   2. har grupp_kalla växlat från namn/tabell till 'fil'
--   3. är vy_normalisering_luckor fortfarande tom
--   4. har volymen inte MINSKAT jämfört med baslinjen
--
-- Om kontroll 4: en ÖKNING är normal — nya HPR-filer bär ny produktion, och
-- kumulativa filer kan dessutom fylla på dagar som redan delimporterats.
-- Att kräva exakt oförändrad totalvolym hade larmat på vanlig avverkning.
-- Det som inte får hända är att volym FÖRSVINNER, eller att ett sortiment
-- tappar sin grupp — det vore "ersatt i stället för kompletterat".

CREATE TABLE IF NOT EXISTS kontroll_baslinje (
  nyckel     text PRIMARY KEY,
  varde      jsonb NOT NULL,
  satt_tid   timestamptz NOT NULL DEFAULT now(),
  anteckning text
);

COMMENT ON TABLE kontroll_baslinje IS
  'Fryst mätvärde att jämföra mot efter en förändring. Skrivs EN gång före ändringen och rörs inte sedan — en baslinje som uppdateras är ingen baslinje.';

-- Baslinjen togs 2026-08-23 08:28 UTC, före deployen av #452:
--   aug_total 4609.1, aug_objekt 9, sortiment_med_grupp 236 av 264
-- ON CONFLICT DO NOTHING: en omkörning får aldrig skriva om den.
INSERT INTO kontroll_baslinje (nyckel, varde, anteckning)
SELECT 'produktfalt_fore_deploy',
       jsonb_build_object(
         'aug_total',   (sortimentsutfall_manad('2026-08-01','Allt','Vida')->>'total_volym')::numeric,
         'aug_objekt',  (sortimentsutfall_manad('2026-08-01','Allt','Vida')->>'antal_objekt')::int,
         'grupper',     sortimentsutfall_manad('2026-08-01','Allt','Vida')->'grupper',
         'sortiment_med_grupp', (SELECT COUNT(*) FROM vy_sortiment_klass WHERE grupp IS NOT NULL),
         'sortiment_totalt',    (SELECT COUNT(*) FROM dim_sortiment)
       ),
       'Tagen före deploy av #452 (nya ProductDefinition-fält). Augusti 2026, Vida, alla åtgärder.'
ON CONFLICT (nyckel) DO NOTHING;

CREATE OR REPLACE FUNCTION kontroll_produktfalt()
RETURNS jsonb LANGUAGE sql STABLE AS $k$
WITH bas AS (
  SELECT varde FROM kontroll_baslinje WHERE nyckel = 'produktfalt_fore_deploy'
),
falt AS (
  SELECT COUNT(*) FILTER (WHERE produktgrupp     IS NOT NULL) AS produktgrupp,
         COUNT(*) FILTER (WHERE destination_namn IS NOT NULL) AS destination_namn,
         COUNT(*) FILTER (WHERE destination_id   IS NOT NULL) AS destination_id,
         COUNT(*) FILTER (WHERE kundkod          IS NOT NULL) AS kundkod,
         COUNT(*) AS sortiment_totalt
  FROM dim_sortiment
),
kalla AS (
  SELECT COUNT(*) FILTER (WHERE grupp_kalla = 'fil')                 AS fran_fil,
         COUNT(*) FILTER (WHERE grupp_kalla = 'dim_sortiment_grupp') AS fran_tabell,
         COUNT(*) FILTER (WHERE grupp_kalla = 'namn')                AS fran_namn,
         COUNT(*) FILTER (WHERE grupp IS NOT NULL)                   AS med_grupp
  FROM vy_sortiment_klass
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
    THEN 'avvikelse'
    ELSE 'ok' END,
  'kontroll_1_falt_fylls', jsonb_build_object(
     'status', CASE WHEN (SELECT produktgrupp FROM falt) > 0 THEN 'ok' ELSE 'väntar' END,
     'produktgrupp', (SELECT produktgrupp FROM falt),
     'destination_namn', (SELECT destination_namn FROM falt),
     'destination_id', (SELECT destination_id FROM falt),
     'kundkod', (SELECT kundkod FROM falt),
     'av_totalt', (SELECT sortiment_totalt FROM falt),
     'not', 'Massaved saknar normalt ProductDestination — destination_namn < produktgrupp är väntat.'),
  'kontroll_2_grupp_kalla', jsonb_build_object(
     'status', CASE WHEN (SELECT fran_fil FROM kalla) > 0 THEN 'ok' ELSE 'väntar' END,
     'fran_fil', (SELECT fran_fil FROM kalla),
     'fran_dim_sortiment_grupp', (SELECT fran_tabell FROM kalla),
     'fran_namnharledning', (SELECT fran_namn FROM kalla)),
  'kontroll_3_luckor', jsonb_build_object(
     'status', CASE WHEN (SELECT antal FROM luckor) = 0 THEN 'ok' ELSE 'AVVIKELSE' END,
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

COMMENT ON FUNCTION kontroll_produktfalt() IS
  'Kontrollpunkt 3 för #452. status: väntar = ingen ny import har passerat nya parsern än; ok = alla fyra kontroller gröna; avvikelse = något ska rapporteras (rätta inget automatiskt).';
