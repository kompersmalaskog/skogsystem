-- Värdeminskning byter modell: procent-på-inköpspris → kr per G15-timme
-- (Ponsse-säljarens verkliga modell: skördare ~300–500 kr/tim, skotare
-- ~250–350 kr/tim de första ~4000 h). Självjusterande — maskinen minskar
-- i värde när den körs, inte när kalendern går.
--
-- inkopspris/inkopsdatum/avskrivning_procent LIGGER KVAR som referens
-- (rörs inte) men läses inte längre av beräkningen.

ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS vardeminskning_kr_per_g15h numeric;

COMMENT ON COLUMN dim_maskin.vardeminskning_kr_per_g15h IS 'Verklig värdeminskning i kr per G15-timme (Ponsse: skördare ~300–500, skotare ~250–350 första ~4000 h). NULL = värdeminskning räknas inte. Ersätter procent-modellen.';
COMMENT ON COLUMN dim_maskin.avskrivning_procent IS 'PENSIONERAD — ersatt av vardeminskning_kr_per_g15h (kr/G15-tim). Läses inte.';
