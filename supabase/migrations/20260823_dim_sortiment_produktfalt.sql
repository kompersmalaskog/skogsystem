-- Fyra fält ur ProductDefinition som importen hittills kastat.
--
-- Verifierat mot Ulfsnäs AU 2026 (PONS20SDJAA270231, Opti5G 3.1.12,
-- StanForD 3.6):
--   <ProductGroupName>Kubb</ProductGroupName>
--   <ProductInfo modificationRestricted="false">262-VAL</ProductInfo>
--   <ProductDestination>
--     <BusinessName>Vida Alvesta</BusinessName>
--     <BusinessID>89303</BusinessID>
--   </ProductDestination>
--
-- Idag konkateneras ProductGroupName in i dim_sortiment.namn och grupp/
-- destination härleds med ilike på den strängen. Båda tystnar utan varning
-- när Vida byter namnsättning. ProductInfo är Vidas egen produktkod — den
-- känner deras system igen, våra namn gör de inte.
--
-- Massa-sortimenten saknar ProductDestination. Förväntat — Vida styr
-- massavedens destination per leverans. NULL, aldrig gissning.

ALTER TABLE dim_sortiment
  ADD COLUMN IF NOT EXISTS produktgrupp     text,
  ADD COLUMN IF NOT EXISTS destination_namn text,
  ADD COLUMN IF NOT EXISTS destination_id   text,
  ADD COLUMN IF NOT EXISTS kundkod          text;

COMMENT ON COLUMN dim_sortiment.produktgrupp     IS 'ProductGroupName RÅTT ur filen. Normaliseras vid läsning i vy_sortiment_klass — aldrig vid skrivning.';
COMMENT ON COLUMN dim_sortiment.destination_namn IS 'ProductDestination/BusinessName rått. NULL = filen angav ingen (normalt för massaved).';
COMMENT ON COLUMN dim_sortiment.destination_id   IS 'ProductDestination/BusinessID, mottagarens id hos Vida.';
COMMENT ON COLUMN dim_sortiment.kundkod          IS 'ProductInfo — köparens egen produktkod ("262-VAL"). Den koden känner deras system igen, inte våra namn.';

-- ═══════════════════════════════════════════════════════════════════════
-- NORMALISERINGSKARTAN — data, inte if-satser
-- ═══════════════════════════════════════════════════════════════════════
-- Filens värden är inte appens vokabulär. Uppmätt över 12 HPR-filer,
-- tre maskiner:
--   ProductGroupName: Massa 54, Energi 26, Kubb 14, Timmer 14,
--                     Unclassified 11, "Tall Timmer" 10
--   BusinessName:     Vida Urshult 17, Vida Alvesta 14, Vida 8,
--                     Vislanda 4, "Vida Vislanda" 3, Skogsvägen 1
--
-- Kartan ligger som RADER, inte som CASE-grenar i flera funktioner. Att
-- lägga till "Gran Timmer" ska vara en INSERT, inte en migration som ändrar
-- kod på två ställen.
--
-- GRUNDREGEL: ett rått värde som inte matchar någon rad blir ALDRIG en egen
-- grupp eller industri. Det ger NULL, faller vidare i kedjan, och landar
-- ytterst på "Ej klassad" / "Industri ej angiven" — som en synlig rad med
-- kubik i. Dyker "Gran Timmer" upp i nästa prislista vill vi se volymen,
-- inte en fjärde grupp som ingen märker.

CREATE TABLE IF NOT EXISTS normalisering_karta (
  doman     text NOT NULL CHECK (doman IN ('grupp','destination')),
  monster   text NOT NULL,   -- matchas som substräng mot lower(rått värde)
  varde     text NOT NULL,   -- kanoniskt värde appen använder
  prioritet int  NOT NULL,   -- lägst först; avgör vid flera träffar
  PRIMARY KEY (doman, monster)
);

COMMENT ON TABLE normalisering_karta IS
  'Kartan från maskinfilernas råa ProductGroupName/BusinessName till appens vokabulär. Lägg till en rad när ett nytt värde dyker upp i vy_normalisering_luckor. Ett värde som inte matchar blir aldrig en egen grupp — det faller till Ej klassad.';

INSERT INTO normalisering_karta (doman, monster, varde, prioritet) VALUES
  -- Kubb före timmer: "Klentimmer" innehåller "timmer", och namn kan bära
  -- båda. Prioriteten är regeln, inte radordningen i filen.
  ('grupp','kubb',      'Kubb',   10),
  ('grupp','timmer',    'Timmer', 20),
  ('grupp','massa',     'Massa',  30),
  ('grupp','energi',    'Energi', 40),
  ('destination','vislanda','Vislanda', 10),
  ('destination','urshult', 'Urshult',  20),
  ('destination','alvesta', 'Alvesta',  30),
  ('destination','hästveda','Hästveda', 40),
  ('destination','hastveda','Hästveda', 41)
ON CONFLICT (doman, monster) DO UPDATE
  SET varde = EXCLUDED.varde, prioritet = EXCLUDED.prioritet;

-- Medvetet EJ i kartan, och varför:
--   'Unclassified' — inte en grupp. Ska falla till Ej klassad.
--   'Vida'         — bolaget, inte ett bruk.
--   'Skogsvägen'   — ett avlägg, inte en industri.
-- De ger NULL och syns i vy_normalisering_luckor så beslutet kan omprövas.

CREATE OR REPLACE FUNCTION normalisera(p_doman text, p_varde text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT k.varde FROM normalisering_karta k
  WHERE k.doman = p_doman
    AND p_varde IS NOT NULL
    AND lower(p_varde) LIKE '%' || k.monster || '%'
  ORDER BY k.prioritet
  LIMIT 1;
$$;

COMMENT ON FUNCTION normalisera(text, text) IS
  'Slår upp ett rått maskinvärde i normalisering_karta. NULL = ingen regel matchade; anroparen ska då falla vidare i kedjan, ALDRIG använda det råa värdet.';

-- ── Namnhärledningen använder samma karta ────────────────────────────────
-- Fanns bara som engångs-SQL i 20260822_sortiment_grupp_harledning.sql.
-- Behövs som levande sista fallback: historiska sortiment har NULL i
-- produktgrupp tills de importerats om och ska inte tappa sin grupp.
-- Läser kartan så att grupp-vokabulären finns på ETT ställe.
CREATE OR REPLACE FUNCTION harled_produktgrupp(p_namn text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT normalisera('grupp', p_namn);
$$;

COMMENT ON FUNCTION harled_produktgrupp(text) IS
  'Sista fallback för sortimentgrupp: härleder ur namnsträngen via normalisering_karta. NULL = kunde inte härledas → Ej klassad.';

-- ═══════════════════════════════════════════════════════════════════════
-- LÄSORDNING — EN definition
-- ═══════════════════════════════════════════════════════════════════════
--   grupp:       normalisera(produktgrupp) -> dim_sortiment_grupp.grupp
--                -> harled_produktgrupp(namn)
--   destination: normalisera(destination_namn) -> harled_industri(namn)
--
-- Inget led borttaget. Historiska sortiment har NULL i de nya kolumnerna och
-- faller på precis de led som gällde förut — samma svar som idag.
--
-- Vy, inte scalar-funktion per stockrad: dim_sortiment är ~264 rader och
-- joinas en gång i stället för miljontals korrelerade anrop.
CREATE OR REPLACE VIEW vy_sortiment_klass
WITH (security_invoker = true) AS
SELECT ds.sortiment_id,
       ds.namn,
       ds.kundkod,
       ds.destination_id,
       COALESCE(normalisera('grupp', ds.produktgrupp), sg.grupp,
                harled_produktgrupp(ds.namn))                  AS grupp,
       COALESCE(normalisera('destination', ds.destination_namn),
                harled_industri(ds.namn))                      AS destination,
       -- Filens råa värden, oförvanskade. Den som ska prata med Vidas
       -- system använder dessa, inte våra normaliserade etiketter.
       ds.produktgrupp     AS produktgrupp_ra,
       ds.destination_namn AS destination_ra,
       -- Vilket led som svarade. Gör mätbart hur mycket som fortfarande
       -- hänger på namnsträngen, utan att någon behöver gissa.
       CASE WHEN normalisera('grupp', ds.produktgrupp) IS NOT NULL THEN 'fil'
            WHEN sg.grupp IS NOT NULL                             THEN 'dim_sortiment_grupp'
            WHEN harled_produktgrupp(ds.namn) IS NOT NULL         THEN 'namn'
       END AS grupp_kalla,
       CASE WHEN normalisera('destination', ds.destination_namn) IS NOT NULL THEN 'fil'
            WHEN harled_industri(ds.namn) IS NOT NULL                        THEN 'namn'
       END AS destination_kalla
FROM dim_sortiment ds
LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = ds.sortiment_id;

COMMENT ON VIEW vy_sortiment_klass IS
  'Sortimentets grupp och mottagande industri med full fallback-kedja. Läs HÄRIFRÅN — upprepa aldrig COALESCE-kedjan i en vy.';

-- ═══════════════════════════════════════════════════════════════════════
-- LUCKORNA — så normaliseringen inte kan tystna
-- ═══════════════════════════════════════════════════════════════════════
-- Varje rått värde som filen bar men kartan inte kände igen, med hur många
-- sortiment det gäller. Är listan tom känner kartan igen allt maskinerna
-- skickat. Dyker "Gran Timmer" upp hamnar den här — och tills någon lägger
-- in den i kartan syns dess volym som "Ej klassad" i vyerna, aldrig som en
-- egen grupp.
CREATE OR REPLACE VIEW vy_normalisering_luckor
WITH (security_invoker = true) AS
SELECT 'grupp' AS doman, ds.produktgrupp AS ra_varde,
       COUNT(*) AS sortiment,
       string_agg(DISTINCT ds.maskin_id, ', ') AS maskiner
FROM dim_sortiment ds
WHERE ds.produktgrupp IS NOT NULL
  AND normalisera('grupp', ds.produktgrupp) IS NULL
GROUP BY 1,2
UNION ALL
SELECT 'destination', ds.destination_namn, COUNT(*),
       string_agg(DISTINCT ds.maskin_id, ', ')
FROM dim_sortiment ds
WHERE ds.destination_namn IS NOT NULL
  AND normalisera('destination', ds.destination_namn) IS NULL
GROUP BY 1,2;

COMMENT ON VIEW vy_normalisering_luckor IS
  'Råa maskinvärden som normalisering_karta inte känner igen. Tom lista = kartan täcker allt. Rader här betyder att volym redovisas som Ej klassad / Industri ej angiven tills kartan kompletteras.';

-- harled_industri läser samma karta. Den hade en egen CASE-kopia av
-- destinationsvokabulären från #443 — två ställen som kan glida isär.
-- Beteendet är identiskt (vislanda/urshult/alvesta/hästveda), bara källan
-- flyttad.
CREATE OR REPLACE FUNCTION harled_industri(p_sortiment_namn text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT normalisera('destination', p_sortiment_namn);
$$;

COMMENT ON FUNCTION harled_industri(text) IS
  'Mottagande industri härledd ur sortimentsnamnet via normalisering_karta. Fallback när filen saknar ProductDestination. NULL = okänd, visas som "Industri ej angiven" — aldrig gissad.';
