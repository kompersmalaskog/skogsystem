-- 2026-08-05  objekt: en stavning för VIDA
--
-- VIDA förekommer redan som "Vida" OCH "VIDA" på olika rader (problemet fanns före envz), och
-- envz ger "Vida Skog AB". Normalisera alla tre till "Vida". Samma regel körs på envz-värdet
-- i koden (lib/trakt/normalisera.ts normaliseraBolag) — detta är engångsstädningen av
-- befintliga rader så tabellen har EN stavning.
--
-- Rör bara VIDA-familjen (case-insensitivt); andra bolag lämnas orörda. bolag = 'Vida'
-- redan -> ingen no-op-uppdatering.

UPDATE objekt
SET bolag = 'Vida'
WHERE lower(trim(bolag)) IN ('vida', 'vida skog ab')
  AND bolag <> 'Vida';
