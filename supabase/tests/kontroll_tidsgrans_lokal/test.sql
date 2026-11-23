-- Den nya kontroll_stammar_utan_stockar ska ge EXAKT samma rader som kroppen i prod före migrationen
-- (20261019104703_opti_tider_utc_3c: GROUP BY över hela detalj_stam). Syntetisk data med ett objekt per fall.
CREATE TABLE detalj_stam (id serial primary key, objekt_id text, maskin_id text, filnamn text, tidpunkt timestamp, tid_ar_utc boolean default false);
CREATE TABLE detalj_stock (id serial primary key, objekt_id text, stem_key text, log_key text, volym_m3sub numeric);
CREATE TABLE dim_objekt (objekt_id text primary key, object_name text, huvudtyp text);
-- Stub med samma semantik som prod: tid_ar_utc => verkligt UTC (svensk tid), annars väggklocka.
CREATE FUNCTION opti_tid_lokal(t timestamp, ar_utc boolean) RETURNS timestamp LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN t IS NULL THEN NULL WHEN ar_utc THEN t AT TIME ZONE 'Europe/Stockholm' ELSE t AT TIME ZONE 'UTC' END $$;
CREATE FUNCTION opti_tid_lokal(t timestamptz, ar_utc boolean) RETURNS timestamp LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN t IS NULL THEN NULL WHEN ar_utc THEN t AT TIME ZONE 'Europe/Stockholm' ELSE t AT TIME ZONE 'UTC' END $$;

INSERT INTO dim_objekt VALUES ('A','Objekt A','Gallring'),('B','Objekt B','Slutavverkning'),('C','Objekt C',NULL);
-- A: 150 stammar från hpr, inga stockar            -> ska larma
-- B: 120 stammar blandade filer, bara nyckellösa stockar -> ska larma (stockar_utan_nyckel = 2)
-- C: 200 stammar, stockar med nycklar              -> ska INTE larma
-- D: 50 stammar utan stockar (under tröskeln 100)  -> ska INTE larma; saknar dim_objekt-rad
-- E: 130 stammar med NULL tidpunkt, inga stockar   -> ska larma, forsta/sista NULL
INSERT INTO detalj_stam (objekt_id, maskin_id, filnamn, tidpunkt, tid_ar_utc)
SELECT 'A','M1','a'||(g%3)||'.hpr', timestamp '2026-10-01 10:00' + g * interval '1 hour', g%2=0 FROM generate_series(1,150) g;
INSERT INTO detalj_stam (objekt_id, maskin_id, filnamn, tidpunkt)
SELECT 'B', CASE WHEN g%2=0 THEN 'M1' ELSE 'M2' END, CASE WHEN g%2=0 THEN 'b.hpr' ELSE 'b.mom' END, timestamp '2026-09-01' + g * interval '1 hour' FROM generate_series(1,120) g;
INSERT INTO detalj_stam (objekt_id, maskin_id, filnamn, tidpunkt)
SELECT 'C','M1','c.hpr', timestamp '2026-08-01' FROM generate_series(1,200) g;
INSERT INTO detalj_stam (objekt_id, maskin_id, filnamn, tidpunkt)
SELECT 'D','M1','d.hpr', timestamp '2026-08-01' FROM generate_series(1,50) g;
INSERT INTO detalj_stam (objekt_id, maskin_id, filnamn, tidpunkt)
SELECT 'E','M1','e.mom', NULL FROM generate_series(1,130) g;
INSERT INTO detalj_stock (objekt_id, stem_key, log_key, volym_m3sub) VALUES
  ('B', NULL, 'x', 1), ('B', 's', NULL, 1), ('C','s1','l1',0.5), ('C','s2','l2',0.5);

-- Gamla kroppen (prod före migrationen), under nytt namn.
CREATE FUNCTION kontroll_gammal(p_min_stammar int DEFAULT 100)
RETURNS TABLE (objekt_id text, namn text, huvudtyp text, stammar bigint, forsta date, sista date,
               maskiner text, kalla text, filer text[], stockar_utan_nyckel bigint) LANGUAGE sql STABLE AS $f$
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
$f$;

-- Nya kroppen: just den fil som migrationen innehåller (psql läser hela filen; indexet ligger på testtabellen).
\i ../../migrations/20261123093545_kontroll_tidsgrans.sql

DO $$
DECLARE avvik int; n_gammal int; n_ny int; p int;
BEGIN
  FOREACH p IN ARRAY ARRAY[1, 100, 120, 150, 1000] LOOP
    SELECT count(*) INTO avvik FROM (
      (SELECT * FROM kontroll_gammal(p) EXCEPT SELECT * FROM kontroll_stammar_utan_stockar(p))
      UNION ALL
      (SELECT * FROM kontroll_stammar_utan_stockar(p) EXCEPT SELECT * FROM kontroll_gammal(p))) q;
    IF avvik <> 0 THEN RAISE EXCEPTION 'p_min=%: nya och gamla funktionen ger olika rader (% avvikande)', p, avvik; END IF;
  END LOOP;
  SELECT count(*) INTO n_ny FROM kontroll_stammar_utan_stockar(100);
  IF n_ny <> 3 THEN RAISE EXCEPTION 'förväntade 3 larmande objekt (A, B, E) men fick %', n_ny; END IF;
  IF (SELECT array_agg(objekt_id ORDER BY objekt_id) FROM kontroll_stammar_utan_stockar(100)) <> ARRAY['A','B','E'] THEN
    RAISE EXCEPTION 'fel objekt larmar'; END IF;
  -- Ordningen är oförändrad: NULL-tid först (E), sedan äldst (B 2026-09, A 2026-10).
  IF (SELECT array_agg(objekt_id ORDER BY ordinality) FROM kontroll_stammar_utan_stockar(100) WITH ORDINALITY) <> ARRAY['E','B','A'] THEN
    RAISE EXCEPTION 'fel ordning'; END IF;
  IF (SELECT stockar_utan_nyckel FROM kontroll_stammar_utan_stockar(100) WHERE objekt_id = 'B') <> 2 THEN
    RAISE EXCEPTION 'stockar_utan_nyckel för B ska vara 2'; END IF;
  IF (SELECT kalla FROM kontroll_stammar_utan_stockar(100) WHERE objekt_id = 'B') <> 'blandat' THEN RAISE EXCEPTION 'kalla'; END IF;
  RAISE NOTICE 'OK: nya kontroll_stammar_utan_stockar = gamla kroppen på 5 trösklar; A, B, E larmar i rätt ordning';
END $$;

-- Indexet ska finnas, vara partiellt och bära volymen (täckande).
DO $$
DECLARE d text;
BEGIN
  SELECT indexdef INTO d FROM pg_indexes WHERE indexname = 'idx_detalj_stock_summa_objekt';
  IF d IS NULL THEN RAISE EXCEPTION 'indexet saknas'; END IF;
  IF d NOT LIKE '%INCLUDE (volym_m3sub)%' OR d NOT LIKE '%stem_key IS NOT NULL%' OR d NOT LIKE '%log_key IS NOT NULL%' THEN
    RAISE EXCEPTION 'indexet har fel form: %', d; END IF;
  RAISE NOTICE 'OK: indexet är partiellt och täckande';
END $$;
