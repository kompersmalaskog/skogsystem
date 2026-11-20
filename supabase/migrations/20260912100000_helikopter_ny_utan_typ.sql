-- /helikopter Läge: "N m³fub på objekt utan typ eller bolag ›".
-- Månadens fakt_produktion + fakt_lass på dim_objekt där huvudtyp ELLER bolag är
-- null/tom. Sådana objekt räknas inte på spåren — det ska synas samma dag.
-- objekt_uuid = objekt-raden (FK dim_objekt_id, annars vo_nummer) för länk till vyn.
DROP FUNCTION IF EXISTS helikopter_ny_utan_typ(int, int);
CREATE FUNCTION helikopter_ny_utan_typ(p_ar int, p_manad int)
RETURNS TABLE (objekt_id text, namn text, vo_nummer text, huvudtyp text, bolag text,
               skordat numeric, skotat numeric, volym numeric, senast_datum date, objekt_uuid uuid)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  utan AS (
    SELECT d.objekt_id, d.object_name, NULLIF(btrim(d.vo_nummer), '') AS vo, d.huvudtyp, d.bolag
    FROM dim_objekt d
    WHERE NULLIF(btrim(d.huvudtyp), '') IS NULL OR NULLIF(btrim(d.bolag), '') IS NULL),
  vol AS (
    SELECT u.objekt_id, u.object_name, u.vo, u.huvudtyp, u.bolag,
           COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p, man WHERE p.objekt_id = u.objekt_id AND p.datum >= man.fran AND p.datum < man.till_excl), 0)::numeric AS skordat,
           COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l, man WHERE l.objekt_id = u.objekt_id AND l.datum >= man.fran AND l.datum < man.till_excl), 0)::numeric AS skotat,
           GREATEST((SELECT max(p.datum) FROM fakt_produktion p, man WHERE p.objekt_id = u.objekt_id AND p.datum >= man.fran AND p.datum < man.till_excl),
                    (SELECT max(l.datum) FROM fakt_lass l, man WHERE l.objekt_id = u.objekt_id AND l.datum >= man.fran AND l.datum < man.till_excl)) AS senast
    FROM utan u)
  SELECT v.objekt_id, v.object_name, v.vo, NULLIF(btrim(v.huvudtyp), ''), NULLIF(btrim(v.bolag), ''),
         v.skordat, v.skotat, (v.skordat + v.skotat)::numeric AS volym, v.senast,
         (SELECT o.id FROM objekt o
           WHERE o.dim_objekt_id = v.objekt_id OR (v.vo IS NOT NULL AND btrim(o.vo_nummer) = v.vo)
           ORDER BY (o.dim_objekt_id = v.objekt_id) DESC NULLS LAST LIMIT 1) AS objekt_uuid
  FROM vol v
  WHERE v.skordat + v.skotat > 0
  ORDER BY v.skordat + v.skotat DESC;
$$;
REVOKE ALL ON FUNCTION helikopter_ny_utan_typ(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_ny_utan_typ(int, int) TO authenticated;
