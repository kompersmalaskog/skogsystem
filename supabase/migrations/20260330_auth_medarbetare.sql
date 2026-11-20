-- Add email and role to medarbetare for auth integration
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS email text UNIQUE;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS roll text DEFAULT 'medarbetare'
  CHECK (roll IN ('medarbetare', 'chef'));
