-- Helikopter: 810E (manuell datakälla) får åter takt = volym på de 5 senaste arbetsdagarna, som övriga maskiner.
-- Bakgrund: 20261017103321 gav 810E månadens volym / rapportdagar eftersom Oskar rapporterade lass i klumpar. Martin 2026-11-25:
-- Oskar rapporterar nu ett lass i taget ("japp på 810"), och månadssnittet gav "klar efter månadens slut" för Tröjemåla 1:115
-- (183 m³ kvar, 5 dagar) när Martin räknar med färdigt torsdag/fredag.
-- Ändringen är minimal och görs på den LEVANDE definitionen (replace), inte en omskriven kopia:
--   helikopter_ny_takt:   rapport_n blir NULL → raden faller till fönstergrenen (fonster_vol / antal dagar i fönstret).
--   helikopter_ny_maskin: CTE:n rapp ger aldrig rader (AND false) → takt = takt_auto (fönstret).
-- Kasta fel om texten inte hittas, så migrationen aldrig tyst blir en no-op.
DO $mig$
DECLARE d text; d2 text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname = 'helikopter_ny_takt' AND pronamespace = 'public'::regnamespace;
  d2 := regexp_replace(d, 'CASE WHEN COALESCE\(dm0\.datakalla.*?END AS rapport_n', 'NULL::int AS rapport_n', 's');
  IF d2 = d THEN RAISE EXCEPTION 'helikopter_ny_takt: rapport_n-uttrycket hittades inte'; END IF;
  EXECUTE d2;

  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname = 'helikopter_ny_maskin' AND pronamespace = 'public'::regnamespace;
  d2 := replace(d, 'AND (SELECT COALESCE(dm.datakalla, ''auto'') = ''manuell'' FROM dim_maskin dm WHERE dm.maskin_id = p_maskin_id))', 'AND false)');
  IF d2 = d THEN RAISE EXCEPTION 'helikopter_ny_maskin: rapp-villkoret hittades inte'; END IF;
  EXECUTE d2;
END
$mig$;
