-- affar_oversikt: snabbare — samma resultat, kraftigt kortare körtid som `authenticated` (RLS gäller).
-- OBS (samma dag, efter mätning): den här omskrivningen räckte INTE som LANGUAGE sql-funktion. Med okända parametrar gissar planeraren fel
-- på tidsfiltret (generisk plan) och funktionen gav 57014 (8,6 s) som authenticated; den hjälpte bara när datumen var konstanter.
-- Ersatt av 20261006_affar_oversikt_vida_snabbare_plan.sql (plpgsql med literala datum). Behålls för historiken.
--
-- OBS (samma dag, efter mätning): den här omskrivningen räckte INTE som LANGUAGE sql-funktion. Med okända parametrar gissar planeraren fel
-- på tidsfiltret (generisk plan) och funktionen gav 57014 (8,6 s) som authenticated; den hjälpte bara när datumen var konstanter.
-- Ersatt av 20261006_affar_oversikt_vida_snabbare_plan.sql (plpgsql med literala datum). Behålls för historiken.
--
-- OBS (samma dag, efter mätning): den här omskrivningen räckte INTE som LANGUAGE sql-funktion. Med okända parametrar gissar planeraren fel
-- på tidsfiltret (generisk plan) och funktionen gav 57014 (8,6 s) som authenticated; den hjälpte bara när datumen var konstanter.
-- Ersatt av 20261006_affar_oversikt_vida_snabbare_plan.sql (plpgsql med literala datum). Behålls för historiken.
--
--
-- Mätt 2026-10-06 som roll authenticated med statement_timeout = 8 s (PostgREST-gränsen): ett helt år (421 000 stockrader) tog 6,1 s
-- med den första versionen (20261006_affar_oversikt_vida.sql). Orsaken var inte RLS utan planen: vyn vy_sortiment_klass inlinades, så
-- normalisera() kördes för varje stockrad (~420 000 gånger) i stället för en gång per sortiment (~285), och 417 621 rader med
-- textnycklar sorterades via disk.
--
-- Ändringen:
--   1. klass AS MATERIALIZED — klassningen (grupp, industri) räknas EN gång per sortiment.
--   2. bas — stockarna summeras först på heltalsnycklar (månad, objekt, sortiment, trädslag): ~1 100 rader i stället för 420 000.
--   3. Tidsgränserna är scalar-subqueries, så filtret ligger på själva skanningen av detalj_stam.
-- Utdata, regler och rättigheter är oförändrade — verifierat med jsonb-likhet mot den första versionen innan den ersattes.
--
-- Idempotent (CREATE OR REPLACE). Kör filen med LF-radslut.

CREATE OR REPLACE FUNCTION public.affar_oversikt(p_ar integer DEFAULT NULL, p_manad date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
WITH omfang AS (
  SELECT CASE WHEN p_manad IS NULL
              THEN make_date(COALESCE(p_ar, EXTRACT(YEAR FROM now())::int), 1, 1)
              ELSE date_trunc('month', p_manad)::date END AS fran,
         CASE WHEN p_manad IS NULL
              THEN make_date(COALESCE(p_ar, EXTRACT(YEAR FROM now())::int) + 1, 1, 1)
              ELSE (date_trunc('month', p_manad) + interval '1 month')::date END AS till
),
-- Klassningen (grupp, industri) görs EN gång per sortiment (~285 rader) — inte per stockrad. Utan MATERIALIZED inlinas vyn
-- vy_sortiment_klass och normalisera() körs för varje stock (~420 000 gånger per år), vilket mer än fördubblade körtiden för ett helt år.
klass AS MATERIALIZED (SELECT sortiment_id, grupp, destination FROM vy_sortiment_klass),
-- Stockarna summeras först på heltalsnycklar (månad, objekt, sortiment, trädslag): ~1 100 rader i stället för 420 000 att sortera.
-- Gränserna är scalar-subqueries så att tidsfiltret ligger på själva skanningen av detalj_stam.
bas AS (
  SELECT date_trunc('month', v.tidpunkt)::date AS manad, v.objekt_id, v.sortiment_id, v.tradslag_id, SUM(v.volym_m3sub) AS volym
  FROM vy_skordarmatt_stock v
  JOIN dim_objekt o ON o.objekt_id = v.objekt_id AND o.bolag = 'Vida'
  WHERE v.tidpunkt >= (SELECT fran FROM omfang) AND v.tidpunkt < (SELECT till FROM omfang)
  GROUP BY 1, 2, 3, 4
),
-- Allt som räknas, ett steg: per månad, objekt, trädslagsklass, sortimentgrupp och industri. Resten är summor av den här.
-- Bara Vida, alla huvudtyper (grot och objekt utan åtgärd ingår), Hemved borträknad — den går till markägaren, inte Vida.
-- Barr = gran + tall, löv = allt annat. Allt som inte är Timmer/Kubb/Massa hamnar i Energi och övrigt (energi, toppar och rens,
-- stammar utan sortiment), så delarna alltid summerar till totalen.
rader AS (
  SELECT b.manad, b.objekt_id,
         CASE t.namn WHEN 'GRAN' THEN 'gran' WHEN 'TALL' THEN 'tall' ELSE 'lov' END AS slag,
         CASE WHEN k.grupp IN ('Timmer','Kubb','Massa') THEN k.grupp ELSE 'Energi' END AS grupp,
         k.destination AS industri,
         SUM(b.volym) AS volym
  FROM bas b
  LEFT JOIN klass k ON k.sortiment_id = b.sortiment_id
  LEFT JOIN dim_tradslag t ON t.tradslag_id = b.tradslag_id
  WHERE COALESCE(k.grupp, '') <> 'Hemved'
  GROUP BY 1, 2, 3, 4, 5
),
total AS (SELECT COALESCE(SUM(volym), 0) AS volym FROM rader),
barr_rader AS (
  SELECT CASE WHEN grupp = 'Timmer' AND slag = 'gran' THEN 'grantimmer'
              WHEN grupp = 'Timmer' AND slag = 'tall' THEN 'talltimmer'
              WHEN grupp = 'Kubb'  THEN 'kubb'
              WHEN grupp = 'Massa' THEN 'massaved'
              ELSE 'energi' END AS nyckel, industri, volym
  FROM rader WHERE slag IN ('gran', 'tall')
),
lov_rader AS (
  SELECT CASE grupp WHEN 'Timmer' THEN 'timmer' WHEN 'Kubb' THEN 'kubb' WHEN 'Massa' THEN 'massaved' ELSE 'energi' END AS nyckel, volym
  FROM rader WHERE slag = 'lov'
),
barr_def(nyckel, namn, ordning) AS (VALUES ('grantimmer','Grantimmer',1), ('talltimmer','Talltimmer',2), ('kubb','Kubb',3), ('massaved','Massaved',4), ('energi','Energi och övrigt',5)),
lov_def(nyckel, namn, ordning)  AS (VALUES ('timmer','Timmer',1), ('kubb','Kubb',2), ('massaved','Massaved',3), ('energi','Energi och övrigt',4)),
barr_summa AS (
  SELECT d.nyckel, d.namn, d.ordning, COALESCE(SUM(b.volym), 0) AS volym
  FROM barr_def d LEFT JOIN barr_rader b ON b.nyckel = d.nyckel GROUP BY 1, 2, 3
),
lov_summa AS (
  SELECT d.nyckel, d.namn, d.ordning, COALESCE(SUM(l.volym), 0) AS volym
  FROM lov_def d LEFT JOIN lov_rader l ON l.nyckel = d.nyckel GROUP BY 1, 2, 3
),
-- Industri bara för de sågbara sortimenten. Stödlängd är ingen industri (ar_industri = false) och ligger sist, dämpat; ett
-- sortiment utan känd industri syns som 'Industri ej angiven' i stället för att försvinna.
industrier AS (
  SELECT b.nyckel, COALESCE(b.industri, 'Industri ej angiven') AS namn,
         (b.industri IS NOT NULL AND b.industri <> 'Stödlängd') AS ar_industri, SUM(b.volym) AS volym
  FROM barr_rader b WHERE b.nyckel IN ('grantimmer', 'talltimmer', 'kubb') GROUP BY 1, 2, 3
),
manader AS (
  SELECT (om.fran + g.n * interval '1 month')::date AS manad, COALESCE(SUM(r.volym), 0) AS volym
  FROM omfang om CROSS JOIN generate_series(0, 11) g(n)
  LEFT JOIN rader r ON r.manad = (om.fran + g.n * interval '1 month')::date
  WHERE p_manad IS NULL
  GROUP BY 1
),
objekt AS (SELECT r.objekt_id, SUM(r.volym) AS volym FROM rader r GROUP BY 1)
SELECT jsonb_build_object(
  'bolag', 'Vida',
  'ar', (SELECT EXTRACT(YEAR FROM fran)::int FROM omfang),
  'manad', CASE WHEN p_manad IS NULL THEN NULL ELSE to_char((SELECT fran FROM omfang), 'YYYY-MM') END,
  'total_volym', ROUND((SELECT volym FROM total)::numeric, 1),
  'antal_objekt', (SELECT COUNT(*) FROM objekt),
  'barr', jsonb_build_object(
    'volym', ROUND((SELECT COALESCE(SUM(volym), 0) FROM barr_summa)::numeric, 1),
    'andel', CASE WHEN (SELECT volym FROM total) > 0
                  THEN ROUND(100 * (SELECT SUM(volym) FROM barr_summa)::numeric / (SELECT volym FROM total), 1) ELSE 0 END,
    'rader', (SELECT jsonb_agg(jsonb_build_object(
        'nyckel', s.nyckel, 'namn', s.namn, 'volym', ROUND(s.volym::numeric, 1),
        'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100 * s.volym::numeric / (SELECT volym FROM total), 1) ELSE 0 END,
        'sagbart', s.nyckel IN ('grantimmer', 'talltimmer', 'kubb'),
        'industrier', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'namn', i.namn, 'volym', ROUND(i.volym::numeric, 1),
            'andel', CASE WHEN s.volym > 0 THEN ROUND(100 * i.volym::numeric / s.volym, 1) ELSE 0 END,
            'ar_industri', i.ar_industri) ORDER BY i.ar_industri DESC, i.volym DESC)
          FROM industrier i WHERE i.nyckel = s.nyckel), '[]'::jsonb)) ORDER BY s.ordning) FROM barr_summa s)
  ),
  'lov', jsonb_build_object(
    'volym', ROUND((SELECT COALESCE(SUM(volym), 0) FROM lov_summa)::numeric, 1),
    'andel', CASE WHEN (SELECT volym FROM total) > 0
                  THEN ROUND(100 * (SELECT SUM(volym) FROM lov_summa)::numeric / (SELECT volym FROM total), 1) ELSE 0 END,
    'rader', (SELECT jsonb_agg(jsonb_build_object(
        'nyckel', s.nyckel, 'namn', s.namn, 'volym', ROUND(s.volym::numeric, 1),
        'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100 * s.volym::numeric / (SELECT volym FROM total), 1) ELSE 0 END)
        ORDER BY s.ordning) FROM lov_summa s)
  ),
  'manader', COALESCE((SELECT jsonb_agg(jsonb_build_object('manad', to_char(m.manad, 'YYYY-MM'), 'volym', ROUND(m.volym::numeric, 1)) ORDER BY m.manad) FROM manader m), '[]'::jsonb),
  'objekt', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'objekt_id', ob.objekt_id, 'namn', d.object_name, 'vo_nummer', d.vo_nummer, 'volym', ROUND(ob.volym::numeric, 1))
      ORDER BY ob.volym DESC) FROM objekt ob JOIN dim_objekt d ON d.objekt_id = ob.objekt_id), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.affar_oversikt(integer, date) IS
  'Affärsuppföljningens Översikt för Vida: ett år (p_ar) eller en månad (p_manad). Barr (grantimmer, talltimmer, kubb, massaved, energi och övrigt) och löv, industri för de sågbara, månadsvolymer. Hemved borträknad. Se supabase/migrations/20261006_affar_oversikt_vida.sql och 20261006_affar_oversikt_vida_snabbare.sql.';

REVOKE ALL ON FUNCTION public.affar_oversikt(integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.affar_oversikt(integer, date) TO authenticated, service_role;
