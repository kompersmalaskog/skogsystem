-- Cache för det map-matchade lastbilsspåret, PER RUNDA (route_cache-mönstret,
-- fast per flyttdag). Spåret matchas mot vägnätet via ORS och det är dyrt +
-- rate-limitat (ORS free ≈ 40/min), så vi räknar om det EN gång per runda och
-- läser ur cachen sen.
--
-- segment = [{ coords: [[lng,lat],...], matchad: bool }, ...] — den färdiga
-- ritningen (matchade väglinjer + ev. raka fallback-segment). punkt_antal
-- invaliderar cachen när en PÅGÅENDE runda får fler loggpunkter (då räknas bara
-- den växande rundan om, aldrig de stängda).

CREATE TABLE IF NOT EXISTS lastbil_spar_cache (
  flyttdag_id uuid PRIMARY KEY,
  punkt_antal integer NOT NULL,
  segment     jsonb   NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS som övriga uppslags-/cache-tabeller: alla inloggade läser, bara admin
-- skriver (API:t skriver via service-role och går förbi RLS ändå).
ALTER TABLE lastbil_spar_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lastbil_spar_cache_select ON lastbil_spar_cache;
CREATE POLICY lastbil_spar_cache_select ON lastbil_spar_cache
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS lastbil_spar_cache_admin_write ON lastbil_spar_cache;
CREATE POLICY lastbil_spar_cache_admin_write ON lastbil_spar_cache
  FOR ALL TO authenticated USING (ar_admin()) WITH CHECK (ar_admin());
