-- Add saldo fields to ledighet_ansokningar user tracking
-- These columns allow per-person customization of annual allowances

ALTER TABLE ledighet_ansokningar
  ADD COLUMN IF NOT EXISTS semester_dagar int DEFAULT 25,
  ADD COLUMN IF NOT EXISTS atk_dagar int DEFAULT 5;

-- Note: saldo is computed client-side by summing godkända ansökningar per year.
-- These fields on the table are for reference/future use if we want per-row overrides.
-- The actual per-user allowance defaults are hardcoded (25 semester, 5 ATK).
