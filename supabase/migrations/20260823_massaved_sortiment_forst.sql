-- Massavedspanelen: sortiment först, trädslag inuti.
--
-- VARFÖR: "Granmassaved" är ett sortiment som inte finns. Gran och tall går
-- båda till Massa: BmavFall_V3 — samma sortiment, samma trave, samma
-- leverans. Bara björken är separerad (BjörkmavFall_V3). En rubrik
-- "Granmassaved" beskriver därför ingen leverans utan en beräkning på
-- stammarnas trädslag, och bruket kan inte stämma av talet mot något de har.
--
-- Etiketten följer SORTIMENTET, inte trädslaget. Där gran och tall går i
-- samma trave heter den Barrmassaved; där de är egna sortiment
-- (Massa: Granmassa V3, Massa: Tallmassa V3) behåller de sina egna namn —
-- att folda in dem i Barrmassaved vore samma fel en gång till.

-- ── Tredje domän i normaliseringskartan ──────────────────────────────────
-- Sortimentsnamnen kartläggs som DATA, inte som CASE-grenar. Ett nytt
-- massasortiment ska vara en INSERT.
ALTER TABLE normalisering_karta DROP CONSTRAINT IF EXISTS normalisering_karta_doman_check;
ALTER TABLE normalisering_karta ADD CONSTRAINT normalisering_karta_doman_check
  CHECK (doman IN ('grupp','destination','massasortiment'));

-- Prioriteten är regeln, inte radordningen. björk före bok/asp/barr, och
-- granmassa/tallmassa före barr så "Barrmav Gran Fall V3" inte fastnar fel.
INSERT INTO normalisering_karta (doman, monster, varde, prioritet) VALUES
  ('massasortiment','björk',     'Björkmassaved', 10),
  ('massasortiment','bjork',     'Björkmassaved', 11),
  ('massasortiment','bok',       'Bokmassaved',   20),
  ('massasortiment','asp',       'Aspmassaved',   30),
  ('massasortiment','granmassa', 'Granmassaved',  40),
  ('massasortiment','tallmassa', 'Tallmassaved',  50),
  ('massasortiment','barr',      'Barrmassaved',  60),
  ('massasortiment','bmav',      'Barrmassaved',  70),
  ('massasortiment','bränsle',   'Bränsleved',    80),
  ('massasortiment','bransle',   'Bränsleved',    81)
ON CONFLICT (doman, monster) DO UPDATE
  SET varde = EXCLUDED.varde, prioritet = EXCLUDED.prioritet;

-- Luck-vyn får ett tredje ben. Utan det hade ett nytt massasortiment tyst
-- hamnat i "Övrig massaved" — precis den sortens tystnad kartan finns emot.
-- Vid införandet fångade det 16 omappade namn i katalogen (Bok-, Asp-,
-- Gran-, Tall- och Bränsleved-varianter från gallringsmaskinerna).
CREATE OR REPLACE VIEW vy_normalisering_luckor
WITH (security_invoker = true) AS
SELECT 'grupp' AS doman, ds.produktgrupp AS ra_varde,
       COUNT(*) AS sortiment, string_agg(DISTINCT ds.maskin_id, ', ') AS maskiner
FROM dim_sortiment ds
WHERE ds.produktgrupp IS NOT NULL AND normalisera('grupp', ds.produktgrupp) IS NULL
GROUP BY 1,2
UNION ALL
SELECT 'destination', ds.destination_namn, COUNT(*), string_agg(DISTINCT ds.maskin_id, ', ')
FROM dim_sortiment ds
WHERE ds.destination_namn IS NOT NULL AND normalisera('destination', ds.destination_namn) IS NULL
GROUP BY 1,2
UNION ALL
SELECT 'massasortiment', ds.namn, COUNT(*), string_agg(DISTINCT ds.maskin_id, ', ')
FROM dim_sortiment ds
LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = ds.sortiment_id
WHERE k.grupp = 'Massa'
  AND lower(COALESCE(ds.namn,'')) NOT LIKE '%hemved%'
  AND normalisera('massasortiment', ds.namn) IS NULL
GROUP BY 1,2;

-- ── RPC:n grupperar nu på sortiment ──────────────────────────────────────
-- Kedjan (rotkap, timmerdimension) ligger under sitt trädslag i stället för
-- som egen rubrik ovanför. "Granmassaved / Totalt 701" och "Per trädslag /
-- Gran 701" var samma siffra två gånger i två avsnitt.
--
-- Verifierat mot prod, Vida augusti 2026:
--   Slutavverkning  Barrmassaved 926 — gran 701 / 43,7 dm / 17,2 % / rotkap 96 / timmer 91
--                                      tall 225 / 46,8 dm /  3,7 % / rotkap  6
--                   Björkmassaved 272 — björk 272 / 47,6 dm / 0,0 %
--   Gallring        Barrmassaved 397 — gran 385 / 43,5 dm / 0,0 %
--                                      tall  12 / 43,1 dm / 0,0 %
--                   Björkmassaved 238 — björk 238 / 43,8 dm / 0,0 %
CREATE OR REPLACE FUNCTION massaved_langder(
  p_manad  date,
  p_atgard text DEFAULT 'Slutavverkning',
  p_bolag  text DEFAULT 'Vida'
) RETURNS jsonb LANGUAGE sql STABLE AS $m$
WITH gransen AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
objekt AS (
  SELECT o.objekt_id FROM dim_objekt o
  WHERE o.bolag = p_bolag
    AND CASE WHEN p_atgard = 'Allt'
             THEN (o.huvudtyp IN ('Slutavverkning','Gallring') OR o.huvudtyp IS NULL)
             ELSE o.huvudtyp = p_atgard END
),
allt AS (
  SELECT v.volym_m3sub, v.langd_cm, v.log_key, v.toppdia_ub_mm,
         COALESCE(dt.namn, 'Okänt trädslag') AS tradslag,
         COALESCE(normalisera('massasortiment', k.namn), 'Övrig massaved') AS sortiment,
         (lower(COALESCE(k.namn,'')) LIKE '%hemved%') AS ar_hemved
  FROM vy_skordarmatt_stock v
  JOIN objekt ob ON ob.objekt_id = v.objekt_id
  CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  LEFT JOIN dim_tradslag dt ON dt.tradslag_id = v.tradslag_id
  WHERE v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till
    AND k.grupp = 'Massa'
),
m AS (SELECT * FROM allt WHERE NOT ar_hemved),
per AS (
  SELECT sortiment, tradslag,
         SUM(volym_m3sub) AS volym,
         SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/10 AS dm,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310) AS tre_m,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key=1) AS rotkap,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key=1
                                    AND toppdia_ub_mm >= 180) AS timmermatt
  FROM m GROUP BY 1,2
),
synliga AS (SELECT * FROM per WHERE volym >= 1),
sort_tot AS (
  SELECT sortiment, SUM(volym) AS volym FROM synliga GROUP BY 1 HAVING SUM(volym) >= 1
)
SELECT jsonb_build_object(
  'manad',  (SELECT to_char(fran,'YYYY-MM') FROM gransen),
  'atgard', p_atgard,
  'bolag',  p_bolag,
  'total_volym',   ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM m),0)::numeric,1),
  'medellangd_dm', ROUND((SELECT SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/10 FROM m)::numeric,1),
  'hemved_volym',  ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM allt WHERE ar_hemved),0)::numeric,1),
  'sortiment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'namn',  st.sortiment,
      'volym', ROUND(st.volym::numeric,0),
      'tradslag', (SELECT jsonb_agg(jsonb_build_object(
            'namn',         initcap(lower(sv.tradslag)),
            'volym',        ROUND(sv.volym::numeric,0),
            'dm',           ROUND(sv.dm::numeric,1),
            'tre_m_andel',  ROUND(100*COALESCE(sv.tre_m,0)::numeric/NULLIF(sv.volym,0)::numeric,1),
            'tre_m_volym',  ROUND(COALESCE(sv.tre_m,0)::numeric,0),
            'rotkap',       ROUND(COALESCE(sv.rotkap,0)::numeric,0),
            'timmermatt',   ROUND(COALESCE(sv.timmermatt,0)::numeric,0))
          ORDER BY sv.volym DESC)
        FROM synliga sv WHERE sv.sortiment = st.sortiment))
    ORDER BY st.volym DESC) FROM sort_tot st), '[]'::jsonb),
  'dolda_rader', (SELECT COUNT(*) FROM per WHERE volym < 1)
);
$m$;

COMMENT ON FUNCTION massaved_langder(date, text, text) IS
  'Massavedens längder, grupperat på SORTIMENT med trädslag inuti. Regel: massaved, hemved borträknad, inget annat. Volymvägd medellängd — aldrig avg(langd_cm).';
