-- Aggregat-vyer för uppföljningslistan: summera i DB istället för att hämta
-- råa rader och summera i klienten. PostgREST 1000-radstaket trunkerade tyst
-- över 8703 prod-rader, och instabil range-paginering under pågående import
-- gav icke-deterministiska summor (samma sida: 1052 → 546 mellan två laddningar
-- med oförändrad data). En rad per objekt_id → alltid under taket.
-- security_invoker = respekterar RLS på underliggande tabeller.
-- Redan applicerad i prod via mcp apply_migration 2026-07-21; filen versionerar den.

CREATE OR REPLACE VIEW vy_uppf_prod_per_objekt
WITH (security_invoker = true) AS
SELECT objekt_id,
       SUM(volym_m3sub)              AS volym_m3sub,
       SUM(stammar)                  AS stammar,
       MAX(datum)                    AS sista_datum,
       array_agg(DISTINCT maskin_id) AS maskin_ids
FROM fakt_produktion
WHERE objekt_id IS NOT NULL
GROUP BY objekt_id;

CREATE OR REPLACE VIEW vy_uppf_lass_per_objekt
WITH (security_invoker = true) AS
SELECT objekt_id,
       SUM(volym_m3sub)              AS volym_m3sub,
       COUNT(*)                      AS antal_lass,
       MAX(datum)                    AS sista_datum,
       array_agg(DISTINCT maskin_id) AS maskin_ids
FROM fakt_lass
WHERE objekt_id IS NOT NULL
GROUP BY objekt_id;

GRANT SELECT ON vy_uppf_prod_per_objekt TO anon, authenticated;
GRANT SELECT ON vy_uppf_lass_per_objekt TO anon, authenticated;
