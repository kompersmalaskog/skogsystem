-- Rollen 'chef' tas bort ur databasen: bara 'forare' och 'admin' finns (samma som ar_admin()).
-- Produktion har 2 admin och 5 forare, ingen chef. Appen slutade kontrollera mot 'chef' i #722.
--
-- Innehaller: (1) en vakt som avbryter om nagon har rollen chef, (2) CHECK-constrainten pa medarbetare.roll,
-- (3) tre funktioner som namnde chef: ar_godkannare (ledighetens godkannare), helikopter_notis_vecka och
-- kö_atk_återställning_notis. Funktionerna ar oforandrade i ovrigt (samma argument, SECURITY DEFINER och
-- search_path som idag). Kan koras om utan skada.

-- 1. Vakt: stoppa om nagon har rollen chef (da maste de andras forst).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.medarbetare WHERE roll = 'chef') THEN
    RAISE EXCEPTION 'Avbryter: det finns medarbetare med rollen chef. Satt deras roll till forare eller admin forst.';
  END IF;
END $$;

-- 2. CHECK-constrainten
ALTER TABLE public.medarbetare DROP CONSTRAINT IF EXISTS medarbetare_roll_check;
ALTER TABLE public.medarbetare ADD CONSTRAINT medarbetare_roll_check CHECK ((roll = ANY (ARRAY['forare'::text, 'admin'::text])));

-- 3a. Ledighetens godkannare
CREATE OR REPLACE FUNCTION public.ar_godkannare()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM medarbetare
    WHERE user_id = auth.uid() AND roll = 'admin'
  );
$function$;

-- 3b. Helikopterns veckolage-notis
CREATE OR REPLACE FUNCTION public.helikopter_notis_vecka(p_idag date DEFAULT CURRENT_DATE, p_manuell boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_mottagare_epost constant text[] := ARRAY['martin.lindqvist@kompersmalaskog.com', 'joacim.ringberg@kompersmalaskog.com'];
  c_typ             constant text   := 'helikopter_vecka';
  v_jwt_email text;
  v_roll      text;
  v_payload   jsonb;
  v_antal     int := 0;
  v_n         int;
  r           record;
BEGIN
  BEGIN
    v_jwt_email := (current_setting('request.jwt.claims', true)::json)->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_email := NULL;
  END;
  IF v_jwt_email IS NOT NULL THEN
    SELECT m.roll INTO v_roll FROM medarbetare m WHERE m.epost = v_jwt_email LIMIT 1;
    IF v_roll IS NULL OR v_roll <> 'admin' THEN
      RAISE EXCEPTION 'helikopter_notis_vecka: kräver admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_payload := helikopter_veckolage(p_idag);

  FOR r IN SELECT m.id FROM medarbetare m WHERE m.epost = ANY(c_mottagare_epost) LOOP
    IF p_manuell THEN
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at)
      VALUES (r.id, c_typ, v_payload || '{"manuell":true}'::jsonb, now());
      v_n := 1;
    ELSE
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at, datum)
      VALUES (r.id, c_typ, v_payload, now(), p_idag)
      ON CONFLICT (typ, mottagare_id, datum) WHERE datum IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_antal := v_antal + v_n;
  END LOOP;
  RETURN v_antal;
END;
$function$;

-- 3c. ATK-aterstallningens notis (triggerfunktion)
CREATE OR REPLACE FUNCTION public."kö_atk_återställning_notis"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_andrare_id  uuid;
  v_jwt_email   text;
  v_befintlig   uuid;
  v_skickas_at  timestamptz := now() + interval '5 minutes';
  v_payload     jsonb;
  v_mottagare   uuid;
  v_admin       uuid;
BEGIN
  IF NOT (OLD.status = 'godkand' AND NEW.status = 'bekräftad') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_jwt_email := (current_setting('request.jwt.claims', true)::json)->>'email';
    IF v_jwt_email IS NOT NULL THEN
      SELECT id INTO v_andrare_id
      FROM medarbetare WHERE epost = v_jwt_email LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_andrare_id := NULL;
  END;

  v_payload := jsonb_build_object(
    'medarbetare_id', NEW.medarbetare_id::text,
    'period', NEW.period,
    'val', NEW.val,
    'andrare_id', v_andrare_id::text
  );

  IF OLD.godkand_av IS NOT NULL AND OLD.godkand_av IS DISTINCT FROM v_andrare_id THEN
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
    FOR v_admin IN
      SELECT id FROM medarbetare
      WHERE roll = 'admin'
        AND id IS DISTINCT FROM v_andrare_id
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
$function$;
