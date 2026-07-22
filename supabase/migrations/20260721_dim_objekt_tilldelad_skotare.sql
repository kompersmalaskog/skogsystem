-- Skotartilldelning i planeringen. dim_objekt.maskin_id är SKÖRDAREN och får
-- aldrig användas för skotargruppering — detta är skotarens motsvarighet.
-- NULL = ingen tilldelad ("Ej tilldelad"). Lassdata vinner när den finns;
-- skiljer de sig visas en stillsam avvikelsenotis, aldrig tyst övertäckning.
-- Redan applicerad i prod 2026-07-21; filen versionerar den.

ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS tilldelad_skotare text
  REFERENCES dim_maskin(maskin_id) ON DELETE SET NULL;

COMMENT ON COLUMN dim_objekt.tilldelad_skotare IS
  'Planerad skotare (maskin_id). NULL = ej tilldelad. Lassdata (vy_uppf_lass_per_objekt) vinner vid konflikt, med avvikelsenotis.';

CREATE INDEX IF NOT EXISTS idx_dim_objekt_tilldelad_skotare
  ON dim_objekt(tilldelad_skotare) WHERE tilldelad_skotare IS NOT NULL;

-- Engångsmigrering av befintliga tilldelningar: objekt.skotare_maskin_id
-- (planeringstabellen) -> dim_objekt.tilldelad_skotare, INNAN uppföljningen
-- slutar läsa den gamla källan (ett begrepp = ett ställe). dim_objekt_id (FK)
-- är sanningskällan; exakt vo_nummer-match är legacy-fallback. Skriver bara
-- där tilldelad_skotare är NULL.
-- Utfall 2026-07-21: 5 av 12 kopierade. Övriga 7 saknar dim_objekt-rad
-- (planeringsobjekt utan maskindata än) — de ärver vid födsel via
-- _arv_skotartilldelning() i skogsmaskin_import_version_6.py.
UPDATE dim_objekt d
SET tilldelad_skotare = o.skotare_maskin_id
FROM objekt o
WHERE o.skotare_maskin_id IS NOT NULL
  AND d.tilldelad_skotare IS NULL
  AND ( d.objekt_id = o.dim_objekt_id
     OR (o.dim_objekt_id IS NULL AND o.vo_nummer IS NOT NULL AND d.vo_nummer = o.vo_nummer) );
