-- Markägarrapport-vyn querya:r detalj_stock och detalj_stam med
-- WHERE objekt_id = $1 AND filnamn IN (...). Utan composite index körs
-- queryn som seq scan på 1.54M-rader-tabell och timeout:ar (57014).
--
-- CONCURRENTLY undviker att låsa tabellen under skapandet — viktigt eftersom
-- imports skriver till samma tabell löpande. Får inte köras i transaktion.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_detalj_stock_objekt_filnamn
  ON detalj_stock (objekt_id, filnamn);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_detalj_stam_objekt_filnamn
  ON detalj_stam (objekt_id, filnamn);
