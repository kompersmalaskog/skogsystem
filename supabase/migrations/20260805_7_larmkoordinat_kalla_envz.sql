-- 2026-08-05  objekt: tillåt larmkoordinat_kalla = 'envz'
--
-- larmkoordinat_kalla har idag värdena 'egen' och 'td' i prod. Envz-importen skriver 'envz'.
-- Finns en CHECK-constraint på kolumnen måste 'envz' med, annars faller inserten.
--
-- larmkoordinat-kolumnerna lades direkt i prod (ej via tracked migration), så constraintens
-- namn/definition syns inte i repot. Detta DO-block är därför defensivt och idempotent:
--   - hittar en ev. CHECK-constraint som nämner larmkoordinat_kalla, oavsett namn
--   - ersätter den med en som tillåter NULL + ('egen','td','envz')
--   - finns ingen constraint -> ingen åtgärd (kolumnen är redan fri)
-- ANTAGANDE: nuvarande tillåtna värden är en delmängd av {egen, td}. Finns andra värden i
-- prod måste de läggas till i listan nedan innan körning, annars avvisas de raderna.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'objekt'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%larmkoordinat_kalla%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE objekt DROP CONSTRAINT %I', cname);
    ALTER TABLE objekt ADD CONSTRAINT objekt_larmkoordinat_kalla_check
      CHECK (larmkoordinat_kalla IS NULL OR larmkoordinat_kalla IN ('egen', 'td', 'envz'));
    RAISE NOTICE 'larmkoordinat_kalla-constraint (%) ersatt med egen/td/envz', cname;
  ELSE
    RAISE NOTICE 'Ingen CHECK-constraint på larmkoordinat_kalla — ingen åtgärd.';
  END IF;
END $$;
