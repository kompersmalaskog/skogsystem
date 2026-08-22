-- Reparerar hpr_filer.stammar_count ur det faktiska antalet hpr_stammar.
--
-- import_hpr.py satte aldrig stammar_count när den skapade hpr_filer-rader
-- (fixat i samma PR). Kolumnen föll till 0, och raderna såg ut som tomma
-- snapshots trots att stammarna fanns.
--
-- Det är inte kosmetiskt. stammar_count är vakten som
-- skogsmaskin_import_version_6._save_hpr_tables jämför mot innan den ersätter
-- ett snapshot:
--
--     if existing_counts and len(stammar) < existing_max: return   # ingen nedgradering
--
-- Med 0 lagrat blir existing_max = 0, och då passerar VILKEN fil som helst
-- och raderar ett komplett snapshot.
--
-- Läget före reparation (mätt 2026-08-22):
--   90 rader i hpr_filer
--   60 med stammar_count = 0 eller NULL
--   58 av dem har faktiska hpr_stammar — 115 968 oräknade stammar
--    2 rader har ett nollskilt men felaktigt värde
--
-- Skriver bara där värdet faktiskt är fel. Rader utan stammar lämnas på 0 —
-- det är ett korrekt värde, inte en lucka.

UPDATE hpr_filer f
SET stammar_count = s.faktiska
FROM (
  SELECT h.hpr_fil_id AS id, COUNT(*)::int AS faktiska
  FROM hpr_stammar h
  GROUP BY h.hpr_fil_id
) s
WHERE s.id = f.id
  AND COALESCE(f.stammar_count, 0) IS DISTINCT FROM s.faktiska;
