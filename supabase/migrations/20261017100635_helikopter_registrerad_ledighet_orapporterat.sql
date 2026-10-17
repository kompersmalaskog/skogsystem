-- Helikopter: två rättningar av planerat stopp (migration 20261017095008_helikopter_planerat_stopp.sql).
--
-- 1. SJUK, VAB och FÖRÄLDRALEDIG räknas som ledig. De ligger i ledighet_ansokningar med status 'registrerad' (anmälan, ingen ansökan —
--    check-villkoret ledighet_registrerad_bara_anmalan), inte 'godkänd'. En sjuk förare utan fil blev annars OFÖRKLARAT och varningen
--    sa "ingen ledighet registrerad". Texten är fortfarande 'ledig:<förnamn>' — aldrig typen (sjuk/VAB är inget helikoptern ska visa).
--    Deldag (fran_tid/till_tid satt) räknas fortfarande inte som ledig dag, och 'väntar'/'nekad' räknas inte.
--
-- 2. MANUELL DATAKÄLLA (dim_maskin.datakalla = 'manuell', 810E): "ingen fil" betyder inte "stod stilla" utan "ingen har rapporterat".
--    Ingen fil + ingen ledighet före idag → status 'orapporterat' i stället för 'oforklarat'. Följder:
--      · 'orapporterat' är varken körd eller oförklarad: dagen ingår INTE i maskinens gångna dagar och därmed inte i takt-fönstret
--        (vi vet inget — den utspäder inte takten) och inte i oforklarade_datum;
--      · maskinen får ingen "körde inte"-rad i Läge. Det enda larmet är den befintliga raden "810E · inga lass registrerade sedan …",
--        som läser maskinens rapportdagar (helikopter_ny_rapportdagar: alla arbetsdagar t.o.m. idag utom planerade/registrerade stopp,
--        orapporterade INKLUSIVE) — veckoläget och notisen läser samma dagar ur payloaden ('dagar_tom_idag' per maskin).
--    Ledig förare + ingen fil är fortfarande 'planerat' (ledigheten förklarar det), fil är fortfarande 'kord'.
--
-- Ändrade (samma kolumner, CREATE OR REPLACE): helikopter_ny_ledig, helikopter_ny_maskindag, helikopter_veckolage.
-- Ny: helikopter_ny_rapportdagar. helikopter_ny_arbetsdagar / _stopp / _takt ändras inte: de släpper redan igenom bara körda, oförklarade och
-- kommande dagar, så 'orapporterat' faller ur takt-fönstret och oforklarade_datum av sig självt.
--
-- Rollback: återställ de tre funktionerna ur 20261017095008_helikopter_planerat_stopp.sql och ta bort helikopter_ny_rapportdagar.

-- ── 1. Vem är ledig? (nu även anmälda frånvaron: sjuk, VAB, föräldraledig) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.helikopter_ny_ledig(p_maskin_id text, p_datum date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT string_agg(DISTINCT split_part(btrim(me.namn), ' ', 1), ', ' ORDER BY split_part(btrim(me.namn), ' ', 1))
  FROM medarbetare me
  JOIN ledighet_ansokningar l ON l.medarbetare_id = me.id
  WHERE me.maskin_id = p_maskin_id
    AND COALESCE(me.aktiv, true)
    AND l.status IN ('godkänd', 'registrerad')
    AND l.fran_tid IS NULL AND l.till_tid IS NULL
    AND p_datum BETWEEN l.startdatum AND l.slutdatum;
$function$;

-- ── 2. Status per maskin och arbetsdag: manuell datakälla utan fil = 'orapporterat' ─────────────────────
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
    GROUP BY l.maskin_id, l.datum HAVING sum(l.volym_m3sub) > 0)
  SELECT mk.maskin_id, d.datum,
         CASE WHEN r.maskin_id IS NOT NULL THEN 'registrerat'
              WHEN k.maskin_id IS NOT NULL THEN 'kord'
              WHEN lg.namn IS NOT NULL THEN 'planerat'
              WHEN d.datum < p_idag AND mk.manuell THEN 'orapporterat'
              WHEN d.datum < p_idag THEN 'oforklarat'
              ELSE 'arbetsdag' END AS status,
         CASE WHEN r.maskin_id IS NOT NULL THEN 'registrerat:' || COALESCE(r.orsak, '')
              WHEN k.maskin_id IS NULL AND lg.namn IS NOT NULL THEN 'ledig:' || lg.namn END AS orsak
  FROM maskiner mk
  CROSS JOIN dagar d
  LEFT JOIN reg r ON r.maskin_id = mk.maskin_id AND r.datum = d.datum
  LEFT JOIN kord k ON k.maskin_id = mk.maskin_id AND k.datum = d.datum
  LEFT JOIN LATERAL (SELECT helikopter_ny_ledig(mk.maskin_id, d.datum) AS namn) lg ON true;
$function$;

-- ── 3. Rapportdagar per maskin: arbetsdagar t.o.m. idag som maskinens "ingen har rapporterat"-larm räknar på ──────────────
-- Alla maskinens arbetsdagar t.o.m. idag utom planerade/registrerade stopp — orapporterade dagar INKLUSIVE (de ingår inte i
-- helikopter_ny_arbetsdagar, annars skulle "inga lass registrerade sedan …" aldrig kunna slå på 810E).
CREATE OR REPLACE FUNCTION public.helikopter_ny_rapportdagar(p_ar integer, p_manad integer, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(maskin_id text, rapportdagar date[])
 LANGUAGE sql
 STABLE
AS $function$
  SELECT md.maskin_id, array_agg(md.datum ORDER BY md.datum)
  FROM helikopter_ny_maskindag(p_ar, p_manad, p_idag) md
  WHERE md.status IN ('kord', 'oforklarat', 'orapporterat', 'arbetsdag') AND md.datum <= p_idag
  GROUP BY md.maskin_id;
$function$;

-- ── 4. Veckoläget (och notisen): maskinens egna dagar t.o.m. idag = rapportdagarna ─────────────────────
-- Enda ändringen mot 20261017095008: 'dagar_tom_idag' per maskin läses ur helikopter_ny_maskindag (orapporterade dagar med), inte ur
-- helikopter_ny_arbetsdagar. Den globala 'dagar_tom_idag' och 'vecka_gangna' är oförändrade.
CREATE OR REPLACE FUNCTION public.helikopter_veckolage(p_idag date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  WITH p AS (SELECT extract(year FROM p_idag)::int AS ar, extract(month FROM p_idag)::int AS manad),
  ad AS (SELECT a.* FROM p, helikopter_ny_arbetsdagar(p.ar, p.manad, p_idag) a),
  dagar AS (SELECT a.maskin_id, unnest(a.gangna_datum || a.kvar_datum) AS d FROM ad a),
  rapport AS (SELECT r.maskin_id, unnest(r.rapportdagar) AS d FROM p, helikopter_ny_rapportdagar(p.ar, p.manad, p_idag) r)
  SELECT jsonb_build_object(
    'idag',           p_idag,
    'ar',             p.ar,
    'manad',          p.manad,
    'isovecka',       extract(week FROM p_idag)::int,
    'dagar',          (SELECT to_jsonb(a) FROM ad a WHERE a.maskin_id IS NULL),
    'dagar_tom_idag', (SELECT COALESCE(jsonb_agg(x.d ORDER BY x.d), '[]'::jsonb) FROM dagar x WHERE x.maskin_id IS NULL AND x.d <= p_idag),
    'vecka_gangna',   (SELECT count(*) FROM dagar x WHERE x.maskin_id IS NULL AND x.d <= p_idag AND x.d >= date_trunc('week', p_idag)::date),
    'spar',           (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM helikopter_ny_spar(p.ar, p.manad, p_idag) s),
    'takt',           (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM helikopter_ny_takt(p.ar, p.manad, p_idag) t),
    'stopp',          (SELECT COALESCE(jsonb_agg(to_jsonb(st)), '[]'::jsonb) FROM helikopter_ny_stopp(p.ar, p.manad, p_idag) st),
    'veckor',         (SELECT COALESCE(jsonb_object_agg(t.typ,
                          (SELECT to_jsonb(v) FROM helikopter_ny_veckor(p.ar, p.manad, t.typ, p_idag) v WHERE v.status = 'pagar' LIMIT 1)), '{}'::jsonb)
                       FROM (VALUES ('slutavverkning'), ('gallring')) AS t(typ)),
    'planerade',      (SELECT jsonb_build_object(
                          'slutavverkning', count(*) FILTER (WHERE lower(pl.typ) = 'slutavverkning'),
                          'gallring',       count(*) FILTER (WHERE lower(pl.typ) = 'gallring'))
                       FROM helikopter_ny_planering(p.ar, p.manad) pl),
    'maskiner',       (SELECT COALESCE(jsonb_agg(
                          to_jsonb(m) || jsonb_build_object(
                            'objekt_typ', (SELECT NULLIF(lower(btrim(d.huvudtyp)), '')
                                             FROM helikopter_ny_maskin(m.maskin_id, p_idag) l
                                             JOIN dim_objekt d ON d.objekt_id = l.objekt_id
                                            LIMIT 1),
                            'dagar_tom_idag', (SELECT COALESCE(jsonb_agg(x.d ORDER BY x.d), '[]'::jsonb)
                                                 FROM rapport x WHERE x.maskin_id = m.maskin_id))
                          ORDER BY m.roll, m.namn), '[]'::jsonb)
                       FROM helikopter_ny_maskiner(p.ar, p.manad, p_idag) m)
  )
  FROM p;
$function$;

-- ── 5. Behörigheter (som övriga helikopter_ny_*) ────────────────────────────
REVOKE ALL ON FUNCTION helikopter_ny_rapportdagar(integer, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_ny_rapportdagar(integer, integer, date) TO authenticated, service_role;
