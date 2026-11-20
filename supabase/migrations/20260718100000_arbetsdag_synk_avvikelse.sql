-- Avvikelse-registrering för bekräftade dagar (M+L-beslut 2026-07-18):
-- MOM-synken skriver ALDRIG över en bekräftad dag (underskriften är
-- förarens), men om maskindatan skiljer sig från det som bekräftades
-- registreras avvikelsen här i stället för att tappas tyst.
-- Appen ändrar inte tyst — den berättar.
--
-- Format (jsonb): { mom_start, mom_slut, mom_rast_min,
--                   bekraftad_start, bekraftad_slut, bekraftad_rast_min,
--                   upptackt }
-- NULL = ingen känd avvikelse (nollställs när MOM matchar igen).
-- Skrivs enbart av /api/mom-import (service-rollen) — ingen ny RLS behövs
-- utöver befintliga arbetsdag-policyer (förare läser sin egen rad).

ALTER TABLE arbetsdag ADD COLUMN IF NOT EXISTS synk_avvikelse jsonb;

COMMENT ON COLUMN arbetsdag.synk_avvikelse IS
  'MOM-data som avviker från bekräftad dag — grunden för "din maskindata har ändrats, vill du uppdatera?". NULL = ingen avvikelse.';
