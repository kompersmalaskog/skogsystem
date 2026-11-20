-- dim_objekt.bolag hade skiftlägesdubbletter: 'VIDA' (38 rader) vs 'Vida' (33),
-- medan bestallningar.bolag bara har 'Vida'. Helikoptervyerna joinar bolag
-- skiftlägeskänsligt, så 'VIDA'-taggad Vida-produktion räknades som obeställd
-- (t.ex. april 2026 underräknades ~1429 m³ avverkat och dök upp som falsk "Övrigt").
-- Kanonisera till samma form som bestallningar + frontendens normalizeBolag.
-- Importens normalize_bolag() (skogsmaskin_import_version_6.py) hindrar återfall
-- när nya filer kommer in. Idempotent — ATA/whitespace är redan rena (0 rader nu).
UPDATE dim_objekt SET bolag = btrim(bolag)
  WHERE bolag IS NOT NULL AND bolag <> btrim(bolag);
UPDATE dim_objekt SET bolag = 'Vida'
  WHERE lower(btrim(bolag)) = 'vida' AND bolag IS DISTINCT FROM 'Vida';
UPDATE dim_objekt SET bolag = 'ATA'
  WHERE lower(btrim(bolag)) = 'ata' AND bolag IS DISTINCT FROM 'ATA';
