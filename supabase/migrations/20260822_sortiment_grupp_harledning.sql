-- Sätter grupp på ogrupperade sortiment, härledd ur dim_sortiment.namn.
--
-- LUCKFYLLANDE: rör aldrig en rad som redan har en grupp. Utan det villkoret
-- skulle de sex Klentimmer-sortimenten skrivas om till 'Timmer' (namnet
-- innehåller "timmer") och en egen sortimentsklass försvinna tyst.
--
-- De 28 sortiment som inte matchar någon regel lämnas UTAN grupp. De gissas
-- inte — en felgissad grupp är värre än en ärlig "Ej klassad"-rad i vyerna.
--
-- grupp_manuell = false betyder "härledd, får skrivas om av härledningen".
-- Sätts den till true för en rad äger människan den och detta skript viker.
--
-- Körd mot prod 2026-08-22: 68 rader fick grupp (Massa 22, Timmer 19,
-- Energi 19, Kubb 8). 28 kvar utan grupp, 6 Klentimmer orörda.
-- Skriptet är idempotent — en omkörning ändrar ingenting.

INSERT INTO dim_sortiment_grupp (sortiment_id, grupp, grupp_manuell, uppdaterad_tid)
SELECT d.sortiment_id,
       CASE WHEN lower(d.namn) LIKE '%kubb%'   THEN 'Kubb'
            WHEN lower(d.namn) LIKE '%timmer%' THEN 'Timmer'
            WHEN lower(d.namn) LIKE 'massa%'   THEN 'Massa'
            WHEN lower(d.namn) LIKE 'energi%'  THEN 'Energi' END,
       false, now()
FROM dim_sortiment d
LEFT JOIN dim_sortiment_grupp g ON g.sortiment_id = d.sortiment_id
WHERE d.namn IS NOT NULL
  AND g.grupp IS NULL
  AND (lower(d.namn) LIKE '%kubb%' OR lower(d.namn) LIKE '%timmer%'
    OR lower(d.namn) LIKE 'massa%' OR lower(d.namn) LIKE 'energi%')
ON CONFLICT (sortiment_id) DO UPDATE
  SET grupp = EXCLUDED.grupp, uppdaterad_tid = now()
  WHERE dim_sortiment_grupp.grupp_manuell = false
    AND dim_sortiment_grupp.grupp IS NULL;
