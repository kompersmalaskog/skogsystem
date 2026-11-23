-- Två kontroller som gap_check inte fick svar på (57014 statement timeout).
--
-- Mätt i prod 2026-11-22 (EXPLAIN ANALYZE, kall cache):
--   kontroll_stammar_utan_stockar        16,1 s   -> 75 ms   (kropp utan index; samma svar)
--   kontroll_fakt_sortiment_mot_stock    17,0 s   -> se index nedan (17 651 sidläsningar -> ~3 000)
--
-- ── 1. kontroll_stammar_utan_stockar ─────────────────────────────────────────
-- 20261001_kontroll_stammar_utan_stockar_snabb.sql gjorde den 80 gånger snabbare
-- (kandidaterna avgörs FÖRST med en Index Only Scan, detaljerna hämtas bara för
-- dem). 20261019104703_opti_tider_utc_3c_kontroll_flertrad.sql skrev om
-- funktionen för tid_ar_utc och kopierade då den ursprungliga långsamma
-- kroppen: GROUP BY över hela detalj_stam (278 827 rader) med opti_tid_lokal()
-- per rad, array_agg(DISTINCT filnamn) och HAVING som filtrerar efteråt.
-- Det är regressionen. Nu: kandidatlistan först, och opti_tid_lokal() (tid_ar_utc
-- från 3c) räknas bara för kandidaterna — normalt noll objekt.
-- Signatur, kolumner, ordning och semantik oförändrade; rättigheterna följer med
-- CREATE OR REPLACE.
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
         min(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS forsta,
         max(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS sista,
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
  ORDER BY min(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc)) NULLS FIRST, count(*) DESC;
$f$;

-- ── 2. kontroll_fakt_sortiment_mot_stock ─────────────────────────────────────
-- Funktionen läser summan av volym_m3sub per objekt ur detalj_stock (740 724
-- nyckelförsedda rader) via idx_detalj_stock_massaved. Det indexet är 136 MB
-- (INCLUDE log_key, langd_cm, volym_m3sub, toppdia_ub_mm, sortiment_id) och i
-- EXPLAIN gav skanningen 17 651 sidläsningar från disk när cachen var kall
-- (43 678 sidor träffade cachen) — 17 s. Varm cache, samma fråga: 716 ms.
-- Kontrollen kördes av cron/gap_check när cachen var kall och föll på tidsgränsen.
--
-- Ett eget, smalt täckande index med samma predikat: bara det kontrollen läser.
-- Uppmätt som temporär tabell med samma två kolumner: 23 MB mot 136 MB, 165 ms
-- för hela summeringen. Funktionen behöver inte ändras — planeraren väljer det
-- smalare indexet av sig själv (samma predikat, mindre sidantal).
--
-- OBS: vanlig CREATE INDEX låser skrivningar till detalj_stock medan den
-- byggs (någon sekund för 740 724 poster). Kör den när ingen importkedja
-- pågår; importens skrivningar väntar och går sedan igenom. CONCURRENTLY går
-- inte i en migration (transaktionsblock).
CREATE INDEX IF NOT EXISTS idx_detalj_stock_summa_objekt
  ON detalj_stock (objekt_id) INCLUDE (volym_m3sub)
  WHERE stem_key IS NOT NULL AND log_key IS NOT NULL;
COMMENT ON INDEX idx_detalj_stock_summa_objekt IS
  'Smalt täckande index för kontroll_fakt_sortiment_mot_stock: summa volym_m3sub per objekt över nyckelförsedda stockar. Samma predikat som idx_detalj_stock_massaved men ~6 gånger mindre, så kontrollen klarar kall cache under tidsgränsen.';
