-- ─────────────────────────────────────────────────────────────
-- Utjämningsperiod: ett kort NAMN ("Gävle") vid sidan av den långa anteckningen
--
-- Anteckningen är en mening ("Gävle/Hedemora–Sandviken 22 apr–29 jun 2026 (sex objekt …)") och gör listan, kalenderns
-- tonade veckor och krockvarningen för långa att läsa. Namnet är det man känner igen perioden på. Anteckningen blir
-- en valfri detalj.
--
-- Kolumnen är NULLBAR i databasen och obligatorisk i formuläret (Admin → Avtal → Utjämningsperioder). Skälet är
-- utrullningen: koden på main skriver inte namn, så en NOT NULL skulle få varje period som skapas före merge att
-- misslyckas. Appen faller tillbaka på de första orden i anteckningen för en rad som saknar namn.
--
-- Backfill: Gävle-raderna (migration 20260918100000: 2026-04-20–2026-07-05, för alla eller per förare) får "Gävle".
-- Alla andra rader som redan finns får de första 20 tecknen av anteckningen (annars "Period"), så ingen rad står utan namn.
--
-- Kör i prod av Martin eller Claude. Inga andra tabeller, inga andra kolumner, ingen RLS-ändring (policyerna gäller hela raden).
-- Läsare som väljer kolumner: Admin → Avtal. Årsövertiden (app/api/lon/arsovertid) väljer sina egna kolumner och rörs inte.
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE utjamningsperiod ADD COLUMN IF NOT EXISTS namn text;

UPDATE utjamningsperiod
   SET namn = 'Gävle'
 WHERE namn IS NULL
   AND startdatum = DATE '2026-04-20'
   AND slutdatum  = DATE '2026-07-05';

UPDATE utjamningsperiod
   SET namn = COALESCE(NULLIF(btrim(left(btrim(anteckning), 20)), ''), 'Period')
 WHERE namn IS NULL;

ALTER TABLE utjamningsperiod DROP CONSTRAINT IF EXISTS utjamningsperiod_namn_langd;
ALTER TABLE utjamningsperiod ADD CONSTRAINT utjamningsperiod_namn_langd
  CHECK (namn IS NULL OR char_length(btrim(namn)) BETWEEN 1 AND 20);

COMMENT ON COLUMN utjamningsperiod.namn IS 'Kort namn på perioden, 1–20 tecken ("Gävle"). Visas i listan, i kalenderns tonade veckor och i krockvarningen. Anteckningen är den långa detaljen.';

COMMIT;

-- Läs in schemat i PostgREST direkt (annars kan "Could not find the 'namn' column" visas en stund):
NOTIFY pgrst, 'reload schema';

-- EFTER:
--   select startdatum, slutdatum, medarbetare_id, namn, left(anteckning, 30) as anteckning
--     from utjamningsperiod order by startdatum;
--     → Gävle-raden: namn = 'Gävle'. Ingen rad med namn IS NULL.
--   select count(*) from utjamningsperiod where namn is null;
--     → 0
--   select conname from pg_constraint where conrelid = 'public.utjamningsperiod'::regclass and contype = 'c' order by 1;
--     → utjamningsperiod_hel_vecka, utjamningsperiod_namn_langd, utjamningsperiod_ordning
--   Negativtest (ska FELA på utjamningsperiod_namn_langd — 21 tecken):
--     insert into utjamningsperiod (startdatum, slutdatum, anteckning, namn)
--       values ('2026-10-12', '2026-10-18', 'test', 'abcdefghijklmnopqrstu');
--
-- ÅNGRA (om det behövs):
--   alter table utjamningsperiod drop constraint if exists utjamningsperiod_namn_langd;
--   alter table utjamningsperiod drop column if exists namn;
