-- Redigering: appen fyller i det den är säker på (Martin 2026-10-23: "allt som är säkert"). 2026-10-23.
--
-- Bakgrund: Redigering är verkstaden för det automatiken missar. Härledningen (lib/redigering/harledning.ts) kallar ett
-- värde SÄKERT när två oberoende källor säger samma sak och ingen säger emot (trakten, namnet, skördarens fil, ett objekt
-- med samma namn). Säkra värden skrivs av cronen /api/redigering/fyll-sakra genom den här funktionen; allt annat är ett
-- förslag som Martin godkänner i "Behöver dig".
--
-- Regler, samma som fyll_dim_fran_trakt:
--   * Bara TOMMA fält fylls. Ett ifyllt värde (importens eller en människas) rörs aldrig — WHERE-satsen, inte appen, avgör.
--   * Bara huvudtyp, avtalsform och bolag, och bara kända värden för typ och avtalsform.
--   * huvudtyp 'Grot' sätter risskotning = true (typen och flaggan synkas alltid, lib/objekt/typ.ts).
--   * avtalsform speglas till objekt-raden (planering) om den finns och är tom.
--   * Provenans i dim_objekt.auto_ifyllt: {"huvudtyp": "härlett: namnet, skördarens fil"} — visas som källan under fältet.
--     Den nollas när någon annan ändrar fältet (rensa-triggern nedan får huvudtyp och avtalsform).
--   * Bara service_role får köra den (cronen). Ingen app-användare kan skriva via den.
--
-- PROVAT: inte kört mot prod. Torrkörning av planeringen mot prod-data 2026-10-23 gav TRE fyllningar:
--   Mölleryd RP J-Hus -25 (11166477): huvudtyp Slutavverkning, avtalsform Rp; Skälviken RP J-Hus -25: huvudtyp Slutavverkning.

-- ── 1. Skrivningen ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION redigering_skriv_auto(p_ids text[], p_falt text, p_varde text, p_kallor text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antal integer := 0;
  v_prov  jsonb;
BEGIN
  IF p_falt NOT IN ('huvudtyp', 'avtalsform', 'bolag') THEN
    RAISE EXCEPTION 'redigering_skriv_auto: fältet % fylls inte automatiskt', p_falt;
  END IF;
  IF NULLIF(btrim(p_varde), '') IS NULL THEN
    RAISE EXCEPTION 'redigering_skriv_auto: tomt värde';
  END IF;
  IF p_falt = 'huvudtyp' AND p_varde NOT IN ('Slutavverkning', 'Gallring', 'Grot') THEN
    RAISE EXCEPTION 'redigering_skriv_auto: okänd typ %', p_varde;
  END IF;
  IF p_falt = 'avtalsform' AND p_varde NOT IN ('Au', 'Rp', 'LRK', 'VF/Bark') THEN
    RAISE EXCEPTION 'redigering_skriv_auto: okänd avtalsform %', p_varde;
  END IF;

  v_prov := jsonb_build_object(p_falt, 'härlett: ' || coalesce(NULLIF(btrim(p_kallor), ''), 'okänd källa'));

  -- Flaggan så rensa-triggern inte nollar provenansen vi sätter.
  PERFORM set_config('app.autofyll', '1', true);

  IF p_falt = 'huvudtyp' THEN
    UPDATE dim_objekt SET huvudtyp = p_varde, risskotning = (p_varde = 'Grot'), auto_ifyllt = auto_ifyllt || v_prov
     WHERE objekt_id = ANY (p_ids) AND NULLIF(btrim(huvudtyp), '') IS NULL;
  ELSIF p_falt = 'avtalsform' THEN
    UPDATE dim_objekt SET avtalsform = p_varde, auto_ifyllt = auto_ifyllt || v_prov
     WHERE objekt_id = ANY (p_ids) AND NULLIF(btrim(avtalsform), '') IS NULL;
  ELSE
    UPDATE dim_objekt SET bolag = p_varde, auto_ifyllt = auto_ifyllt || v_prov
     WHERE objekt_id = ANY (p_ids) AND NULLIF(btrim(bolag), '') IS NULL;
  END IF;
  GET DIAGNOSTICS v_antal = ROW_COUNT;

  -- Avtalsformen speglas till planeringens objekt-rad (FK först, annars VO), bara om den är tom där.
  IF p_falt = 'avtalsform' AND v_antal > 0 THEN
    UPDATE objekt o SET avtalsform = p_varde
     WHERE NULLIF(btrim(o.avtalsform), '') IS NULL
       AND (o.dim_objekt_id = ANY (p_ids)
            OR o.vo_nummer IN (SELECT btrim(d.vo_nummer) FROM dim_objekt d WHERE d.objekt_id = ANY (p_ids) AND NULLIF(btrim(d.vo_nummer), '') IS NOT NULL));
  END IF;

  PERFORM set_config('app.autofyll', '', true);
  RETURN v_antal;
END;
$$;

REVOKE ALL ON FUNCTION redigering_skriv_auto(text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redigering_skriv_auto(text[], text, text, text) TO service_role;

-- ── 2. Provenansen nollas när NÅGON ANNAN ändrar fältet: + huvudtyp, avtalsform ──
-- Prod-versionen (läst 2026-10-23) hade skogsagare, inkopare, avverkningsform, bolag och grot_anpassad — men inte huvudtyp,
-- så en "trakt"-märkning på en typ blev kvar efter att Martin rättat den. Raderna nedan är prod-versionens, plus två.
CREATE OR REPLACE FUNCTION dim_objekt_rensa_auto_ifyllt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.autofyll', true) = '1' THEN RETURN NEW; END IF;
  IF NEW.skogsagare      IS DISTINCT FROM OLD.skogsagare      THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'skogsagare';      END IF;
  IF NEW.inkopare        IS DISTINCT FROM OLD.inkopare        THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'inkopare';        END IF;
  IF NEW.avverkningsform IS DISTINCT FROM OLD.avverkningsform THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'avverkningsform'; END IF;
  IF NEW.bolag           IS DISTINCT FROM OLD.bolag           THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'bolag';           END IF;
  IF NEW.huvudtyp        IS DISTINCT FROM OLD.huvudtyp        THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'huvudtyp';        END IF;
  IF NEW.avtalsform      IS DISTINCT FROM OLD.avtalsform      THEN NEW.auto_ifyllt := NEW.auto_ifyllt - 'avtalsform';      END IF;
  IF NEW.grot_anpassad   IS DISTINCT FROM OLD.grot_anpassad   THEN NEW.auto_ifyllt := NEW.auto_ifyllt || '{"grot_anpassad":"manuell"}'::jsonb; END IF;
  RETURN NEW;
END; $$;

-- CREATE OR REPLACE TRIGGER, inte DROP + CREATE (DROP hänger i Supabase-MCP:n, se CLAUDE.md under Ledighet).
CREATE OR REPLACE TRIGGER dim_objekt_rensa_auto_ifyllt
  BEFORE UPDATE OF skogsagare, inkopare, avverkningsform, bolag, grot_anpassad, huvudtyp, avtalsform ON dim_objekt
  FOR EACH ROW
  EXECUTE FUNCTION dim_objekt_rensa_auto_ifyllt();
