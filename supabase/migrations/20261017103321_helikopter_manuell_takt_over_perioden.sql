-- Helikopter: manuell datakälla (810E) får takt = månadens volym / rapportdagar hittills, inte volym på de 5 senaste rapporterade dagarna.
--
-- Varför: för en manuell maskin är rapportdatum inte produktionsdatum — Oscar rapporterar flera dagars lass på en gång. Med
-- 'orapporterat' (20261017100635) föll de tomma dagarna ur takt-fönstret och 810E:s hela månad (561 m³ gallring) lades på de två dagar
-- som råkade ha lass: 280,5 m³/dag. Rätt tal är volymen jämnt fördelad över de dagar maskinen hade att rapportera på.
--
-- Regel (bara dim_maskin.datakalla = 'manuell'; auto-maskiner oförändrade, rad för rad):
--   takt      = volym i spåret (typ + bas) med datum före idag / antal rapportdagar före idag
--   takt_dagar = antal rapportdagar före idag
--   rapportdagar = helikopter_ny_rapportdagar: maskinens arbetsdagar utom planerade/registrerade stopp, orapporterade INKLUSIVE
--   (ledig förare = planerat stopp = inte rapportdag). Inga rapportdagar än → takt null (ingen prognos), som förut när fönstret var tomt.
--
-- Samma regel i helikopter_ny_maskin (takt_per_dag): den läses av maskinlistan, veckoläget, onsdagsnotisen och "Räcker ca …" —
-- annars visar samma maskin två olika takter.
--
-- Ändrade (samma kolumner, CREATE OR REPLACE): helikopter_ny_takt, helikopter_ny_maskin.
-- Rollback: återställ de två funktionerna ur 20261017095008_helikopter_planerat_stopp.sql resp. prodens tidigare helikopter_ny_maskin.

-- ── 1. Takt per maskin ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.helikopter_ny_takt(p_ar integer, p_manad integer, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(typ text, bas text, maskin_id text, roll text, takt numeric, takt_dagar integer, kvar integer, kvar_datum date[], volym_manad numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  ad AS (SELECT * FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag)),
  glob AS (SELECT a.gangna_datum, a.kvar_datum FROM ad a WHERE a.maskin_id IS NULL),
  vol AS (
    SELECT p.maskin_id, p.datum,
           COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd') AS typ, NULLIF(btrim(d.bolag), '') AS bolag,
           p.volym_m3sub::numeric AS v
    FROM fakt_produktion p JOIN dim_objekt d ON d.objekt_id = p.objekt_id, man
    WHERE p.datum >= man.fran AND p.datum < man.till_excl
    UNION ALL
    SELECT l.maskin_id, l.datum,
           COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd'), NULLIF(btrim(d.bolag), ''),
           l.volym_m3sub::numeric
    FROM fakt_lass l JOIN dim_objekt d ON d.objekt_id = l.objekt_id, man
    WHERE l.datum >= man.fran AND l.datum < man.till_excl),
  best AS (
    SELECT lower(btrim(b.typ)) AS typ, btrim(b.bolag) AS bolag
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad GROUP BY 1, 2),
  typer AS (SELECT unnest(ARRAY['slutavverkning', 'gallring']) AS typ),
  baser AS (SELECT unnest(ARRAY['bestallt', 'totalt']) AS bas),
  maskiner AS (
    SELECT a.maskin_id, a.gangna_datum, a.kvar_datum FROM ad a WHERE a.maskin_id IS NOT NULL
    UNION ALL
    SELECT x.maskin_id, g.gangna_datum, g.kvar_datum
    FROM (SELECT DISTINCT v.maskin_id FROM vol v
          WHERE v.maskin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ad a WHERE a.maskin_id = v.maskin_id)) x
    CROSS JOIN glob g),
  fonster AS (
    SELECT m.maskin_id, m.kvar_datum,
           ARRAY(SELECT dd FROM unnest(m.gangna_datum) dd ORDER BY dd DESC LIMIT 5) AS dagar,
           -- manuell datakälla: antal rapportdagar t.o.m. igår (helikopter_ny_rapportdagar, orapporterade med); null = ej manuell
           CASE WHEN COALESCE(dm0.datakalla, 'auto') = 'manuell' AND rd.rapportdagar IS NOT NULL
                THEN (SELECT count(*)::int FROM unnest(rd.rapportdagar) d WHERE d < p_idag) END AS rapport_n
    FROM maskiner m
    LEFT JOIN dim_maskin dm0 ON dm0.maskin_id = m.maskin_id
    LEFT JOIN helikopter_ny_rapportdagar(p_ar, p_manad, p_idag) rd ON rd.maskin_id = m.maskin_id)
  SELECT t.typ, bs.bas, f.maskin_id,
         CASE WHEN dm.maskin_typ = 'Harvester' THEN 'skordare' ELSE 'skotare' END AS roll,
         CASE WHEN f.rapport_n IS NOT NULL THEN CASE WHEN f.rapport_n > 0 THEN round(COALESCE(s.hittills_vol, 0) / f.rapport_n, 4) END
              WHEN cardinality(f.dagar) > 0 THEN round(COALESCE(s.fonster_vol, 0) / cardinality(f.dagar), 4) END AS takt,
         COALESCE(f.rapport_n, cardinality(f.dagar))::int AS takt_dagar,
         cardinality(f.kvar_datum)::int AS kvar,
         f.kvar_datum,
         COALESCE(s.manad_vol, 0)::numeric AS volym_manad
  FROM fonster f
  JOIN dim_maskin dm ON dm.maskin_id = f.maskin_id AND dm.maskin_typ IN ('Harvester', 'Forwarder')
  CROSS JOIN typer t
  CROSS JOIN baser bs
  LEFT JOIN LATERAL (
    SELECT sum(v.v) FILTER (WHERE v.datum = ANY(f.dagar)) AS fonster_vol, sum(v.v) FILTER (WHERE v.datum < p_idag) AS hittills_vol, sum(v.v) AS manad_vol
    FROM vol v
    WHERE v.maskin_id = f.maskin_id AND v.typ = t.typ
      AND (bs.bas = 'totalt' OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(v.bolag)))) s ON true
  ORDER BY t.typ, bs.bas, roll, f.maskin_id;
$function$;
-- ── 2. Maskinens takt per dag (maskinlistan, veckoläget, notisen): samma regel ───────────────────────────
-- Enda ändringen mot prodens version: CTE:n takt heter takt_auto, och en ny takt väljer rapportdagarna för manuell datakälla.
CREATE OR REPLACE FUNCTION public.helikopter_ny_maskin(p_maskin_id text, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(roll text, objekt_id text, namn text, volym numeric, gjort numeric, kvar numeric, takt_per_dag numeric, takt_dagar integer, nasta_namn text, planerad_namn text, senast_datum date)
 LANGUAGE sql
 STABLE
AS $function$
  WITH m AS (
    SELECT CASE WHEN maskin_typ = 'Harvester' THEN 'skordare' WHEN maskin_typ = 'Forwarder' THEN 'skotare' END AS roll
    FROM dim_maskin WHERE maskin_id = p_maskin_id),
  senast AS (
    SELECT x.objekt_id, x.datum FROM (
      SELECT p.objekt_id, p.datum, sum(p.volym_m3sub) AS v FROM fakt_produktion p, m WHERE m.roll = 'skordare' AND p.maskin_id = p_maskin_id GROUP BY 1, 2
      UNION ALL
      SELECT l.objekt_id, l.datum, sum(l.volym_m3sub) FROM fakt_lass l, m WHERE m.roll = 'skotare' AND l.maskin_id = p_maskin_id GROUP BY 1, 2
    ) x ORDER BY x.datum DESC, x.v DESC LIMIT 1),
  dobj AS (
    SELECT d.objekt_id, d.object_name, NULLIF(btrim(d.vo_nummer), '') AS vo FROM dim_objekt d JOIN senast s ON s.objekt_id = d.objekt_id),
  dims AS (
    SELECT d2.objekt_id FROM dim_objekt d2, dobj
    WHERE d2.objekt_id = dobj.objekt_id OR (dobj.vo IS NOT NULL AND btrim(d2.vo_nummer) = dobj.vo)),
  planvol AS (
    SELECT o.volym::numeric AS v FROM objekt o, dobj
    WHERE dobj.vo IS NOT NULL AND btrim(o.vo_nummer) = dobj.vo AND o.volym IS NOT NULL
    ORDER BY o.ar DESC NULLS LAST, o.manad DESC NULLS LAST LIMIT 1),
  vol AS (
    SELECT COALESCE((SELECT sum(volym_m3sub) FROM fakt_produktion WHERE objekt_id IN (SELECT objekt_id FROM dims)), 0)::numeric AS skordat,
           COALESCE((SELECT sum(volym_m3sub) FROM fakt_lass       WHERE objekt_id IN (SELECT objekt_id FROM dims)), 0)::numeric AS skotat),
  kal AS (
    SELECT unnest(gangna_datum) AS d FROM (
      SELECT gangna_datum
      FROM helikopter_ny_arbetsdagar(extract(year FROM p_idag)::int, extract(month FROM p_idag)::int, p_idag)
      WHERE maskin_id = p_maskin_id OR maskin_id IS NULL
      ORDER BY maskin_id NULLS LAST LIMIT 1) k),
  fonster AS (SELECT d FROM kal ORDER BY d DESC LIMIT 5),
  takt_auto AS (
    SELECT count(*) AS n,
           (CASE WHEN (SELECT roll FROM m) = 'skordare'
                THEN COALESCE((SELECT sum(volym_m3sub) FROM fakt_produktion WHERE maskin_id = p_maskin_id AND datum IN (SELECT d FROM fonster)), 0)
                ELSE COALESCE((SELECT sum(volym_m3sub) FROM fakt_lass       WHERE maskin_id = p_maskin_id AND datum IN (SELECT d FROM fonster)), 0)
           END)::numeric AS vol
    FROM fonster),
  -- manuell datakälla: månadens volym före idag / rapportdagar före idag (orapporterade med)
  rapp AS (
    SELECT (SELECT count(*) FROM unnest(r.rapportdagar) d WHERE d < p_idag)::bigint AS n
    FROM helikopter_ny_rapportdagar(extract(year FROM p_idag)::int, extract(month FROM p_idag)::int, p_idag) r
    WHERE r.maskin_id = p_maskin_id
      AND (SELECT COALESCE(dm.datakalla, 'auto') = 'manuell' FROM dim_maskin dm WHERE dm.maskin_id = p_maskin_id)),
  takt AS (
    SELECT CASE WHEN EXISTS (SELECT 1 FROM rapp) THEN (SELECT n FROM rapp) ELSE a.n END AS n,
           CASE WHEN EXISTS (SELECT 1 FROM rapp)
                THEN (CASE WHEN (SELECT roll FROM m) = 'skordare'
                           THEN COALESCE((SELECT sum(volym_m3sub) FROM fakt_produktion WHERE maskin_id = p_maskin_id AND datum >= date_trunc('month', p_idag)::date AND datum < p_idag), 0)
                           ELSE COALESCE((SELECT sum(volym_m3sub) FROM fakt_lass       WHERE maskin_id = p_maskin_id AND datum >= date_trunc('month', p_idag)::date AND datum < p_idag), 0)
                      END)::numeric
                ELSE a.vol END AS vol
    FROM takt_auto a),
  tilldelad AS (
    SELECT o.namn, NULLIF(btrim(o.vo_nummer), '') AS vo FROM objekt o, m
    WHERE o.status = 'pagaende'
      AND ((m.roll = 'skordare' AND o.skordare_maskin_id = p_maskin_id) OR (m.roll = 'skotare' AND o.skotare_maskin_id = p_maskin_id))
    ORDER BY o.ar NULLS LAST, o.manad NULLS LAST, o.ordning NULLS LAST, o.namn
    LIMIT 1),
  nasta AS (
    SELECT o.namn FROM objekt o, m
    WHERE o.status = 'planerad'
      AND ((m.roll = 'skordare' AND o.skordare_maskin_id = p_maskin_id) OR (m.roll = 'skotare' AND o.skotare_maskin_id = p_maskin_id))
    ORDER BY o.ar NULLS LAST, o.manad NULLS LAST, o.ordning NULLS LAST, o.namn
    LIMIT 1)
  SELECT m.roll, dobj.objekt_id, dobj.object_name,
         (SELECT v FROM planvol) AS volym,
         CASE WHEN m.roll = 'skordare' THEN vol.skordat ELSE vol.skotat END AS gjort,
         CASE WHEN m.roll = 'skordare'
              THEN CASE WHEN (SELECT v FROM planvol) IS NOT NULL THEN GREATEST((SELECT v FROM planvol) - vol.skordat, 0) END
              ELSE GREATEST(vol.skordat - vol.skotat, 0) END AS kvar,
         CASE WHEN takt.n > 0 THEN round(takt.vol / takt.n, 1) END AS takt_per_dag,
         takt.n::int AS takt_dagar,
         (SELECT namn FROM nasta) AS nasta_namn,
         CASE WHEN (SELECT vo FROM tilldelad) IS DISTINCT FROM dobj.vo THEN (SELECT namn FROM tilldelad) END AS planerad_namn,
         (SELECT datum FROM senast) AS senast_datum
  FROM m JOIN dobj ON true CROSS JOIN vol CROSS JOIN takt;
$function$;
