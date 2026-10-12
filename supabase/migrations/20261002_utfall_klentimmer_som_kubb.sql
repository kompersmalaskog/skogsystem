-- utfall_objekt: klentimmer räknas som kubb.
--
-- Stämplingsvyn (/affarsuppfoljning/stampling) räknar Kubb + Klentimmer som
-- kubb: klentimmer går till såg som kubb. berakna_utfall_objekt() räknade bara
-- grupp 'Kubb', så klentimmer hamnade i varken timmer, kubb eller massa —
-- /affarsuppfoljning/medelstam visade 0 % kubb för Anders Ingemarsson RP ATA
-- (210 m³ klentimmer av 580) medan stämplingsvyn visade 36,3 %. Fyra objekt
-- har klentimmer (två slutavverkningar, två andra); alla andra är oförändrade.
--
-- Funktionen skrivs om ur den GÄLLANDE texten (pg_get_functiondef), inte ur
-- migrationsfilen — filerna är inte nödvändigtvis den gällande texten. Mönstret
-- måste hittas exakt en gång, annars avbryts allt. Idempotent: är ändringen
-- redan gjord händer ingenting.
--
-- Efteråt måste utfall_objekt räknas om — gruppen ändras utan att någon stock
-- rörs, så förberäkningen ser det inte själv:
--   python berakna_utfall_objekt.py --alla
DO $$
DECLARE
  d      text := pg_get_functiondef('berakna_utfall_objekt(boolean,integer,timestamptz)'::regprocedure);
  gammal text := 'coalesce(sum(g.volym) FILTER (WHERE g.grupp = ''Kubb''),   0) AS kubb';
  ny     text := 'coalesce(sum(g.volym) FILTER (WHERE g.grupp IN (''Kubb'', ''Klentimmer'')), 0) AS kubb';
  n_gammal int;
  n_ny     int;
BEGIN
  n_gammal := (length(d) - length(replace(d, gammal, ''))) / length(gammal);
  n_ny     := (length(d) - length(replace(d, ny, ''))) / length(ny);
  IF n_ny = 1 AND n_gammal = 0 THEN
    RAISE NOTICE 'berakna_utfall_objekt räknar redan klentimmer som kubb — inget att göra';
    RETURN;
  END IF;
  IF n_gammal <> 1 THEN
    RAISE EXCEPTION 'mönstret för kubb hittades % gånger i berakna_utfall_objekt (väntade 1) — avbryter', n_gammal;
  END IF;
  EXECUTE replace(d, gammal, ny);
END $$;

COMMENT ON COLUMN utfall_objekt.kubb_m3 IS
  'Kubb PLUS Klentimmer (grupperna i vy_sortiment_klass), hemved borträknad. Klentimmer går till såg som kubb. Samma definition som stämplingsvyn (stamplings_cell.kubb).';
COMMENT ON COLUMN utfall_objekt.kubb_pct IS
  'Andel kubb inklusive klentimmer av volymen utan hemved — se kubb_m3.';
