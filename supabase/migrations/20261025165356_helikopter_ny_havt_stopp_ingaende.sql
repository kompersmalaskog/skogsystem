-- Helikoptern: fyra rättningar i prognosen (Martin 2026-10-25).
--
-- 1. HÄVT STOPP: kommer en fil från maskinen under ett härlett stopp (förarens heldagsledighet) räknas resten av
--    stoppet, från och med idag, som arbetsdagar — maskinen kör uppenbarligen, någon annan sitter i den.
--    (Martin kör Elefant 26 v. 44 medan Daniel är ledig; förut räknades varje framtida dag som stopp tills just den
--    dagens fil kommit, så "Landar på" var pessimistisk hela veckan.) En dag med fil var redan körd oavsett förare.
--    Ett sammanhängande stopp = arbetsdagar i följd med samma ledig förare (samma orsak) inom månaden.
--    Registrerade stopp (stopp/stopp_maskin) rörs inte. Dagar FÖRE idag utan fil i ett hävt stopp står kvar som
--    planerat (vi vet inte om maskinen stod).
-- 2. INGÅENDE OSKOTAT räknas över objekt som var ÖPPNA VID MÅNADENS START (inte "öppna nu"): ett objekt som
--    avslutats under månaden föll ur och gjorde taket på skotat-prognosen för lågt (gallring okt 2026: taket 890
--    mot skotat 962 → "Landar på 962").
-- 3. EGEN SKOTNING (dim_objekt.egen_skotning) räknas ALDRIG mot beställningen: inte i skördat/skotat per dag
--    (helikopter_ny_dag), inte i takten (helikopter_ny_takt), inte som oskotat (ingående, taket, oskotat_objekt).
--    Markägaren skotar själv — inga lass kommer. Visas bara under sin egen rubrik (helikopter_ny_egen_skotning).
--    Mer › Maskiner (helikopter_ny_maskin) räknar fortfarande alla lass per maskin, som förut.
-- 4. (Appen) Svarsraden säger VILKET spår som fattas: "Slutavverkning fattas 356 · gallring 38".

-- ── 3. helikopter_ny_dag utan egen skotning ─────────────────────────────────
CREATE OR REPLACE VIEW public.helikopter_ny_dag AS
SELECT datum, typ, bolag, sum(skordat) AS skordat, sum(skotat) AS skotat
FROM (
  SELECT p.datum,
         COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd') AS typ,
         NULLIF(btrim(d.bolag), '') AS bolag,
         p.volym_m3sub AS skordat,
         0::numeric AS skotat
  FROM fakt_produktion p JOIN dim_objekt d ON d.objekt_id = p.objekt_id
  WHERE COALESCE(d.egen_skotning, false) = false
  UNION ALL
  SELECT l.datum,
         COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd'),
         NULLIF(btrim(d.bolag), ''),
         0::numeric,
         l.volym_m3sub
  FROM fakt_lass l JOIN dim_objekt d ON d.objekt_id = l.objekt_id
  WHERE COALESCE(d.egen_skotning, false) = false
) x
GROUP BY datum, typ, bolag;

-- ── 1. helikopter_ny_maskindag med hävt stopp ───────────────────────────────
CREATE OR REPLACE FUNCTION public.helikopter_ny_maskindag(p_ar integer, p_manad integer, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(maskin_id text, datum date, status text, orsak text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH man AS (
    SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month - 1 day')::date AS till),
  dagar AS (
    SELECT d::date AS datum FROM man, generate_series(man.fran, man.till, interval '1 day') d
    WHERE helikopter_ny_ar_arbetsdag(d::date)),
  maskiner AS (
    SELECT m.maskin_id, COALESCE(m.datakalla, 'auto') = 'manuell' AS manuell FROM dim_maskin m, man
    WHERE m.maskin_typ IN ('Harvester', 'Forwarder')
      AND COALESCE(m.extramaskin, false) = false
      AND (m.aktiv_till IS NULL OR m.aktiv_till >= man.till)),
  reg AS (
    SELECT DISTINCT ON (sm.maskin_id, d.datum) sm.maskin_id, d.datum, s.orsak
    FROM stopp s JOIN stopp_maskin sm ON sm.stopp_id = s.id
    JOIN dagar d ON d.datum BETWEEN s.fran_datum AND s.till_datum
    ORDER BY sm.maskin_id, d.datum, s.fran_datum),
  kord AS (
    SELECT p.maskin_id, p.datum FROM fakt_produktion p, man
    WHERE p.datum >= man.fran AND p.datum <= man.till
    GROUP BY p.maskin_id, p.datum HAVING sum(p.volym_m3sub) > 0
    UNION
    SELECT l.maskin_id, l.datum FROM fakt_lass l, man
    WHERE l.datum >= man.fran AND l.datum <= man.till
    GROUP BY l.maskin_id, l.datum HAVING sum(l.volym_m3sub) > 0),
  led AS (
    SELECT mk.maskin_id, d.datum, helikopter_ny_ledig(mk.maskin_id, d.datum) AS namn,
           row_number() OVER (PARTITION BY mk.maskin_id ORDER BY d.datum) AS rn
    FROM maskiner mk CROSS JOIN dagar d),
  -- ett sammanhängande stopp = arbetsdagar i följd med samma ledig förare
  stracka AS (
    SELECT l.maskin_id, l.datum, l.namn,
           l.rn - row_number() OVER (PARTITION BY l.maskin_id, l.namn ORDER BY l.datum) AS grp
    FROM led l WHERE l.namn IS NOT NULL),
  -- hävt: en fil har kommit tidigare i samma stopp → dagarna från och med idag är arbetsdagar
  havt AS (
    SELECT s.maskin_id, s.datum FROM stracka s
    WHERE s.datum >= p_idag
      AND EXISTS (SELECT 1 FROM stracka s2 JOIN kord k ON k.maskin_id = s2.maskin_id AND k.datum = s2.datum
                  WHERE s2.maskin_id = s.maskin_id AND s2.namn = s.namn AND s2.grp = s.grp AND s2.datum < s.datum))
  SELECT mk.maskin_id, d.datum,
         CASE WHEN r.maskin_id IS NOT NULL THEN 'registrerat'
              WHEN k.maskin_id IS NOT NULL THEN 'kord'
              WHEN lg.namn IS NOT NULL AND h.maskin_id IS NULL THEN 'planerat'
              WHEN d.datum < p_idag AND mk.manuell THEN 'orapporterat'
              WHEN d.datum < p_idag THEN 'oforklarat'
              ELSE 'arbetsdag' END AS status,
         CASE WHEN r.maskin_id IS NOT NULL THEN 'registrerat:' || COALESCE(r.orsak, '')
              WHEN k.maskin_id IS NULL AND lg.namn IS NOT NULL AND h.maskin_id IS NULL THEN 'ledig:' || lg.namn END AS orsak
  FROM maskiner mk
  CROSS JOIN dagar d
  LEFT JOIN reg r ON r.maskin_id = mk.maskin_id AND r.datum = d.datum
  LEFT JOIN kord k ON k.maskin_id = mk.maskin_id AND k.datum = d.datum
  LEFT JOIN led lg ON lg.maskin_id = mk.maskin_id AND lg.datum = d.datum
  LEFT JOIN havt h ON h.maskin_id = mk.maskin_id AND h.datum = d.datum;
$function$;

-- ── 3. helikopter_ny_takt utan egen skotning ────────────────────────────────
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
    WHERE p.datum >= man.fran AND p.datum < man.till_excl AND COALESCE(d.egen_skotning, false) = false
    UNION ALL
    SELECT l.maskin_id, l.datum,
           COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd'), NULLIF(btrim(d.bolag), ''),
           l.volym_m3sub::numeric
    FROM fakt_lass l JOIN dim_objekt d ON d.objekt_id = l.objekt_id, man
    WHERE l.datum >= man.fran AND l.datum < man.till_excl AND COALESCE(d.egen_skotning, false) = false),
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

-- ── 2 + 3. helikopter_ny_spar: ingående över objekt öppna vid månadens start, aldrig egen skotning ──
CREATE OR REPLACE FUNCTION public.helikopter_ny_spar(p_ar integer, p_manad integer, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(typ text, bas text, bestallt numeric, bolag text[], skordat numeric, skotat numeric, takt_skordat numeric, takt_skotat numeric, takt_dagar integer, takt_fonster date[], oskotat_forandring_per_dag numeric, ingaende_oskotat numeric, oskotat_objekt jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  gangna AS (SELECT unnest(gangna_datum) AS d FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag) WHERE maskin_id IS NULL),
  fonster AS (SELECT d FROM gangna ORDER BY d DESC LIMIT 5),
  best AS (
    SELECT lower(btrim(b.typ)) AS typ, btrim(b.bolag) AS bolag, sum(b.volym)::numeric AS volym
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad
    GROUP BY 1, 2),
  typer AS (SELECT unnest(ARRAY['slutavverkning', 'gallring']) AS typ),
  baser AS (SELECT unnest(ARRAY['bestallt', 'totalt']) AS bas),
  dag AS (
    SELECT hd.* FROM helikopter_ny_dag hd, man WHERE hd.datum >= man.fran AND hd.datum < man.till_excl),
  rader AS (
    SELECT t.typ, bs.bas, d.datum, d.skordat, d.skotat
    FROM typer t CROSS JOIN baser bs
    JOIN dag d ON d.typ = t.typ
    WHERE bs.bas = 'totalt'
       OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(d.bolag))),
  -- Objekt som kan bära oskotat: aldrig egen skotning (markägaren skotar själv, inga lass kommer).
  -- oppen_nu = skotningen är inte avslutad; oppen_start = den var inte avslutad före månadens första dag.
  obj AS (
    SELECT d.objekt_id, d.object_name, COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd') AS typ, NULLIF(btrim(d.bolag), '') AS bolag,
           (d.skotning_avslutad IS NULL AND COALESCE(d.skotning_avslutad_auto, false) = false) AS oppen_nu,
           ((d.skotning_avslutad IS NULL AND COALESCE(d.skotning_avslutad_auto, false) = false) OR d.skotning_avslutad >= man.fran) AS oppen_start
    FROM dim_objekt d, man
    WHERE COALESCE(d.egen_skotning, false) = false),
  obj_oskotat AS (
    SELECT o.objekt_id, o.object_name, o.typ, o.bolag, o.oppen_nu, o.oppen_start,
           GREATEST(
             COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p, man WHERE p.objekt_id = o.objekt_id AND p.datum < man.fran), 0)
           - COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l, man WHERE l.objekt_id = o.objekt_id AND l.datum < man.fran), 0), 0)::numeric AS oskotat_ingaende,
           GREATEST(
             COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p WHERE p.objekt_id = o.objekt_id), 0)
           - COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l WHERE l.objekt_id = o.objekt_id), 0), 0)::numeric AS oskotat_nu
    FROM obj o
    WHERE o.oppen_nu OR o.oppen_start),
  ingaende AS (
    SELECT t.typ, bs.bas, COALESCE(sum(oo.oskotat_ingaende), 0)::numeric AS oskotat
    FROM typer t CROSS JOIN baser bs
    LEFT JOIN obj_oskotat oo ON oo.typ = t.typ AND oo.oppen_start
      AND (bs.bas = 'totalt' OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(oo.bolag)))
    GROUP BY t.typ, bs.bas),
  topp AS (
    SELECT t.typ, bs.bas,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('namn', x.object_name, 'oskotat', round(x.oskotat_nu)) ORDER BY x.oskotat_nu DESC)
                     FROM (SELECT oo.object_name, oo.oskotat_nu FROM obj_oskotat oo
                           WHERE oo.typ = t.typ AND oo.oskotat_nu > 0 AND oo.oppen_nu
                             AND (bs.bas = 'totalt' OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(oo.bolag)))
                           ORDER BY oo.oskotat_nu DESC LIMIT 2) x), '[]'::jsonb) AS objekt
    FROM typer t CROSS JOIN baser bs),
  agg AS (
    SELECT t.typ, bs.bas,
           COALESCE(sum(r.skordat), 0)::numeric AS skordat,
           COALESCE(sum(r.skotat), 0)::numeric AS skotat
    FROM typer t CROSS JOIN baser bs
    LEFT JOIN rader r ON r.typ = t.typ AND r.bas = bs.bas
    GROUP BY t.typ, bs.bas),
  tk AS (
    SELECT x.typ, x.bas,
           COALESCE(sum(x.takt) FILTER (WHERE x.roll = 'skordare'), 0) AS t_skordat,
           COALESCE(sum(x.takt) FILTER (WHERE x.roll = 'skotare'), 0) AS t_skotat
    FROM helikopter_ny_takt(p_ar, p_manad, p_idag) x
    GROUP BY x.typ, x.bas)
  SELECT a.typ, a.bas,
         COALESCE((SELECT sum(volym) FROM best b WHERE b.typ = a.typ), 0)::numeric AS bestallt,
         COALESCE((SELECT array_agg(b.bolag ORDER BY b.volym DESC, b.bolag) FROM best b WHERE b.typ = a.typ), '{}') AS bolag,
         a.skordat, a.skotat,
         CASE WHEN f.n > 0 THEN round(COALESCE(tk.t_skordat, 0), 1) END AS takt_skordat,
         CASE WHEN f.n > 0 THEN round(COALESCE(tk.t_skotat, 0), 1) END AS takt_skotat,
         f.n::int AS takt_dagar,
         f.dagar AS takt_fonster,
         CASE WHEN f.n > 0 THEN round(COALESCE(tk.t_skordat, 0) - COALESCE(tk.t_skotat, 0), 1) END AS oskotat_forandring_per_dag,
         i.oskotat AS ingaende_oskotat,
         tp.objekt AS oskotat_objekt
  FROM agg a
  JOIN ingaende i ON i.typ = a.typ AND i.bas = a.bas
  JOIN topp tp ON tp.typ = a.typ AND tp.bas = a.bas
  LEFT JOIN tk ON tk.typ = a.typ AND tk.bas = a.bas
  CROSS JOIN (SELECT count(*) AS n, COALESCE(array_agg(d ORDER BY d), '{}') AS dagar FROM fonster) f
  ORDER BY a.typ, a.bas;
$function$;
