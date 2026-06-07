-- 2026-06-07  bestallningar → bolag-koppling.  OBS: bolag.id är INTEGER (ej uuid).
--
-- Lägger till bolag_id (FK → bolag.id) på bestallningar, backfillar den enda
-- befintliga raden genom case-insensitiv namnmatchning, och normaliserar
-- fritexten till kanoniskt bolag.namn så att helikoptervyns text-match
-- (bolag-text + typ + månad) fortsätter funka oförändrad.
--
-- RLS rörs INTE i denna migration.

ALTER TABLE bestallningar
  ADD COLUMN IF NOT EXISTS bolag_id integer REFERENCES bolag(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bestallningar_bolag_id_idx ON bestallningar (bolag_id);

-- Backfill: matcha fritext → bolag.namn (case-insensitivt), sätt bolag_id
-- OCH skriv tillbaka kanoniskt namn på texten.
UPDATE bestallningar b
SET bolag_id = bl.id,
    bolag    = bl.namn
FROM bolag bl
WHERE b.bolag_id IS NULL
  AND lower(btrim(b.bolag)) = lower(btrim(bl.namn));

-- Hindra case-dubbletter ("vida"/"Vida"/"VIDA") så "skapa en gång" blir vattentätt.
CREATE UNIQUE INDEX IF NOT EXISTS bolag_namn_lower_unique ON bolag (lower(namn));
