-- 2026-08-05  objekt: SKAPA CHECK-constraint på larmkoordinat_kalla
--
-- Prod har idag ingen constraint (migration 7 var no-op) — vad som helst kan skrivas till
-- larmkoordinat_kalla. Ett stavfel-'ENVZ' eller 'envz ' skulle gå in tyst och sedan aldrig
-- matcha i UI:t. En CHECK gör det till ett högljutt insert-fel i stället. Nuvarande värden
-- i prod: (null), 'egen', 'td' — alla ryms i listan nedan, så ADD CONSTRAINT validerar rent.
--
-- Idempotent: skapas bara om ingen constraint på kolumnen redan finns.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'objekt'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%larmkoordinat_kalla%'
  ) THEN
    ALTER TABLE objekt ADD CONSTRAINT objekt_larmkoordinat_kalla_check
      CHECK (larmkoordinat_kalla IS NULL OR larmkoordinat_kalla IN ('egen', 'td', 'envz'));
  END IF;
END $$;
