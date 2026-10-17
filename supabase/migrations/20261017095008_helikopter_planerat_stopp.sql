-- Helikopter: planerat stopp HÄRLEDT ur ledighet + filer. Inget registreras, inget lagras.
--
-- Bakgrund: Giant stod ons–fre 14–16 okt (Stefan på semester). Beställningen räcker utan de dagarna, men helikoptern tolkade
-- tre dagar utan produktion som dålig takt. Appen vet redan allt: ledigheten ligger godkänd i ledighet_ansokningar, förare → maskin
-- i medarbetare.maskin_id, och kör någon annan kommer det filer.
--
-- Regel per maskin och dag (bolagets arbetsdagar i månaden):
--   0. Registrerat stopp i stopp/stopp_maskin → 'registrerat' (gäller som förut, ovanpå; dagen räknas inte).
--   1. Fil med produktion för dagen (fakt_produktion / fakt_lass, filens datum — aldrig uppladdningstid) → 'kord'.
--      Räknas i takt och mot beställning oavsett förare. 810E (manuell): fakt_lass med filnamn 'manuell' är en fil som alla andra.
--   2. Ingen fil + någon av maskinens aktiva förare (medarbetare.maskin_id) har godkänd HELDAGS-ledighet → 'planerat'.
--      Räknas inte i takten och inte som arbetsdag kvar. Deldag (fran_tid/till_tid satt) är inte en ledig dag.
--   3. Ingen fil + ingen ledighet, dagen före idag → 'oforklarat': räknas som 0 i takten. Enda fallet som visas som avvikelse.
--   Framåt (idag och senare) finns inga filer än: ledighet → 'planerat', annars 'arbetsdag'.
-- Härledda stopp skrivs ALDRIG till stopp/stopp_maskin — de räknas, de lagras inte.
--
-- Nya funktioner:  helikopter_ny_ledig, helikopter_ny_maskindag, helikopter_ny_stopp, helikopter_ny_takt
-- Ändrade (samma kolumner, CREATE OR REPLACE): helikopter_ny_arbetsdagar, helikopter_ny_spar, helikopter_veckolage, helikopter_notis_manad
-- Oförändrade men påverkade av nya arbetsdagar: helikopter_ny_maskin / _maskiner (takt per maskin räknas på maskinens egna dagar),
--   Planeringens kapacitet (maskinens dagar × 8 h).
-- Globala raden (maskin_id NULL) i helikopter_ny_arbetsdagar räknas som förut (bara registrerade stopp) — veckoplan, plan idag,
--   behov per dag och månadsfacit ändras inte.
--
-- Rollback: återställ de fyra ändrade funktionerna ur migrationerna 20260908100000 / 20260910100100 / 20260913100000 /
--   20261016090100 och ta bort de fyra nya (DROP FUNCTION helikopter_ny_stopp, helikopter_ny_takt, helikopter_ny_maskindag, helikopter_ny_ledig).

-- ── 1. Vem är ledig? ────────────────────────────────────────────────────────
-- SECURITY DEFINER: medarbetare kan ha egen RLS; svaret (förnamn på ledig förare) är samma uppgift som ledighetsvyns schema visar alla.
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
    AND l.status = 'godkänd'
    AND l.fran_tid IS NULL AND l.till_tid IS NULL
    AND p_datum BETWEEN l.startdatum AND l.slutdatum;
$function$;

-- ── 2. Status per maskin och arbetsdag ──────────────────────────────────────
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
    SELECT m.maskin_id FROM dim_maskin m, man
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

-- ── 3. Arbetsdagar: per maskin = dagar maskinen körde, kan ha kört eller borde ha kört ─────────────
-- gangna_datum per maskin = körda + oförklarade dagar före idag (planerade och registrerade stopp hoppas över) = takt-fönstret.
-- Varje aktiv maskin får en rad, även med 0 dagar (annars faller konsumenterna tillbaka på de globala dagarna och en maskin
-- som är ledig resten av månaden fick hela månadens kapacitet).
CREATE OR REPLACE FUNCTION public.helikopter_ny_arbetsdagar(p_ar integer, p_manad integer, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(maskin_id text, totalt integer, gangna integer, kvar integer, gangna_datum date[], kvar_datum date[])
 LANGUAGE sql
 STABLE
AS $function$
  WITH man AS (
    SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month - 1 day')::date AS till),
  dagar AS (
    SELECT d::date AS datum FROM man, generate_series(man.fran, man.till, interval '1 day') d
    WHERE helikopter_ny_ar_arbetsdag(d::date)),
  maskiner AS (
    SELECT m.maskin_id FROM dim_maskin m, man
    WHERE m.maskin_typ IN ('Harvester', 'Forwarder')
      AND COALESCE(m.extramaskin, false) = false
      AND (m.aktiv_till IS NULL OR m.aktiv_till >= man.till)),
  stoppade AS (
    SELECT sm.maskin_id, d.datum
    FROM stopp s JOIN stopp_maskin sm ON sm.stopp_id = s.id
    JOIN dagar d ON d.datum BETWEEN s.fran_datum AND s.till_datum),
  per_maskin_reg AS (
    SELECT mk.maskin_id, d.datum FROM maskiner mk CROSS JOIN dagar d
    WHERE NOT EXISTS (SELECT 1 FROM stoppade st WHERE st.maskin_id = mk.maskin_id AND st.datum = d.datum)),
  globalt AS (
    SELECT d.datum FROM dagar d
    WHERE NOT EXISTS (SELECT 1 FROM maskiner)
       OR EXISTS (SELECT 1 FROM per_maskin_reg pm WHERE pm.datum = d.datum)),
  per_maskin AS (
    SELECT md.maskin_id, md.datum FROM helikopter_ny_maskindag(p_ar, p_manad, p_idag) md
    WHERE md.status IN ('kord', 'arbetsdag', 'oforklarat')),
  alla AS (
    SELECT NULL::text AS maskin_id, datum FROM globalt
    UNION ALL
    SELECT maskin_id, datum FROM per_maskin),
  rader AS (
    SELECT NULL::text AS maskin_id
    UNION ALL
    SELECT mk.maskin_id FROM maskiner mk)
  SELECT r.maskin_id,
         count(a.datum)::int AS totalt,
         count(a.datum) FILTER (WHERE a.datum < p_idag)::int AS gangna,
         count(a.datum) FILTER (WHERE a.datum >= p_idag)::int AS kvar,
         COALESCE(array_agg(a.datum ORDER BY a.datum) FILTER (WHERE a.datum < p_idag), '{}') AS gangna_datum,
         COALESCE(array_agg(a.datum ORDER BY a.datum) FILTER (WHERE a.datum >= p_idag), '{}') AS kvar_datum
  FROM rader r
  LEFT JOIN alla a ON a.maskin_id IS NOT DISTINCT FROM r.maskin_id
  GROUP BY r.maskin_id;
$function$;

-- ── 4. Stopp per maskin: närmaste stopp, oförklarade dagar, takt-fönstrets start ───────────────────
-- Ett stopp = ett sammanhängande led av planerade/registrerade arbetsdagar med samma orsak (helg och röda dagar bryter inte).
-- Närmaste: pågående, annars första kommande, annars senaste som varit. stopp_orsak: 'ledig:Stefan' | 'registrerat:<stopp.orsak>'.
-- oforklarade_datum: oförklarade dagar bland de 5 dagar som ingår i maskinens takt (de senaste körda/oförklarade, före idag).
CREATE OR REPLACE FUNCTION public.helikopter_ny_stopp(p_ar integer, p_manad integer, p_idag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(maskin_id text, namn text, roll text, stopp_fran date, stopp_till date, stopp_orsak text, stopp_status text,
               stopp_kor_igen date, stopp_dagar integer, stopp_dagar_gangna integer,
               stopp_dagar_manad integer, stopp_orsaker_manad text[], oforklarade_datum date[], takt_fran date)
 LANGUAGE sql
 STABLE
AS $function$
  WITH md AS (
    SELECT x.maskin_id, x.datum, x.status, x.orsak,
           row_number() OVER (PARTITION BY x.maskin_id ORDER BY x.datum) AS dagnr
    FROM helikopter_ny_maskindag(p_ar, p_manad, p_idag) x),
  st AS (
    SELECT m.maskin_id, m.datum, m.orsak,
           m.dagnr - row_number() OVER (PARTITION BY m.maskin_id, m.orsak ORDER BY m.datum) AS grp
    FROM md m WHERE m.status IN ('planerat', 'registrerat')),
  runs AS (
    SELECT s.maskin_id, s.orsak, min(s.datum) AS fran, max(s.datum) AS till, count(*)::int AS dagar,
           (count(*) FILTER (WHERE s.datum < p_idag))::int AS gangna
    FROM st s GROUP BY s.maskin_id, s.orsak, s.grp),
  val AS (
    SELECT r.*, CASE WHEN r.fran <= p_idag AND r.till >= p_idag THEN 'pagar'
                     WHEN r.fran > p_idag THEN 'kommande' ELSE 'varit' END AS status
    FROM runs r),
  valt AS (
    SELECT DISTINCT ON (v.maskin_id) v.*
    FROM val v
    ORDER BY v.maskin_id,
             CASE v.status WHEN 'pagar' THEN 0 WHEN 'kommande' THEN 1 ELSE 2 END,
             CASE WHEN v.status = 'varit' THEN -(v.till - date '2000-01-01') ELSE (v.fran - date '2000-01-01') END),
  fonster AS (
    SELECT x.maskin_id,
           array_agg(x.datum ORDER BY x.datum) AS dagar,
           array_agg(x.datum ORDER BY x.datum) FILTER (WHERE x.status = 'oforklarat') AS oforklarade
    FROM (SELECT m.maskin_id, m.datum, m.status,
                 row_number() OVER (PARTITION BY m.maskin_id ORDER BY m.datum DESC) AS rn
          FROM md m WHERE m.datum < p_idag AND m.status IN ('kord', 'oforklarat')) x
    WHERE x.rn <= 5
    GROUP BY x.maskin_id),
  maskiner AS (SELECT DISTINCT m.maskin_id FROM md m)
  SELECT mk.maskin_id,
         COALESCE(NULLIF(btrim(dm.visningsnamn), ''), dm.modell, mk.maskin_id) AS namn,
         CASE WHEN dm.maskin_typ = 'Harvester' THEN 'skordare' ELSE 'skotare' END AS roll,
         v.fran, v.till, v.orsak, v.status,
         (SELECT d::date FROM generate_series(v.till + 1, v.till + 21, interval '1 day') d
           WHERE helikopter_ny_ar_arbetsdag(d::date)
             AND helikopter_ny_ledig(mk.maskin_id, d::date) IS NULL
             AND NOT EXISTS (SELECT 1 FROM stopp s JOIN stopp_maskin sm ON sm.stopp_id = s.id
                             WHERE sm.maskin_id = mk.maskin_id AND d::date BETWEEN s.fran_datum AND s.till_datum)
           ORDER BY d LIMIT 1) AS stopp_kor_igen,
         v.dagar, v.gangna,
         (SELECT count(*)::int FROM st s WHERE s.maskin_id = mk.maskin_id AND s.datum < p_idag) AS stopp_dagar_manad,
         COALESCE((SELECT array_agg(DISTINCT s.orsak ORDER BY s.orsak) FROM st s WHERE s.maskin_id = mk.maskin_id AND s.datum < p_idag), '{}') AS stopp_orsaker_manad,
         COALESCE(f.oforklarade, '{}') AS oforklarade_datum,
         f.dagar[1] AS takt_fran
  FROM maskiner mk
  JOIN dim_maskin dm ON dm.maskin_id = mk.maskin_id
  LEFT JOIN valt v ON v.maskin_id = mk.maskin_id
  LEFT JOIN fonster f ON f.maskin_id = mk.maskin_id
  ORDER BY roll, namn;
$function$;

-- ── 5. Takt per maskin, spår och bas ────────────────────────────────────────
-- takt = maskinens volym i spåret (typ + bas) på de 5 senaste dagarna maskinen KÖRDE eller OFÖRKLARAT inte körde (planerade stopp
-- hoppas över) / antal dagar i fönstret. kvar/kvar_datum = maskinens egna arbetsdagar kvar (idag och senare, ledighet borträknad).
-- Prognos för spåret = hittills + summan av takt × kvar över maskinerna. Maskiner utan egen rad (extramaskin, såld) med produktion
-- i månaden räknas på de globala dagarna, som förut.
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
           ARRAY(SELECT dd FROM unnest(m.gangna_datum) dd ORDER BY dd DESC LIMIT 5) AS dagar
    FROM maskiner m)
  SELECT t.typ, bs.bas, f.maskin_id,
         CASE WHEN dm.maskin_typ = 'Harvester' THEN 'skordare' ELSE 'skotare' END AS roll,
         CASE WHEN cardinality(f.dagar) > 0 THEN round(COALESCE(s.fonster_vol, 0) / cardinality(f.dagar), 4) END AS takt,
         cardinality(f.dagar)::int AS takt_dagar,
         cardinality(f.kvar_datum)::int AS kvar,
         f.kvar_datum,
         COALESCE(s.manad_vol, 0)::numeric AS volym_manad
  FROM fonster f
  JOIN dim_maskin dm ON dm.maskin_id = f.maskin_id AND dm.maskin_typ IN ('Harvester', 'Forwarder')
  CROSS JOIN typer t
  CROSS JOIN baser bs
  LEFT JOIN LATERAL (
    SELECT sum(v.v) FILTER (WHERE v.datum = ANY(f.dagar)) AS fonster_vol, sum(v.v) AS manad_vol
    FROM vol v
    WHERE v.maskin_id = f.maskin_id AND v.typ = t.typ
      AND (bs.bas = 'totalt' OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(v.bolag)))) s ON true
  ORDER BY t.typ, bs.bas, roll, f.maskin_id;
$function$;

-- ── 6. Spår: takten är summan av maskinernas takt ───────────────────────────
-- Samma kolumner som förut. takt_skordat/takt_skotat = summan över maskinerna i rollen (helikopter_ny_takt); takt_dagar och
-- takt_fonster är de globala dagarna (styr bara "ingen prognos före arbetsdag 4"). Prognosen räknas i appen: hittills + Σ takt × kvar.
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
  oppna AS (
    SELECT d.objekt_id, d.object_name, COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd') AS typ, NULLIF(btrim(d.bolag), '') AS bolag
    FROM dim_objekt d
    WHERE d.skotning_avslutad IS NULL AND COALESCE(d.skotning_avslutad_auto, false) = false),
  obj_oskotat AS (
    SELECT o.objekt_id, o.object_name, o.typ, o.bolag,
           GREATEST(
             COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p, man WHERE p.objekt_id = o.objekt_id AND p.datum < man.fran), 0)
           - COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l, man WHERE l.objekt_id = o.objekt_id AND l.datum < man.fran), 0), 0)::numeric AS oskotat_ingaende,
           GREATEST(
             COALESCE((SELECT sum(p.volym_m3sub) FROM fakt_produktion p WHERE p.objekt_id = o.objekt_id), 0)
           - COALESCE((SELECT sum(l.volym_m3sub) FROM fakt_lass l WHERE l.objekt_id = o.objekt_id), 0), 0)::numeric AS oskotat_nu
    FROM oppna o),
  ingaende AS (
    SELECT t.typ, bs.bas, COALESCE(sum(oo.oskotat_ingaende), 0)::numeric AS oskotat
    FROM typer t CROSS JOIN baser bs
    LEFT JOIN obj_oskotat oo ON oo.typ = t.typ
      AND (bs.bas = 'totalt' OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(oo.bolag)))
    GROUP BY t.typ, bs.bas),
  topp AS (
    SELECT t.typ, bs.bas,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('namn', x.object_name, 'oskotat', round(x.oskotat_nu)) ORDER BY x.oskotat_nu DESC)
                     FROM (SELECT oo.object_name, oo.oskotat_nu FROM obj_oskotat oo
                           WHERE oo.typ = t.typ AND oo.oskotat_nu > 0
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

-- ── 7. Veckoläget (och därmed onsdagsnotisen): samma takt och stopp som vyn ─────────────────────────
-- Två nya nycklar i payloaden: 'takt' (helikopter_ny_takt) och 'stopp' (helikopter_ny_stopp). Övrigt som förut.
CREATE OR REPLACE FUNCTION public.helikopter_veckolage(p_idag date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  WITH p AS (SELECT extract(year FROM p_idag)::int AS ar, extract(month FROM p_idag)::int AS manad),
  ad AS (SELECT a.* FROM p, helikopter_ny_arbetsdagar(p.ar, p.manad, p_idag) a),
  dagar AS (SELECT a.maskin_id, unnest(a.gangna_datum || a.kvar_datum) AS d FROM ad a)
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
                                                 FROM dagar x WHERE x.maskin_id = m.maskin_id AND x.d <= p_idag))
                          ORDER BY m.roll, m.namn), '[]'::jsonb)
                       FROM helikopter_ny_maskiner(p.ar, p.manad, p_idag) m)
  )
  FROM p;
$function$;

-- ── 8. Månadsnotisen: stoppen som förklaring ────────────────────────────────
-- Payload = månadsfacit för föregående månad + 'stopp' (helikopter_ny_stopp för den månaden). Texten byggs i appen (formateraManadNotis).
CREATE OR REPLACE FUNCTION public.helikopter_notis_manad(p_idag date DEFAULT CURRENT_DATE, p_manuell boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_mottagare_epost constant text[] := ARRAY['martin.lindqvist@kompersmalaskog.com', 'joacim.ringberg@kompersmalaskog.com'];
  c_typ             constant text   := 'helikopter_manad';
  v_forra     date := (date_trunc('month', p_idag) - interval '1 month')::date;
  v_jwt_email text;
  v_roll      text;
  v_payload   jsonb;
  v_antal     int := 0;
  v_n         int;
  r           record;
BEGIN
  BEGIN
    v_jwt_email := (current_setting('request.jwt.claims', true)::json)->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_email := NULL;
  END;
  IF v_jwt_email IS NOT NULL THEN
    SELECT m.roll INTO v_roll FROM medarbetare m WHERE m.epost = v_jwt_email LIMIT 1;
    IF v_roll IS NULL OR v_roll <> 'admin' THEN
      RAISE EXCEPTION 'helikopter_notis_manad: kräver admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_payload := helikopter_manadsfacit(extract(year FROM v_forra)::int, extract(month FROM v_forra)::int, p_idag);
  IF v_payload->'totalt' IS NULL OR jsonb_typeof(v_payload->'totalt') = 'null' THEN
    RETURN 0;
  END IF;
  v_payload := v_payload || jsonb_build_object('stopp',
    (SELECT COALESCE(jsonb_agg(to_jsonb(st)), '[]'::jsonb)
       FROM helikopter_ny_stopp(extract(year FROM v_forra)::int, extract(month FROM v_forra)::int, p_idag) st));

  FOR r IN SELECT m.id FROM medarbetare m WHERE m.epost = ANY(c_mottagare_epost) LOOP
    IF p_manuell THEN
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at)
      VALUES (r.id, c_typ, v_payload || '{"manuell":true}'::jsonb, now());
      v_n := 1;
    ELSE
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at, datum)
      VALUES (r.id, c_typ, v_payload, now(), p_idag)
      ON CONFLICT (typ, mottagare_id, datum) WHERE datum IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_antal := v_antal + v_n;
  END LOOP;
  RETURN v_antal;
END;
$function$;

-- ── 9. Behörigheter: samma som övriga helikopter_ny_*-funktioner (inloggade + service_role, aldrig anon/PUBLIC) ─────
-- helikopter_ny_ledig är SECURITY DEFINER och svarar med förnamn på ledig förare: den får aldrig kunna anropas utan inloggning.
REVOKE ALL ON FUNCTION
  helikopter_ny_ledig(text, date),
  helikopter_ny_maskindag(integer, integer, date),
  helikopter_ny_stopp(integer, integer, date),
  helikopter_ny_takt(integer, integer, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  helikopter_ny_ledig(text, date),
  helikopter_ny_maskindag(integer, integer, date),
  helikopter_ny_stopp(integer, integer, date),
  helikopter_ny_takt(integer, integer, date)
TO authenticated, service_role;
