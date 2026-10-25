-- AVSLUT UR MASKINDATA, del 4 av 4: körs varje timme (minut 25, när timmens filer hunnit in).
-- Namngivet jobb = upsert, så filen går att köra om.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('avslut_ur_maskindata', '25 * * * *', 'SELECT count(*) FROM public.avslut_ur_maskindata(true)');
  END IF;
END $$;
