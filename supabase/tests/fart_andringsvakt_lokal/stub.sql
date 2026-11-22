-- Minsta möjliga prod: bara det berakna_utfall_objekt och berakna_stamplingsmodell rör, med prods FUNKTIONSTEXT ORDAGRANT
-- (pg_get_functiondef 2026-11-22) så att migrationens patch prövas mot den riktiga texten.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;

create table dim_objekt (objekt_id text primary key, huvudtyp text);
create table dim_tradslag (tradslag_id text primary key, namn text);
create table dim_sortiment (sortiment_id text primary key, namn text);

create table detalj_stock (
  id bigserial primary key, maskin_id text, objekt_id text, stem_key text, log_key text,
  sortiment_id text, sortiment_namn text, volym_m3sub numeric, langd_cm int, tidpunkt timestamp, tradslag_id text,
  unique (maskin_id, stem_key, log_key));
create index on detalj_stock (objekt_id);
create table detalj_stam (
  id bigserial primary key, maskin_id text, stam_key text, filnamn text, objekt_id text, dbh_mm int, tradslag_id text,
  unique (maskin_id, stam_key));
create index on detalj_stam (objekt_id);
create table detalj_stam_diameter (
  maskin_id text, objekt_id text, stam_key text, filnamn text, primary key (maskin_id, objekt_id, stam_key));
create index on detalj_stam_diameter (filnamn);

create view vy_sortiment_klass as select sortiment_id, namn, case when sortiment_id = '1' then 'Timmer' when sortiment_id = '2' then 'Massa' when sortiment_id = '3' then 'Hemved' else 'Kubb' end as grupp from dim_sortiment;
create view vy_skordarmatt_stock as select objekt_id, maskin_id, stem_key, sortiment_id, volym_m3sub, tidpunkt as tidpunkt_lokal, tradslag_id, langd_cm from detalj_stock;
create function harled_produktgrupp(t text) returns text language sql immutable as $$ select null::text $$;

create table utfall_objekt (
  objekt_id text primary key, forsta date, stammar int, volym numeric, timmer_m3 numeric, kubb_m3 numeric, massa_m3 numeric,
  lov_m3 numeric, stockar_antal int, stammar_antal int, beraknad timestamptz, kontrollerad timestamptz, manad_beraknad timestamptz);
create table utfall_manad (
  objekt_id text, manad date, volym numeric, timmer_m3 numeric, kubb_m3 numeric, massa_m3 numeric, massa_barr_m3 numeric,
  massa_barr_lm numeric, stockar int, beraknad timestamptz, primary key (objekt_id, manad));
create table stamplings_objekt (
  objekt_id text primary key, slutavverkning boolean, stockar_antal int, stammar_antal int, beraknad timestamptz,
  stammar20 numeric, rot20 numeric);
create table stamplings_cell (objekt_id text, slag text, klass int, rot boolean, stammar bigint, volym numeric, timmer numeric, kubb numeric, massa numeric);
create table stamplings_klass (slag text, klass int, rot text, stammar numeric, objekt bigint, m3_per_stam numeric, timmer_pct numeric, kubb_pct numeric, massa_pct numeric, ovrigt_pct numeric, beraknad timestamptz);
create table stamplings_meta (nyckel text, varde numeric, text text, beraknad timestamptz);

-- ═══ prods funktioner, ordagrant ═══
CREATE OR REPLACE FUNCTION public.berakna_utfall_objekt(p_allt boolean DEFAULT false, p_max integer DEFAULT 5, p_fore timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  t0 timestamptz := clock_timestamp();
  v_hemved text[];
  v_lov text[];
  v_raknade int; v_kvar int; v_borttagna int;
BEGIN
  SELECT coalesce(array_agg(sortiment_id), '{}') INTO v_hemved
  FROM vy_sortiment_klass WHERE grupp = 'Hemved';

  SELECT coalesce(array_agg(tradslag_id), '{}') INTO v_lov
  FROM dim_tradslag WHERE namn IN ('BJÖRK', 'ÖVR_LÖV', 'ÖVR LÖV', 'LÖV', 'LOV2');

  WITH nyckel AS (
    SELECT s.objekt_id, s.n::int AS stockar_antal, coalesce(m.n, 0)::int AS stammar_antal
    FROM (SELECT objekt_id, count(*) AS n FROM detalj_stock
          WHERE stem_key IS NOT NULL AND log_key IS NOT NULL AND objekt_id IS NOT NULL
          GROUP BY 1) s
    LEFT JOIN (SELECT objekt_id, count(*) AS n FROM detalj_stam
               WHERE objekt_id IS NOT NULL GROUP BY 1) m ON m.objekt_id = s.objekt_id
  ),
  alla_andrade AS (
    SELECT n.* FROM nyckel n
    LEFT JOIN utfall_objekt u ON u.objekt_id = n.objekt_id
    WHERE u.objekt_id IS NULL
       OR u.stockar_antal <> n.stockar_antal OR u.stammar_antal <> n.stammar_antal
       OR (p_allt AND u.beraknad < p_fore)
       OR u.lov_m3 IS NULL
       OR u.manad_beraknad IS NULL
  ),
  andrade AS (SELECT * FROM alla_andrade ORDER BY objekt_id LIMIT p_max),
  klass AS MATERIALIZED (SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass),
  stock AS (
    SELECT v.objekt_id, v.maskin_id, v.stem_key, v.sortiment_id, v.volym_m3sub, v.tidpunkt_lokal AS tidpunkt, v.tradslag_id, v.langd_cm
    FROM vy_skordarmatt_stock v
    JOIN andrade a ON a.objekt_id = v.objekt_id
    WHERE v.sortiment_id IS NULL OR NOT (v.sortiment_id = ANY (v_hemved))
  ),
  per_objekt AS (
    SELECT objekt_id, min(tidpunkt)::date AS forsta,
           count(DISTINCT (maskin_id, stem_key)) AS stammar, sum(volym_m3sub) AS volym,
           coalesce(sum(volym_m3sub) FILTER (WHERE tradslag_id = ANY (v_lov)), 0) AS lov
    FROM stock GROUP BY 1
  ),
  per_grupp AS (
    SELECT s.objekt_id, k.grupp, sum(s.volym) AS volym
    FROM (SELECT objekt_id, sortiment_id, sum(volym_m3sub) AS volym FROM stock GROUP BY 1, 2) s
    LEFT JOIN klass k ON k.sortiment_id = s.sortiment_id
    GROUP BY 1, 2
  ),
  manad_tal AS (
    SELECT m.objekt_id, m.manad, sum(m.volym) AS volym,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp IN ('Kubb', 'Klentimmer')), 0) AS kubb,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Massa'), 0) AS massa,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Massa' AND k.namn = 'Massa: BmavFall_V3'), 0) AS massa_barr,
           coalesce(sum(m.lm) FILTER (WHERE k.grupp = 'Massa' AND k.namn = 'Massa: BmavFall_V3'), 0) AS massa_barr_lm,
           sum(m.stockar)::int AS stockar
    FROM (SELECT objekt_id, date_trunc('month', tidpunkt)::date AS manad, sortiment_id,
                 sum(volym_m3sub) AS volym, sum(langd_cm * volym_m3sub) AS lm, count(*) AS stockar
          FROM stock WHERE tidpunkt IS NOT NULL GROUP BY 1, 2, 3) m
    LEFT JOIN klass k ON k.sortiment_id = m.sortiment_id
    GROUP BY 1, 2
  ),
  tal AS (
    SELECT o.objekt_id, o.forsta, o.stammar, o.volym, o.lov,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp IN ('Kubb', 'Klentimmer')), 0) AS kubb,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Massa'),  0) AS massa
    FROM per_objekt o LEFT JOIN per_grupp g ON g.objekt_id = o.objekt_id
    GROUP BY 1, 2, 3, 4, 5
  ),
  skrivna AS (
    INSERT INTO utfall_objekt (objekt_id, forsta, stammar, volym, timmer_m3, kubb_m3, massa_m3, lov_m3,
                               stockar_antal, stammar_antal, beraknad, kontrollerad, manad_beraknad)
    SELECT a.objekt_id, t.forsta, coalesce(t.stammar, 0), coalesce(t.volym, 0),
           coalesce(t.timmer, 0), coalesce(t.kubb, 0), coalesce(t.massa, 0), coalesce(t.lov, 0),
           a.stockar_antal, a.stammar_antal, now(), now(), now()
    FROM andrade a LEFT JOIN tal t ON t.objekt_id = a.objekt_id
    ON CONFLICT (objekt_id) DO UPDATE SET
      forsta = EXCLUDED.forsta, stammar = EXCLUDED.stammar, volym = EXCLUDED.volym,
      timmer_m3 = EXCLUDED.timmer_m3, kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3, lov_m3 = EXCLUDED.lov_m3,
      stockar_antal = EXCLUDED.stockar_antal, stammar_antal = EXCLUDED.stammar_antal,
      beraknad = now(), kontrollerad = now(), manad_beraknad = now()
    RETURNING 1
  ),
  skrivna_manad AS (
    INSERT INTO utfall_manad (objekt_id, manad, volym, timmer_m3, kubb_m3, massa_m3,
                              massa_barr_m3, massa_barr_lm, stockar, beraknad)
    SELECT objekt_id, manad, volym, timmer, kubb, massa, massa_barr, massa_barr_lm, stockar, now()
    FROM manad_tal
    ON CONFLICT (objekt_id, manad) DO UPDATE SET
      volym = EXCLUDED.volym, timmer_m3 = EXCLUDED.timmer_m3, kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3,
      massa_barr_m3 = EXCLUDED.massa_barr_m3, massa_barr_lm = EXCLUDED.massa_barr_lm, stockar = EXCLUDED.stockar,
      beraknad = now()
    RETURNING 1
  )
  SELECT count(*), (SELECT count(*) FROM alla_andrade) - count(*)
    INTO v_raknade, v_kvar FROM skrivna;

  DELETE FROM utfall_objekt u
  WHERE NOT EXISTS (SELECT 1 FROM detalj_stock s
                    WHERE s.objekt_id = u.objekt_id AND s.stem_key IS NOT NULL AND s.log_key IS NOT NULL);
  GET DIAGNOSTICS v_borttagna = ROW_COUNT;

  DELETE FROM utfall_manad m
  WHERE NOT EXISTS (SELECT 1 FROM utfall_objekt u WHERE u.objekt_id = m.objekt_id);
  DELETE FROM utfall_manad m
  USING utfall_objekt u
  WHERE u.objekt_id = m.objekt_id AND u.manad_beraknad = now() AND m.beraknad < now();

  UPDATE utfall_objekt SET kontrollerad = now() WHERE kontrollerad < now();

  RETURN jsonb_build_object(
    'raknade', v_raknade, 'kvar', v_kvar, 'borttagna', v_borttagna,
    'rader', (SELECT count(*) FROM utfall_objekt),
    'manadrader', (SELECT count(*) FROM utfall_manad),
    'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000),
    'roll', current_user,
    'statement_timeout', current_setting('statement_timeout'));
END $function$;

CREATE OR REPLACE FUNCTION public.berakna_stamplingsmodell(p_allt boolean DEFAULT false, p_max integer DEFAULT 5, p_fore timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_t0      timestamptz := clock_timestamp();
  v_alla    int := 0;
  v_raknade int := 0;
  v_bort    int := 0;
  v_rader   int;
  v_ids     text[];
  v_sa      text[];
BEGIN
  WITH nyckel AS (
    SELECT s.objekt_id, s.n::int AS stockar_antal, coalesce(m.n, 0)::int AS stammar_antal,
           coalesce(o.huvudtyp = 'Slutavverkning', false) AS slutavverkning
    FROM (SELECT objekt_id, count(*) AS n FROM detalj_stock
          WHERE stem_key IS NOT NULL AND log_key IS NOT NULL AND objekt_id IS NOT NULL GROUP BY 1) s
    LEFT JOIN (SELECT objekt_id, count(*) AS n FROM detalj_stam WHERE objekt_id IS NOT NULL GROUP BY 1) m
           ON m.objekt_id = s.objekt_id
    LEFT JOIN dim_objekt o ON o.objekt_id = s.objekt_id),
  alla_andrade AS (
    SELECT n.* FROM nyckel n
    LEFT JOIN stamplings_objekt u ON u.objekt_id = n.objekt_id
    WHERE u.objekt_id IS NULL
       OR u.stockar_antal <> n.stockar_antal OR u.stammar_antal <> n.stammar_antal
       OR u.slutavverkning <> n.slutavverkning
       OR (p_allt AND u.beraknad < p_fore)),
  andrade AS (SELECT * FROM alla_andrade ORDER BY objekt_id LIMIT p_max),
  skrivna AS (
    INSERT INTO stamplings_objekt (objekt_id, slutavverkning, stockar_antal, stammar_antal, beraknad)
    SELECT objekt_id, slutavverkning, stockar_antal, stammar_antal, now() FROM andrade
    ON CONFLICT (objekt_id) DO UPDATE SET
      slutavverkning = EXCLUDED.slutavverkning, stockar_antal = EXCLUDED.stockar_antal,
      stammar_antal = EXCLUDED.stammar_antal, beraknad = now()
    RETURNING objekt_id, slutavverkning)
  SELECT (SELECT count(*) FROM alla_andrade)::int,
         coalesce(array_agg(objekt_id), '{}'),
         coalesce(array_agg(objekt_id) FILTER (WHERE slutavverkning), '{}')
  INTO v_alla, v_ids, v_sa
  FROM skrivna;

  v_raknade := coalesce(cardinality(v_ids), 0);

  DELETE FROM stamplings_cell WHERE objekt_id = ANY (v_ids);

  WITH klass AS MATERIALIZED (SELECT sortiment_id, grupp FROM vy_sortiment_klass),
  stock AS (
    SELECT d.maskin_id, d.stem_key, d.objekt_id, d.log_key, d.volym_m3sub,
           coalesce(k.grupp, harled_produktgrupp(d.sortiment_namn), 'Övrigt') AS grupp
    FROM detalj_stock d
    LEFT JOIN klass k ON k.sortiment_id = d.sortiment_id
    WHERE d.objekt_id = ANY (v_sa)
      AND d.stem_key IS NOT NULL AND d.log_key IS NOT NULL
      AND coalesce(k.grupp, harled_produktgrupp(d.sortiment_namn), '') <> 'Hemved'),
  forsta AS (
    SELECT DISTINCT ON (maskin_id, objekt_id, stem_key) maskin_id, objekt_id, stem_key, (grupp = 'Massa') AS rot
    FROM stock ORDER BY maskin_id, objekt_id, stem_key, log_key),
  stam AS (
    SELECT s.maskin_id, s.stam_key, s.objekt_id,
           CASE WHEN t.namn = 'TALL' THEN 'tall' WHEN t.namn = 'GRAN' THEN 'gran' ELSE 'annat' END AS slag,
           CASE WHEN s.dbh_mm < 100 THEN 5 WHEN s.dbh_mm >= 550 THEN 55 ELSE (s.dbh_mm / 50) * 5 END AS klass
    FROM detalj_stam s
    LEFT JOIN dim_tradslag t ON t.tradslag_id = s.tradslag_id
    WHERE s.objekt_id = ANY (v_sa) AND s.dbh_mm IS NOT NULL),
  per_stam AS (
    SELECT st.objekt_id, st.slag, st.klass, f.rot,
           sum(sk.volym_m3sub) AS vol,
           coalesce(sum(sk.volym_m3sub) FILTER (WHERE sk.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(sk.volym_m3sub) FILTER (WHERE sk.grupp IN ('Kubb', 'Klentimmer')), 0) AS kubb,
           coalesce(sum(sk.volym_m3sub) FILTER (WHERE sk.grupp = 'Massa'), 0) AS massa
    FROM stam st
    JOIN stock sk ON sk.maskin_id = st.maskin_id AND sk.stem_key = st.stam_key AND sk.objekt_id = st.objekt_id
    JOIN forsta f ON f.maskin_id = st.maskin_id AND f.stem_key = st.stam_key AND f.objekt_id = st.objekt_id
    GROUP BY st.objekt_id, st.slag, st.klass, f.rot, st.maskin_id, st.stam_key)
  INSERT INTO stamplings_cell (objekt_id, slag, klass, rot, stammar, volym, timmer, kubb, massa)
  SELECT objekt_id, slag, klass, rot, count(*), sum(vol), sum(timmer), sum(kubb), sum(massa)
  FROM per_stam GROUP BY 1, 2, 3, 4;

  UPDATE stamplings_objekt u SET
    stammar20 = r.n, rot20 = r.rot
  FROM (SELECT x.objekt_id,
               sum(c.stammar) AS n,
               CASE WHEN sum(c.stammar) > 0 THEN coalesce(sum(c.stammar) FILTER (WHERE c.rot), 0)::numeric / sum(c.stammar) END AS rot
        FROM unnest(v_ids) AS x(objekt_id)
        LEFT JOIN stamplings_cell c
               ON c.objekt_id = x.objekt_id AND c.klass >= 20 AND c.slag IN ('tall', 'gran')
        GROUP BY x.objekt_id) r
  WHERE u.objekt_id = r.objekt_id;

  DELETE FROM stamplings_objekt u
  WHERE NOT EXISTS (SELECT 1 FROM detalj_stock s
                    WHERE s.objekt_id = u.objekt_id AND s.stem_key IS NOT NULL AND s.log_key IS NOT NULL);
  GET DIAGNOSTICS v_bort = ROW_COUNT;

  DELETE FROM stamplings_klass WHERE true;
  INSERT INTO stamplings_klass (slag, klass, rot, stammar, objekt, m3_per_stam, timmer_pct, kubb_pct, massa_pct, ovrigt_pct, beraknad)
  SELECT slag, klass, CASE WHEN rot THEN 'ja' ELSE 'nej' END, sum(stammar), count(DISTINCT objekt_id),
         sum(volym) / sum(stammar),
         100 * sum(timmer) / sum(volym), 100 * sum(kubb) / sum(volym), 100 * sum(massa) / sum(volym),
         100 * (sum(volym) - sum(timmer) - sum(kubb) - sum(massa)) / sum(volym), now()
  FROM stamplings_cell WHERE volym > 0 GROUP BY slag, klass, rot
  UNION ALL
  SELECT slag, klass, 'alla', sum(stammar), count(DISTINCT objekt_id),
         sum(volym) / sum(stammar),
         100 * sum(timmer) / sum(volym), 100 * sum(kubb) / sum(volym), 100 * sum(massa) / sum(volym),
         100 * (sum(volym) - sum(timmer) - sum(kubb) - sum(massa)) / sum(volym), now()
  FROM stamplings_cell WHERE volym > 0 GROUP BY slag, klass;

  DELETE FROM stamplings_meta WHERE true;
  INSERT INTO stamplings_meta (nyckel, varde, text, beraknad)
  SELECT 'objekt_antal', count(DISTINCT objekt_id), NULL, now() FROM stamplings_cell;

  SELECT count(*) INTO v_rader FROM stamplings_klass;
  RETURN jsonb_build_object(
    'raknade', v_raknade, 'kvar', v_alla - v_raknade, 'borttagna', v_bort, 'rader', v_rader,
    'ms', round(extract(epoch FROM clock_timestamp() - v_t0) * 1000),
    'roll', current_user, 'statement_timeout', current_setting('statement_timeout'));
END $function$;
