-- Auto-ifyllning dim_objekt <- objekt: + huvudtyp och bolag. 2026-09-12.
--
-- Bakgrund: helikoptern räknar produktion på spåren via dim_objekt.huvudtyp och
-- dim_objekt.bolag. Trakt-importen har typ och bolag på objekt-raden, men
-- maskinfilernas dim_objekt-rad föds utan — produktionen hamnar då på
-- "utan typ eller bolag" tills någon rättar för hand (Hallaslätt 2026-09-12).
--
-- Samma regler som 20260904_autofyll_dim_fran_trakt:
--   * Bara TOMMA fält fylls. Ett ifyllt värde rörs aldrig.
--   * huvudtyp <- initcap(objekt.typ)  ('slutavverkning' -> 'Slutavverkning',
--     samma form som redigeringsvyns chip; alla läsare matchar lower(btrim()).
--   * bolag    <- objekt.bolag som det står ('Vida', 'Privat').
--   * Provenans i dim_objekt.auto_ifyllt ({"huvudtyp":"trakt","bolag":"trakt"}),
--     nollas när någon annan ändrar fältet (rensa-triggern).
--   * Fyrar i båda ordningarna: när dim_objekt-raden föds (Ponsse-importen,
--     trigger 4b — oförändrad) och när kopplingen sätts eller trakt-raden får
--     typ/bolag (trigger 4a, kolumnlistan utökad).
--
-- ENGÅNGSKÖRNINGEN (steg 4) — SELECT först, prod 2026-09-12:
--   57 objekt-rader, 147 dim_objekt-rader. 14 dim_objekt saknar huvudtyp
--   eller bolag; INGEN av dem har en kopplad objekt-rad (FK eller VO).
--   => 0 rader ändras i dag. Körningen är idempotent och står kvar så att
--   den täcker rader som kopplas mellan SELECT:en och migrationen.

-- ── 1. Fyllningen: + huvudtyp, bolag ────────────────────────────────────────
CREATE OR REPLACE FUNCTION fyll_dim_fran_trakt(p_objekt_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o          objekt%ROWTYPE;
  v_vo       text;
  v_typ      text;
  v_antal    integer := 0;
BEGIN
  SELECT * INTO o FROM objekt WHERE id = p_objekt_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Mål-VO: FK-radens vo om FK finns, annars objekt-radens vo. Hela VO-gruppen
  -- (skördar- + skotarrad) fylls, som GEMENSAMMA-fälten i redigeringsvyn.
  SELECT NULLIF(btrim(d.vo_nummer), '') INTO v_vo
    FROM dim_objekt d WHERE d.objekt_id = o.dim_objekt_id;
  IF v_vo IS NULL THEN v_vo := NULLIF(btrim(o.vo_nummer), ''); END IF;

  -- huvudtyp i samma form som redigeringsvyn skriver: 'Slutavverkning', 'Gallring', 'Grot'.
  v_typ := initcap(NULLIF(btrim(o.typ), ''));

  -- Flagga så BEFORE UPDATE-triggern (steg 2) inte nollar provenansen vi sätter.
  PERFORM set_config('app.autofyll', '1', true);

  UPDATE dim_objekt d
     SET skogsagare      = CASE WHEN NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL THEN o.markagare       ELSE d.skogsagare      END,
         inkopare        = CASE WHEN NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL THEN o.inkopare        ELSE d.inkopare        END,
         avverkningsform = CASE WHEN NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL THEN o.avverkningsform ELSE d.avverkningsform END,
         huvudtyp        = CASE WHEN NULLIF(btrim(d.huvudtyp), '')        IS NULL AND v_typ                                IS NOT NULL THEN v_typ             ELSE d.huvudtyp        END,
         bolag           = CASE WHEN NULLIF(btrim(d.bolag), '')           IS NULL AND NULLIF(btrim(o.bolag), '')           IS NOT NULL THEN btrim(o.bolag)    ELSE d.bolag           END,
         auto_ifyllt     = d.auto_ifyllt
           || CASE WHEN NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL THEN '{"skogsagare":"trakt"}'::jsonb      ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL THEN '{"inkopare":"trakt"}'::jsonb        ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL THEN '{"avverkningsform":"trakt"}'::jsonb ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.huvudtyp), '')        IS NULL AND v_typ                                IS NOT NULL THEN '{"huvudtyp":"trakt"}'::jsonb        ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.bolag), '')           IS NULL AND NULLIF(btrim(o.bolag), '')           IS NOT NULL THEN '{"bolag":"trakt"}'::jsonb           ELSE '{}'::jsonb END
   WHERE (d.objekt_id = o.dim_objekt_id OR (v_vo IS NOT NULL AND btrim(d.vo_nummer) = v_vo))
     -- rör bara rader där något faktiskt är tomt OCH trakten har värde (annars no-op, ingen uppdaterad_tid-stämpel i onödan)
     AND (   (NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL)
          OR (NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL)
          OR (NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL)
          OR (NULLIF(btrim(d.huvudtyp), '')        IS NULL AND v_typ                                IS NOT NULL)
          OR (NULLIF(btrim(d.bolag), '')           IS NULL AND NULLIF(btrim(o.bolag), '')           IS NOT NULL));
  GET DIAGNOSTICS v_antal = ROW_COUNT;

  PERFORM set_config('app.autofyll', '', true);
  RETURN v_antal;
END;
$$;

-- ── 2. Provenansen nollas när NÅGON ANNAN ändrar fältet: + huvudtyp, bolag ──
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
  IF NEW.huvudtyp        IS DISTINCT FROM OLD.huvudtyp        THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'huvudtyp';        END IF;
  IF NEW.bolag           IS DISTINCT FROM OLD.bolag           THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'bolag';           END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dim_objekt_rensa_auto_ifyllt ON dim_objekt;
CREATE TRIGGER dim_objekt_rensa_auto_ifyllt
  BEFORE UPDATE OF skogsagare, inkopare, avverkningsform, huvudtyp, bolag ON dim_objekt
  FOR EACH ROW
  EXECUTE FUNCTION dim_objekt_rensa_auto_ifyllt();

-- ── 3. Trigger 4a: trakt-raden får typ/bolag, eller kopplingen sätts ────────
-- (Funktionen objekt_autofyll_dim är oförändrad; bara kolumnlistan växer.
--  Trigger 4b på dim_objekt — INSERT eller VO-ändring — täcker Ponsse-importen
--  oförändrad: den anropar samma fyll_dim_fran_trakt.)
DROP TRIGGER IF EXISTS objekt_autofyll_dim ON objekt;
CREATE TRIGGER objekt_autofyll_dim
  AFTER INSERT OR UPDATE OF markagare, inkopare, avverkningsform, typ, bolag, vo_nummer, dim_objekt_id ON objekt
  FOR EACH ROW
  EXECUTE FUNCTION objekt_autofyll_dim();

-- ── 4. Engångskörning för befintliga rader (0 rader i prod 2026-09-12, se ovan) ─
DO $$
DECLARE
  r        record;
  v_summa  integer := 0;
BEGIN
  FOR r IN SELECT o.id FROM objekt o ORDER BY o.vo_nummer LOOP
    v_summa := v_summa + fyll_dim_fran_trakt(r.id);
  END LOOP;
  RAISE NOTICE 'autofyll huvudtyp/bolag: % dim_objekt-rader fyllda', v_summa;
END $$;
