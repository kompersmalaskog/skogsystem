-- AUTO-IFYLLNING dim_objekt <- objekt: + grot_anpassad, + bolag, + "manuell"-provenans.
-- Bygger vidare på 20260904_autofyll_dim_fran_trakt.sql (samma funktion, samma
-- triggers, samma provenanskolumn). Utrett 2026-09-12, Martins beslut.
--
-- 1. GROT — TD-direktivet säger "GROT-anpassa avverkningen Ja/Nej" → objekt.grot.
--    Bara Ja fyller: dim_objekt.grot_anpassad := true, provenans {"grot_anpassad":"trakt"}.
--    Nej rör ALDRIG fältet: prod 2026-09-12 har 15 objekt där Martin satt ja mot
--    TD-Nej (Uggleboda, Tjuvön, Akelius Tåget …) — TD-frågan underskattar.
--    Bakåt: exakt 1 objekt ändras (Hallaslätt AU 2026, vo 11249883), se steg 5.
-- 2. BOLAG — trakt-importen sätter objekt.bolag ('Vida' default); dim_objekt.bolag
--    kom från maskinfilen (SKYDDAD i importen sedan #157). Fylls bara när dim är
--    tomt. Prod i dag: 0 rader ändras (alla 44 kopplade har Vida på båda sidor);
--    första icke-Vida-trakten är fallet.
-- 3. PROVENANS FÖR BOOLESKA FÄLT — ett default-nej går inte att skilja från ett
--    manuellt nej. Rensa-triggern märker därför {"grot_anpassad":"manuell"} när
--    någon ANNAN än fyllningen ändrar fältet, och fyllningen hoppar över nycklar
--    med värdet 'manuell'. Så skriver en trakt-omimport aldrig över ett manuellt
--    nej med TD-Ja. Textfälten behåller regeln "tomt fylls" (borttagen nyckel).
--
-- STUBBEHANDLING ingår INTE: Rottne H8E skriver inte StumpTreatment i HPR
-- (verifierat i 3 filer + MOM), så ingen fil kan fylla det. Redigeringsvyn
-- visar säsongsregeln (lib/egenkontroll) som dämpat förslag, skriver aldrig.
--
-- Idempotent. Ingen tabellstruktur ändras. SECURITY DEFINER som förut.

-- ── 1. Fyllningen: + bolag, + grot_anpassad (bara Ja, aldrig över 'manuell') ─
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

  SELECT NULLIF(btrim(d.vo_nummer), '') INTO v_vo
    FROM dim_objekt d WHERE d.objekt_id = o.dim_objekt_id;
  IF v_vo IS NULL THEN v_vo := NULLIF(btrim(o.vo_nummer), ''); END IF;

  PERFORM set_config('app.autofyll', '1', true);

  UPDATE dim_objekt d
     SET skogsagare      = CASE WHEN NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL THEN o.markagare       ELSE d.skogsagare      END,
         inkopare        = CASE WHEN NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL THEN o.inkopare        ELSE d.inkopare        END,
         avverkningsform = CASE WHEN NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL THEN o.avverkningsform ELSE d.avverkningsform END,
         bolag           = CASE WHEN NULLIF(btrim(d.bolag), '')           IS NULL AND NULLIF(btrim(o.bolag), '')           IS NOT NULL THEN o.bolag           ELSE d.bolag           END,
         -- GROT: bara TD-Ja, bara när fältet inte redan är ja, aldrig över ett manuellt beslut.
         grot_anpassad   = CASE WHEN o.grot IS TRUE AND d.grot_anpassad IS DISTINCT FROM TRUE AND (d.auto_ifyllt->>'grot_anpassad') IS DISTINCT FROM 'manuell' THEN TRUE ELSE d.grot_anpassad END,
         auto_ifyllt     = d.auto_ifyllt
           || CASE WHEN NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL THEN '{"skogsagare":"trakt"}'::jsonb      ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL THEN '{"inkopare":"trakt"}'::jsonb        ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL THEN '{"avverkningsform":"trakt"}'::jsonb ELSE '{}'::jsonb END
           || CASE WHEN NULLIF(btrim(d.bolag), '')           IS NULL AND NULLIF(btrim(o.bolag), '')           IS NOT NULL THEN '{"bolag":"trakt"}'::jsonb           ELSE '{}'::jsonb END
           || CASE WHEN o.grot IS TRUE AND d.grot_anpassad IS DISTINCT FROM TRUE AND (d.auto_ifyllt->>'grot_anpassad') IS DISTINCT FROM 'manuell' THEN '{"grot_anpassad":"trakt"}'::jsonb ELSE '{}'::jsonb END
   WHERE (d.objekt_id = o.dim_objekt_id OR (v_vo IS NOT NULL AND btrim(d.vo_nummer) = v_vo))
     AND (   (NULLIF(btrim(d.skogsagare), '')      IS NULL AND NULLIF(btrim(o.markagare), '')       IS NOT NULL)
          OR (NULLIF(btrim(d.inkopare), '')        IS NULL AND NULLIF(btrim(o.inkopare), '')        IS NOT NULL)
          OR (NULLIF(btrim(d.avverkningsform), '') IS NULL AND NULLIF(btrim(o.avverkningsform), '') IS NOT NULL)
          OR (NULLIF(btrim(d.bolag), '')           IS NULL AND NULLIF(btrim(o.bolag), '')           IS NOT NULL)
          OR (o.grot IS TRUE AND d.grot_anpassad IS DISTINCT FROM TRUE AND (d.auto_ifyllt->>'grot_anpassad') IS DISTINCT FROM 'manuell'));
  GET DIAGNOSTICS v_antal = ROW_COUNT;

  PERFORM set_config('app.autofyll', '', true);
  RETURN v_antal;
END;
$$;

-- ── 2. Rensa-triggern: textfält → nyckeln bort (tomt får fyllas igen);
--       booleskt fält → nyckeln blir 'manuell' (fyllningen håller sig borta) ──
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
  IF NEW.bolag           IS DISTINCT FROM OLD.bolag           THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'bolag';           END IF;
  IF NEW.grot_anpassad   IS DISTINCT FROM OLD.grot_anpassad   THEN NEW.auto_ifyllt := NEW.auto_ifyllt || '{"grot_anpassad":"manuell"}'::jsonb; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dim_objekt_rensa_auto_ifyllt ON dim_objekt;
CREATE TRIGGER dim_objekt_rensa_auto_ifyllt
  BEFORE UPDATE OF skogsagare, inkopare, avverkningsform, bolag, grot_anpassad ON dim_objekt
  FOR EACH ROW
  EXECUTE FUNCTION dim_objekt_rensa_auto_ifyllt();

-- ── 3. Objekt-triggern fyrar även när trakt-importen ändrar grot eller bolag ─
DROP TRIGGER IF EXISTS objekt_autofyll_dim ON objekt;
CREATE TRIGGER objekt_autofyll_dim
  AFTER INSERT OR UPDATE OF markagare, inkopare, avverkningsform, bolag, grot, vo_nummer, dim_objekt_id ON objekt
  FOR EACH ROW
  EXECUTE FUNCTION objekt_autofyll_dim();

-- (dim_objekt_autofyll_fran_trakt på dim_objekt INSERT / UPDATE OF vo_nummer är oförändrad.)

COMMENT ON COLUMN dim_objekt.auto_ifyllt IS
  'Provenans per fält: "trakt" = fyllt ur trakt-importen (objekt-tabellen); "manuell" (booleska fält) = ändrat av någon annan än fyllningen, fylls aldrig igen. Textfält tappar nyckeln när de ändras.';

-- ── 4. FÖRHANDSVISNING (read-only) — kör FÖRE steg 5 ─────────────────────────
-- Vilka dim-rader skulle ändras, och hur:
--   SELECT o.vo_nummer, o.namn, d.objekt_id,
--          CASE WHEN o.grot IS TRUE AND d.grot_anpassad IS DISTINCT FROM TRUE AND (d.auto_ifyllt->>'grot_anpassad') IS DISTINCT FROM 'manuell' THEN 'grot_anpassad: nej → ja' END AS grot,
--          CASE WHEN NULLIF(btrim(d.bolag), '') IS NULL AND NULLIF(btrim(o.bolag), '') IS NOT NULL THEN 'bolag: tomt → ' || o.bolag END AS bolag
--     FROM objekt o
--     JOIN dim_objekt d ON d.objekt_id = o.dim_objekt_id
--                      OR (o.dim_objekt_id IS NULL AND NULLIF(btrim(o.vo_nummer), '') IS NOT NULL AND btrim(d.vo_nummer) = btrim(o.vo_nummer))
--    WHERE (o.grot IS TRUE AND d.grot_anpassad IS DISTINCT FROM TRUE AND (d.auto_ifyllt->>'grot_anpassad') IS DISTINCT FROM 'manuell')
--       OR (NULLIF(btrim(d.bolag), '') IS NULL AND NULLIF(btrim(o.bolag), '') IS NOT NULL)
--    ORDER BY o.vo_nummer;
-- Väntat 2026-09-12: EN rad — 11249883 Hallaslätt AU 2026, grot_anpassad: nej → ja. Bolag: ingen.

-- ── 5. ENGÅNGS-BACKFILL (körs separat, EFTER Martins OK på förhandsvisningen) ─
--   SELECT o.vo_nummer, o.namn, fyll_dim_fran_trakt(o.id) AS fyllda_rader
--     FROM objekt o ORDER BY o.vo_nummer;
-- Idempotent — text-/bolagsfält som redan är ifyllda rörs inte, grot bara TD-Ja.
