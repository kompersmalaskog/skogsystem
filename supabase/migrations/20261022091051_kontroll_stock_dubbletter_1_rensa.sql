-- ════════════════════════════════════════════════
-- detalj_kontroll_stock: samma mätning i flera ackumulerande HQC-filer (2026-10-22)
--
-- Scorpionen (och Rottne på Rössmåla) exporterar HQC-filer som upprepar alla
-- tidigare kontrollstockar. Unika nyckeln (filnamn, stam_nummer, stock_nummer)
-- släpper igenom varje kopia, så samma fysiska mätning räknades en gång per fil
-- i varje fönster (881 av 2 632 rader var kopior; Scorpionen jan–jun 6 199
-- diametermått där 3 670 är unika).
--
-- "Samma mätning" = samma maskin, samma skördetid, samma stam- och stocknummer
-- och samma mättider (maskin + operatör). Kontrollerat i prod 2026-10-22: i alla
-- 506 grupper med kopior är längder, toppdiametrar, volymer, positioner och
-- mättider identiska; bara filnamn och kontroll_datum (filens datum) skiljer.
-- Den äldsta kopian (lägsta id) behålls: dess kontroll_datum är dagen mätningen
-- först exporterades. Mätpunkterna under de borttagna raderna följer med
-- (ON DELETE CASCADE) — de finns kvar under den behållna raden.
--
-- Rössmåla (R64428): fem stockar på samma stam står med objekt 11077137 i den
-- äldsta filen och 11240372 i alla senare. 11077137 har ingen produktion, inga
-- stammar och ingen objekt-rad; stammen ligger 0 m från en avverkad stam under
-- 11240372 (båda heter "Rössmåla Ga 2026"). Den behållna raden får därför 11240372.
-- ════════════════════════════════════════════════

-- Spärr: avbryt om kopiorna i någon grupp INTE är identiska (data ändrad sedan kontrollen).
DO $$
DECLARE
  avvikande integer;
BEGIN
  SELECT count(*) INTO avvikande FROM (
    SELECT 1
      FROM detalj_kontroll_stock
     GROUP BY maskin_id, harvest_date, stam_nummer, stock_nummer,
              machine_measurement_date, operator_measurement_date
    HAVING count(*) > 1
       AND count(DISTINCT (maskin_langd_cm, operator_langd_cm, maskin_toppdia_mm, operator_toppdia_mm,
                           maskin_volym_sub, operator_volym_sub, stem_lat, stem_lon)) > 1
  ) g;
  IF avvikande > 0 THEN
    RAISE EXCEPTION 'Avbryter: % grupper har kopior med olika mätvärden — granska innan dubbletter tas bort', avvikande;
  END IF;
END $$;

UPDATE detalj_kontroll_stock
   SET objekt_id = '11240372'
 WHERE maskin_id = 'R64428'
   AND objekt_id = '11077137'
   AND stam_nummer = 1
   AND harvest_date = '2026-08-03 08:23:37.376596+00';

WITH r AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY maskin_id, harvest_date, stam_nummer, stock_nummer,
                        machine_measurement_date, operator_measurement_date
           ORDER BY id) AS rn
    FROM detalj_kontroll_stock
)
DELETE FROM detalj_kontroll_stock s
 USING r
 WHERE s.id = r.id AND r.rn > 1;
