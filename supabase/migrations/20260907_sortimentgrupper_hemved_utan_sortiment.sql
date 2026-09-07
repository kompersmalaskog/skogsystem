-- Hemved är en egen grupp, inte Massa. Utan sortiment ska synas, inte gömmas.
--
-- BAKGRUND. Gruppen kommer ur vy_sortiment_klass i tur och ordning: filens
-- ProductGroupName via normalisering_karta, sedan dim_sortiment_grupp, sist
-- namnet. Hemved blev Massa för att filen säger Massa, och exkluderades i
-- stället med ett namnfilter i varje massavedsvy — men inte alls i
-- affärsuppföljningen, som räknade 121,9 m³ hemved mot Vida i augusti.
-- Unclassified (Ponsse) och Unspecified (Rottne) kände inget mönster igen,
-- så de blev NULL, "Ej klassad", och tände ÅTGÄRD BEHÖVS varje månad.
--
-- LÖSNING, på ETT ställe:
--   1. normalisering_karta får domänen grupp_forst: namnmönster som vinner
--      över filens produktgrupp. Bara 'hemved' → Hemved ligger där.
--      Unclassified/Unspecified → Utan sortiment läggs i domänen grupp och
--      fångas på NAMNET (filens produktgrupp respektive sortimentsnamnet),
--      så nya sortiment-id med samma namn mappas automatiskt.
--   2. vy_sortiment_klass läser grupp_forst först. grupp_kalla = 'namn_forst'.
--   3. massaved_niva2, massaved_niva3 och massaved_rader hade egna
--      inbäddade kopior av gruppregeln — de pekas om till vyn så regeln finns
--      en gång. Hemved-namnfiltren i dem och i massaved_langder byts till
--      gruppen.
--   4. sortimentsutfall_manad exkluderar gruppen Hemved: den går till
--      markägaren och når aldrig någon industri, så den ingår aldrig i volym
--      som redovisas mot Vida.
--   5. kontroll_produktfalt räknar namn_forst som en stark källa — annars
--      läser den flytten från fil/tabell som ett tapp.
--
-- INTE dim_sortiment_grupp. Den tabellen är Acord-motorns prisgruppering
-- (lib/ekonomi läser den direkt, ekonomi-inställningarna redigerar den) och
-- antalet grupper per objekt styr sortimentstillägget. Hemved och Utan
-- sortiment där ändrar en beräkning — det får ett eget beslut.
--
-- Väntad differens: affärsuppföljningens totaler sjunker med hemveden
-- (augusti 121,9 m³, september 16,2 m³, Vida slutavverkning), Ej klassad
-- försvinner och Utan sortiment står i stället (augusti 12,2 m³ / 20,7
-- alla åtgärder, september 1,5 / 3,2). Massavedsvyerna ändras inte alls —
-- de exkluderade redan hemveden, bara på namnet.

-- ── 1. Kartan ────────────────────────────────────────────────────────────
ALTER TABLE normalisering_karta DROP CONSTRAINT IF EXISTS normalisering_karta_doman_check;
ALTER TABLE normalisering_karta ADD CONSTRAINT normalisering_karta_doman_check
  CHECK (doman = ANY (ARRAY['grupp'::text, 'grupp_forst'::text, 'destination'::text, 'massasortiment'::text]));

INSERT INTO normalisering_karta (doman, monster, varde, prioritet) VALUES
  ('grupp_forst', 'hemved',       'Hemved',         1),
  ('grupp',       'unclassified', 'Utan sortiment', 50),
  ('grupp',       'unspecified',  'Utan sortiment', 51)
ON CONFLICT (doman, monster) DO UPDATE SET varde = EXCLUDED.varde, prioritet = EXCLUDED.prioritet;

COMMENT ON TABLE normalisering_karta IS
  'Mönster → normaliserat värde per domän. grupp: filens produktgrupp OCH sortimentsnamnet (namnhärledning). grupp_forst: namnmönster som vinner över filen — hemved är aldrig massa oavsett vad maskinen säger. Nya sortiment-id med samma namn fångas automatiskt.';

-- ── 2. Vyn ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vy_sortiment_klass AS
SELECT ds.sortiment_id,
       ds.namn,
       ds.kundkod,
       ds.destination_id,
       COALESCE(normalisera('grupp_forst', ds.namn),
                normalisera('grupp', ds.produktgrupp),
                sg.grupp,
                harled_produktgrupp(ds.namn)) AS grupp,
       COALESCE(normalisera('destination', ds.destination_namn), harled_industri(ds.namn)) AS destination,
       ds.produktgrupp AS produktgrupp_ra,
       ds.destination_namn AS destination_ra,
       CASE WHEN normalisera('grupp_forst', ds.namn)    IS NOT NULL THEN 'namn_forst'
            WHEN normalisera('grupp', ds.produktgrupp)  IS NOT NULL THEN 'fil'
            WHEN sg.grupp                               IS NOT NULL THEN 'dim_sortiment_grupp'
            WHEN harled_produktgrupp(ds.namn)           IS NOT NULL THEN 'namn'
            ELSE NULL END AS grupp_kalla,
       CASE WHEN normalisera('destination', ds.destination_namn) IS NOT NULL THEN 'fil'
            WHEN harled_industri(ds.namn) IS NOT NULL THEN 'namn'
            ELSE NULL END AS destination_kalla
FROM dim_sortiment ds
LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = ds.sortiment_id;

COMMENT ON VIEW vy_sortiment_klass IS
  'EN definition av sortimentsgrupp. Ordning: grupp_forst på namnet (Hemved), filens produktgrupp, dim_sortiment_grupp, namnhärledning. Grupper: Timmer, Klentimmer, Kubb, Massa, Energi, Hemved, Utan sortiment, Övrigt. Hemved ingår aldrig i massaved eller i volym mot Vida. Varje funktion som behöver gruppen läser HÄRIFRÅN — inga inbäddade kopior.';

-- ── 3. Luckvyn: hemved är inte längre Massa, namnfiltret är överflödigt ──
CREATE OR REPLACE VIEW vy_normalisering_luckor AS
 SELECT 'grupp'::text AS doman, ds.produktgrupp AS ra_varde, count(*) AS sortiment,
        string_agg(DISTINCT ds.maskin_id, ', '::text) AS maskiner
   FROM dim_sortiment ds
  WHERE ds.produktgrupp IS NOT NULL AND normalisera('grupp'::text, ds.produktgrupp) IS NULL
  GROUP BY 'grupp'::text, ds.produktgrupp
UNION ALL
 SELECT 'destination'::text, ds.destination_namn, count(*),
        string_agg(DISTINCT ds.maskin_id, ', '::text)
   FROM dim_sortiment ds
  WHERE ds.destination_namn IS NOT NULL AND normalisera('destination'::text, ds.destination_namn) IS NULL
  GROUP BY 'destination'::text, ds.destination_namn
UNION ALL
 SELECT 'massasortiment'::text, ds.namn, count(*),
        string_agg(DISTINCT ds.maskin_id, ', '::text)
   FROM dim_sortiment ds
     LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = ds.sortiment_id
  WHERE k.grupp = 'Massa'::text AND normalisera('massasortiment'::text, ds.namn) IS NULL
  GROUP BY 'massasortiment'::text, ds.namn;

-- ── 4. Massavedsfunktionerna: vyn i stället för kopian, gruppen i stället för namnet ──
-- Skrivs om ur sin NUVARANDE definition i databasen, inte ur en gammal
-- migrationsfil. Varje ersättning kontrolleras — hittas mönstret inte
-- avbryts hela migrationen i stället för att tyst lämna en kopia kvar.
DO $do$
DECLARE
  d text; n int; namn text;
  monster text := 'klass AS MATERIALIZED \(\s*SELECT ds\.sortiment_id, ds\.namn,\s*COALESCE\(normalisera\(''grupp'', ds\.produktgrupp\), sg\.grupp,\s*harled_produktgrupp\(ds\.namn\)\) AS grupp\s*FROM dim_sortiment ds\s*LEFT JOIN dim_sortiment_grupp sg ON sg\.sortiment_id = ds\.sortiment_id\s*\)';
BEGIN
  FOR namn IN SELECT unnest(ARRAY['massaved_niva2','massaved_niva3','massaved_rader']) LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = namn;
    n := (SELECT count(*) FROM regexp_matches(d, monster, 'g'));
    IF n <> 1 THEN RAISE EXCEPTION '%: inbäddad klass-CTE hittades % gånger, väntade 1', namn, n; END IF;
    d := regexp_replace(d, monster, 'klass AS MATERIALIZED (' || chr(10) || '  SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass' || chr(10) || ')');
    d := replace(d, ' AND lower(COALESCE(s.sortnamn,'''')) NOT LIKE ''%hemved%''', '');
    d := replace(d, ' AND lower(COALESCE(a.sortnamn,'''')) NOT LIKE ''%hemved%''', '');
    d := replace(d, 'WHERE grupp=''Massa'' AND lower(COALESCE(sortnamn,'''')) LIKE ''%hemved%''', 'WHERE grupp=''Hemved''');
    IF position('hemved%' IN d) > 0 THEN RAISE EXCEPTION '%: ett hemved-namnfilter är kvar', namn; END IF;
    EXECUTE d;
  END LOOP;

  -- massaved_langder: hemveden är fortfarande med i "allt" (för hemved_volym), men på gruppen.
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'massaved_langder';
  IF position('AND k.grupp = ''Massa''' IN d) = 0 OR position('(lower(COALESCE(k.namn,'''')) LIKE ''%hemved%'') AS ar_hemved' IN d) = 0 THEN
    RAISE EXCEPTION 'massaved_langder: väntade mönster saknas';
  END IF;
  d := replace(d, 'AND k.grupp = ''Massa''', 'AND k.grupp IN (''Massa'',''Hemved'')');
  d := replace(d, '(lower(COALESCE(k.namn,'''')) LIKE ''%hemved%'') AS ar_hemved', '(k.grupp = ''Hemved'') AS ar_hemved');
  EXECUTE d;

  -- kontroll_produktfalt: namn_forst är en STARK källa (en uttrycklig regel),
  -- inte ett tapp från fil eller tabell.
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'kontroll_produktfalt';
  IF position('COUNT(*) FILTER (WHERE grupp_kalla=''fil'')' IN d) = 0 THEN
    RAISE EXCEPTION 'kontroll_produktfalt: väntat mönster saknas';
  END IF;
  d := replace(d, 'COUNT(*) FILTER (WHERE grupp_kalla=''fil'')', 'COUNT(*) FILTER (WHERE grupp_kalla IN (''fil'',''namn_forst''))');
  EXECUTE d;
END $do$;

-- ── 5. Affärsuppföljningen: aldrig hemved mot Vida ───────────────────────
CREATE OR REPLACE FUNCTION public.sortimentsutfall_manad(p_manad date, p_atgard text DEFAULT 'Slutavverkning'::text, p_bolag text DEFAULT 'Vida'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH gransen AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
-- Grupperingsnyckel: rent numeriskt vo_nummer, annars objekt_id. Ponsse
-- skriver tidsstämplar i ObjectUserID som hamnar i vo_nummer
-- ("_100226-113212") — blind gruppering på vo slår ihop orelaterade objekt.
-- Numerisk VO slår däremot korrekt ihop 11217392 och A130743_7, som är
-- samma trakt sedd av skördare och skotare.
objekt AS (
  SELECT o.objekt_id, o.object_name, o.vo_nummer, o.huvudtyp,
         o.skotning_avslutad, o.skordning_avslutad,
         CASE WHEN o.vo_nummer ~ '^[0-9]+$' THEN o.vo_nummer ELSE o.objekt_id END AS grupp_nyckel
  FROM dim_objekt o
  WHERE o.bolag = p_bolag
    AND CASE WHEN p_atgard = 'Allt'
             THEN (o.huvudtyp IN ('Slutavverkning','Gallring') OR o.huvudtyp IS NULL)
             ELSE o.huvudtyp = p_atgard END
),
-- Bolagets objekt oavsett åtgärd — bara för tomtillståndet, så att sidan kan
-- peka på var volymen finns istället för att bara säga noll.
objekt_alla AS (
  SELECT o.objekt_id, COALESCE(o.huvudtyp,'Ej angiven') AS huvudtyp
  FROM dim_objekt o WHERE o.bolag = p_bolag
),
-- Hemved går till markägaren och når aldrig någon industri. Den ingår
-- aldrig i volym som redovisas mot Vida — inte i totalen, inte i någon
-- grupp, inte i objektens volymer. Gruppen bär regeln, inte ett namnfilter.
rader AS (
  SELECT v.volym_m3sub, v.toppdia_ub_mm, v.objekt_id, ob.grupp_nyckel,
         COALESCE(k.grupp, 'Ej klassad') AS sortimentsgrupp,
         k.destination AS industri
  FROM vy_skordarmatt_stock v
  JOIN objekt ob ON ob.objekt_id = v.objekt_id
  CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  WHERE v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till
    AND COALESCE(k.grupp, '') <> 'Hemved'
),
total AS (SELECT COALESCE(SUM(volym_m3sub),0) AS volym FROM rader),
-- "Ej klassad" är en egen rad, aldrig bortsopad ur summan. "Utan sortiment"
-- är en egen grupp: toppar och rens som föraren aldrig gett ett sortiment.
grupper AS (SELECT sortimentsgrupp AS namn, SUM(volym_m3sub) AS volym FROM rader GROUP BY 1),
sagbart AS (SELECT * FROM rader WHERE sortimentsgrupp IN ('Timmer','Kubb')),
diameter AS (
  SELECT COALESCE(industri,'Industri ej angiven') AS industri,
         CASE WHEN toppdia_ub_mm IS NULL OR toppdia_ub_mm = 0 THEN 'Okänd'
              WHEN toppdia_ub_mm < 160 THEN 'Under 16' WHEN toppdia_ub_mm < 200 THEN '16–19'
              WHEN toppdia_ub_mm < 240 THEN '20–23'    WHEN toppdia_ub_mm < 280 THEN '24–27'
              WHEN toppdia_ub_mm < 320 THEN '28–31'    ELSE '32+' END AS klass,
         CASE WHEN toppdia_ub_mm IS NULL OR toppdia_ub_mm = 0 THEN 9
              WHEN toppdia_ub_mm < 160 THEN 1 WHEN toppdia_ub_mm < 200 THEN 2
              WHEN toppdia_ub_mm < 240 THEN 3 WHEN toppdia_ub_mm < 280 THEN 4
              WHEN toppdia_ub_mm < 320 THEN 5 ELSE 6 END AS ordning,
         volym_m3sub
  FROM sagbart
),
industrier AS (SELECT COALESCE(industri,'Industri ej angiven') AS namn, SUM(volym_m3sub) AS volym FROM sagbart GROUP BY 1),
objekt_volym AS (SELECT grupp_nyckel, SUM(volym_m3sub) AS volym FROM rader GROUP BY 1),
-- Status härleds ALDRIG ur volym. En VO-grupp kan rymma flera objekt_id
-- (skördarens och skotarens rad); regeln läser gruppen som en helhet.
objekt_status AS (
  SELECT ob.grupp_nyckel,
         MIN(ob.object_name) FILTER (WHERE ob.object_name IS NOT NULL) AS namn,
         MIN(ob.vo_nummer)   FILTER (WHERE ob.vo_nummer ~ '^[0-9]+$')  AS vo_nummer,
         BOOL_OR(ob.huvudtyp IS NULL)               AS saknar_atgard,
         MAX(ob.skotning_avslutad)                  AS skotning_avslutad,
         BOOL_OR(ob.skordning_avslutad IS NOT NULL) AS nagon_skordning_klar,
         BOOL_OR(EXISTS (SELECT 1 FROM fakt_lass_sortiment fl WHERE fl.objekt_id = ob.objekt_id)) AS har_lass
  FROM objekt ob GROUP BY 1
),
objektlista AS (
  SELECT s.grupp_nyckel, s.namn, s.vo_nummer, ov.volym, s.saknar_atgard,
         CASE WHEN s.skotning_avslutad IS NOT NULL THEN 'Skotat'
              WHEN s.har_lass                      THEN 'Skotning pågår'
              WHEN NOT s.nagon_skordning_klar      THEN 'Avverkning pågår'
              ELSE 'Ej markerad' END AS status,
         s.skotning_avslutad AS status_datum
  FROM objekt_status s JOIN objekt_volym ov ON ov.grupp_nyckel = s.grupp_nyckel
),
-- Tomtillstånd: skilj "inga stammar alls" från "stammar men inget
-- stockunderlag". Januari och april 2026 är det senare — Vida-objekt
-- avverkades, men stockraderna saknar dedupe-nyckel och når aldrig vyn.
-- Att kalla det "ingen volym" vore en lögn.
stammar AS (
  SELECT COUNT(*) AS i_urval FROM detalj_stam sm
  JOIN objekt ob ON ob.objekt_id = sm.objekt_id CROSS JOIN gransen gr
  WHERE sm.tidpunkt >= gr.fran AND sm.tidpunkt < gr.till
),
per_atgard AS (
  SELECT oa.huvudtyp AS namn, SUM(v.volym_m3sub) AS volym
  FROM vy_skordarmatt_stock v
  JOIN objekt_alla oa ON oa.objekt_id = v.objekt_id CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  WHERE v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till
    AND COALESCE(k.grupp, '') <> 'Hemved'
  GROUP BY 1
)
SELECT jsonb_build_object(
  'manad', (SELECT to_char(fran,'YYYY-MM') FROM gransen),
  'atgard', p_atgard, 'bolag', p_bolag,
  'total_volym', ROUND((SELECT volym FROM total)::numeric, 1),
  'antal_objekt', (SELECT COUNT(*) FROM objektlista),
  'stammar_i_urval', (SELECT i_urval FROM stammar),
  'grupper', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'namn', namn, 'volym', ROUND(volym::numeric,1),
      'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100*volym::numeric/(SELECT volym FROM total),1) ELSE 0 END)
    ORDER BY volym DESC) FROM grupper), '[]'::jsonb),
  'sagbart', jsonb_build_object(
    'volym', ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM sagbart),0)::numeric,1),
    'andel', CASE WHEN (SELECT volym FROM total) > 0
                  THEN ROUND(100*COALESCE((SELECT SUM(volym_m3sub) FROM sagbart),0)::numeric/(SELECT volym FROM total),1) ELSE 0 END,
    'industrier', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'namn', i.namn, 'volym', ROUND(i.volym::numeric,1),
        'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100*i.volym::numeric/(SELECT volym FROM total),1) ELSE 0 END,
        'klasser', COALESCE((SELECT jsonb_agg(jsonb_build_object('klass', k.klass, 'ordning', k.ordning, 'volym', k.v) ORDER BY k.ordning)
                             FROM (SELECT d.klass, d.ordning, ROUND(SUM(d.volym_m3sub)::numeric,1) AS v
                                   FROM diameter d WHERE d.industri = i.namn
                                   GROUP BY d.klass, d.ordning) k), '[]'::jsonb))
      ORDER BY i.volym DESC) FROM industrier i), '[]'::jsonb)),
  'objekt', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'nyckel', grupp_nyckel, 'namn', namn, 'vo_nummer', vo_nummer,
      'volym', ROUND(volym::numeric,1), 'status', status,
      'status_datum', status_datum, 'saknar_atgard', saknar_atgard)
    ORDER BY volym DESC) FROM objektlista), '[]'::jsonb),
  'volym_per_atgard', COALESCE((SELECT jsonb_agg(jsonb_build_object('namn', namn, 'volym', ROUND(volym::numeric,1)) ORDER BY volym DESC) FROM per_atgard), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION sortimentsutfall_manad(date, text, text) IS
  'Sortimentsutfall per månad för köparen. Läser vy_skordarmatt_stock, aldrig fakt_sortiment. Gruppen Hemved ingår aldrig — den går till markägaren. Utan sortiment (Unclassified/Unspecified) är en egen rad; Ej klassad finns bara för sortiment inget mönster känner igen.';
