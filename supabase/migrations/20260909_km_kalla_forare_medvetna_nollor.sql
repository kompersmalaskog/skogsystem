-- Medvetna km-nollor som BARA skyddas av redigerad-vakten (km 0/null,
-- redigerad=true, km_kalla NULL) märks km_kalla='forare' INNAN vakten på
-- redigerad tas bort ur km-helpern och nattjobbet (#518).
--
-- Räknat i prod 2026-09-09: 14 dagar, alla Martin Lindqvist, alla med
-- maskinpass. KÖRS AV MARTIN — stryk de datum som INTE är medvetna nollor
-- (2026-09-09 Hålabäck ska INTE vara med: den ska räknas till 28+28).
--
-- Efter körning: verifiera med SELECT nedan att bara de avsedda raderna har
-- km_kalla='forare' och att km fortfarande är 0.

UPDATE arbetsdag
SET km_kalla = 'forare'
WHERE redigerad = true
  AND km_kalla IS NULL
  AND coalesce(km_morgon, 0) = 0
  AND coalesce(km_kvall, 0) = 0
  AND medarbetare_id = (SELECT id FROM medarbetare WHERE namn = 'Martin Lindqvist')
  AND datum IN (
    '2026-01-12',  -- fel i mom filen
    '2026-04-14',  -- (ingen anledning)
    '2026-04-25',  -- HPR-syntes: MOM saknas för Hössjömåla 20
    '2026-06-10',  -- Operatörsbyte vid objektbyte
    '2026-07-08',  -- Operatörsbyte vid objektbyte
    '2026-07-09',  -- Operatörsbyte vid objektbyte
    '2026-07-10',  -- Operatörsbyte vid objektbyte
    '2026-07-11',  -- Operatörsbyte vid objektbyte
    '2026-07-12',  -- Operatörsbyte vid objektbyte
    '2026-08-31',  -- 810E
    '2026-09-01',  -- 810E lagt av band
    '2026-09-03',  -- 810E
    '2026-09-04'   -- 810E
    -- '2026-09-09' MEDVETET UTELÄMNAD — Hålabäck, ska få 28+28 av helpern
  );

-- Verifiering (förväntat: 13 rader, alla km 0, km_kalla 'forare'):
-- SELECT datum, km_morgon, km_kvall, km_kalla, redigerad_anl
-- FROM arbetsdag
-- WHERE medarbetare_id = (SELECT id FROM medarbetare WHERE namn = 'Martin Lindqvist')
--   AND redigerad = true AND km_kalla = 'forare' AND coalesce(km_totalt,0) = 0
-- ORDER BY datum;
