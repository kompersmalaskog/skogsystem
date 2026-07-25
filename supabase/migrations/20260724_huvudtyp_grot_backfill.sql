-- GROT som riktigt huvudtyp-värde: backfilla huvudtyp='Grot' på de objekt som
-- redan är risskotning-flaggade. Huvudtyp och flagga speglar varandra
-- (redigeringssheeten synkar dem framåt); den här körningen får huvudtyp att
-- tala sanning på de historiska raderna, utan kända undantag.
--
-- Träffar de 13 risskotning=true-objekten: 12 med tom/null huvudtyp + Karstorp
-- som felaktigt bar 'Slutavverkning'. Rör ALDRIG en rad med huvudtyp='Gallring'
-- (ingen risskotning=true har det idag) och aldrig ett icke-flaggat objekt.
-- Klassningen (lib/objekt/typ.ts) läser redan flaggan som grot, så inget objekt
-- byter typ av detta — det är huvudtyp-TEXTEN som slutar ljuga.

UPDATE dim_objekt
SET huvudtyp = 'Grot'
WHERE risskotning IS TRUE
  AND (huvudtyp IS NULL OR huvudtyp = '' OR huvudtyp = 'Slutavverkning');
