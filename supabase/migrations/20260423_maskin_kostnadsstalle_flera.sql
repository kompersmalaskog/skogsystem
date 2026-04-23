-- Tillåt flera Fortnox-kostnadsställen per maskin. Scorpion Gigant har t.ex.
-- "SCO" för kostnader och "M13" för intäkter — Fortnox kan inte slå ihop dem.
-- Gamla PK (maskin_id) bytts mot surrogat-id + UNIQUE(maskin_id, cc_kod).

ALTER TABLE maskin_kostnadsstalle DROP CONSTRAINT IF EXISTS maskin_kostnadsstalle_pkey;

ALTER TABLE maskin_kostnadsstalle
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE maskin_kostnadsstalle SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE maskin_kostnadsstalle
  ALTER COLUMN id SET NOT NULL,
  ADD CONSTRAINT maskin_kostnadsstalle_pkey PRIMARY KEY (id);

ALTER TABLE maskin_kostnadsstalle
  DROP CONSTRAINT IF EXISTS maskin_kostnadsstalle_unik;
ALTER TABLE maskin_kostnadsstalle
  ADD CONSTRAINT maskin_kostnadsstalle_unik UNIQUE (maskin_id, kostnadsstalle_kod);

CREATE INDEX IF NOT EXISTS idx_mks_maskin ON maskin_kostnadsstalle(maskin_id);
CREATE INDEX IF NOT EXISTS idx_mks_cc     ON maskin_kostnadsstalle(kostnadsstalle_kod);

-- Lägg till M13 som andra kostnadsställe för Scorpion Gigant (Ponsse).
INSERT INTO maskin_kostnadsstalle (maskin_id, kostnadsstalle_kod)
VALUES ('PONS20SDJAA270231', 'M13')
ON CONFLICT (maskin_id, kostnadsstalle_kod) DO NOTHING;
