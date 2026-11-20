-- detalj_kontroll_stock: samma fysiska stock under olika stam_nummer (2026-10-24)
--
-- Förra rensningen (20261022091051) räknade en stock som samma mätning när maskin, skördetid,
-- STAM_NUMMER, stocknummer och mättider var lika. Men maskinen numrerar om stammarna i varje
-- kumulativ HQC-fil, så samma stock står med olika stam_nummer i olika filer och släpptes igenom:
-- 379 grupper / 789 rader var fortfarande samma fysiska mätning (410 rader för mycket, 23 %).
--
-- Fysisk identitet = maskin, skördetid (harvest_date identifierar stammen), stocknummer och
-- mättider (maskin + operatör). stam_nummer ingår INTE. Kontrollerat i prod 2026-10-24: i alla 379
-- grupper är längder, toppdiametrar, volymer, positioner, objekt, urval, sortiment, trädets mått
-- och mätare identiska, och ingen grupp ligger inom en enda fil — bara filnamn, stam_nummer och
-- kontroll_datum skiljer.
--
-- Den kopia som behålls är den med tidigast kontroll_datum (dagen mätningen först exporterades),
-- sedan lägst id. Mätpunkterna under de borttagna raderna följer med (ON DELETE CASCADE) — de finns
-- kvar under den behållna raden.
--
-- En kontroll (fakt_kalibrering) som bara bestod av upprepade stockar får inga egna stockrader. Den
-- raden rörs inte; kalibrering_kontroller() (migration _3) döljer den för Kontroller och kalendern.

-- Spärr: avbryt om kopiorna i någon grupp INTE är identiska (data ändrad sedan kontrollen).
DO $$
DECLARE
  avvikande integer;
BEGIN
  SELECT count(*) INTO avvikande FROM (
    SELECT 1
      FROM detalj_kontroll_stock
     GROUP BY maskin_id, harvest_date, stock_nummer, machine_measurement_date, operator_measurement_date
    HAVING count(*) > 1
       AND (
         count(DISTINCT (maskin_langd_cm, operator_langd_cm, maskin_toppdia_mm, operator_toppdia_mm,
                         maskin_volym_sub, operator_volym_sub, stem_lat, stem_lon)) > 1
         OR count(DISTINCT (objekt_id, stem_selection, sortiment_namn, cutting_reason, stem_dbh_mm,
                            log_diameter_mid_ob_mm, log_diameter_butt_ob_mm, measurer_name,
                            measurement_mode, rejected_reason, processing_category)) > 1
       )
  ) g;
  IF avvikande > 0 THEN
    RAISE EXCEPTION 'Avbryter: % grupper har kopior med olika värden — granska innan dubbletter tas bort', avvikande;
  END IF;
END $$;

-- Spärr 2: ingen mätpunkt får försvinna. Varje mätpunkt under en kopia som tas bort ska finnas (samma position, maskin-,
-- operatörs- och klavmått) under den behållna raden. Kontrollerat i prod 2026-10-24: 376 av 410 kopior har exakt samma
-- mätpunkter som den behållna, 32 saknar dem båda, och 2 (Trestensdal gallring 2025) har bara en delmängd av den behållnas.
DO $$
DECLARE
  forlorade integer;
BEGIN
  SELECT count(*) INTO forlorade FROM (
    WITH r AS (
      SELECT id, maskin_id, harvest_date, stock_nummer, machine_measurement_date AS mmd, operator_measurement_date AS omd,
             row_number() OVER (
               PARTITION BY maskin_id, harvest_date, stock_nummer,
                            machine_measurement_date, operator_measurement_date
               ORDER BY kontroll_datum NULLS LAST, id) AS rn
        FROM detalj_kontroll_stock
    )
    SELECT m.id
      FROM detalj_kontroll_stock_matpunkt m
      JOIN r d ON d.id = m.detalj_kontroll_stock_id AND d.rn > 1
     WHERE NOT EXISTS (
       SELECT 1
         FROM r k
         JOIN detalj_kontroll_stock_matpunkt km ON km.detalj_kontroll_stock_id = k.id
        WHERE k.rn = 1
          AND k.maskin_id = d.maskin_id AND k.harvest_date = d.harvest_date AND k.stock_nummer = d.stock_nummer
          AND k.mmd IS NOT DISTINCT FROM d.mmd AND k.omd IS NOT DISTINCT FROM d.omd
          AND km.position_cm = m.position_cm
          AND km.diameter_maskin_mm IS NOT DISTINCT FROM m.diameter_maskin_mm
          AND km.diameter_operator_mm IS NOT DISTINCT FROM m.diameter_operator_mm
          AND km.klave_first_mm IS NOT DISTINCT FROM m.klave_first_mm
          AND km.klave_second_mm IS NOT DISTINCT FROM m.klave_second_mm
     )
  ) f;
  IF forlorade > 0 THEN
    RAISE EXCEPTION 'Avbryter: % mätpunkter under borttagna kopior saknas under den behållna raden', forlorade;
  END IF;
END $$;

WITH r AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY maskin_id, harvest_date, stock_nummer,
                        machine_measurement_date, operator_measurement_date
           ORDER BY kontroll_datum NULLS LAST, id) AS rn
    FROM detalj_kontroll_stock
)
DELETE FROM detalj_kontroll_stock s
 USING r
 WHERE s.id = r.id AND r.rn > 1;
