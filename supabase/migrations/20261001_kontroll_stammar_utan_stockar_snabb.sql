-- kontroll_stammar_utan_stockar: samma svar, 80 gånger billigare.
--
-- Mätt som authenticated med 8 s statement_timeout 2026-10-01 19:04:
-- gamla kroppen 5 473 ms, den här 66 ms. gap_check-körningen 18:58 samma dag
-- fick 57014 (statement timeout) på den gamla medan en importkedja körde
-- samtidigt — 5,5 s i vila är för nära 8 s, och detalj_stam växer
-- (231 026 rader i dag). En veckokontroll som ibland svarar OKÄND slutar
-- man lita på.
--
-- Varför den var dyr: den grupperade HELA detalj_stam med min/max(tidpunkt),
-- string_agg(maskin_id) och array_agg(filnamn) — en Index Scan som hämtar
-- varje rads heap-tupel (4,4 s av 5,5) — och filtrerade bort objekten först
-- efteråt (HAVING). Här avgörs kandidaterna FÖRST: count per objekt med en
-- Index Only Scan på idx_detalj_stam_objekt_filnamn (37 ms) och NOT EXISTS
-- mot idx_detalj_stock_massaved; detaljerna hämtas bara för kandidaterna,
-- som normalt är noll objekt. Signatur, kolumner, ordning och semantik är
-- oförändrade; GRANT/REVOKE från 20261001_kontroll_stammar_utan_stockar.sql
-- följer med (CREATE OR REPLACE behåller rättigheterna).
CREATE OR REPLACE FUNCTION kontroll_stammar_utan_stockar(p_min_stammar int DEFAULT 100)
RETURNS TABLE (
  objekt_id text, namn text, huvudtyp text, stammar bigint,
  forsta date, sista date, maskiner text, kalla text, filer text[],
  stockar_utan_nyckel bigint
) LANGUAGE sql STABLE AS $f$
  WITH kand AS (
    SELECT s.objekt_id
    FROM detalj_stam s
    WHERE s.objekt_id IS NOT NULL
    GROUP BY s.objekt_id
    HAVING count(*) >= p_min_stammar
       AND NOT EXISTS (SELECT 1 FROM detalj_stock k
                       WHERE k.objekt_id = s.objekt_id
                         AND k.stem_key IS NOT NULL AND k.log_key IS NOT NULL))
  SELECT s.objekt_id, o.object_name, o.huvudtyp, count(*) AS stammar,
         min(s.tidpunkt)::date AS forsta, max(s.tidpunkt)::date AS sista,
         string_agg(DISTINCT s.maskin_id, ',') AS maskiner,
         CASE WHEN bool_and(s.filnamn ILIKE '%.hpr') THEN 'hpr'
              WHEN bool_and(s.filnamn ILIKE '%.mom') THEN 'mom'
              ELSE 'blandat' END AS kalla,
         array_agg(DISTINCT s.filnamn) AS filer,
         (SELECT count(*) FROM detalj_stock k
           WHERE k.objekt_id = s.objekt_id AND (k.stem_key IS NULL OR k.log_key IS NULL)) AS stockar_utan_nyckel
  FROM detalj_stam s
  JOIN kand USING (objekt_id)
  LEFT JOIN dim_objekt o ON o.objekt_id = s.objekt_id
  GROUP BY 1, 2, 3
  ORDER BY min(s.tidpunkt) NULLS FIRST, count(*) DESC;
$f$;
