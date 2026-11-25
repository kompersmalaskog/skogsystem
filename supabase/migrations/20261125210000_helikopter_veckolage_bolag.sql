-- Veckoläget bär också per-bolag-siffrorna (helikopter_ny_bolag) — skördat och skotat MED egen skotning, takt över senaste 5 arbetsdagarna.
-- Onsdagsnotisen räknar spårens tal ur dem (veckoNotis.ts spararMedBolag), så notisen stämmer med Veckor och Per bolag.
-- helikopter_ny_spar lämnar egen skotning utanför (tavlan lägger till den själv i TypeScript) och rörs inte. Nytt fält, inga befintliga ändras.
-- Körd i prod 2026-11-25 som DO-block (pg_get_functiondef + replace).
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.helikopter_veckolage(date)'::regprocedure);
  IF position('''bolag''' in d) > 0 THEN RETURN; END IF;
  IF position('    ''veckor'',' in d) = 0 THEN RAISE EXCEPTION 'oväntad definition'; END IF;
  d := replace(d, '    ''veckor'',', '    ''bolag'',          (SELECT COALESCE(jsonb_agg(to_jsonb(b)), ''[]''::jsonb) FROM helikopter_ny_bolag(p.ar, p.manad, p_idag) b),' || E'\n' || '    ''veckor'',');
  EXECUTE d;
END $do$;
