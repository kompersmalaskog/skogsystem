-- Helikopter · helikopter_ny_klar, version 2 (2026-10-23): GROT och energiklippning räknas i maskinernas köer, och en trakt utan vald maskin
-- får maskinen ur maskinkön.
--
-- Ändringar mot 20261017142154 (samma funktion, samma svar, tre tillägg):
--  · Trakter av typ 'grot' (bara skotning) och 'energiklippning' (båda rollerna) ligger i maskinens kö och flyttar klar-datumet — en skotare med
--    tre dagar GROT efter virket blir klar tre dagar senare. De räknas ALDRIG mot beställningen (spar är fortfarande bara slutavverkning/gallring).
--  · Saknar trakten vald maskin för rollen men ligger i EXAKT en kapacitetsmaskins kö (maskin_ko) räknas den maskinen som tilldelad
--    (trakter[].ur_ko = true). Ligger den i två köer, eller ingen, är maskin_id NULL som förut (appen visar "har ingen maskin").
--    Ingenting skrivs till objekt — tilldelningen är härledd, som de planerade stoppen.
--  · trakter[].medelstam (objekt.medelstam) följer med så appen kan räkna G15-förslaget för en trakt som saknar prognos (lib/g15Forslag).
--
-- Rollback: kör 20261017142154_helikopter_ny_klar.sql igen.

CREATE OR REPLACE FUNCTION public.helikopter_ny_klar(p_ar integer, p_manad integer, p_idag date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  WITH man AS (
    SELECT make_date(p_ar, p_manad, 1) AS fran,
           (make_date(p_ar, p_manad, 1) + interval '1 month - 1 day')::date AS till,
           (make_date(p_ar, p_manad, 1) - interval '1 month')::date AS forra),
  start AS (SELECT GREATEST(man.fran, p_idag) AS d FROM man),
  sista AS (
    SELECT max(d::date) AS d FROM man, generate_series(man.fran, man.till, interval '1 day') d
    WHERE helikopter_ny_ar_arbetsdag(d::date)),
  -- Kapacitetsmaskiner: skördare/skotare, inte extramaskin, inte såld före månadens slut.
  mk AS (
    SELECT m.maskin_id,
           COALESCE(NULLIF(btrim(m.visningsnamn), ''), m.modell, m.maskin_id) AS namn,
           CASE WHEN m.maskin_typ = 'Harvester' THEN 'skordare' ELSE 'skotare' END AS roll,
           COALESCE(NULLIF(lower(btrim(m.klarar_typ)), ''), 'bada') AS klarar_typ,
           COALESCE(m.datakalla, 'auto') = 'manuell' AS manuell
    FROM dim_maskin m, man
    WHERE m.maskin_typ IN ('Harvester', 'Forwarder')
      AND COALESCE(m.extramaskin, false) = false
      AND (m.aktiv_till IS NULL OR m.aktiv_till >= man.till)),
  g AS (SELECT * FROM helikopter_ny_g15_per_arbetsdag(p_idag)),
  kap AS (
    SELECT mk.*,
           CASE WHEN COALESCE(g.dagar >= 20 AND g.g15_per_dag > 0, false) THEN round(g.g15_per_dag::numeric, 4) ELSE 8::numeric END AS g15_per_dag,
           NOT COALESCE(g.dagar >= 20 AND g.g15_per_dag > 0, false) AS ej_matt,
           (SELECT jsonb_object_agg(t.typ, t.takt) FROM helikopter_ny_takt(extract(year FROM p_idag)::int, extract(month FROM p_idag)::int, p_idag) t
             WHERE t.maskin_id = mk.maskin_id AND t.bas = 'totalt' AND t.takt IS NOT NULL) AS takt
    FROM mk LEFT JOIN g ON g.maskin_id = mk.maskin_id),
  -- Maskinens lediga arbetsdagar framåt (sex månader).
  dagar AS (
    SELECT md.maskin_id, md.datum
    FROM man, generate_series(0, 5) k,
         LATERAL helikopter_ny_maskindag(
           extract(year FROM (man.fran + make_interval(months => k)))::int,
           extract(month FROM (man.fran + make_interval(months => k)))::int, p_idag) md
    WHERE md.status = 'arbetsdag' AND md.datum >= (SELECT d FROM start)
      AND md.maskin_id IN (SELECT maskin_id FROM mk)),
  dagarr AS (SELECT d.maskin_id, array_agg(d.datum ORDER BY d.datum) AS arr FROM dagar d GROUP BY d.maskin_id),
  -- Trakterna: månadens + förra månadens.
  kand AS (
    SELECT p.*, false AS forra FROM helikopter_ny_planering(p_ar, p_manad) p
    UNION ALL
    SELECT p.*, true FROM man, helikopter_ny_planering(extract(year FROM man.forra)::int, extract(month FROM man.forra)::int) p),
  kand2 AS (
    SELECT k.*, o.ordning, o.ar, o.manad, o.dim_objekt_id, o.medelstam::numeric AS medelstam
    FROM kand k JOIN objekt o ON o.id = k.objekt_id
    WHERE k.typ IN ('slutavverkning', 'gallring', 'grot', 'energiklippning')),
  -- Maskinkön (maskin_ko): ligger trakten i EXAKT en kapacitetsmaskins kö för rollen är den maskinen tilldelad — ingen fråga till planeraren.
  ko AS (
    SELECT q.objekt_id, mk.roll, min(q.maskin_id) AS maskin_id
    FROM maskin_ko q JOIN mk ON mk.maskin_id = q.maskin_id
    GROUP BY 1, 2 HAVING count(DISTINCT q.maskin_id) = 1),
  dm AS (
    SELECT DISTINCT k.objekt_id AS ouuid, d.objekt_id AS dim_id
    FROM kand2 k JOIN objekt o ON o.id = k.objekt_id
    JOIN dim_objekt d ON d.objekt_id = o.dim_objekt_id
                      OR (NULLIF(btrim(o.vo_nummer), '') IS NOT NULL AND btrim(d.vo_nummer) = btrim(o.vo_nummer))),
  uth AS (
    SELECT dm.ouuid,
           CASE WHEN m.maskin_typ = 'Harvester' THEN 'skordare' ELSE 'skotare' END AS roll,
           sum((COALESCE(ft.processing_sek, 0) + COALESCE(ft.terrain_sek, 0) + COALESCE(ft.other_work_sek, 0)) / 3600.0) AS h
    FROM fakt_tid ft JOIN dm ON dm.dim_id = ft.objekt_id JOIN dim_maskin m ON m.maskin_id = ft.maskin_id
    WHERE m.maskin_typ IN ('Harvester', 'Forwarder')
    GROUP BY 1, 2),
  skord AS (SELECT dm.ouuid, sum(fp.volym_m3sub) AS v FROM fakt_produktion fp JOIN dm ON dm.dim_id = fp.objekt_id GROUP BY 1),
  skot AS (SELECT dm.ouuid, sum(fl.volym_m3sub) AS v FROM fakt_lass fl JOIN dm ON dm.dim_id = fl.objekt_id GROUP BY 1),
  -- En rad per trakt och roll, med kvarvarande timmar/volym.
  tr0 AS (
    SELECT k.objekt_id, k.namn, k.vo_nummer, k.typ, k.volym, k.ordning, k.ar, k.manad, k.forra, k.medelstam, r.roll,
           COALESCE(CASE r.roll WHEN 'skordare' THEN k.skordare_maskin_id ELSE k.skotare_maskin_id END, ko.maskin_id) AS maskin_id,
           (CASE r.roll WHEN 'skordare' THEN k.skordare_maskin_id ELSE k.skotare_maskin_id END) IS NULL AND ko.maskin_id IS NOT NULL AS ur_ko,
           CASE r.roll WHEN 'skordare' THEN k.prognos_skordare_h ELSE k.prognos_skotare_h END AS prognos_h,
           CASE r.roll WHEN 'skordare' THEN k.klar_skordare ELSE k.klar_skotare END AS klar,
           CASE r.roll WHEN 'skordare' THEN k.skordare_utforare ELSE k.skotare_utforare END AS utforare,
           COALESCE(uh.h, 0) AS utfort_h,
           COALESCE(sk.v, 0) AS skordat,
           COALESCE(st.v, 0) AS skotat
    FROM kand2 k
    -- GROT är bara skotning; energiklippning och virke har båda rollerna.
    CROSS JOIN (VALUES ('skordare'), ('skotare')) r(roll)
    LEFT JOIN ko ON ko.objekt_id = k.objekt_id AND ko.roll = r.roll
    LEFT JOIN uth uh ON uh.ouuid = k.objekt_id AND uh.roll = r.roll
    LEFT JOIN skord sk ON sk.ouuid = k.objekt_id
    LEFT JOIN skot st ON st.ouuid = k.objekt_id),
  tr AS (
    SELECT t.*,
           round(CASE WHEN t.prognos_h IS NULL THEN NULL
                      WHEN t.roll = 'skotare' AND t.utfort_h <= 0 AND t.skordat > 0 THEN t.prognos_h * (1 - LEAST(1, t.skotat / t.skordat))
                      ELSE GREATEST(t.prognos_h - t.utfort_h, 0) END, 4) AS rest_h,
           round(CASE WHEN t.roll = 'skotare' AND COALESCE(t.volym, NULLIF(t.skordat, 0)) IS NOT NULL
                      THEN GREATEST(COALESCE(t.volym, t.skordat) - t.skotat, 0) END, 2) AS rest_vol,
           -- Ordningen (objekt.ordning, ar, manad, namn) som ETT tal: appen sorterar på det, så att databasens teckenordning aldrig kan skilja.
           dense_rank() OVER (ORDER BY t.ordning NULLS LAST, t.ar, t.manad, t.namn, t.objekt_id) AS sortn
    FROM tr0 t
    WHERE NOT COALESCE(t.klar, false) AND COALESCE(t.utforare, '') NOT IN ('egen', 'extern')
      AND NOT (t.typ = 'grot' AND t.roll = 'skordare')),
  -- Arbetsbörda i dagar på den tilldelade maskinen, i maskinens ordning.
  seq AS (
    SELECT t.*, kap.manuell, kap.g15_per_dag,
           CASE WHEN kap.manuell THEN t.rest_vol / NULLIF((kap.takt ->> t.typ)::numeric, 0)
                ELSE t.rest_h / kap.g15_per_dag END AS dg,
           row_number() OVER (PARTITION BY t.maskin_id ORDER BY t.sortn, t.roll) AS rn
    FROM tr t JOIN kap ON kap.maskin_id = t.maskin_id
    WHERE (t.rest_h IS NULL OR t.rest_h > 0 OR kap.manuell)
      AND (NOT kap.manuell OR t.rest_vol IS NULL OR t.rest_vol > 0)),
  cum AS (
    SELECT s.*,
           round(COALESCE(sum(s.dg) OVER (PARTITION BY s.maskin_id ORDER BY s.rn), 0)::numeric, 6) AS slut,
           bool_or(s.dg IS NULL) OVER (PARTITION BY s.maskin_id) AS saknar_maskin
    FROM seq s),
  cum2 AS (
    SELECT c.*, round(c.slut - COALESCE(c.dg, 0)::numeric, 6) AS foer
    FROM cum c),
  rad AS (
    SELECT c.*, da.arr,
           CASE WHEN c.dg IS NULL OR c.saknar_maskin THEN NULL ELSE da.arr[floor(c.foer)::int + 1] END AS fran_dat,
           CASE WHEN c.dg IS NULL OR c.saknar_maskin THEN NULL ELSE da.arr[GREATEST(ceil(c.slut)::int, 1)] END AS till_dat
    FROM cum2 c LEFT JOIN dagarr da ON da.maskin_id = c.maskin_id),
  sistarad AS (SELECT DISTINCT ON (r.maskin_id) r.maskin_id, r.till_dat, r.saknar_maskin FROM rad r ORDER BY r.maskin_id, r.rn DESC),
  best AS (
    SELECT lower(btrim(b.typ)) AS typ, COALESCE(sum(b.volym), 0)::numeric AS bestallt, count(*) AS n
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad GROUP BY 1),
  sparrad AS (
    -- Volym per trakt som räknas mot beställningen: månadens hela, förra månadens kvarvarande (volym − skördat).
    SELECT k.objekt_id, k.namn, k.typ,
           CASE WHEN k.forra THEN GREATEST(COALESCE(k.volym, 0) - COALESCE(sk.v, 0), 0) ELSE COALESCE(k.volym, 0) END AS vol,
           k.forra, k.ordning, k.ar, k.manad,
           (SELECT bool_or(tt.prognos_h IS NULL AND NOT COALESCE(kk.manuell, false))
              FROM tr tt LEFT JOIN kap kk ON kk.maskin_id = tt.maskin_id WHERE tt.objekt_id = k.objekt_id) AS saknar
    FROM kand2 k LEFT JOIN skord sk ON sk.ouuid = k.objekt_id
    WHERE NOT (k.klar_skordare AND k.klar_skotare)),
  maskiner_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'maskin_id', kap.maskin_id, 'namn', kap.namn, 'roll', kap.roll, 'klarar_typ', kap.klarar_typ, 'manuell', kap.manuell,
             'g15_per_dag', round(kap.g15_per_dag, 4), 'ej_matt', kap.ej_matt, 'takt', COALESCE(kap.takt, '{}'::jsonb),
             'dagar', to_jsonb(COALESCE(da.arr, '{}'::date[])),
             'klar_datum', sr.till_dat,
             'efter_manad', COALESCE(sr.till_dat > (SELECT d FROM sista), false),
             'saknar_prognos', COALESCE(sr.saknar_maskin, false),
             'trakter', COALESCE((SELECT jsonb_agg(jsonb_build_object('objekt_id', r.objekt_id, 'fran', r.fran_dat, 'till', r.till_dat) ORDER BY r.rn)
                                   FROM rad r WHERE r.maskin_id = kap.maskin_id), '[]'::jsonb)
           ) ORDER BY kap.roll, kap.namn), '[]'::jsonb) AS j
    FROM kap LEFT JOIN dagarr da ON da.maskin_id = kap.maskin_id LEFT JOIN sistarad sr ON sr.maskin_id = kap.maskin_id),
  trakter_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'objekt_id', t.objekt_id, 'namn', COALESCE(NULLIF(btrim(t.namn), ''), t.vo_nummer, 'Objekt'), 'typ', t.typ, 'roll', t.roll,
             'maskin_id', t.maskin_id, 'sortn', t.sortn, 'ordning', t.ordning, 'ar', t.ar, 'manad', t.manad, 'forra_manaden', t.forra,
             'volym', t.volym, 'medelstam', t.medelstam, 'ur_ko', t.ur_ko, 'timmar', t.rest_h, 'rest_volym', t.rest_vol,
             'saknar_prognos', t.prognos_h IS NULL AND NOT COALESCE((SELECT kk.manuell FROM kap kk WHERE kk.maskin_id = t.maskin_id), false)
           ) ORDER BY t.sortn, t.roll), '[]'::jsonb) AS j
    FROM tr t),
  spar_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'typ', ty.typ,
             'bestallt', COALESCE((SELECT round(b.bestallt, 0) FROM best b WHERE b.typ = ty.typ), 0),
             'trakt_volym', COALESCE((SELECT round(sum(s.vol), 0) FROM sparrad s WHERE s.typ = ty.typ), 0),
             'trakter', COALESCE((SELECT jsonb_agg(jsonb_build_object('objekt_id', s.objekt_id, 'namn', COALESCE(NULLIF(btrim(s.namn), ''), 'Objekt'),
                                                                       'volym', round(s.vol, 0), 'saknar_prognos', COALESCE(s.saknar, false), 'forra_manaden', s.forra)
                                                   ORDER BY s.ordning NULLS LAST, s.ar, s.manad, s.namn)
                                   FROM sparrad s WHERE s.typ = ty.typ), '[]'::jsonb)
           ) ORDER BY ty.ord), '[]'::jsonb) AS j
    FROM (VALUES ('slutavverkning', 1), ('gallring', 2)) ty(typ, ord))
  SELECT jsonb_build_object(
    'ar', p_ar, 'manad', p_manad, 'idag', p_idag,
    'start', (SELECT d FROM start), 'sista_arbetsdag', (SELECT d FROM sista),
    'har_bestallning', EXISTS (SELECT 1 FROM best),
    'maskiner', (SELECT j FROM maskiner_json),
    'trakter', (SELECT j FROM trakter_json),
    'spar', (SELECT j FROM spar_json));
$function$;

REVOKE ALL ON FUNCTION public.helikopter_ny_klar(integer, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.helikopter_ny_klar(integer, integer, date) TO authenticated, service_role;
