-- Färdtidsersättning enligt Skogsavtalet: efter 60 km per dag utgår
-- ersättning per påbörjad mil. Tidigare använde koden km_ersattning_kr
-- (kr/km) vilket inte matchar avtalstextens kr/mil-modell.

ALTER TABLE gs_avtal ADD COLUMN IF NOT EXISTS fardtid_kr_per_mil numeric;

UPDATE gs_avtal SET fardtid_kr_per_mil = 10.49
WHERE giltigt_fran = '2025-04-01';
