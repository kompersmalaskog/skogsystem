-- ─────────────────────────────────────────────────────────────
-- SAMLAD FRÅNVAROMODELL — STEG 2, backfill: de två frånvarodagarna som bara
-- finns i arbetsdag.dagtyp flyttas in i ledighet_ansokningar.
--
-- Prod 2026-09-18: exakt två arbetsdag-rader har en frånvaro-dagtyp:
--   Martin Lindqvist  2026-05-10  sjuk  (id 129f27d9-a043-4be1-bd98-0b75ba460271)
--   Joacim Ringberg   2026-08-19  sjuk  (id f77f78bc-dbf8-4ae5-aae0-5c7328575858)
-- Joacims dag försvann tyst ur augustis löneunderlag: exporten läste bara
-- ledighet_ansokningar. Efter backfillen syns den som frånvarorad.
--
-- Raderna i arbetsdag RÖRS INTE (dagtyp behåller värdet tills steg 3).
-- Idempotent: körs den igen skapas inga dubbletter.
-- Kör i prod av Martin.
-- ─────────────────────────────────────────────────────────────

-- FÖRE:
--   select a.datum, m.namn, a.dagtyp from arbetsdag a join medarbetare m on m.id = a.medarbetare_id
--     where a.dagtyp in ('sjuk','vab','foraldraledig','semester','atk') order by 1;
--     → 2026-05-10 Martin Lindqvist sjuk · 2026-08-19 Joacim Ringberg sjuk
--   select count(*) from ledighet_ansokningar;  → 2 (Stefans semester, godkänd + väntar)

BEGIN;

INSERT INTO ledighet_ansokningar (medarbetare_id, anvandare_id, typ, startdatum, slutdatum, status, kalla, skapad_av, kommentar)
SELECT a.medarbetare_id, m.namn, a.dagtyp, a.datum, a.datum, 'registrerad', 'backfill', 'migration 20260918110000',
       'Flyttad från arbetsdag.dagtyp (arbetsdag.id ' || a.id || ')'
FROM arbetsdag a
JOIN medarbetare m ON m.id = a.medarbetare_id
WHERE a.dagtyp IN ('sjuk', 'vab', 'foraldraledig')
  AND NOT EXISTS (
    SELECT 1 FROM ledighet_ansokningar l
    WHERE l.medarbetare_id = a.medarbetare_id
      AND l.typ = a.dagtyp
      AND l.startdatum <= a.datum AND l.slutdatum >= a.datum
      AND l.status IN ('godkänd', 'registrerad')
  );

-- Spärr: exakt två rader ska ha skapats första gången (0 vid omkörning).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM ledighet_ansokningar WHERE kalla = 'backfill';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Backfill: väntade 2 rader med kalla = backfill, fick %', n;
  END IF;
END $$;

COMMIT;

-- EFTER:
--   select l.startdatum, m.namn, l.typ, l.status, l.kalla, l.anvandare_id, l.kommentar
--     from ledighet_ansokningar l join medarbetare m on m.id = l.medarbetare_id
--     where l.kalla = 'backfill' order by 1;
--     → 2026-05-10 Martin Lindqvist sjuk registrerad backfill Martin Lindqvist "Flyttad från arbetsdag.dagtyp (arbetsdag.id 129f27d9-…)"
--       2026-08-19 Joacim Ringberg  sjuk registrerad backfill Joacim Ringberg  "Flyttad från arbetsdag.dagtyp (arbetsdag.id f77f78bc-…)"
--   select typ, status, kalla, count(*) from ledighet_ansokningar group by 1,2,3 order by 1,2,3;
--     → semester godkänd ansokan 1 · semester väntar ansokan 1 · sjuk registrerad backfill 2
--   Semesterraderna oförändrade:
--   select id, typ, status, startdatum, slutdatum from ledighet_ansokningar where typ = 'semester' order by startdatum;
--     → a37d8370-… semester godkänd 2026-06-29 2026-07-17 · cbaf0482-… semester väntar 2026-10-12 2026-10-16
--   arbetsdag orörd:
--   select count(*) from arbetsdag where dagtyp = 'sjuk';  → 2
