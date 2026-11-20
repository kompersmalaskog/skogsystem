-- Push-prenumerationer per enhet. Tidigare låg en enda JSON-sträng i
-- medarbetare.push_subscription, vilket skrev över när man installerade PWA
-- på en ny enhet. Nu: en rad per enhet, unik på endpoint.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medarbetare_id uuid NOT NULL,
  endpoint       text NOT NULL UNIQUE,
  subscription   jsonb NOT NULL,
  device_name    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_medarbetare_idx
  ON push_subscriptions (medarbetare_id);
