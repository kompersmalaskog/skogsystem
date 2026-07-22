-- Wisent-regressionen 2026-07-21: gamla unika constrainten fakt_skift_unik
-- (maskin_id, inloggning_tid, filnamn) låg kvar efter ShifKey-migrationen.
-- Upsert med on_conflict=(maskin_id, datum, shift_key) hanterar bara krockar
-- på DET målet — en rad som krockar på den GAMLA constrainten ger 23505 och
-- fäller HELA batchen: Wisent-filen 21/7 gav 0 skiftrader (Martins arbetsdag
-- utan tider) eftersom samma filnamn+inloggning redan fanns från gårdagens
-- import. Ponsse gick fri av en slump — varje timfil har nytt filnamn.
--
-- Nya världens identitet är (maskin_id, datum, shift_key); filnamn uppdateras
-- vid varje kuvert-merge och kan inte ingå i någon nyckel.

ALTER TABLE fakt_skift DROP CONSTRAINT IF EXISTS fakt_skift_unik;
DROP INDEX IF EXISTS fakt_skift_unik;
