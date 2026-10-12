-- affar_oversikt(p_ar, p_manad): affärsuppföljningens Översikt i ETT anrop — ett år eller en månad, bara Vida.
-- OBS (samma dag, efter mätning som authenticated): den här första versionen tog 6,1 s för ett helt år. Slutversionen — samma utdata,
-- samma regler — finns i 20261006_affar_oversikt_vida_snabbare_plan.sql (2,7 s kall / 1,6 s varm). Filen behålls för historiken; reglerna i
-- normalisering_karta (INSERT nedan) är de som gäller.
--
--
-- Bakgrund: affärsuppföljningen läggs om till tre flikar (Översikt / Räkna / Kvalitet). Översikten och månadsskärmen har samma
-- uppbyggnad: ett stort tal (m³fub levererat till Vida), månadsstaplar (bara för ett år), barrets sortiment och löv som en rad.
-- sortimentsutfall_manad() räcker inte: den delar inte Timmer på gran och tall, har ingen energi/barr/löv-uppdelning och tar bolag
-- som parameter. utfall_manad saknar samma uppdelning. Den här funktionen räknar direkt ur stockarna (vy_skordarmatt_stock).
--
-- Regler (Martin 2026-10-06):
--   * Bara objekt med dim_objekt.bolag = 'Vida' (hårdkodat, som massaved_niva1). Alla huvudtyper ingår — även grot och objekt utan
--     åtgärd. Bolags- och åtgärdsväljarna tas bort ur appen.
--   * Hemved ingår aldrig (den går till markägaren, inte Vida) — samma regel som sortimentsutfall_manad.
--   * Barr = trädslagen GRAN och TALL, löv = allt annat. Barrets rader: Grantimmer (Timmer av gran), Talltimmer (Timmer av tall),
--     Kubb, Massaved och Energi och övrigt. Löv: Timmer, Kubb, Massaved, Energi och övrigt — samma sortimentsrader, ingen gran/tall.
--   * "Energi och övrigt" tar ALLT som inte är Timmer/Kubb/Massa: energi, toppar och rens, stammar utan sortiment ('Utan sortiment').
--     Raden ska inte påstå att det är energi, och delarna summerar alltid till totalen.
--   * Industri läses ur vy_sortiment_klass.destination (dim_sortiment.destination_namn först, sortimentsnamnet som reserv, via
--     normalisering_karta). Bara Grantimmer, Talltimmer och Kubb får industrinivå — Massaved har ingen industri i sortimentet.
--     Stödlängd är ingen industri (ar_industri = false, visas dämpat sist); okänd industri syns som 'Industri ej angiven'.
--   * Månadsgränser som i övriga uppföljningsfunktioner: tidpunkt jämförs mot datum i sessionens tidszon.
--
-- Utdata (jsonb): bolag, ar, manad (null för ett helt år), total_volym, antal_objekt,
--   barr {volym, andel, rader[{nyckel, namn, volym, andel, sagbart, industrier[{namn, volym, andel, ar_industri}]}]},
--   lov {volym, andel, rader[{nyckel, namn, volym, andel}]}, manader[{manad, volym}] (12 st, bara för ett helt år), objekt[...].
--   andel på sortimentsrader = % av total_volym; andel på industrier = % av sortimentet. Volymer avrundade till 1 decimal.
--
-- Regler i normalisering_karta (domän 'destination'): tranemo -> Tranemo (50) och stödlängd/stodlangd -> Stödlängd (90/91).
-- Lägre prioritet vinner (normalisera() tar den lägsta), så ett industriord i namnet slår alltid Stödlängd. 'Vida Vislanda' och
-- 'Vislanda' blir redan EN rad (regeln 'vislanda' träffar båda) — inget att göra där.
--
-- Idempotent. Kör filen med LF-radslut. Funktionen är STABLE och bara läsande (SECURITY INVOKER, som övriga uppföljnings-RPC:er).

INSERT INTO normalisering_karta (doman, monster, varde, prioritet)
SELECT n.doman, n.monster, n.varde, n.prioritet
FROM (VALUES ('destination', 'tranemo',   'Tranemo',   50),
             ('destination', 'stödlängd', 'Stödlängd', 90),
             ('destination', 'stodlangd', 'Stödlängd', 91)) AS n(doman, monster, varde, prioritet)
WHERE NOT EXISTS (SELECT 1 FROM normalisering_karta k WHERE k.doman = n.doman AND k.monster = n.monster);

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
-- Allt som räknas, ett steg: per månad, objekt, trädslagsklass, sortimentgrupp och industri. Resten är summor av den här.
-- Bara Vida, alla huvudtyper (grot och objekt utan åtgärd ingår), Hemved borträknad — den går till markägaren, inte Vida.
-- Barr = gran + tall, löv = allt annat. Allt som inte är Timmer/Kubb/Massa hamnar i Energi och övrigt (energi, toppar och rens,
-- stammar utan sortiment), så delarna alltid summerar till totalen.
rader AS (
  SELECT date_trunc('month', v.tidpunkt)::date AS manad, v.objekt_id,
         CASE t.namn WHEN 'GRAN' THEN 'gran' WHEN 'TALL' THEN 'tall' ELSE 'lov' END AS slag,
         CASE WHEN k.grupp IN ('Timmer','Kubb','Massa') THEN k.grupp ELSE 'Energi' END AS grupp,
         k.destination AS industri,
         SUM(v.volym_m3sub) AS volym
  FROM vy_skordarmatt_stock v
  JOIN dim_objekt o ON o.objekt_id = v.objekt_id AND o.bolag = 'Vida'
  CROSS JOIN omfang om
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  LEFT JOIN dim_tradslag t ON t.tradslag_id = v.tradslag_id
  WHERE v.tidpunkt >= om.fran AND v.tidpunkt < om.till
    AND COALESCE(k.grupp, '') <> 'Hemved'
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
  'Affärsuppföljningens Översikt för Vida: ett år (p_ar) eller en månad (p_manad). Barr (grantimmer, talltimmer, kubb, massaved, energi och övrigt) och löv, industri för de sågbara, månadsvolymer. Hemved borträknad. Se supabase/migrations/20261006_affar_oversikt_vida.sql.';

-- Läsbar för inloggade, ingenting annat (samma princip som tabellerna: REVOKE, sedan GRANT).
REVOKE ALL ON FUNCTION public.affar_oversikt(integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.affar_oversikt(integer, date) TO authenticated, service_role;
