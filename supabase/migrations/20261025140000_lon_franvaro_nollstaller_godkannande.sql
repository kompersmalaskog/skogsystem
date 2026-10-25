-- Ändrad frånvaro nollställer förarens godkännande, precis som en ändrad dag (Martin 2026-10-25).
--
-- Bygger på 20261021181920_lon_forarens_godkannande.sql: triggrarna där ligger på arbetsdag och extra_tid, men frånvaron
-- (ledighet_ansokningar) ändrar lönen lika mycket — månadens ordinarie (och därmed övertid/timlön), helglönen (§10 mom 4) och
-- hemskickad fyllnad. Lades sjuk in efter att föraren godkänt stod godkännandet kvar och Fortnox fick siffror han aldrig sett.
--
-- Regeln:
--  * Bara rader som GÄLLER räknas, samma som lönen läser (lib/franvaro FRANVARO_STATUS_GALLER: 'godkänd', 'registrerad').
--    En ansökan som väntar eller nekas ändrar inte lönen; att den godkänns (väntar → godkänd) eller tas tillbaka
--    (godkänd → nekad/borttagen) gör det.
--  * Bara lönerelevanta kolumner: medarbetare, typ, startdatum, slutdatum, fran_tid, till_tid, ersatter_datum. Inte kommentar,
--    kalla, beslutad_at m.m. Ändras inget av det (IS DISTINCT FROM) händer inget.
--  * Varje ARBETSmånad perioden rör nollställs (en semester 28 sep–2 okt rör både september och oktober), för den gamla OCH den
--    nya versionen av raden. Tjänstledighet påverkar helglönen för en röd dag som den OMGER (närmaste vardag före/efter, över
--    månadsskiftet), så för tjänstledig räknas perioden ±10 dagar — samma marginal som loneunderlag.ts läser frånvaro med.
--  * Själva nollställningen, notisen och "redan skickad"-märkningen är lon_nollstall_godkannande, oförändrad. Dagen som anges
--    är periodens första dag inom månaden.
--  * Ett fel här får ALDRIG välta skrivningen av ledigheten (eget BEGIN … EXCEPTION).
--
-- Additiv och idempotent. Rollback längst ner.

CREATE OR REPLACE FUNCTION public.ledighet_nollstall_manader(p_med uuid, p_typ text, p_fran date, p_till date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fran date;
  v_till date;
  v_manad date;
  v_n int := 0;
BEGIN
  IF p_med IS NULL OR p_fran IS NULL THEN RETURN; END IF;
  v_fran := p_fran;
  v_till := coalesce(p_till, p_fran);
  IF v_till < v_fran THEN v_till := v_fran; END IF;
  IF p_typ = 'tjanstledig' THEN
    v_fran := v_fran - 10;
    v_till := v_till + 10;
  END IF;
  v_manad := date_trunc('month', v_fran)::date;
  -- Högst 36 månader: en felskriven period (år 2062) ska inte loopa i evighet.
  WHILE v_manad <= v_till AND v_n < 36 LOOP
    PERFORM lon_nollstall_godkannande(p_med, greatest(v_fran, v_manad));
    v_manad := (v_manad + interval '1 month')::date;
    v_n := v_n + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ledighet_nollstall_godkannande() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gamla boolean := false;
  v_nya boolean := false;
BEGIN
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_gamla := coalesce(OLD.status IN ('godkänd', 'registrerad'), false); END IF;
    IF TG_OP IN ('UPDATE', 'INSERT') THEN v_nya := coalesce(NEW.status IN ('godkänd', 'registrerad'), false); END IF;

    IF TG_OP = 'UPDATE' AND v_gamla = v_nya AND (NOT v_gamla OR
         (OLD.medarbetare_id, OLD.typ, OLD.startdatum, OLD.slutdatum, OLD.fran_tid, OLD.till_tid, OLD.ersatter_datum)
         IS NOT DISTINCT FROM
         (NEW.medarbetare_id, NEW.typ, NEW.startdatum, NEW.slutdatum, NEW.fran_tid, NEW.till_tid, NEW.ersatter_datum)) THEN
      RETURN NULL;  -- inget som lönen läser har ändrats
    END IF;

    IF v_gamla THEN PERFORM ledighet_nollstall_manader(OLD.medarbetare_id, OLD.typ, OLD.startdatum, OLD.slutdatum); END IF;
    IF v_nya THEN PERFORM ledighet_nollstall_manader(NEW.medarbetare_id, NEW.typ, NEW.startdatum, NEW.slutdatum); END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ledighet_nollstall_godkannande: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

CREATE OR REPLACE TRIGGER trg_ledighet_nollstall_godkannande AFTER INSERT OR UPDATE OR DELETE ON public.ledighet_ansokningar
  FOR EACH ROW EXECUTE FUNCTION public.ledighet_nollstall_godkannande();

REVOKE ALL ON FUNCTION public.ledighet_nollstall_manader(uuid, text, date, date), public.ledighet_nollstall_godkannande()
  FROM PUBLIC, anon, authenticated;

-- ── Kontroll (kör efteråt) ───────────────────────────────────────────────────────────────────────────────
-- select tgname from pg_trigger where tgname = 'trg_ledighet_nollstall_godkannande' and not tgisinternal;  -- 1 rad
--
-- ── Rollback ─────────────────────────────────────────────────────────────────────────────────────────────
-- (kör DROP utanför Supabase-MCP:n — den hänger på destruktiva satser)
-- DROP TRIGGER IF EXISTS trg_ledighet_nollstall_godkannande ON public.ledighet_ansokningar;
-- DROP FUNCTION IF EXISTS public.ledighet_nollstall_godkannande(), public.ledighet_nollstall_manader(uuid, text, date, date);
