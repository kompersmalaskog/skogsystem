-- affar_oversikt: planeringsoptimeringen i kommentaren i funktionen är bevarad. Frågan bygger fortfarande timestamptz-LITERALER
-- mot den råa kolumnen (så planeraren uppskattar antalet stammar rätt och väljer hash join) — fönstret är nu ±3 timmar vidare
-- än månaden/året, eftersom en rad i den gamla konventionen ligger upp till två timmar åt andra hållet — och det exakta urvalet
-- sker sedan på den svenska väggklockan (tidpunkt_lokal) bara på de rader som kommit med. Månaden per rad är också
-- date_trunc('month', tidpunkt_lokal). Patch av befintlig definition (se 3d för varför); varje ersättning kontrollerar att den
-- träffar exakt en gång. Kropp kontrollerad mot prod: c9f87a62695684aa02e0d5e747eb5473.
DO $patch$
DECLARE
  d text := pg_get_functiondef('public.affar_oversikt(integer,date)'::regprocedure);
  par text[][] := ARRAY[
    [$a$  v_till date;
  r      jsonb;$a$,
     $b$  v_till date;
  v_fran_ts timestamptz;
  v_till_ts timestamptz;
  r      jsonb;$b$],
    [$a$  END IF;

  EXECUTE format($sql$$a$,
     $b$  END IF;
  v_fran_ts := (v_fran::timestamp AT TIME ZONE 'Europe/Stockholm') - interval '3 hours';
  v_till_ts := (v_till::timestamp AT TIME ZONE 'Europe/Stockholm') + interval '3 hours';

  EXECUTE format($sql$$b$],
    [$a$nested loop med 160 000-620 000 indexuppslag och tar 8,6 s $a$,
     $b$nested loop med 160 000-620 000 indexuppslag och tar 8,6 s $b$],
    [$a$-- nested loop med 160 000-620 000 indexuppslag och tar 8,6 s — över PostgREST:s 8 s-gräns som authenticated.
$a$,
     $b$-- nested loop med 160 000-620 000 indexuppslag och tar 8,6 s — över PostgREST:s 8 s-gräns som authenticated.
-- Fönstret är ±3 h vidare än perioden (båda konventionerna ryms); det exakta urvalet är det svenska datumet i tidpunkt_lokal.
$b$],
    [$a$SELECT date_trunc('month', v.tidpunkt)::date AS manad$a$,
     $b$SELECT date_trunc('month', v.tidpunkt_lokal)::date AS manad$b$],
    [$a$  WHERE v.tidpunkt >= %1$L::timestamptz AND v.tidpunkt < %2$L::timestamptz$a$,
     $b$  WHERE v.tidpunkt >= %4$L::timestamptz AND v.tidpunkt < %5$L::timestamptz
    AND v.tidpunkt_lokal >= %1$L::date AND v.tidpunkt_lokal < %2$L::date$b$],
    [$a$$sql$, v_fran, v_till, (p_manad IS NULL)::text) INTO r;$a$,
     $b$$sql$, v_fran, v_till, (p_manad IS NULL)::text, v_fran_ts, v_till_ts) INTO r;$b$]
  ];
  i int;
  n int;
BEGIN
  FOR i IN 1 .. array_length(par, 1) LOOP
    n := (length(d) - length(replace(d, par[i][1], ''))) / length(par[i][1]);
    IF n <> 1 THEN
      RAISE EXCEPTION 'affar_oversikt: ersättning % träffade % gånger', i, n;
    END IF;
    d := replace(d, par[i][1], par[i][2]);
  END LOOP;
  EXECUTE d;
END
$patch$;
