-- Utfall per trädslag och objekt — för Gran · Tall-valet på medelstamssidan (Martin 2026-11-10).
--
-- Källa: stamplings_cell (en rad per objekt, trädslag, 5 cm-klass och röta; bara slutavverkning,
-- fylls av berakna_stamplingsmodell efter import). Summerat per objekt och trädslag stämmer den
-- exakt mot utfall_objekt (volym, stammar och timmer, kontrollerat på alla 78 objekt 2026-11-10).
--
-- authenticated har ingen läsrätt på stamplings_cell (20261002_stamplings_rattigheter.sql) och får
-- ingen nu heller: vyn ägs av postgres och lämnar bara ut summorna per objekt och trädslag.
-- rot20 = andel stammar över 20 cm med massaved i rotändan, samma definition som stamplings_objekt.rot20,
-- räknad bara på trädslagets egna stammar.

CREATE OR REPLACE VIEW utfall_objekt_tradslag AS
SELECT objekt_id,
       slag,
       sum(stammar)::int                                   AS stammar,
       sum(volym)                                          AS volym,
       sum(timmer)                                         AS timmer,
       sum(kubb)                                           AS kubb,
       sum(massa)                                          AS massa,
       sum(stammar) FILTER (WHERE klass >= 20)::int        AS stammar20,
       CASE WHEN coalesce(sum(stammar) FILTER (WHERE klass >= 20), 0) > 0
            THEN coalesce(sum(stammar) FILTER (WHERE klass >= 20 AND rot), 0)::numeric
                 / sum(stammar) FILTER (WHERE klass >= 20)
       END                                                 AS rot20
FROM stamplings_cell
WHERE slag IN ('gran', 'tall')
GROUP BY objekt_id, slag;

REVOKE ALL ON utfall_objekt_tradslag FROM anon, authenticated;
GRANT SELECT ON utfall_objekt_tradslag TO authenticated;
