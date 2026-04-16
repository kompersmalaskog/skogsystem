-- ATK-notisflöde: spara vem som godkände, kö-tabell + trigger som köar
-- notis när godkänt val återställs. 5-minuters debounce per (mottagare,
-- typ, medarbetare, period) — flera återställningar inom 5 min slås ihop.

/* 1. Spåra vem som godkände och när */
ALTER TABLE atk_val ADD COLUMN IF NOT EXISTS godkand_av text;
ALTER TABLE atk_val ADD COLUMN IF NOT EXISTS godkand_at timestamptz;

/* 2. Notis-kö */
CREATE TABLE IF NOT EXISTS notis_kö (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mottagare_id text NOT NULL,
  typ text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  skapad_at timestamptz NOT NULL DEFAULT now(),
  skickas_at timestamptz NOT NULL,
  skickad_at timestamptz,
  fel_meddelande text
);

CREATE INDEX IF NOT EXISTS notis_ko_pending_idx
  ON notis_kö (skickas_at)
  WHERE skickad_at IS NULL;

CREATE INDEX IF NOT EXISTS notis_ko_dedup_idx
  ON notis_kö (mottagare_id, typ)
  WHERE skickad_at IS NULL;

/* 3. Trigger som köar notis när atk_val går från 'godkand' till 'bekräftad' */
CREATE OR REPLACE FUNCTION kö_atk_återställning_notis()
RETURNS TRIGGER AS $$
DECLARE
  v_andrare_id  text;
  v_jwt_email   text;
  v_befintlig   uuid;
  v_skickas_at  timestamptz := now() + interval '5 minutes';
  v_payload     jsonb;
  v_mottagare   text;
  v_admin       text;
BEGIN
  -- Bara godkand → bekräftad
  IF NOT (OLD.status = 'godkand' AND NEW.status = 'bekräftad') THEN
    RETURN NEW;
  END IF;

  -- Försök hitta vem som triggade ändringen via Supabase JWT-claims
  BEGIN
    v_jwt_email := (current_setting('request.jwt.claims', true)::json)->>'email';
    IF v_jwt_email IS NOT NULL THEN
      SELECT id::text INTO v_andrare_id
      FROM medarbetare WHERE epost = v_jwt_email LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_andrare_id := NULL;
  END;

  v_payload := jsonb_build_object(
    'medarbetare_id', NEW.medarbetare_id::text,
    'period', NEW.period,
    'val', NEW.val,
    'andrare_id', v_andrare_id
  );

  /* Bestäm mottagare. Om godkand_av finns och inte är samma person som ändrade
     → en mottagare. Annars → alla med roll IN ('chef','admin') (utom andraren). */
  IF OLD.godkand_av IS NOT NULL AND OLD.godkand_av <> coalesce(v_andrare_id, '') THEN
    v_mottagare := OLD.godkand_av;
    SELECT id INTO v_befintlig FROM notis_kö
      WHERE mottagare_id = v_mottagare
        AND typ = 'atk_återställd'
        AND skickad_at IS NULL
        AND payload->>'medarbetare_id' = NEW.medarbetare_id::text
        AND payload->>'period' = NEW.period
      LIMIT 1;
    IF v_befintlig IS NOT NULL THEN
      UPDATE notis_kö SET skickas_at = v_skickas_at, payload = v_payload WHERE id = v_befintlig;
    ELSE
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at)
      VALUES (v_mottagare, 'atk_återställd', v_payload, v_skickas_at);
    END IF;
  ELSE
    -- Fallback: alla chef/admin utom andraren
    FOR v_admin IN
      SELECT id::text FROM medarbetare
      WHERE roll IN ('chef', 'admin')
        AND id::text <> coalesce(v_andrare_id, '')
    LOOP
      SELECT id INTO v_befintlig FROM notis_kö
        WHERE mottagare_id = v_admin
          AND typ = 'atk_återställd'
          AND skickad_at IS NULL
          AND payload->>'medarbetare_id' = NEW.medarbetare_id::text
          AND payload->>'period' = NEW.period
        LIMIT 1;
      IF v_befintlig IS NOT NULL THEN
        UPDATE notis_kö SET skickas_at = v_skickas_at, payload = v_payload WHERE id = v_befintlig;
      ELSE
        INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at)
        VALUES (v_admin, 'atk_återställd', v_payload, v_skickas_at);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kö_atk_notis ON atk_val;
CREATE TRIGGER trg_kö_atk_notis
AFTER UPDATE ON atk_val
FOR EACH ROW
EXECUTE FUNCTION kö_atk_återställning_notis();
