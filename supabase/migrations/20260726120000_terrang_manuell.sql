-- Terrängval per objekt (PR ekonomi-kvalitet-terrang): manuellt val av
-- acord_terrang-taxa (appen kan inte bedöma terräng). NULL = inget val =
-- Normal (0 kr) — inget objekt får svår-tillägg av misstag. Importen rör
-- aldrig *_manuell-kolumner; permanent tills admin ändrar. Värdet matchar
-- acord_terrang.namn exakt.
ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS terrang_manuell text;

COMMENT ON COLUMN dim_objekt.terrang_manuell IS 'Manuellt terrängval (= acord_terrang.namn); NULL = Normal, 0 kr tillägg';
