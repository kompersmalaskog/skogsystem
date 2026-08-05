-- Verklig värdeminskning per maskin — KALKYL, inte bokförd avskrivning.
-- Bokförd avskrivning (78xx) är skattestyrd och kan skriva ner en fullt
-- brukbar maskin till nästan noll — den används INTE som ägarkostnad.
-- I stället: inköpspris + %/år på kvarvarande värde (degressiv), utslaget
-- per G15-timme av lib/ekonomi/vardeminskning.ts.
--
-- inkopspris NULL = ingen värdeminskning räknas för maskinen (ärligt,
-- ingen 0-gissning). Fälten sätts i /ekonomi/installningar (admin).

ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS inkopspris numeric;
ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS avskrivning_procent numeric DEFAULT 20;

COMMENT ON COLUMN dim_maskin.inkopspris IS 'Inköpspris kr — grund för verklig värdeminskning (kalkyl, ej bokförd avskrivning). NULL = värdeminskning räknas inte.';
COMMENT ON COLUMN dim_maskin.avskrivning_procent IS 'Verklig värdeminskning i %/år på kvarvarande värde (degressiv). Förval 20.';

-- Hängslen: om kolumnen fanns sedan tidigare utan värden
UPDATE dim_maskin SET avskrivning_procent = 20 WHERE avskrivning_procent IS NULL;
