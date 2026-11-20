-- Spara polygonkoordinater för skotningsuttag (istället för bara centroid)
ALTER TABLE skotning_uttag
  ADD COLUMN IF NOT EXISTS polygon_coords JSONB;
-- polygon_coords: [[lng,lat], [lng,lat], ...] — stängd polygon
