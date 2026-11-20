-- Auto-avslut av skotning: 14 -> 30 dagar. 2026-09-12.
--
-- Skotaren kommer ofta mer än två veckor efter skördaren; med 14 dagar stängdes
-- objekt som bara väntade på skotaren. Cron-jobbet i prod kör redan
-- helikopter_auto_avslut_skotning(CURRENT_DATE, 30) — här följer funktionens
-- default och cron-raden i repot efter. Konstanten i appen:
-- app/helikopter/_lib/trosklar.ts AUTO_AVSLUT_DAGAR = 30.
-- Kroppen är oförändrad från 20260909100000.
CREATE OR REPLACE FUNCTION helikopter_auto_avslut_skotning(p_idag date DEFAULT CURRENT_DATE, p_dagar int DEFAULT 30)
RETURNS TABLE (objekt_id text, object_name text, senast_produktion date, senast_lass date)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH kand AS (
    SELECT d.objekt_id, d.object_name,
           (SELECT max(p.datum) FROM fakt_produktion p WHERE p.objekt_id = d.objekt_id) AS sp,
           (SELECT max(l.datum) FROM fakt_lass l WHERE l.objekt_id = d.objekt_id) AS sl
    FROM dim_objekt d
    WHERE d.skotning_avslutad IS NULL AND COALESCE(d.skotning_avslutad_auto, false) = false),
  stang AS (
    UPDATE dim_objekt d
       SET skotning_avslutad_auto = true
      FROM kand k
     WHERE d.objekt_id = k.objekt_id
       AND k.sp IS NOT NULL AND k.sp < p_idag - p_dagar
       AND COALESCE(k.sl, DATE '1900-01-01') < p_idag - p_dagar
    RETURNING d.objekt_id, k.object_name, k.sp, k.sl)
  SELECT * FROM stang ORDER BY 2;
$$;
REVOKE ALL ON FUNCTION helikopter_auto_avslut_skotning(date, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION helikopter_auto_avslut_skotning(date, int) TO service_role;

-- Nattlig körning 03:20 UTC. Namngivet jobb = upsert; dagtalet står explicit i kommandot.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('helikopter_auto_avslut_skotning', '20 3 * * *', 'SELECT public.helikopter_auto_avslut_skotning(CURRENT_DATE, 30)');
  END IF;
END $$;
