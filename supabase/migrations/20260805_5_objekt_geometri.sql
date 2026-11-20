-- 2026-08-05  objekt_geometri: trakt-geometri som GeoJSON (ur envz-shapefiler)
--
-- En rad per objekt = en FeatureCollection i WGS84 (traktgräns + ev. hänsynsytor, linjer,
-- punkter). Sparas som GeoJSON, INTE som bild — kartvyn itererar över de features/lager som
-- faktiskt kom. kalla = 'envz'. Importen ersätter objektets rad vid omimport.
--
-- RLS på: läsning för inloggade (kartvyn), skrivning bara service-role (importen går förbi
-- RLS). Skapar medvetet INGEN anon-policy — vi lägger inte till en ny öppen tabell.

CREATE TABLE IF NOT EXISTS objekt_geometri (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objekt_id uuid REFERENCES objekt(id) ON DELETE CASCADE,
  geometri  jsonb NOT NULL,
  kalla     text,
  skapad    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS objekt_geometri_objekt_id_idx ON objekt_geometri (objekt_id);

ALTER TABLE objekt_geometri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS objekt_geometri_las_inloggad ON objekt_geometri;
CREATE POLICY objekt_geometri_las_inloggad ON objekt_geometri
  FOR SELECT TO authenticated USING (true);
