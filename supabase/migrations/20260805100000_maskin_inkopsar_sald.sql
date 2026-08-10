-- Komplettering av verklig värdeminskning (20260804100000): den degressiva
-- kurvan behöver veta VAR i kurvan maskinen är (inkopsar), och en såld
-- maskin ska sluta bära värdeminskning framåt men behålla historiken.

ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS inkopsar integer;
ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS sald boolean DEFAULT false;
ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS sald_datum date;

COMMENT ON COLUMN dim_maskin.inkopsar IS 'Året maskinen köptes/togs i drift — position i den degressiva avskrivningskurvan. NULL = år 1 antas (försiktigt).';
COMMENT ON COLUMN dim_maskin.sald IS 'Avyttrad maskin — bär ingen värdeminskning från och med säljåret; historik före räknas.';
COMMENT ON COLUMN dim_maskin.sald_datum IS 'Försäljningsdatum. NULL med sald=true = såld nu (ingen värdeminskning från innevarande år).';
