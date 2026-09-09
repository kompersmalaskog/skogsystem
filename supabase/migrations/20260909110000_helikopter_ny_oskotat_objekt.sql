-- /helikopter — "Var virket ligger": alla öppna objekt (ej skotningsavslutade)
-- med oskotat > 0, per typ, samma bolagsurval som spåret (beställda bolag för
-- typ+månad om beställning finns, annars alla). helikopter_ny_spar ger bara
-- topp två per spår; sheeten visar hela listan härifrån.
DROP FUNCTION IF EXISTS helikopter_ny_oskotat_objekt(int, int);
CREATE FUNCTION helikopter_ny_oskotat_objekt(p_ar int, p_manad int)
RETURNS TABLE (typ text, objekt_id text, namn text, bolag text, skordat numeric, skotat numeric, oskotat numeric, senast_datum date)
LANGUAGE sql STABLE AS $$
  WITH best AS (
    SELECT lower(btrim(b.typ)) AS typ, btrim(b.bolag) AS bolag
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad GROUP BY 1, 2),
  oppna AS (
    SELECT d.objekt_id, d.object_name, COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd') AS typ, NULLIF(btrim(d.bolag), '') AS bolag
    FROM dim_objekt d
    WHERE d.skotning_avslutad IS NULL AND COALESCE(d.skotning_avslutad_auto, false) = false
      AND lower(btrim(d.huvudtyp)) IN ('slutavverkning', 'gallring')),
  vol AS (
    SELECT o.objekt_id, o.object_name, o.typ, o.bolag,
           COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p WHERE p.objekt_id = o.objekt_id), 0) AS skordat,
           COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l WHERE l.objekt_id = o.objekt_id), 0) AS skotat,
           GREATEST((SELECT max(p.datum) FROM fakt_produktion p WHERE p.objekt_id = o.objekt_id),
                    (SELECT max(l.datum) FROM fakt_lass l WHERE l.objekt_id = o.objekt_id)) AS senast
    FROM oppna o)
  SELECT v.typ, v.objekt_id, v.object_name, v.bolag, v.skordat, v.skotat, v.skordat - v.skotat AS oskotat, v.senast
  FROM vol v
  WHERE v.skordat - v.skotat > 0
    AND (NOT EXISTS (SELECT 1 FROM best b WHERE b.typ = v.typ)
         OR EXISTS (SELECT 1 FROM best b WHERE b.typ = v.typ AND lower(b.bolag) = lower(v.bolag)))
  ORDER BY v.typ, v.skordat - v.skotat DESC;
$$;
REVOKE ALL ON FUNCTION helikopter_ny_oskotat_objekt(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_ny_oskotat_objekt(int, int) TO authenticated;
