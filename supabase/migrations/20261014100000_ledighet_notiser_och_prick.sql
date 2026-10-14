-- Ledighet: två notiser (push) och en prick som alltid går att få bort.
--
-- Hakar på den BEFINTLIGA kanalen: rad i notis_kö -> /api/notis/flush (cron var 5:e minut) -> web-push.
-- Texten byggs färskt vid utskick i flush-rutten; här köas bara VEM och VILKEN ansökan.
--
-- 1. ledighet_ansokan  till alla admin UTOM den som ansökte, när en ansökan skapas med status 'väntar'.
-- 2. ledighet_beslut   till ägaren av ansökan, när status går 'väntar' -> 'godkänd' | 'nekad'.
--    Inget annat köar något: inte 'registrerad' (sjuk/VAB), inte ändring av en väntande, inte borttag,
--    inte en omkastad status.
--
-- NOTISFEL FÅR ALDRIG VÄLTA SKRIVNINGEN: notisinsatsen ligger i ett eget BEGIN ... EXCEPTION-block
-- (en delström som rullas tillbaka och sväljs). Ansökan och beslutet sparas alltid.
-- Den enda ändring av själva skrivningen är att beslutet också får sin tidpunkt (beslutad_at).
--
-- Pricken ("kräver din handling", inte "något har hänt"):
--   godkännare: antal väntande ansökningar (samma regel som "N att godkänna" i vyn)
--   anställd:   egna beslut (godkänd/nekad) med beslutad_at > medarbetare.ledighet_sett_at
-- ledighet_sett_at sätts av ledighet_markera_sett(p_till) när Mig-vyn har LÄST ansökningarna utan fel och visat
-- de nya besluten (grupp "Nytt besked"); kvitteringen avgränsas till det som visades (p_till).
-- Alla får sett = migrationstidpunkten, och gamla rader har beslutad_at NULL — ingen får en prick vid släppet.
--
-- Additiv och idempotent (kan köras om; CREATE OR REPLACE TRIGGER, Postgres 14+, så inget DROP behövs). Rollback längst ner.

-- 1. Beslutstidpunkt och "sett"
ALTER TABLE public.ledighet_ansokningar ADD COLUMN IF NOT EXISTS beslutad_at timestamptz;
ALTER TABLE public.medarbetare ADD COLUMN IF NOT EXISTS ledighet_sett_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.ledighet_ansokningar.beslutad_at IS
  'När väntar -> godkänd/nekad. Satt av trg_ledighet_beslutad. NULL för gamla rader och för allt som aldrig varit väntande.';
COMMENT ON COLUMN public.medarbetare.ledighet_sett_at IS
  'När personen senast öppnade ledighetsvyn och läste sina ansökningar (ledighet_markera_sett). Pricken räknar beslut efter detta.';

-- 2. Beslutstidpunkten sätts i SAMMA skrivning som beslutet
CREATE OR REPLACE FUNCTION public.ledighet_satt_beslutad() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'väntar' AND NEW.status IN ('godkänd', 'nekad') THEN
    NEW.beslutad_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_ledighet_beslutad BEFORE UPDATE ON public.ledighet_ansokningar
  FOR EACH ROW EXECUTE FUNCTION public.ledighet_satt_beslutad();

-- 3. Köa notisen — best-effort. SECURITY DEFINER eftersom notis_kö bara är skrivbar för admin.
CREATE OR REPLACE FUNCTION public."kö_ledighet_notis"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status = 'väntar' THEN
        INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
        SELECT m.id, 'ledighet_ansokan', jsonb_build_object('ansokan_id', NEW.id::text), now(), NEW.id::text
        FROM medarbetare m
        WHERE m.roll = 'admin' AND m.id IS DISTINCT FROM NEW.medarbetare_id
        ON CONFLICT (typ, mottagare_id, dedup_nyckel) DO NOTHING;
      END IF;
    ELSIF OLD.status = 'väntar' AND NEW.status IN ('godkänd', 'nekad') THEN
      INSERT INTO notis_kö (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      VALUES (NEW.medarbetare_id, 'ledighet_beslut',
              jsonb_build_object('ansokan_id', NEW.id::text, 'status', NEW.status),
              now(), NEW.id::text || '|' || NEW.status)
      ON CONFLICT (typ, mottagare_id, dedup_nyckel) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kö_ledighet_notis: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER "trg_kö_ledighet_notis" AFTER INSERT OR UPDATE ON public.ledighet_ansokningar
  FOR EACH ROW EXECUTE FUNCTION public."kö_ledighet_notis"();

-- 4. Pricken: räknas på servern ur auth.uid(). Anställd ser bara sitt eget; bara godkännare får en siffra för väntande.
--    Returnerar också VILKA beslut som är nya (så vyn kan visa dem) och tidpunkten för det senaste, så att
--    kvitteringen kan avgränsas till det som faktiskt visades.
CREATE OR REPLACE FUNCTION public.ledighet_prick() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH nya AS (
    SELECT la.id, la.beslutad_at
    FROM ledighet_ansokningar la
    JOIN medarbetare m ON m.id = la.medarbetare_id
    WHERE m.user_id = auth.uid()
      AND la.status IN ('godkänd', 'nekad')
      AND la.beslutad_at IS NOT NULL
      AND la.beslutad_at > m.ledighet_sett_at
  )
  SELECT jsonb_build_object(
    'att_godkanna', CASE WHEN ar_godkannare()
                         THEN (SELECT count(*) FROM ledighet_ansokningar WHERE status = 'väntar')
                         ELSE 0 END,
    'nya_beslut', (SELECT count(*) FROM nya),
    'nya_beslut_ids', (SELECT coalesce(jsonb_agg(id ORDER BY beslutad_at), '[]'::jsonb) FROM nya),
    'nya_beslut_till', (SELECT max(beslutad_at) FROM nya)
  );
$$;

-- Kvittera beslut t.o.m. p_till (= nya_beslut_till ur ledighet_prick). Aldrig framåt i tiden, aldrig bakåt.
CREATE OR REPLACE FUNCTION public.ledighet_markera_sett(p_till timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE medarbetare
     SET ledighet_sett_at = greatest(ledighet_sett_at, least(p_till, now()))
   WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.ledighet_prick(), public.ledighet_markera_sett(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledighet_prick(), public.ledighet_markera_sett(timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Kontroll (kör efteråt) ───────────────────────────────────────────────────────────────────────────
-- select tgname from pg_trigger where tgrelid = 'public.ledighet_ansokningar'::regclass and not tgisinternal;
--   -> trg_ledighet_beslutad, trg_kö_ledighet_notis
-- select proname from pg_proc where proname in ('ledighet_prick','ledighet_markera_sett') and pronamespace = 'public'::regnamespace;  -- 2 rader
--
-- ── Rollback ─────────────────────────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS "trg_kö_ledighet_notis" ON public.ledighet_ansokningar;
-- DROP TRIGGER IF EXISTS trg_ledighet_beslutad ON public.ledighet_ansokningar;
-- DROP FUNCTION IF EXISTS public."kö_ledighet_notis"(), public.ledighet_satt_beslutad(),
--                         public.ledighet_prick(), public.ledighet_markera_sett(timestamptz);
-- ALTER TABLE public.ledighet_ansokningar DROP COLUMN IF EXISTS beslutad_at;
-- ALTER TABLE public.medarbetare DROP COLUMN IF EXISTS ledighet_sett_at;
-- (Köade ledighet_*-rader i notis_kö: delete from notis_kö where typ in ('ledighet_ansokan','ledighet_beslut') and skickad_at is null;)
