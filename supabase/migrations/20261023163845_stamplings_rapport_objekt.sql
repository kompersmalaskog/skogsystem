-- Stämplingsrapporten vet vilken trakt den hör till (rotpostuppföljningen, Martin 2026-10-23).
-- Vidas import sparar stämplingslängden på trakten (objekt.stamplingslangd_url) men läser den aldrig; läsverktyget
-- (stamplings_rapport) visste inte vilken trakt en rapport gällde. objekt_id = objekt.vo_nummer = utfall_objekt.objekt_id.
-- Bara ett tillägg: inga befintliga rader eller läsare ändras.
ALTER TABLE stamplings_rapport ADD COLUMN IF NOT EXISTS objekt_id text;
CREATE INDEX IF NOT EXISTS stamplings_rapport_objekt_idx ON stamplings_rapport (objekt_id);

-- Den enda rapporten som redan är läst (uppladdad för hand 2026-10-04) är Bågskyttebanans.
UPDATE stamplings_rapport SET objekt_id = '11271849'
WHERE id = 'afe290ab-d617-4ab9-9ae8-06fecae747da' AND objekt_id IS NULL;
