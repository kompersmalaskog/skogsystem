-- Helikoptervyerna kördes som ägare (postgres) och gick förbi RLS på
-- fakt_produktion/fakt_lass/dim_objekt/bestallningar. Mätt 2026-09-07 med
-- bara anon-nyckeln (ingen session): helikopter_vy 102 rader, helikopter_oversikt
-- 10, helikopter_oversikt_ovrigt 24, vy_objekt_utfall 166 — medan dim_objekt,
-- fakt_produktion och fakt_lass svarade tomt för anon. Vyerna läckte alltså
-- produktionsdata utan inloggning.
--
-- security_invoker = vyn läser som den som frågar. Underliggande policies:
--   fakt_produktion/fakt_lass/fakt_tid  SELECT = alla inloggade (20260804)
--   dim_objekt                          SELECT = alla inloggade (qual = true)
--   bestallningar                       enligt 20260524153759 bara admin — men
--                                       svarar idag med data för anon, så
--                                       policyn är i praktiken inte aktiv.
-- Konsekvens: inloggade ser samma som förut; oinloggade ser tomt.
ALTER VIEW helikopter_vy               SET (security_invoker = true);
ALTER VIEW helikopter_oversikt         SET (security_invoker = true);
ALTER VIEW helikopter_oversikt_ovrigt  SET (security_invoker = true);
ALTER VIEW vy_objekt_utfall            SET (security_invoker = true);
