-- stamplings_*: authenticated får läsa de tre tabeller som sidorna läser, inget annat.
--
-- 20261002_stamplingsmodell.sql gjorde REVOKE ALL bara från anon. Supabase ger authenticated alla
-- tabellrättigheter som standard (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER), så de
-- låg kvar på alla fyra tabeller. RLS stoppade insert/update/delete (en policy för SELECT och inga andra),
-- men TRUNCATE styrs inte av RLS. Det nås inte via PostgREST, men en tabell som bara service-rollen skriver
-- ska inte ha skrivrätt för inloggade över huvud taget.
--
-- Efter: authenticated har SELECT på stamplings_objekt, stamplings_klass och stamplings_meta (de sidorna läser;
-- policyerna USING (true) ligger kvar) och ingenting på stamplings_cell (ingen vy läser den). Service-rollen
-- är orörd. utfall_objekt hade redan bara SELECT (20261001_utfall_objekt_forberaknad.sql).
--
-- Verifierat som authenticated efteråt: läsning fungerar (102 / 99 / 9 rader), stamplings_cell, UPDATE och
-- TRUNCATE ger 42501 permission denied; berakna_stamplingsmodell() som service_role körs som förut.

REVOKE ALL ON stamplings_objekt, stamplings_cell, stamplings_klass, stamplings_meta FROM authenticated;
GRANT SELECT ON stamplings_objekt, stamplings_klass, stamplings_meta TO authenticated;
