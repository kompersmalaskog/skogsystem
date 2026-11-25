-- Onsdagsnotisen går tills vidare bara till admin (Martin 2026-11-25): spårens tal i notisen var fel för gallring (egen skotning saknades) och
-- fick inte gå ut till alla. Körd i prod som DO-block. För att skicka till alla aktiva igen: byt tillbaka WHERE till
--   WHERE m.aktiv AND (NOT p_manuell OR m.roll = 'admin')     (se 20261125200000).
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.helikopter_notis_vecka(date,boolean)'::regprocedure);
  IF position('WHERE m.aktiv AND (NOT p_manuell OR m.roll = ''admin'')' in d) = 0 THEN RETURN; END IF;
  d := replace(d, 'WHERE m.aktiv AND (NOT p_manuell OR m.roll = ''admin'')', 'WHERE m.aktiv AND m.roll = ''admin''');
  EXECUTE d;
END $do$;
