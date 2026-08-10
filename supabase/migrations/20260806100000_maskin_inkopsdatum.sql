-- Inköpsår → inköps-år+månad. Maskiner köps ofta mitt i året (juni/juli) —
-- bara årtal ger upp till ett halvårs fel i första årets värdeminskning.
-- date-kolumn med dag=01 (månadsupplösning räcker); befintliga inmatade
-- årtal backfillas som JANUARI (försiktigt = full årskostnad det året —
-- justera månad i Inställningar där det spelar roll).

ALTER TABLE dim_maskin ADD COLUMN IF NOT EXISTS inkopsdatum date;

UPDATE dim_maskin
SET inkopsdatum = make_date(inkopsar, 1, 1)
WHERE inkopsar IS NOT NULL AND inkopsdatum IS NULL;

COMMENT ON COLUMN dim_maskin.inkopsdatum IS 'Inköps-år+månad (dag alltid 01) — position i avskrivningskurvan + pro rata första året.';
COMMENT ON COLUMN dim_maskin.inkopsar IS 'PENSIONERAD — ersatt av inkopsdatum (backfillad som januari). Läses inte.';
