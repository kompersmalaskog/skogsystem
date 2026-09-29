-- ENGÅNGS-STÄDNING: ta bort de fyra region-/riksstora referenslagren ur befintlig
-- objekt_geometri. De importeras inte längre (se lib/trakt/geometri.ts HOPPA_LAGER), men de
-- 15 objekt som redan har geometri bär dem — ~90 % av innehållet är detta skräp (886312: 410 kB,
-- 98 av 109 features okända). Kirurgiskt: rör bara de fyra lagren, allt annat (traktgräns,
-- hänsyn, avlägg, fornlämning, nyckelbiotop, skogsbruksplan, fastighet) lämnas orört.
--
-- Idempotent: WHERE EXISTS gör att bara rader som faktiskt bär något av lagren rörs, och en
-- andra körning gör inget. Kör 1) dry-run, granska, sedan 2) UPDATE, sedan 3) verifiering.
--
-- Matchning på properties._lager (exakt lagernamn), gemener-normaliserat. INTE på _typ='okänt'
-- (då skulle en framtida ny-okänd typ svepas med av misstag).

-- ── 1) DRY-RUN: vilka objekt rörs, hur många features försvinner, storlek före ──
SELECT
  og.objekt_id,
  o.namn,
  jsonb_array_length(og.geometri->'features') AS features_fore,
  (SELECT count(*) FROM jsonb_array_elements(og.geometri->'features') f
     WHERE lower(f->'properties'->>'_lager') IN
       ('l_lst_naturvard_101','l_nvv_friluftsliv_101','l_nvv_natura2000_101','l_nvv_naturreservat_101')
  ) AS tas_bort,
  pg_size_pretty(pg_column_size(og.geometri)::bigint) AS storlek_fore
FROM objekt_geometri og
LEFT JOIN objekt o ON o.id = og.objekt_id
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(og.geometri->'features') f
  WHERE lower(f->'properties'->>'_lager') IN
    ('l_lst_naturvard_101','l_nvv_friluftsliv_101','l_nvv_natura2000_101','l_nvv_naturreservat_101')
)
ORDER BY pg_column_size(og.geometri) DESC;

-- ── 2) UPDATE: bygg om features utan de fyra lagren ──
-- (Kör detta när dry-runen ser rätt ut.)
UPDATE objekt_geometri og
SET geometri = jsonb_set(
  og.geometri, '{features}',
  COALESCE(
    (SELECT jsonb_agg(f)
     FROM jsonb_array_elements(og.geometri->'features') f
     WHERE lower(f->'properties'->>'_lager') NOT IN
       ('l_lst_naturvard_101','l_nvv_friluftsliv_101','l_nvv_natura2000_101','l_nvv_naturreservat_101')),
    '[]'::jsonb)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(og.geometri->'features') f
  WHERE lower(f->'properties'->>'_lager') IN
    ('l_lst_naturvard_101','l_nvv_friluftsliv_101','l_nvv_natura2000_101','l_nvv_naturreservat_101')
);

-- ── 3) VERIFIERING: 0 rader kvar med något av lagren, ny storlek ──
SELECT count(*) AS rader_med_hoppade_lager_kvar
FROM objekt_geometri og
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(og.geometri->'features') f
  WHERE lower(f->'properties'->>'_lager') IN
    ('l_lst_naturvard_101','l_nvv_friluftsliv_101','l_nvv_natura2000_101','l_nvv_naturreservat_101')
);
-- ^ ska vara 0.
