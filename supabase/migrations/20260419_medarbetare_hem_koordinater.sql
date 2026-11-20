-- Koordinater för förarens hemadress. Används för automatisk km-beräkning
-- (hem → trakt) i Arbetsrapport. Fylls i manuellt via admin tills vidare
-- — geokodning av fritext-hemadress är inte implementerad.

ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_lat numeric;
ALTER TABLE medarbetare ADD COLUMN IF NOT EXISTS hem_lng numeric;
