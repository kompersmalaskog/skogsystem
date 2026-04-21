-- Nightly sync av Fortnox-verifikat via pg_cron → pg_net.
-- Kräver två secrets i Vault (manuell inläggning via Supabase dashboard):
--   fortnox_sync_url    = https://skogsystem.vercel.app/api/fortnox/sync-vouchers
--   fortnox_sync_secret = <samma värde som env-var FORTNOX_SYNC_SECRET på Vercel>
--
-- Om secrets saknas blir schedule skapat men job body failar tyst — kolla
-- cron.job_run_details för fel.

CREATE OR REPLACE FUNCTION fortnox_kör_sync()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  url text;
  secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO url FROM vault.decrypted_secrets WHERE name = 'fortnox_sync_url' LIMIT 1;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'fortnox_sync_secret' LIMIT 1;
  IF url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'fortnox_kör_sync: saknar vault-secrets fortnox_sync_url eller fortnox_sync_secret';
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := jsonb_build_object('source', 'pg_cron')
  ) INTO request_id;
  RETURN request_id;
END;
$$;

-- Schemalägg 02:00 UTC dagligen. Avplanera befintligt jobb med samma namn.
DO $$
BEGIN
  PERFORM cron.unschedule('fortnox-nightly-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'fortnox-nightly-sync',
  '0 2 * * *',
  'SELECT fortnox_kör_sync();'
);
