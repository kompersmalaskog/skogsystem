-- DEL 0: Gör maskin_id nullable i skotare_objekt_manuell och
-- migrera dim_objekt.skotad_volym_manuell som objektnivå-rader.
--
-- NULL maskin_id = "gäller hela objektet, maskinoberoende."
-- Maskinspecifika rader (maskin_id IS NOT NULL) har prioritet vid läsning;
-- summera ALDRIG NULL-rad + maskinspecifika rader för samma objekt.
--
-- KÖRS I PREVIEW FÖRST — produktion kräver Martins explicita OK.

-- 1. Gör maskin_id nullable
ALTER TABLE skotare_objekt_manuell
  ALTER COLUMN maskin_id DROP NOT NULL;

COMMENT ON COLUMN skotare_objekt_manuell.maskin_id IS
  'NULL = gäller hela objektet, maskinoberoende. '
  'Maskinspecifika rader (NOT NULL) har prioritet vid läsning — '
  'summera ALDRIG NULL-rad + maskinspecifika rader för samma objekt.';

-- 2. Byt unik-constraint till två partiella index
--    (gamla constraint klarar inte NULL ≠ NULL-semantiken)
ALTER TABLE skotare_objekt_manuell
  DROP CONSTRAINT skotare_objekt_manuell_objekt_id_maskin_id_datum_fran_key;

-- Max en maskin-oberoende rad per objekt
CREATE UNIQUE INDEX skotare_objekt_manuell_objekt_null_maskin
  ON skotare_objekt_manuell (objekt_id)
  WHERE maskin_id IS NULL;

-- Max en rad per (objekt, maskin, datum_fran) för maskin-specifika rader
CREATE UNIQUE INDEX skotare_objekt_manuell_objekt_maskin_datum
  ON skotare_objekt_manuell (objekt_id, maskin_id, datum_fran)
  WHERE maskin_id IS NOT NULL;

-- 3. Rensa skuggobjekt innan INSERT
--    PONS20SDJAA270231_101 är ett importskapat skuggobjekt med maskinprefix-id
--    (ej synligt i appens objektlista). Volymen 17 m³ dubbelräknade mot det
--    riktiga Anders Moliis-objektet 11177393 (406 m³, totalen för båda besöken).
--    NULL:ar fältet så att steget nedan exkluderar det ur INSERT:en automatiskt.
UPDATE dim_objekt
SET skotad_volym_manuell = NULL
WHERE objekt_id = 'PONS20SDJAA270231_101';

-- 4. Migrera 46 objekt från dim_objekt (volym + g15 där det finns)
--    Exkluderat: objekt som redan har rader i skotare_objekt_manuell
--    (8 st med maskinspecifika rader behåller sina värden orörda) +
--    PONS20SDJAA270231_101 (rensades i steg 3 ovan).
--    skotning_g15_manuell: 4 objekt har värden (NULLIF mot 0).
--    skordning_g15_manuell: 0 värden — rörs inte.
INSERT INTO skotare_objekt_manuell
  (objekt_id, maskin_id, volym_m3, g15_timmar, notering)
SELECT
  o.objekt_id,
  NULL AS maskin_id,
  o.skotad_volym_manuell AS volym_m3,
  NULLIF(o.skotning_g15_manuell, 0) AS g15_timmar,
  'Migrerad från dim_objekt.skotad_volym_manuell' AS notering
FROM dim_objekt o
WHERE o.skotad_volym_manuell > 0
  AND NOT EXISTS (
    SELECT 1
    FROM skotare_objekt_manuell s
    WHERE s.objekt_id = o.objekt_id
  )
ON CONFLICT (objekt_id) WHERE maskin_id IS NULL DO NOTHING;

-- 5. Verifiering (kör separat och jämför med förväntat):
--
--    -- Objekt med manuell volym i dim_objekt efter steg 3:
--    SELECT COUNT(*) FROM dim_objekt WHERE skotad_volym_manuell > 0;
--    -- Förväntat: 54
--
--    SELECT COUNT(*) FROM skotare_objekt_manuell;
--    -- Förväntat: 8 befintliga + 46 nya = 54
--
--    SELECT COUNT(*) FROM skotare_objekt_manuell WHERE maskin_id IS NULL;
--    -- Förväntat: 46
--
--    SELECT COUNT(*) FROM skotare_objekt_manuell WHERE maskin_id IS NOT NULL;
--    -- Förväntat: 8 (oförändrade)
--
--    -- Noll-diff volym (0 rader = OK):
--    SELECT o.objekt_id, o.skotad_volym_manuell, s.volym_m3,
--           o.skotad_volym_manuell - s.volym_m3 AS diff
--    FROM dim_objekt o
--    JOIN skotare_objekt_manuell s
--      ON s.objekt_id = o.objekt_id AND s.maskin_id IS NULL
--    WHERE o.skotad_volym_manuell > 0
--      AND ABS(o.skotad_volym_manuell - COALESCE(s.volym_m3, -1)) > 0.001;
--    -- Förväntat: 0 rader
--
--    -- Noll-diff g15 (0 rader = OK):
--    SELECT o.objekt_id, o.skotning_g15_manuell, s.g15_timmar,
--           o.skotning_g15_manuell - s.g15_timmar AS diff
--    FROM dim_objekt o
--    JOIN skotare_objekt_manuell s
--      ON s.objekt_id = o.objekt_id AND s.maskin_id IS NULL
--    WHERE COALESCE(o.skotning_g15_manuell, 0) > 0
--      AND ABS(o.skotning_g15_manuell - COALESCE(s.g15_timmar, -1)) > 0.001;
--    -- Förväntat: 0 rader
