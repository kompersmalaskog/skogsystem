-- arbetsdag.arbetad_min: pass över midnatt räknades NEGATIVT.
--
-- Kolumnen är GENERATED ALWAYS på två time-kolumner utan datum:
--   (slut_tid - start_tid)/60 - rast_min
-- 19:32 → 04:16 gav därför −916 i stället för +524 (Daniel 2026-06-22). Felet
-- dök upp tre gånger i olika sammanhang (uppföljning, granskningsvyn, årsöver-
-- tiden) innan det togs. Nattskift vid brandrisk börjar 03:00 eller slutar sent
-- — då blir det fel på riktigt.
--
-- Fix: skillnaden modulo 24 timmar. Ett pass som passerar midnatt blir rätt,
-- ett vanligt pass påverkas inte (skillnaden är redan 0–24 h). Ett pass kan
-- inte vara längre än 24 h med två klockslag — det är känt och accepterat.
--
-- FÄLLA (Martin 2026-09-15): modulo förvandlar ett UPPENBART fel (negativ tid,
-- t.ex. felskriven sluttid 07:00 efter start 08:00) till ett TROLIGT fel (23 h)
-- som ingen ser. Oskar 2023-10-09 11:15→09:38 går från −97 till 1 343 min.
-- Därför flaggar granskningsvyn dagar över 16 timmar (lib/arbetsdagRegler
-- ARBETSDAG_MAX_MINUTER) och förarens Bekräfta frågar — de längsta äkta
-- dagarna i prod är 11–12 timmar. Rast längre än passet (två rader: −17 och
-- −8 min) fixas INTE av modulo och förblir negativa; de flaggas på samma sätt.
--
-- Postgres kan inte ändra uttrycket på en genererad kolumn: DROP + ADD.
-- Inga vyer, funktioner, policies, index eller triggers beror på kolumnen
-- (kontrollerat i prod 2026-09-15). Alla läsare använder select * eller
-- namnet, så att kolumnen hamnar sist spelar ingen roll.
--
-- FÖRE (prod 2026-09-15): 1008 rader, 4 negativa, md5 över alla
-- (id:arbetad_min ordnat på id) = 574641a006e70cbad6c976ae1bbd53f1.
-- FÖRVÄNTAT EFTER: exakt 2 rader ändrade —
--   0326e317-da00-4851-978b-66c6ce0f6e0c  Daniel 2026-06-22   −916 → 524
--   fc6ef468-250d-43af-a5b5-439fd21e9762  Oskar  2023-10-09    −97 → 1343
-- de övriga 1006 raderna byte-identiska: md5 = a7d24df9634a8e47dfcc88f1df2fe925.

BEGIN;

ALTER TABLE public.arbetsdag DROP COLUMN arbetad_min;

ALTER TABLE public.arbetsdag ADD COLUMN arbetad_min integer
  GENERATED ALWAYS AS (
    ((((EXTRACT(epoch FROM (slut_tid - start_tid)))::integer + 86400) % 86400) / 60) - rast_min
  ) STORED;

COMMENT ON COLUMN public.arbetsdag.arbetad_min IS
  'Maskinpassets minuter: (slut_tid − start_tid) modulo 24 h, minus rast_min. Passerar midnatt rätt (2026-09-15). Kan bli negativ om rast_min > passet — flaggas i granskningsvyn, rättas i Redigera.';

COMMIT;

-- PostgREST: läs om schemat så kolumnen syns direkt.
NOTIFY pgrst, 'reload schema';

-- ── VERIFIERING EFTER (kör som separata SELECT:er) ──────────────────────────
-- 1) Bara två rader ändrade, båda till förväntat värde:
--    SELECT id, datum, arbetad_min FROM arbetsdag
--     WHERE id IN ('0326e317-da00-4851-978b-66c6ce0f6e0c','fc6ef468-250d-43af-a5b5-439fd21e9762');
--    -- förväntat: 524 och 1343
-- 2) Ingen vanlig dag ändrad — samma kontrollsumma över de övriga 1006 raderna
--    som före:
--    SELECT md5(string_agg(id::text||':'||coalesce(arbetad_min::text,'null'), ',' ORDER BY id))
--      FROM arbetsdag WHERE id NOT IN ('0326e317-da00-4851-978b-66c6ce0f6e0c','fc6ef468-250d-43af-a5b5-439fd21e9762');
--    -- förväntat: a7d24df9634a8e47dfcc88f1df2fe925
-- 3) Negativa kvar = exakt de två rast-längre-än-passet-raderna:
--    SELECT count(*) FROM arbetsdag WHERE arbetad_min < 0;   -- förväntat: 2
