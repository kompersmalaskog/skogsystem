-- detalj_stock.stock_key är inte unik — ta bort constrainten som sade det.
--
-- stock_key = '<stem_key>_<log_key>' utan maskin (sedan 20260507, då
-- filnamnet togs bort ur den). StemKey är en räknare PER MASKIN, så samma
-- stock_key finns legitimt på två maskiner: Scorpion stod på 72 000–86 000
-- januari–april 2026, R64428 står där i dag (Betet gallring 2026-09-16,
-- odenssvalahult 2026-10-01). Den logiska identiteten är och förblir
-- UNIQUE (maskin_id, stem_key, log_key) — det är den importen upsertar på.
--
-- Så länge UNIQUE (stock_key) fanns kvar avvisade databasen varje stock vars
-- stem_log redan fanns på en annan maskin: 409/23505 i import_fel, 204 rader
-- sedan 2026-07-24 (86 Flyttobjekt-filer), och hela omimporten av de 41
-- objekten utan stockar 2026-10-01 stoppades i första batchen. R64428:s
-- räknare närmar sig Scorpions nuvarande intervall (86 534–182 222), så
-- tappet hade spridit sig till löpande import.
--
-- stock_key behålls som kolumn (rad-id i äldre data), bara constrainten
-- försvinner. Ingen kod upsertar på stock_key (kontrollerat 2026-10-01).
ALTER TABLE detalj_stock DROP CONSTRAINT IF EXISTS detalj_stock_stock_key_unique;

COMMENT ON COLUMN detalj_stock.stock_key IS
  'Historiskt rad-id: <stem_key>_<log_key> (före 20260507 med filnamn). INTE unik — StemKey räknas per maskin. Identiteten är (maskin_id, stem_key, log_key).';
