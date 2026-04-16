-- Lägg till 'admin'-roll och migrera 'medarbetare' → 'forare'
-- Befintlig CHECK tillåter bara ('medarbetare', 'chef'). Vi vill ha ('forare', 'chef', 'admin').
ALTER TABLE medarbetare DROP CONSTRAINT IF EXISTS medarbetare_roll_check;

UPDATE medarbetare SET roll = 'forare' WHERE roll = 'medarbetare' OR roll IS NULL;

ALTER TABLE medarbetare ALTER COLUMN roll SET DEFAULT 'forare';

ALTER TABLE medarbetare ADD CONSTRAINT medarbetare_roll_check
  CHECK (roll IN ('forare', 'chef', 'admin'));

-- Sätt Martin (id börjar på 09a0be09) till admin
UPDATE medarbetare SET roll = 'admin' WHERE id::text LIKE '09a0be09%';
