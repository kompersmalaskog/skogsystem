-- Daglig sync för fordons-påminnelser. Kör 06:00 UTC (kompromiss mellan
-- sommar- och vintertid). Kräver vault-secrets:
--   fordon_notify_url    = https://<app>/api/fordon/notify-pamin
--   fordon_notify_secret = samma som FORDON_NOTIFY_SECRET på Vercel

CREATE OR REPLACE FUNCTION fordon_kör_notify()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  url text;
  secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO url FROM vault.decrypted_secrets WHERE name = 'fordon_notify_url' LIMIT 1;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'fordon_notify_secret' LIMIT 1;
  IF url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'fordon_kör_notify: saknar vault-secrets fordon_notify_url eller fordon_notify_secret';
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
BEGIN
  PERFORM cron.unschedule('fordon-daily-notify');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'fordon-daily-notify',
  '0 6 * * *',
  'SELECT fordon_kör_notify();'
);
