-- Terräng är ett SPANN (Svår 1–8 kr/m³fub, bedömning per objekt), inte
-- fast taxa. terrang_kr_manuell bär det inmatade kronvärdet; NULL = Normal
-- = 0 kr. Ersätter terrang_manuell (text) som pensioneras oanvänd (0 rader
-- hade värde). acord_terrang-taxan används inte längre i beräkningen —
-- Svår-raden där är numera bara referens/riktvärde.
ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS terrang_kr_manuell numeric;

COMMENT ON COLUMN dim_objekt.terrang_kr_manuell IS 'Terrängtillägg kr/m³fub (Svår-spann 1–8, bedömt per objekt); NULL = Normal, 0 kr';
COMMENT ON COLUMN dim_objekt.terrang_manuell IS 'PENSIONERAD (aldrig använd i data) — ersatt av terrang_kr_manuell';
