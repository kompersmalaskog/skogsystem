-- ─────────────────────────────────────────────────────────────
-- BYTESDAG (skoftning, Skogsavtalet §5 mom 4) — regler för typ 'inarbetad'.
--
-- Fallet: den röda dagen faller på en onsdag, man jobbar den och är ledig
-- fredagen i stället. Raden: typ 'inarbetad', startdatum = slutdatum = den
-- lediga dagen, ersatter_datum = den röda dagen som arbetades. Steg 1
-- (20260917100000) gav kolumnen och spärren "ersatter_datum bara för och
-- alltid för inarbetad". Det här lägger till vad som saknades:
--
--   1. En inarbetad dag är EN vardag (mån–fre), och den röda dagen den
--      ersätter är också en vardag — en röd lördag ger inga bortfallna
--      timmar att byta. Att ersatter_datum verkligen är en röd dag avgörs i
--      kod (lib/roda-dagar, samma källa som kalendern och helglönen):
--      databasen känner inte påsken.
--   2. Samma person kan inte byta bort samma röda dag två gånger. Olika
--      personer kan byta samma dag. Nekade rader räknas inte.
--
-- Lönen (§5 mom 4): den röda dagens timmar är ORDINARIE tid (+ söndags-
-- tillägg om beordrat, §8 mom 1), den lediga dagen är inarbetad ledighet
-- utan avdrag, och helglönen FLYTTAS INTE (§10 mom 2 — timmarna bortföll
-- inte). Annars betalas 48 timmar för en 40-timmarsvecka.
--
-- Kör i prod av Martin. Additivt, inga rader rörs (ingen inarbetad finns).
-- ─────────────────────────────────────────────────────────────

-- FÖRE:
--   select count(*) from ledighet_ansokningar where typ = 'inarbetad';  → 0

BEGIN;

ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_inarbetad_en_vardag;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_inarbetad_en_vardag CHECK (
    typ <> 'inarbetad' OR (
      startdatum = slutdatum
      AND extract(isodow from startdatum) BETWEEN 1 AND 5
      AND extract(isodow from ersatter_datum) BETWEEN 1 AND 5
      AND ersatter_datum <> startdatum
    )
  );

-- Samma person, samma röda dag: högst en gällande rad (väntar/godkänd).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledighet_inarbetad_unik
  ON ledighet_ansokningar (medarbetare_id, ersatter_datum)
  WHERE typ = 'inarbetad' AND status <> 'nekad';

COMMENT ON CONSTRAINT ledighet_inarbetad_en_vardag ON ledighet_ansokningar IS
  'Skoftning §5 mom 4: en inarbetad dag är en vardag som ersätter en röd vardag. Att ersatter_datum är röd avgörs i kod (lib/roda-dagar). Helglönen flyttas inte.';

COMMIT;

-- EFTER:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.ledighet_ansokningar'::regclass and conname = 'ledighet_inarbetad_en_vardag';
--     → CHECK ((typ <> 'inarbetad') OR (startdatum = slutdatum AND isodow … BETWEEN 1 AND 5 … AND ersatter_datum <> startdatum))
--   select indexname, indexdef from pg_indexes where indexname = 'idx_ledighet_inarbetad_unik';
--     → UNIQUE … (medarbetare_id, ersatter_datum) WHERE typ = 'inarbetad' AND status <> 'nekad'
--   Negativtest 1 (ska FELA på ledighet_inarbetad_en_vardag — 2026-06-07 är en söndag):
--     insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status, ersatter_datum)
--       values ('x', (select id from medarbetare limit 1), 'inarbetad', '2026-06-07', '2026-06-07', 'väntar', '2026-06-06');
--   Negativtest 2 (ska FELA på ledighet_ersatter_bara_inarbetad — semester med ersatter_datum):
--     insert into ledighet_ansokningar (anvandare_id, medarbetare_id, typ, startdatum, slutdatum, status, ersatter_datum)
--       values ('x', (select id from medarbetare limit 1), 'semester', '2026-06-08', '2026-06-08', 'väntar', '2026-06-06');
