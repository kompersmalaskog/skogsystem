CREATE OR REPLACE FUNCTION public.kontroll_stammar_utan_stockar(p_min_stammar integer DEFAULT 100)
 RETURNS TABLE(objekt_id text, namn text, huvudtyp text, stammar bigint, forsta date, sista date, maskiner text, kalla text, filer text[], stockar_utan_nyckel bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT s.objekt_id, o.object_name, o.huvudtyp, count(*) AS stammar,
         min(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS forsta, max(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS sista,
         string_agg(DISTINCT s.maskin_id, ',') AS maskiner,
         CASE WHEN bool_and(s.filnamn ILIKE '%.hpr') THEN 'hpr'
              WHEN bool_and(s.filnamn ILIKE '%.mom') THEN 'mom'
              ELSE 'blandat' END AS kalla,
         array_agg(DISTINCT s.filnamn) AS filer,
         (SELECT count(*) FROM detalj_stock k
           WHERE k.objekt_id = s.objekt_id AND (k.stem_key IS NULL OR k.log_key IS NULL)) AS stockar_utan_nyckel
  FROM detalj_stam s
  LEFT JOIN dim_objekt o ON o.objekt_id = s.objekt_id
  WHERE s.objekt_id IS NOT NULL
  GROUP BY 1, 2, 3
  HAVING count(*) >= p_min_stammar
     AND NOT EXISTS (SELECT 1 FROM detalj_stock k
                     WHERE k.objekt_id = s.objekt_id
                       AND k.stem_key IS NOT NULL AND k.log_key IS NOT NULL)
  ORDER BY min(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc)) NULLS FIRST, count(*) DESC;
$function$;

-- Räknade redan om tidpunkt från UTC till Stockholm — vilket var FEL för de äldre raderna (väggklocka lagrad som UTC): en stam
-- kl 22–24 svensk tid hamnade på nästa dag. Nu via flaggan. Det råa tidsfiltret behålls (±1/+2 dygn, rymmer båda
-- konventionerna); den exakta dagen avgörs på tidpunkt_lokal.
CREATE OR REPLACE FUNCTION public.maskindata_flertrad_period(p_maskin_ids text[], p_start date, p_slut date)
 RETURNS TABLE(dag date, stammar_alla bigint, stammar_matta bigint, bunt_stammar bigint, grepp bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH matta_filer AS (
    SELECT DISTINCT filnamn FROM detalj_stam
    WHERE maskin_id = ANY(p_maskin_ids) AND filnamn IS NOT NULL
      AND skapad_tid >= TIMESTAMPTZ '2026-08-23 00:00:00+00'
  ),
  rader AS (
    SELECT opti_tid_lokal(s.tidpunkt, s.tid_ar_utc)::date AS dag,
           s.maskin_id, s.objekt_id, s.stam_bunt_nyckel,
           (s.filnamn IS NOT NULL AND s.filnamn IN (SELECT filnamn FROM matta_filer)) AS matt
    FROM detalj_stam s
    WHERE s.maskin_id = ANY(p_maskin_ids) AND s.tidpunkt IS NOT NULL
      AND s.tidpunkt >= (p_start - 1)::timestamp AT TIME ZONE 'Europe/Stockholm'
      AND s.tidpunkt <  (p_slut  + 2)::timestamp AT TIME ZONE 'Europe/Stockholm'
      AND opti_tid_lokal(s.tidpunkt, s.tid_ar_utc)::date BETWEEN p_start AND p_slut
  )
  SELECT dag,
    COUNT(*)                                                      AS stammar_alla,
    COUNT(*) FILTER (WHERE matt)                                  AS stammar_matta,
    COUNT(*) FILTER (WHERE matt AND stam_bunt_nyckel IS NOT NULL) AS bunt_stammar,
    COUNT(DISTINCT (maskin_id, objekt_id, stam_bunt_nyckel))
      FILTER (WHERE matt AND stam_bunt_nyckel IS NOT NULL)        AS grepp
  FROM rader GROUP BY dag ORDER BY dag
$function$;
