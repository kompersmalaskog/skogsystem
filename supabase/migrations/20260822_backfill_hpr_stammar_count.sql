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
--   58 med stammar_count = 0 men faktiska stammar — 115 968 oräknade
--    2 med ett FÖR HÖGT värde: 4 000 respektive 429 lovade, noll faktiska
--
-- De två för höga är den omvända faran. Huvudimporten skriver filraden och
-- sedan stammarna i batchar; faller en batch loggas bara en varning
-- (_save_hpr_tables: "hpr_stammar insert batch misslyckades") och raden blir
-- kvar med ett löfte datan inte håller. Vakten läser då existing_max = 4000
-- för objekt 11213462 och skulle avvisa VARJE framtida fil under 4 000
-- stammar — för ett objekt som inte har en enda stam. Ett lås, inte ett skydd.
--
-- Därför räknas ALLA rader om, i båda riktningarna — inte bara de som har
-- stammar. En inner join mot hpr_stammar missar precis de två raderna, vilket
-- den första versionen av den här migrationen gjorde.
--
-- Rader som verkligen saknar stammar (4 st) hamnar på 0. Det är ett korrekt
-- värde: de skyddar inget och ska inte hindra nästa fil.

UPDATE hpr_filer f
SET stammar_count = s.faktiska
FROM (
  SELECT f2.id,
         (SELECT COUNT(*)::int FROM hpr_stammar h WHERE h.hpr_fil_id = f2.id) AS faktiska
  FROM hpr_filer f2
) s
WHERE s.id = f.id
  AND COALESCE(f.stammar_count, 0) IS DISTINCT FROM s.faktiska;
