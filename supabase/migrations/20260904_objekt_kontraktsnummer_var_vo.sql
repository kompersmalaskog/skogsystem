-- Städning: objekt.kontraktsnummer som bara är VO-numret. 2026-09-04.
--
-- Trakt-importen (lib/trakt/objektinfo.ts) mappade OGI ContractNumber till
-- kontraktsnummer — men i VIDA:s trakt-XML ÄR ContractNumber VO-numret (samma
-- som maskinfilernas ContractNumber → vo_nummer). Resultat i prod: 13 objekt
-- med kontraktsnummer = vo_nummer (ett, Kroksjömåla, med två VO:n
-- "11155842,11251460"). Det finns inget riktigt kontraktsnummer i källan.
-- Mappningen är borttagen i koden; detta nollar de 13 raderna.
--
-- Predikatet är avsiktligt smalt: bara rader där kontraktsnumret INNEHÅLLER
-- radens eget VO. Ett äkta kontraktsnummer (som inte är VO:t) rörs inte.
-- Idempotent — omkörning träffar 0 rader.
--
-- Förhandsvisning (read-only 2026-09-04), 13 rader:
--   11242209 Bjällerhult au + ga · 11225601 Östra-Hoka 1:7 A-C -25 · 11251428 Vällust RP M-R -25
--   11219961 Hålabäck gallring 2026 · 11233325 Räveboda gallring 2026 · 11166477 Mölleryd RP J-Hus -25
--   11161397 Skälviken RP J-Hus -25 · 11251460 Kroksjömåla 1:23 A-A -25 ("11155842,11251460")
--   11249883 Hallaslätt AU 2026 · 11166440 Bågskyttebanan RP J-Hus- 25 · 11219862 Hålabäck 1:6 ga 2026
--   11218909 Betet gallring 2026 · 11131022 Stänkelsmåla 2025
--
-- Kör: först SELECT-raden och jämför med listan ovan, sedan UPDATE:n.

-- SELECT id, vo_nummer, namn, kontraktsnummer FROM objekt
--  WHERE kontraktsnummer IS NOT NULL AND btrim(vo_nummer) <> ''
--    AND position(btrim(vo_nummer) IN kontraktsnummer) > 0
--  ORDER BY vo_nummer;

UPDATE objekt
   SET kontraktsnummer = NULL
 WHERE kontraktsnummer IS NOT NULL
   AND vo_nummer IS NOT NULL AND btrim(vo_nummer) <> ''
   AND position(btrim(vo_nummer) IN kontraktsnummer) > 0;
