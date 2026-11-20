-- /helikopter — månadsfacit och historik. Rena läsfunktioner (SECURITY INVOKER, som alla helikopter_ny_*): inget skrivs, ingen vy ändras.
--
-- SKOTAT är EXAKT samma tal som Läge/Uppföljning/Veckor visar: lass i fakt_lass (maskinfiler OCH förarens manuella lass, filnamn = 'manuell')
-- på objekt vars typ + bolag har beställning den månaden — samma filter som helikopter_ny_spar (bas 'bestallt') och helikopter_ny_veckor.
-- Facit kan därför aldrig avvika från det appen visade när månaden pågick. Det som INTE räknas (och inte kan räknas): skotare_objekt_manuell /
-- dim_objekt.skotad_volym_manuell är objektsummor utan datum — de går inte att placera i en månad och ingår inte i någon helikoptervy.
--
-- Avrundning: volymer avrundas per spår FÖRST (m³fub, heltal), totalen är summan av de avrundade spåren och procent räknas på de avrundade
-- talen — det som står på sidan går att kontrollräkna med miniräknare.

-- ---------------------------------------------------------------------------
-- helikopter_manadsfacit(p_ar, p_manad, p_idag) → jsonb
--   p_idag styr bara status och veckornas status (last/pagar/kommande); default i dag. En avslutad månad: alla veckor 'last'.
--   Spår utan beställning den månaden = null (aldrig 0 %). Ingen beställning alls = totalt null.
--   klart_datum = första dagen då ACKUMULERAT skotat (från månadens första dag) nådde beställt, annars null.
--   skotat_fran_tidigare = skotat i månaden på objekt vars skördning avslutades FÖRE månaden (dim_objekt.skordning_avslutad); objekt utan
--   skördningsdatum räknas inte hit. tidigare_manader = samma volym fördelad på månaden skördningen avslutades i (nyaste först).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helikopter_manadsfacit(p_ar int, p_manad int, p_idag date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH man AS (
    SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  idag AS (
    SELECT LEAST(GREATEST(p_idag, man.fran), man.till_excl) AS d FROM man),
  best AS (
    SELECT lower(btrim(b.typ)) AS typ, lower(btrim(b.bolag)) AS bolag_l, min(btrim(b.bolag)) AS bolag, sum(b.volym)::numeric AS volym
    FROM bestallningar b
    WHERE b.ar = p_ar AND b.manad = p_manad AND lower(btrim(b.typ)) IN ('slutavverkning', 'gallring')
    GROUP BY 1, 2),
  best_typ AS (
    SELECT typ, sum(volym) AS bestallt, array_agg(bolag ORDER BY volym DESC, bolag) AS bolag
    FROM best GROUP BY typ HAVING sum(volym) > 0),
  prod AS (
    SELECT lower(btrim(d.huvudtyp)) AS typ, p.maskin_id, p.volym_m3sub AS vol
    FROM fakt_produktion p JOIN dim_objekt d ON d.objekt_id = p.objekt_id, man
    WHERE p.datum >= man.fran AND p.datum < man.till_excl
      AND EXISTS (SELECT 1 FROM best b WHERE b.typ = lower(btrim(d.huvudtyp)) AND b.bolag_l = lower(btrim(d.bolag)))),
  lass AS (
    SELECT lower(btrim(d.huvudtyp)) AS typ, l.datum, l.maskin_id, l.volym_m3sub AS vol, d.skordning_avslutad::date AS skordning_avslutad
    FROM fakt_lass l JOIN dim_objekt d ON d.objekt_id = l.objekt_id, man
    WHERE l.datum >= man.fran AND l.datum < man.till_excl
      AND EXISTS (SELECT 1 FROM best b WHERE b.typ = lower(btrim(d.huvudtyp)) AND b.bolag_l = lower(btrim(d.bolag)))),
  dagsum AS (SELECT typ, datum, sum(vol) AS vol FROM lass GROUP BY typ, datum),
  kum AS (SELECT typ, datum, sum(vol) OVER (PARTITION BY typ ORDER BY datum) AS kum FROM dagsum),
  klart AS (
    SELECT k.typ, min(k.datum) AS datum FROM kum k JOIN best_typ bt ON bt.typ = k.typ WHERE k.kum >= bt.bestallt GROUP BY k.typ),
  tidigare AS (
    SELECT l.typ, date_trunc('month', l.skordning_avslutad)::date AS m, sum(l.vol) AS vol
    FROM lass l, man WHERE l.skordning_avslutad < man.fran GROUP BY 1, 2),
  veckor AS (
    SELECT bt.typ,
           jsonb_agg(jsonb_build_object('iso_ar', v.iso_ar, 'isovecka', v.isovecka, 'arbetsdagar', v.arbetsdagar, 'plan', v.plan,
                                        'skordat', round(v.skordat), 'skotat', round(v.skotat)) ORDER BY v.fran) AS v
    FROM best_typ bt, LATERAL helikopter_ny_veckor(p_ar, p_manad, bt.typ, (SELECT d FROM idag)) v
    GROUP BY bt.typ),
  spar AS (
    SELECT bt.typ, bt.bestallt, bt.bolag,
           round(COALESCE((SELECT sum(p.vol) FROM prod p WHERE p.typ = bt.typ), 0)) AS skordat,
           round(COALESCE((SELECT sum(l.vol) FROM lass l WHERE l.typ = bt.typ), 0)) AS skotat,
           round(COALESCE((SELECT sum(l.vol) FROM lass l, man WHERE l.typ = bt.typ AND l.skordning_avslutad < man.fran), 0)) AS skotat_fran_tidigare,
           (SELECT k.datum FROM klart k WHERE k.typ = bt.typ) AS klart_datum,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('ar', extract(year FROM t.m)::int, 'manad', extract(month FROM t.m)::int, 'volym', round(t.vol)) ORDER BY t.m DESC)
                     FROM tidigare t WHERE t.typ = bt.typ), '[]'::jsonb) AS tidigare_manader,
           COALESCE((SELECT v.v FROM veckor v WHERE v.typ = bt.typ), '[]'::jsonb) AS veckor
    FROM best_typ bt),
  spar_json AS (
    SELECT s.typ,
           jsonb_build_object(
             'bestallt', s.bestallt, 'bolag', to_jsonb(s.bolag),
             'skordat', s.skordat, 'skotat', s.skotat,
             'skotat_fran_tidigare', s.skotat_fran_tidigare, 'tidigare_manader', s.tidigare_manader,
             'procent', round(100 * s.skotat / s.bestallt)::int,
             'klart_datum', s.klart_datum, 'veckor', s.veckor) AS j
    FROM spar s),
  tot AS (
    SELECT sum(bestallt) AS bestallt, sum(skordat) AS skordat, sum(skotat) AS skotat, count(*) AS antal FROM spar),
  maskiner AS (
    SELECT count(DISTINCT m)::int AS n FROM (SELECT maskin_id AS m FROM prod UNION SELECT maskin_id FROM lass) x WHERE m IS NOT NULL),
  dagar AS (
    SELECT a.totalt FROM helikopter_ny_arbetsdagar(p_ar, p_manad, (SELECT d FROM idag)) a WHERE a.maskin_id IS NULL)
  SELECT jsonb_build_object(
    'ar', p_ar, 'manad', p_manad,
    'status', CASE WHEN p_idag >= (SELECT till_excl FROM man) THEN 'avslutad' WHEN p_idag < (SELECT fran FROM man) THEN 'kommande' ELSE 'pagaende' END,
    'spar', jsonb_build_object(
      'slutavverkning', (SELECT j FROM spar_json WHERE typ = 'slutavverkning'),
      'gallring', (SELECT j FROM spar_json WHERE typ = 'gallring')),
    'totalt', CASE WHEN (SELECT antal FROM tot) = 0 THEN NULL ELSE jsonb_build_object(
      'bestallt', (SELECT bestallt FROM tot), 'skordat', (SELECT skordat FROM tot), 'skotat', (SELECT skotat FROM tot),
      'procent', round(100 * (SELECT skotat FROM tot) / (SELECT bestallt FROM tot))::int,
      'maskiner', (SELECT n FROM maskiner), 'arbetsdagar', (SELECT totalt FROM dagar)) END);
$$;

-- ---------------------------------------------------------------------------
-- helikopter_historik(p_manader, p_idag) → jsonb
--   En post per månad (nyaste först) bakåt p_manader kalendermånader från månaden FÖRE p_idag-månaden, bara månader med minst en beställning.
--   Den pågående månaden ingår aldrig (en halv månad är inget facit). procent per spår = null när spåret saknar beställning.
--   Samma tal som helikopter_manadsfacit: skotat avrundat per spår, summerat, procent på de avrundade talen.
--   snitt_6m = medel av `procent` över de senaste 6 månaderna med beställning (avrundat); antal_6m = hur många det är (≤ 6);
--   inom_5_6m = hur många av dem som ligger inom ±5 % från 100.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helikopter_historik(p_manader int DEFAULT 12, p_idag date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH nu AS (SELECT date_trunc('month', p_idag)::date AS denna),
  best AS (
    SELECT b.ar, b.manad, make_date(b.ar, b.manad, 1) AS fran, lower(btrim(b.typ)) AS typ, lower(btrim(b.bolag)) AS bolag_l, sum(b.volym)::numeric AS volym
    FROM bestallningar b, nu
    WHERE lower(btrim(b.typ)) IN ('slutavverkning', 'gallring')
      AND make_date(b.ar, b.manad, 1) < nu.denna
      AND make_date(b.ar, b.manad, 1) >= (nu.denna - make_interval(months => GREATEST(p_manader, 0)))::date
    GROUP BY 1, 2, 3, 4, 5),
  best_typ AS (SELECT ar, manad, fran, typ, sum(volym) AS bestallt FROM best GROUP BY 1, 2, 3, 4 HAVING sum(volym) > 0),
  lev AS (
    SELECT b.ar, b.manad, b.typ, sum(hd.skotat) AS skotat
    FROM best b JOIN helikopter_ny_dag hd
      ON hd.typ = b.typ AND lower(hd.bolag) = b.bolag_l AND hd.datum >= b.fran AND hd.datum < (b.fran + interval '1 month')::date
    GROUP BY 1, 2, 3),
  per_typ AS (
    SELECT bt.ar, bt.manad, bt.typ, bt.bestallt, round(COALESCE(l.skotat, 0)) AS skotat,
           round(100 * round(COALESCE(l.skotat, 0)) / bt.bestallt)::int AS procent
    FROM best_typ bt LEFT JOIN lev l ON l.ar = bt.ar AND l.manad = bt.manad AND l.typ = bt.typ),
  per_manad AS (
    SELECT ar, manad, sum(bestallt) AS bestallt, sum(skotat) AS skotat,
           round(100 * sum(skotat) / sum(bestallt))::int AS procent,
           max(procent) FILTER (WHERE typ = 'slutavverkning') AS slutavverkning,
           max(procent) FILTER (WHERE typ = 'gallring') AS gallring
    FROM per_typ GROUP BY ar, manad),
  sex AS (SELECT procent FROM per_manad ORDER BY ar DESC, manad DESC LIMIT 6)
  SELECT jsonb_build_object(
    'manader', COALESCE((SELECT jsonb_agg(jsonb_build_object('ar', ar, 'manad', manad, 'bestallt', bestallt, 'skotat', skotat, 'procent', procent,
                                                              'slutavverkning', slutavverkning, 'gallring', gallring) ORDER BY ar DESC, manad DESC)
                         FROM per_manad), '[]'::jsonb),
    'snitt_6m', (SELECT round(avg(procent))::int FROM sex),
    'antal_6m', (SELECT count(*)::int FROM sex),
    'inom_5_6m', (SELECT count(*) FILTER (WHERE abs(procent - 100) <= 5)::int FROM sex));
$$;
