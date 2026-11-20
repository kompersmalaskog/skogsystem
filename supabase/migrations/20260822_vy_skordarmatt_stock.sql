-- Skördarmätt stockdata — EN definition av joinen, använd av alla vyer.
--
-- Varför inte fakt_sortiment: den upsertas med merge-duplicates på
-- (datum, maskin_id, objekt_id, sortiment_id). HPR-filer är kumulativa, så en
-- kapad export skriver NER en redan komplett dag istället för att komplettera
-- den. Verifierat 2026-08-07 på objekt 11217392: fakt_sortiment 459 stockar /
-- 50,6 m³ mot 2 651 / 260,5 m³ här. detalj_stock upsertas per stock och kan
-- bara växa — därför är den här vyn den sannare källan.
--
-- Kolumnnamnen skiljer sig mellan tabellerna: detalj_stock.stem_key mot
-- detalj_stam.stam_key. Det är inte ett stavfel nedan.
--
-- maskin_id är med i joinen ENBART för att göra detalj_stock_logical_unique
-- användbart som index. Verifierat 2026-08-22 att den inte ändrar urvalet:
-- (stem_key, objekt_id) ger 253 492 rader, med maskin_id likaså 253 492.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LÄS DETTA INNAN NÅGON BACKFILLAR stem_key
-- ─────────────────────────────────────────────────────────────────────────
-- WHERE stem_key IS NOT NULL AND log_key IS NOT NULL exkluderar 2 831 438 av
-- detalj_stocks 3 084 930 rader (91,8 %). Det är inte städning av kuriosa —
-- det är merparten av tabellen. Raderna importerades innan
-- detalj_stock_logical_unique (migration 20260507_detalj_stock_dedupe_keys)
-- fanns, saknar dedupe-nyckel, och är dubbletter av varandra: 3 084 930 rader
-- rymmer bara 253 494 logiskt unika stockar. En enda nyckel finns i 1 698 245
-- kopior. Massan sitter i objekt 11124774 (Vida, 1 457 004 rader, stem_key
-- NULL på samtliga) och 11177558 (Karl Hedin, 1 092 921 rader).
--
-- Konsekvensen idag: april 2026 är osynlig i den här vyn. Vida har 21 105
-- stammar på 9 objekt den månaden (och januari 4 084 stammar på 5 objekt) som
-- aldrig når fram, eftersom NULL aldrig matchar i joinen. Det är avsiktligt
-- men det är ett bortfall, inte ett tomt utfall — vyer som bygger på den här
-- måste skilja "inga stammar" från "stammar utan stockunderlag".
--
-- Den dag någon backfillar stem_key på de raderna börjar april flöda hit.
-- Det är önskvärt — MEN bara om dubbletterna rensats FÖRST. Backfillas de som
-- de ligger blir varje logisk stock inläst en gång per kopia och volymerna
-- mångdubblas.
--
-- Skyddet idag är detalj_stock_logical_unique: en backfill som återinför
-- logiska dubbletter avvisas av indexet och FALLERAR högljutt istället för att
-- tyst dubbla den här vyn. Det skyddet gäller bara så länge indexet står kvar.
-- Droppas eller ersätts det måste den här vyn ses över i samma ändring.
--
-- Ordning vid en framtida backfill:
--   1. rensa dubbletter i detalj_stock
--   2. verifiera count(*) = count(DISTINCT (maskin_id, stem_key, log_key))
--   3. backfilla stem_key/log_key
--   4. kontrollera att månadsvolymerna feb–aug 2026 är OFÖRÄNDRADE och att
--      januari + april tillkommit — ändras en redan känd månad är något fel

CREATE OR REPLACE VIEW vy_skordarmatt_stock
WITH (security_invoker = true) AS
SELECT
  st.id             AS stock_id,
  st.maskin_id,
  st.objekt_id,
  st.stem_key,
  st.log_key,
  st.sortiment_id,
  st.volym_m3sub,
  st.toppdia_ub_mm,
  sm.tidpunkt
FROM detalj_stock st
JOIN detalj_stam sm
       ON sm.maskin_id = st.maskin_id
      AND sm.stam_key  = st.stem_key
      AND sm.objekt_id = st.objekt_id
WHERE st.stem_key IS NOT NULL
  AND st.log_key  IS NOT NULL;

COMMENT ON VIEW vy_skordarmatt_stock IS
  'Skördarmätt stock joinad mot stam för tidpunkt. Volym = volym_m3sub (m³fub). '
  'Exkluderar 2,83 M dubblettrader utan dedupe-nyckel (pre-20260507) — se '
  'kommentaren i 20260822_vy_skordarmatt_stock.sql innan stem_key backfillas.';

-- detalj_stam saknade index på tidpunkt; varje månadsfråga seq-scannade
-- 181 333 rader. Liten tabell, billigt index.
CREATE INDEX IF NOT EXISTS idx_detalj_stam_tidpunkt
  ON detalj_stam (tidpunkt);

-- ─────────────────────────────────────────────────────────────────────────
-- Mottagande industri härleds ur sortimentsnamnet.
--
-- Detta är EN funktion med avsikt. Namnhärledning är en tillfällig lösning —
-- rätt hem är ett fält på dim_sortiment_grupp. När det fältet finns byts
-- kroppen här ut mot en uppslagning, och ingen vy behöver röras.
--
-- Hästveda är med efter mätning: juli+augusti 2026 gick 1 380,8 m³ Vida-timmer
-- dit, 25 % av sågvolymen. Utan den raden hade en fjärdedel av det köparen
-- ser hamnat i en namnlös hög.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION harled_industri(p_sortiment_namn text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(p_sortiment_namn) LIKE '%vislanda%' THEN 'Vislanda'
    WHEN lower(p_sortiment_namn) LIKE '%urshult%'  THEN 'Urshult'
    WHEN lower(p_sortiment_namn) LIKE '%alvesta%'  THEN 'Alvesta'
    WHEN lower(p_sortiment_namn) LIKE '%hästveda%'
      OR lower(p_sortiment_namn) LIKE '%hastveda%' THEN 'Hästveda'
  END;
$$;

COMMENT ON FUNCTION harled_industri(text) IS
  'Mottagande industri ur sortimentsnamn. Tillfällig — ersätts av ett fält på '
  'dim_sortiment_grupp. NULL = industri okänd, ska visas som sådan, aldrig gissas.';
