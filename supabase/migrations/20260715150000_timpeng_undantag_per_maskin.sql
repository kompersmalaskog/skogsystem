-- Timpeng-undantag per maskin (Martins beslut: fulla C).
-- Verkligheten: oftast kör BÅDA maskinerna specialdelen på timpeng, men inte
-- alltid — och timmarna är oberoende (skördaren 5,5 h, skotaren 3 h).
-- Ett timfält per maskin; EN volym med dra-flaggor per maskin (oftast samma
-- specialdel som dras från båda ackorden — bara timmarna skiljer).
-- Tomma/nollade fält = ingen timpeng-del för den maskinen (rent ackord).
--
-- KÖRD mot Supabase 2026-07-15 (gamla timpeng_undantag_timmar hade 0 rader).

ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS timpeng_undantag_timmar_skordare numeric,
  ADD COLUMN IF NOT EXISTS timpeng_undantag_timmar_skotare numeric,
  ADD COLUMN IF NOT EXISTS timpeng_undantag_dra_skordare boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS timpeng_undantag_dra_skotare boolean NOT NULL DEFAULT true;

-- Skyddsnät: flytta ev. sparade timmar (gamla fältet avsåg skördaren).
UPDATE dim_objekt SET timpeng_undantag_timmar_skordare = timpeng_undantag_timmar
WHERE timpeng_undantag_timmar IS NOT NULL AND timpeng_undantag_timmar_skordare IS NULL;

ALTER TABLE dim_objekt DROP COLUMN IF EXISTS timpeng_undantag_timmar;

COMMENT ON COLUMN dim_objekt.timpeng_undantag_timmar_skordare IS
  'Skördarens timmar (decimal) på ackordobjekt som faktureras timpeng. Tomt = skördaren har ingen timpeng-del.';
COMMENT ON COLUMN dim_objekt.timpeng_undantag_timmar_skotare IS
  'Skotarens timmar (decimal) på ackordobjekt som faktureras timpeng. Tomt = skotaren har ingen timpeng-del.';
COMMENT ON COLUMN dim_objekt.timpeng_undantag_volym IS
  'Volym (m3fub) för timpeng-undantaget. Dras från skördarens/skotarens ackordsvolym enligt dra-flaggorna — annars dubbelbetald.';
COMMENT ON COLUMN dim_objekt.timpeng_undantag_dra_skordare IS
  'Undantagsvolymen dras från SKÖRDARENS ackordsvolym. Default true (oftast kör båda maskinerna specialdelen på timpeng).';
COMMENT ON COLUMN dim_objekt.timpeng_undantag_dra_skotare IS
  'Undantagsvolymen dras från SKOTARENS ackordsvolym. Default true.';
