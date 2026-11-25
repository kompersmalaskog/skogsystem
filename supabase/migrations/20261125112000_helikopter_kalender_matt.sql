-- Helikopter › Kalender: vad varje maskin faktiskt gjort per dag och trakt i en månad, rakt ur data (inget beräknat).
-- Skördare ur fakt_produktion, skotare ur helikopter_lass; en rad per maskin, dag och objekt (volym summerad). Körd i prod 2026-11-25.
CREATE OR REPLACE FUNCTION public.helikopter_kalender_matt(p_ar integer, p_manad integer)
 RETURNS TABLE(maskin_id text, datum date, objekt_id text, namn text, volym numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  r AS (
    SELECT p.maskin_id::text AS maskin_id, p.datum, p.objekt_id::text AS objekt_id, p.volym_m3sub::numeric AS v
    FROM fakt_produktion p, man WHERE p.datum >= man.fran AND p.datum < man.till_excl
    UNION ALL
    SELECT l.maskin_id::text, l.datum, l.objekt_id::text, l.volym_m3sub::numeric
    FROM helikopter_lass l, man WHERE l.datum >= man.fran AND l.datum < man.till_excl)
  SELECT r.maskin_id, r.datum, r.objekt_id, d.object_name::text AS namn, sum(r.v) AS volym
  FROM r LEFT JOIN dim_objekt d ON d.objekt_id::text = r.objekt_id
  WHERE r.maskin_id IS NOT NULL
  GROUP BY r.maskin_id, r.datum, r.objekt_id, d.object_name
  ORDER BY r.datum, r.maskin_id;
$function$;
