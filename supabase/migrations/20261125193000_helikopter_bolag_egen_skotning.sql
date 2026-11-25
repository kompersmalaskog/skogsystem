-- Helikopter › Per bolag och månadsraden i Veckor: egen skotning räknas, på SKÖRDAD volym (Martin 2026-11-25, samma regel som helikopter_ny_veckor).
-- helikopter_ny_bolag summerade helikopter_ny_dag, som lämnar trakter med dim_objekt.egen_skotning = true utanför både skördat och skotat —
-- Vida gallring stod med 37,8 skördat och 0 skotat fast 810 m³ egen skotning var skördad. Nu läggs de till per dag (skördad volym som både
-- skördat och skotat), så också takten (senaste 5 arbetsdagarna) och prognosen räknar med dem. Signaturen är oförändrad. Körd i prod 2026-11-25
-- som `helikopter_bolag_egen_skotning` (definitionen skrevs om med en ersättning i stället för att skrivas ut i sin helhet).
-- Facit Vida gallring nov 2026: lovat 1 000 · skördat 848,0 · skotat 810,2 · takt_skotat 64,8; slutavverkning oförändrad (5 012,6 / 3 403,2).
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.helikopter_ny_bolag(integer,integer,date)'::regprocedure);
  IF position('FROM helikopter_ny_dag hd, man' IN d) = 0 THEN RAISE EXCEPTION 'mönstret hittades inte'; END IF;
  d := replace(d, 'FROM helikopter_ny_dag hd, man', $x$FROM (
      SELECT h0.datum, h0.typ, h0.bolag, h0.skordat, h0.skotat FROM helikopter_ny_dag h0
      UNION ALL
      SELECT p.datum, lower(btrim(dd.huvudtyp)), btrim(dd.bolag), p.volym_m3sub::numeric, p.volym_m3sub::numeric
      FROM fakt_produktion p JOIN dim_objekt dd ON dd.objekt_id = p.objekt_id
      WHERE dd.egen_skotning = true AND COALESCE(dd.exkludera, false) = false) hd, man$x$);
  EXECUTE d;
END
$do$;
