-- STEG 2: partner-relationer + fixa Max maskin-bugg
--
-- Lägger till partner_user_id på medarbetare (självreferens) så att skördarens
-- partner-skotare kan auto-tilldelas i planeringsvyn när objekt får skördare.
-- Fixar också databuggen där Max stod på Daniels maskin (Elephant King).

ALTER TABLE medarbetare
  ADD COLUMN IF NOT EXISTS partner_user_id uuid REFERENCES medarbetare(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS medarbetare_partner_idx
  ON medarbetare (partner_user_id) WHERE partner_user_id IS NOT NULL;

-- Fixa databug: Max stod på A110148 (Elephant King = Daniels maskin).
-- Spec säger Wisent (A030353).
UPDATE medarbetare SET maskin_id = 'A030353' WHERE namn = 'Max Karlsson';

-- Partner-relationer (båda riktningar, namn-baserat för läsbarhet)
UPDATE medarbetare m SET partner_user_id = p.id FROM medarbetare p
  WHERE m.namn = 'Stefan Karlsson'   AND p.namn = 'Daniel Johansson';
UPDATE medarbetare m SET partner_user_id = p.id FROM medarbetare p
  WHERE m.namn = 'Daniel Johansson'  AND p.namn = 'Stefan Karlsson';
UPDATE medarbetare m SET partner_user_id = p.id FROM medarbetare p
  WHERE m.namn = 'Oskar Nilsson'     AND p.namn = 'Max Karlsson';
UPDATE medarbetare m SET partner_user_id = p.id FROM medarbetare p
  WHERE m.namn = 'Max Karlsson'      AND p.namn = 'Oskar Nilsson';
