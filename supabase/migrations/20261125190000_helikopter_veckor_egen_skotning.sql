-- Helikopter › Veckor: egen skotning räknas som skotat, på SKÖRDAD volym (Martin 2026-11-25).
-- Trakter med dim_objekt.egen_skotning = true skotas inte av våra maskiner (markägaren skotar), så de har inga lass.
-- Veckans skördat och skotat räknar med egen skotning: helikopter_ny_dag lämnar de trakterna utanför båda, men skördaren har skördat dem (och maskinraderna räknade dem redan).
-- Veckans skotat = lass vi skotat (helikopter_ny_dag) + skördad volym (fakt_produktion) på egen-skotning-trakter, samma spår och
-- samma bolagsfilter som resten (bara bolag med beställning). Egen skotning syns som EGEN kolumn (skotat_egen) så vyn kan säga det;
-- den ingår i skotat. Skotare-raderna i maskiner har bara lassen — ingen av våra skotare skotade den.
-- Kolumnen läggs sist: helikopter_manadsfacit och helikopter_veckolage läser kolumnerna vid namn / to_jsonb och påverkas inte.
-- Förutsättning (kontrollerat 2026-11-25): inga lass finns på egen-skotning-trakter, så ingen volym räknas två gånger.
DROP FUNCTION IF EXISTS public.helikopter_ny_veckor(integer, integer, text, date);

CREATE FUNCTION public.helikopter_ny_veckor(p_ar integer, p_manad integer, p_typ text, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(isovecka integer, iso_ar integer, fran date, till date, arbetsdagar integer, arbetsdagar_kvar integer, plan numeric, skordat numeric, skotat numeric, status text, orsak text, maskiner jsonb, skotat_egen numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  ad AS (SELECT * FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag) WHERE maskin_id IS NULL),
  dagar AS (SELECT unnest(gangna_datum || kvar_datum) AS d FROM ad),
  best AS (
    SELECT btrim(b.bolag) AS bolag, sum(b.volym)::numeric AS volym
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad AND lower(btrim(b.typ)) = lower(p_typ) GROUP BY 1),
  bestallt AS (SELECT COALESCE(sum(volym), 0)::numeric AS v, count(*) > 0 AS finns FROM best),
  veckor AS (
    SELECT DISTINCT extract(isoyear FROM d)::int AS iso_ar, extract(week FROM d)::int AS isovecka,
           date_trunc('week', d)::date AS fran, (date_trunc('week', d) + interval '6 days')::date AS till
    FROM dagar),
  vd AS (SELECT v.iso_ar, v.isovecka, d.d FROM veckor v JOIN dagar d ON d.d BETWEEN v.fran AND v.till),
  vinfo AS (
    SELECT iso_ar, isovecka, count(*)::int AS arbetsdagar, count(*) FILTER (WHERE d >= p_idag)::int AS arbetsdagar_kvar, max(d) AS sista
    FROM vd GROUP BY 1, 2),
  dag AS (
    SELECT hd.* FROM helikopter_ny_dag hd, man
    WHERE hd.datum >= man.fran AND hd.datum < man.till_excl AND hd.typ = lower(p_typ)
      AND ((SELECT finns FROM bestallt) = false OR EXISTS (SELECT 1 FROM best b WHERE lower(b.bolag) = lower(hd.bolag)))),
  vol AS (
    SELECT v.iso_ar, v.isovecka, COALESCE(sum(d.skordat), 0)::numeric AS skordat, COALESCE(sum(d.skotat), 0)::numeric AS skotat
    FROM veckor v LEFT JOIN dag d ON d.datum BETWEEN v.fran AND v.till GROUP BY 1, 2),
  egen AS (
    SELECT p.datum, p.volym_m3sub::numeric AS vol
    FROM fakt_produktion p JOIN dim_objekt d ON d.objekt_id = p.objekt_id, man
    WHERE p.datum >= man.fran AND p.datum < man.till_excl AND lower(btrim(d.huvudtyp)) = lower(p_typ)
      AND d.egen_skotning = true AND COALESCE(d.exkludera, false) = false
      AND ((SELECT finns FROM bestallt) = false OR EXISTS (SELECT 1 FROM best b WHERE lower(b.bolag) = lower(btrim(d.bolag))))),
  egenvol AS (
    SELECT v.iso_ar, v.isovecka, COALESCE(sum(e.vol), 0)::numeric AS vol
    FROM veckor v LEFT JOIN egen e ON e.datum BETWEEN v.fran AND v.till GROUP BY 1, 2),
  rader AS (
    SELECT p.datum, p.maskin_id, 'skordare'::text AS roll, p.volym_m3sub::numeric AS vol
    FROM fakt_produktion p JOIN dim_objekt d ON d.objekt_id = p.objekt_id, man
    WHERE p.datum >= man.fran AND p.datum < man.till_excl AND lower(btrim(d.huvudtyp)) = lower(p_typ)
      AND ((SELECT finns FROM bestallt) = false OR EXISTS (SELECT 1 FROM best b WHERE lower(b.bolag) = lower(btrim(d.bolag))))
    UNION ALL
    SELECT l.datum, l.maskin_id, 'skotare', l.volym_m3sub::numeric
    FROM helikopter_lass l JOIN dim_objekt d ON d.objekt_id = l.objekt_id, man
    WHERE l.datum >= man.fran AND l.datum < man.till_excl AND lower(btrim(d.huvudtyp)) = lower(p_typ)
      AND ((SELECT finns FROM bestallt) = false OR EXISTS (SELECT 1 FROM best b WHERE lower(b.bolag) = lower(btrim(d.bolag))))),
  mask AS (
    SELECT v.iso_ar, v.isovecka, r.maskin_id, r.roll, sum(r.vol) AS vol
    FROM veckor v JOIN rader r ON r.datum BETWEEN v.fran AND v.till GROUP BY 1, 2, 3, 4)
  SELECT v.isovecka, v.iso_ar, v.fran, v.till,
         vi.arbetsdagar, vi.arbetsdagar_kvar,
         CASE WHEN (SELECT totalt FROM ad) > 0 THEN round((vi.arbetsdagar * (SELECT bv.v FROM bestallt bv) / (SELECT totalt FROM ad))::numeric, 0) END AS plan,
         vol.skordat + ev.vol AS skordat, vol.skotat + ev.vol AS skotat,
         CASE WHEN vi.sista < p_idag THEN 'last' WHEN p_idag BETWEEN v.fran AND v.till THEN 'pagar' ELSE 'kommande' END AS status,
         (SELECT o.orsak FROM helikopter_veckoorsak o WHERE o.ar = p_ar AND o.manad = p_manad AND lower(o.typ) = lower(p_typ) AND o.isovecka = v.isovecka) AS orsak,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'maskin_id', m.maskin_id,
                     'modell', dm.modell,
                     'namn', COALESCE(NULLIF(btrim(dm.visningsnamn), ''), dm.modell, m.maskin_id),
                     'roll', m.roll,
                     'volym', round(m.vol)) ORDER BY m.roll, m.vol DESC)
                   FROM mask m LEFT JOIN dim_maskin dm ON dm.maskin_id = m.maskin_id
                   WHERE m.iso_ar = v.iso_ar AND m.isovecka = v.isovecka), '[]'::jsonb) AS maskiner,
         ev.vol AS skotat_egen
  FROM veckor v
  JOIN vinfo vi ON vi.iso_ar = v.iso_ar AND vi.isovecka = v.isovecka
  JOIN vol ON vol.iso_ar = v.iso_ar AND vol.isovecka = v.isovecka
  JOIN egenvol ev ON ev.iso_ar = v.iso_ar AND ev.isovecka = v.isovecka
  ORDER BY v.fran;
$function$;

-- Samma behörighet som förut: inloggade och service_role, inte anon.
REVOKE ALL ON FUNCTION public.helikopter_ny_veckor(integer, integer, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.helikopter_ny_veckor(integer, integer, text, date) TO authenticated, service_role;
