-- Sortimentsutfall per månad — hela sidans underlag i ETT anrop.
--
-- Varför RPC och inte klientfrågor: detalj_stock är 3,08 M rader. Den
-- befintliga sidans fetchAllRows paginerar 1 000 rader i taget — det hade
-- blivit ~3 000 rundturer. Aggregeringen hör hemma i databasen.
--
-- SECURITY INVOKER (default). Ändra ALDRIG till SECURITY DEFINER.
--
-- OBS — funktionen är INTE åtkomstbegränsad. Samtliga inblandade tabeller har
-- <tabell>_select för authenticated med qual = true. Det är permissivt, inte
-- scopat: VARJE inloggad användare läser ALLA bolag, inte bara sitt eget.
-- SECURITY INVOKER betyder alltså bara "ingen eskalering" — inte "säker".
--
-- p_bolag är ett FILTER, inte en behörighetsgräns. Den som kan anropa
-- funktionen kan skicka vilket bolag som helst.
--
-- Konsekvens: den här vyn är säker att EXPORTERA som rapport till en köpare.
-- Den är INTE säker att ge en köpare inloggning till. Ska Vida få egen
-- åtkomst krävs bolagsscopad RLS först — det finns inte idag.
--
-- Sidoupplysning för den som auditerar: public.objekt har
-- relrowsecurity = false med fyra vilande policies. Kontrollera alltid
-- pg_class.relrowsecurity, aldrig bara pg_policies.
--
-- p_atgard: 'Slutavverkning' | 'Gallring' | 'Grot' | 'Allt'
--   'Allt' = slutavverkning + gallring + objekt utan angiven huvudtyp.
--   Grot ingår AVSIKTLIGT inte i 'Allt'. Grot producerar inget sågbart och
--   späder bara ut nämnaren i "sågbart som andel av volymen" utan att
--   tillföra något till täljaren — andelen blir missvisande utan att någon
--   ser varför. Grot har ett eget läge istället.
--
-- Verifierat mot prod 2026-08-22:
--   aug/Slutavverkning  3 875,2 m³   6 objekt
--   aug/Allt            4 609,1 m³   9 objekt   (grot exkluderad)
--   maj/Slutavverkning      0,0 m³   0 objekt   0 stammar  → "ingen volym"
--   maj/Grot              160,9 m³   1 objekt
--   apr/Allt                0,0 m³   0 objekt  21 105 stammar → "underlag saknas"

CREATE OR REPLACE FUNCTION sortimentsutfall_manad(
  p_manad  date,
  p_atgard text DEFAULT 'Slutavverkning',
  p_bolag  text DEFAULT 'Vida'
) RETURNS jsonb LANGUAGE sql STABLE AS $rpc$
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
rader AS (
  SELECT v.volym_m3sub, v.toppdia_ub_mm, v.objekt_id, ob.grupp_nyckel,
         COALESCE(sg.grupp, 'Ej klassad') AS sortimentsgrupp,
         harled_industri(ds.namn) AS industri
  FROM vy_skordarmatt_stock v
  JOIN objekt ob ON ob.objekt_id = v.objekt_id
  CROSS JOIN gransen gr
  LEFT JOIN dim_sortiment ds       ON ds.sortiment_id = v.sortiment_id
  LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = v.sortiment_id
  WHERE v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till
),
total AS (SELECT COALESCE(SUM(volym_m3sub),0) AS volym FROM rader),
-- "Ej klassad" är en egen rad, aldrig bortsopad ur summan.
grupper AS (SELECT sortimentsgrupp AS namn, SUM(volym_m3sub) AS volym FROM rader GROUP BY 1),
sagbart AS (SELECT * FROM rader WHERE sortimentsgrupp IN ('Timmer','Kubb')),
diameter AS (
  SELECT COALESCE(industri,'Okänd industri') AS industri,
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
industrier AS (SELECT COALESCE(industri,'Okänd industri') AS namn, SUM(volym_m3sub) AS volym FROM sagbart GROUP BY 1),
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
  WHERE v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till GROUP BY 1
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
$rpc$;

COMMENT ON FUNCTION sortimentsutfall_manad(date, text, text) IS
  'Hela sortimentsutfallssidans underlag i ett anrop. Läser vy_skordarmatt_stock, aldrig fakt_sortiment (som underrapporterar vid kapade HPR-exporter).';

-- Bakre gräns för månadsväljaren: den enda punkt där datan verkligen tar slut.
CREATE OR REPLACE FUNCTION sortimentsutfall_granser()
RETURNS jsonb LANGUAGE sql STABLE AS $g$
  SELECT jsonb_build_object('fran', to_char(MIN(tidpunkt),'YYYY-MM'), 'till', to_char(MAX(tidpunkt),'YYYY-MM'))
  FROM detalj_stam WHERE tidpunkt IS NOT NULL;
$g$;
