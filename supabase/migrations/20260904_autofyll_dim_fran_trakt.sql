-- B: AUTO-IFYLLNING dim_objekt <- objekt (trakt-importen). 2026-09-04.
--
-- Problem: fält Martin fyller i för hand i /redigering (markägare, inköpare,
-- avverkningsform) finns ofta redan i objekt-tabellen från trakt-importen, men
-- redigeringsvyn och nedströmsvyerna läser dim_objekt (maskinfiler), som saknar
-- dem. Prod 2026-08-29 (40 kopplade objekt): 1 markägare, 11 inköpare,
-- 6 avverkningsform fyllbara; 0 för VO/åtgärd (och 6+11 KROCKAR där = de får
-- ALDRIG auto-fyllas — olika vokabulär resp. olika personer).
--
-- REGLER (Martins beslut):
--   * Bara TOMMA fält fylls. Ett ifyllt värde rörs aldrig — ett tomt fält kan
--     per definition inte bära ett manuellt värde. Trakt-datan är förslag.
--   * Bara skogsagare (<- objekt.markagare), inkopare, avverkningsform.
--     ALDRIG vo_nummer (join-nyckeln; FK-länkade rader har legitimt olika VO,
--     Husjönäs) och ALDRIG atgard ("Gallring" vs "Första gallring").
--   * Ingen objekt-rad skapas (Etapp 0). Fyllning bara där kopplingen finns:
--     objekt.dim_objekt_id (FK) först, annars objekt.vo_nummer = dim_objekt.vo_nummer
--     — samma resolver som save-routern (lib/redigering/objektRouter.ts).
--   * Provenans: dim_objekt.auto_ifyllt jsonb, t.ex. {"skogsagare":"trakt"}.
--     Redigeringsvyn kan visa "ur trakt-import"; nyckeln NOLLAS automatiskt
--     när någon annan än fyllningen ändrar fältet (BEFORE UPDATE-trigger) —
--     ingen skrivare (router, import, SQL) behöver veta om provenansen.
--
-- VAR I FLÖDET: i databasen, inte i någon av importrarna. Två triggers täcker
-- båda ordningarna (trakt först / maskin först): de 15 planerade trakterna
-- utan maskindata fylls den dag skördaren kör och dim_objekt-raden föds.
-- Idempotent: körs den igen fyller den inget (allt är redan ifyllt).
--
-- Importens eget skydd (SKYDDADE_OBJEKTFALT, #157/#499) gör att en maskinfil
-- inte kan skriva över det som fyllts här.

-- ── 1. Provenans-kolumn ─────────────────────────────────────────────────────
ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS auto_ifyllt jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN dim_objekt.auto_ifyllt IS
  'Vilka fält som fyllts automatiskt ur trakt-importen (objekt-tabellen), t.ex. {"skogsagare":"trakt"}. Nyckeln tas bort när fältet ändras av någon annan än auto-ifyllningen.';

-- ── 2. Fyllningen ───────────────────────────────────────────────────────────
-- SECURITY DEFINER: triggern kan fyra från en förares insert i objekt (RLS)
-- eller från importens service-roll — fyllningen ska lyckas oavsett vem som
-- skrev. search_path låst (Supabase-praxis för DEFINER-funktioner).
CREATE OR REPLACE FUNCTION fyll_dim_fran_trakt(p_objekt_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o          objekt%ROWTYPE;
  v_vo       text;
  v_antal    integer := 0;
BEGIN
  SELECT * INTO o FROM objekt WHERE id = p_objekt_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Mål-VO: FK-radens vo om FK finns, annars objekt-radens vo. Hela VO-gruppen
  -- (skördar- + skotarrad) fylls, som GEMENSAMMA-fälten i redigeringsvyn.
  SELECT NULLIF(btrim(d.vo_nummer), '') INTO v_vo
    FROM dim_objekt d WHERE d.objekt_id = o.dim_objekt_id;
  IF v_vo IS NULL THEN v_vo := NULLIF(btrim(o.vo_nummer), ''); END IF;

  -- Flagga så BEFORE UPDATE-triggern (steg 3) inte nollar provenansen vi sätter.
  PERFORM set_config('app.autofyll', '1', true);

  UPDATE dim_objekt d
     SET skogsagare      = CASE WHEN NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL THEN o.markagare       ELSE d.skogsagare      END,
         inkopare        = CASE WHEN NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL THEN o.inkopare        ELSE d.inkopare        END,
         avverkningsform = CASE WHEN NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL THEN o.avverkningsform ELSE d.avverkningsform END,
         auto_ifyllt     = d.auto_ifyllt
           || CASE WHEN NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL THEN '{"skogsagare":"trakt"}'::jsonb      ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL THEN '{"inkopare":"trakt"}'::jsonb        ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL THEN '{"avverkningsform":"trakt"}'::jsonb ELSE '{}'::jsonb END
   WHERE (d.objekt_id = o.dim_objekt_id OR (v_vo IS NOT NULL AND btrim(d.vo_nummer) = v_vo))
     -- rör bara rader där något faktiskt är tomt OCH trakten har värde (annars no-op, ingen uppdaterad_tid-stämpel i onödan)
     AND (   (NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL)
          OR (NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL)
          OR (NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL));
  GET DIAGNOSTICS v_antal = ROW_COUNT;

  PERFORM set_config('app.autofyll', '', true);
  RETURN v_antal;
END;
$$;

-- ── 3. Provenansen nollas när NÅGON ANNAN ändrar fältet ─────────────────────
-- Fångar alla skrivare (redigeringsvyn via sparaFalt, importen, manuell SQL)
-- utan att någon av dem behöver känna till auto_ifyllt. Fyllningen själv
-- sätter app.autofyll='1' och undantas.
CREATE OR REPLACE FUNCTION dim_objekt_rensa_auto_ifyllt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.autofyll', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.skogsagare      IS DISTINCT FROM OLD.skogsagare      THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'skogsagare';      END IF;
  IF NEW.inkopare        IS DISTINCT FROM OLD.inkopare        THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'inkopare';        END IF;
  IF NEW.avverkningsform IS DISTINCT FROM OLD.avverkningsform THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'avverkningsform'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dim_objekt_rensa_auto_ifyllt ON dim_objekt;
CREATE TRIGGER dim_objekt_rensa_auto_ifyllt
  BEFORE UPDATE OF skogsagare, inkopare, avverkningsform ON dim_objekt
  FOR EACH ROW
  EXECUTE FUNCTION dim_objekt_rensa_auto_ifyllt();

-- ── 4. Triggers som startar fyllningen ──────────────────────────────────────
-- 4a. Trakt-importen skapar/uppdaterar objekt-raden (eller kopplingen ändras).
CREATE OR REPLACE FUNCTION objekt_autofyll_dim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM fyll_dim_fran_trakt(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS objekt_autofyll_dim ON objekt;
CREATE TRIGGER objekt_autofyll_dim
  AFTER INSERT OR UPDATE OF markagare, inkopare, avverkningsform, vo_nummer, dim_objekt_id ON objekt
  FOR EACH ROW
  EXECUTE FUNCTION objekt_autofyll_dim();

-- 4b. Maskindatan föder dim_objekt-raden (eller dess VO rättas så den matchar).
--     Hittar objekt-raden via FK eller vo och kör fyllningen för den.
CREATE OR REPLACE FUNCTION dim_objekt_autofyll_fran_trakt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT o.id FROM objekt o
     WHERE o.dim_objekt_id = NEW.objekt_id
        OR (NULLIF(btrim(NEW.vo_nummer), '') IS NOT NULL AND btrim(o.vo_nummer) = btrim(NEW.vo_nummer))
  LOOP
    PERFORM fyll_dim_fran_trakt(r.id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dim_objekt_autofyll_fran_trakt ON dim_objekt;
CREATE TRIGGER dim_objekt_autofyll_fran_trakt
  AFTER INSERT OR UPDATE OF vo_nummer ON dim_objekt
  FOR EACH ROW
  EXECUTE FUNCTION dim_objekt_autofyll_fran_trakt();

-- ── 5. ENGÅNGS-BACKFILL (körs separat, EFTER Martins OK på förhandsvisningen) ─
-- Förhandsvisning (read-only, 2026-09-04): 1 markägare + 11 inköpare +
-- 6 avverkningsform på 40 kopplade objekt. Kör:
--   SELECT o.vo_nummer, o.namn, fyll_dim_fran_trakt(o.id) AS fyllda_rader
--     FROM objekt o ORDER BY o.vo_nummer;
-- Idempotent — kan köras om utan effekt när allt är fyllt.
