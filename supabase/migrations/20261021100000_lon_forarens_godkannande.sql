-- Förarens godkännande styr Fortnox-exporten (Admin → Lön, Martin 2026-10-21).
--
-- Godkännandet är det som alltid funnits: loneunderlag.status = 'godkand_av_forare' (äldre rader 'inskickat'), en rad per förare och
-- ARBETSmånad (period "2026-09"). Exporten skickar bara förare som godkänt. Den här migrationen lägger till tre saker:
--
-- 1. NOLLSTÄLLNING. Ändras en dag i en godkänd månad — av föraren, av admin eller av en import — sätts loneunderlag.status till NULL (det
--    är så Arbetsrapport redan läser "inte godkänd": den visar Godkänn-knappen igen) och föraren får en ny notis (lon_andrad).
--    Triggrarna ligger på arbetsdag och extra_tid och reagerar bara på kolumner som påverkar lönen (inte på bekraftad, kommentar,
--    redigerad-flaggan eller objekt), och bara när ett värde faktiskt ändras (IS DISTINCT FROM). En dag som flyttas mellan månader
--    nollställer båda månaderna.
--    Notisen köas med skickas_at = 'infinity' (som ledighetsnotiserna): den GAMLA flush-koden på production skickar okända typer som
--    en generisk "Notis" + rå JSON, och väljer aldrig rader med skickas_at i framtiden. Den nya flushen tar typen oavsett skickas_at
--    och hoppar över allt köat för mer än 24 timmar sedan. Företagsledare får aldrig en notis.
--    NOTISFEL FÅR ALDRIG VÄLTA SKRIVNINGEN: allt ligger i ett eget BEGIN … EXCEPTION-block.
--
-- 2. KVITTERING av "Att kolla"-punkter (lon_kvittering): admin trycker "Ser rätt ut" på en punkt i förarens kort; den sparas med radens
--    text, och gäller bara så länge texten är densamma (ändras värdet i raden kvitteras den inte längre av sig själv).
--
-- 3. fortnox_export_logg.utan_forarens_godkannande: sätts bara när admin uttryckligen skickat EN förare som inte godkänt.
--
-- Additiv och idempotent. Rollback längst ner.

ALTER TABLE public.loneunderlag ADD COLUMN IF NOT EXISTS nollstalld_at timestamptz;
ALTER TABLE public.loneunderlag ADD COLUMN IF NOT EXISTS nollstalld_datum date;
COMMENT ON COLUMN public.loneunderlag.nollstalld_at IS 'När godkännandet nollställdes av en ändring i månaden (status sattes till NULL). Läs bara när status är NULL.';
COMMENT ON COLUMN public.loneunderlag.nollstalld_datum IS 'Vilken dag som ändrades när godkännandet nollställdes.';

ALTER TABLE public.fortnox_export_logg ADD COLUMN IF NOT EXISTS utan_forarens_godkannande boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.fortnox_export_logg.utan_forarens_godkannande IS 'Admin skickade just den här föraren utan att föraren godkänt månaden (uttryckligt val, en förare i taget).';

-- ── 1. Nollställning ────────────────────────────────────────────────────────────────────────────────────

-- Nollställer förarens godkännande för den månad dagen p_datum ligger i, och köar notisen. Gör ingenting om månaden inte är godkänd.
-- Nollställningen är det som räknas; notisen är best-effort och ligger i ett eget block, så ett notisfel (t.ex. en kö som inte går att
-- skriva) aldrig tar tillbaka nollställningen.
CREATE OR REPLACE FUNCTION public.lon_nollstall_godkannande(p_med uuid, p_datum date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period text;
  v_tid timestamptz;
BEGIN
  IF p_med IS NULL OR p_datum IS NULL THEN RETURN; END IF;
  UPDATE loneunderlag
     SET status = NULL, nollstalld_at = now(), nollstalld_datum = p_datum
   WHERE medarbetare_id = p_med::text
     AND period = to_char(p_datum, 'YYYY-MM')
     AND status IN ('godkand_av_forare', 'inskickat')
  RETURNING period, skickat_tidpunkt INTO v_period, v_tid;
  IF NOT FOUND THEN RETURN; END IF;

  BEGIN
    INSERT INTO "notis_kö" (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
    SELECT m.id, 'lon_andrad', jsonb_build_object('arbetsmanad', v_period, 'datum', p_datum), 'infinity'::timestamptz,
           -- En notis per godkännande-omgång: ett nytt godkännande får ny tidpunkt, så nästa ändring ger en ny notis.
           v_period || '|' || coalesce(extract(epoch FROM v_tid)::bigint::text, '0')
      FROM medarbetare m
     WHERE m.id = p_med AND coalesce(m.foretagsledare, false) = false
    ON CONFLICT (typ, mottagare_id, dedup_nyckel) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lon_nollstall_godkannande (notis): %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.arbetsdag_nollstall_godkannande() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM lon_nollstall_godkannande(NEW.medarbetare_id, NEW.datum);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM lon_nollstall_godkannande(OLD.medarbetare_id, OLD.datum);
    ELSIF (OLD.medarbetare_id, OLD.datum, OLD.dagtyp, OLD.start_tid, OLD.slut_tid, OLD.rast_min, OLD.km_morgon, OLD.km_kvall, OLD.km_totalt,
           OLD.maskin_id, OLD.traktamente, OLD.arbetad_min, OLD.brandrisk_beordrad, OLD.tidigarelagd_start)
          IS DISTINCT FROM
          (NEW.medarbetare_id, NEW.datum, NEW.dagtyp, NEW.start_tid, NEW.slut_tid, NEW.rast_min, NEW.km_morgon, NEW.km_kvall, NEW.km_totalt,
           NEW.maskin_id, NEW.traktamente, NEW.arbetad_min, NEW.brandrisk_beordrad, NEW.tidigarelagd_start) THEN
      PERFORM lon_nollstall_godkannande(OLD.medarbetare_id, OLD.datum);
      -- En dag som flyttas till en annan månad (eller en annan förare) ändrar även den månaden.
      IF (NEW.medarbetare_id, to_char(NEW.datum, 'YYYY-MM')) IS DISTINCT FROM (OLD.medarbetare_id, to_char(OLD.datum, 'YYYY-MM')) THEN
        PERFORM lon_nollstall_godkannande(NEW.medarbetare_id, NEW.datum);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'arbetsdag_nollstall_godkannande: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.extra_tid_nollstall_godkannande() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM lon_nollstall_godkannande(NEW.medarbetare_id, NEW.datum);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM lon_nollstall_godkannande(OLD.medarbetare_id, OLD.datum);
    ELSIF (OLD.medarbetare_id, OLD.datum, OLD.typ, OLD.minuter, OLD.debiterbar, OLD.start_tid, OLD.slut_tid, OLD.aktivitet_typ, OLD.rast_min)
          IS DISTINCT FROM
          (NEW.medarbetare_id, NEW.datum, NEW.typ, NEW.minuter, NEW.debiterbar, NEW.start_tid, NEW.slut_tid, NEW.aktivitet_typ, NEW.rast_min) THEN
      PERFORM lon_nollstall_godkannande(OLD.medarbetare_id, OLD.datum);
      IF (NEW.medarbetare_id, to_char(NEW.datum, 'YYYY-MM')) IS DISTINCT FROM (OLD.medarbetare_id, to_char(OLD.datum, 'YYYY-MM')) THEN
        PERFORM lon_nollstall_godkannande(NEW.medarbetare_id, NEW.datum);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'extra_tid_nollstall_godkannande: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

-- AFTER-triggrar: de ser det slutliga värdet (extra_tid har en BEFORE-trigger som räknar netto-minuter).
CREATE OR REPLACE TRIGGER trg_arbetsdag_nollstall_godkannande AFTER INSERT OR UPDATE OR DELETE ON public.arbetsdag
  FOR EACH ROW EXECUTE FUNCTION public.arbetsdag_nollstall_godkannande();
CREATE OR REPLACE TRIGGER trg_extra_tid_nollstall_godkannande AFTER INSERT OR UPDATE OR DELETE ON public.extra_tid
  FOR EACH ROW EXECUTE FUNCTION public.extra_tid_nollstall_godkannande();

REVOKE ALL ON FUNCTION public.lon_nollstall_godkannande(uuid, date), public.arbetsdag_nollstall_godkannande(), public.extra_tid_nollstall_godkannande()
  FROM PUBLIC, anon, authenticated;

-- ── 2. Kvittering av "Att kolla" ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lon_kvittering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medarbetare_id uuid NOT NULL REFERENCES public.medarbetare(id) ON DELETE CASCADE,
  period text NOT NULL,        -- ARBETSmånad (YYYY-MM), som loneunderlag.period
  punkt text NOT NULL,         -- radens id i Löneunderlag, t.ex. 'orim-2026-09-10'
  text text NOT NULL,          -- raden så som den såg ut när den kvitterades: ändras texten gäller kvitteringen inte längre
  kvitterad_av uuid REFERENCES public.medarbetare(id) ON DELETE SET NULL,
  kvitterad_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (medarbetare_id, period, punkt)
);
ALTER TABLE public.lon_kvittering ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lon_kvittering_admin ON public.lon_kvittering;
CREATE POLICY lon_kvittering_admin ON public.lon_kvittering FOR ALL TO authenticated USING (ar_admin()) WITH CHECK (ar_admin());
REVOKE ALL ON public.lon_kvittering FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lon_kvittering TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Kontroll (kör efteråt) ───────────────────────────────────────────────────────────────────────────────
-- select tgname from pg_trigger where tgname in ('trg_arbetsdag_nollstall_godkannande','trg_extra_tid_nollstall_godkannande') and not tgisinternal;  -- 2 rader
-- select column_name from information_schema.columns where table_name = 'loneunderlag' and column_name like 'nollstalld%';                         -- 2 rader
-- select to_regclass('public.lon_kvittering');
--
-- ── Rollback ─────────────────────────────────────────────────────────────────────────────────────────────
-- (kör DROP TRIGGER utanför Supabase-MCP:n — den hänger i 60 s på destruktiva satser)
-- DROP TRIGGER IF EXISTS trg_arbetsdag_nollstall_godkannande ON public.arbetsdag;
-- DROP TRIGGER IF EXISTS trg_extra_tid_nollstall_godkannande ON public.extra_tid;
-- DROP FUNCTION IF EXISTS public.arbetsdag_nollstall_godkannande(), public.extra_tid_nollstall_godkannande(), public.lon_nollstall_godkannande(uuid, date);
-- DROP TABLE IF EXISTS public.lon_kvittering;
-- ALTER TABLE public.loneunderlag DROP COLUMN IF EXISTS nollstalld_at, DROP COLUMN IF EXISTS nollstalld_datum;
-- ALTER TABLE public.fortnox_export_logg DROP COLUMN IF EXISTS utan_forarens_godkannande;
-- (Köade lon_andrad-rader: delete from "notis_kö" where typ = 'lon_andrad' and skickad_at is null;)
