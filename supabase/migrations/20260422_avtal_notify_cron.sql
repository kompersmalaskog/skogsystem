-- Daglig sync för avtals-påminnelser. 06:05 UTC (5 min efter fordon-notify).
-- Kräver vault-secrets avtal_notify_url och avtal_notify_secret.

CREATE OR REPLACE FUNCTION avtal_kör_notify()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  url text;
  secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO url FROM vault.decrypted_secrets WHERE name = 'avtal_notify_url' LIMIT 1;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'avtal_notify_secret' LIMIT 1;
  IF url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'avtal_kör_notify: saknar vault-secrets avtal_notify_url eller avtal_notify_secret';
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

DO $$
BEGIN PERFORM cron.unschedule('avtal-daily-notify');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'avtal-daily-notify',
  '5 6 * * *',
  'SELECT avtal_kör_notify();'
);
