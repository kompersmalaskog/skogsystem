-- ── 3. Skydd mot att en äldre importversion skriver väggklocka-som-UTC över en flyttad rad ─────────────────────────────
-- INSERT … ON CONFLICT DO UPDATE kör BEFORE INSERT-triggern för den föreslagna raden först. En äldre import skickar ingen
-- tid_ar_utc (→ default false): då märks transaktionen, och BEFORE UPDATE gör raden till en äldre rad igen om en tid skrevs
-- över. De tider som inte skrevs över ligger kvar i den gamla radens konvention och räknas om, så raden aldrig blir halvt
-- och halvt. Null bär ingen konvention och räknas inte som en ändring.
CREATE OR REPLACE FUNCTION opti_tid_markera_gammal_import() RETURNS trigger
LANGUAGE plpgsql AS $t$
BEGIN
  IF NEW.tid_ar_utc IS NOT TRUE THEN
    PERFORM set_config('app.opti_tid_gammal_import', '1', true);
  END IF;
  RETURN NEW;
END $t$;

CREATE OR REPLACE FUNCTION opti_tid_flagga() RETURNS trigger
LANGUAGE plpgsql AS $t$
DECLARE
  k      text;
  andrad boolean := false;
  ny     jsonb := to_jsonb(NEW);
  gammal jsonb := to_jsonb(OLD);
BEGIN
  IF current_setting('app.opti_tid_gammal_import', true) IS DISTINCT FROM '1' OR NEW.tid_ar_utc IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  FOREACH k IN ARRAY TG_ARGV LOOP
    IF ny->>k IS NOT NULL AND ny->>k IS DISTINCT FROM gammal->>k THEN
      andrad := true;
    END IF;
  END LOOP;
  IF NOT andrad THEN
    RETURN NEW;
  END IF;
  FOREACH k IN ARRAY TG_ARGV LOOP
    IF OLD.tid_ar_utc IS TRUE AND gammal->>k IS NOT NULL AND ny->>k IS NOT DISTINCT FROM gammal->>k THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(k, to_jsonb(opti_tid_fran_utc((gammal->>k)::timestamptz, false))));
    END IF;
  END LOOP;
  NEW.tid_ar_utc := false;
  RETURN NEW;
END $t$;

-- Triggernamn med "aa_" så de körs FÖRE fakt_skift_bara_utoka / trg_detalj_stam_behall_harledd_tidpunkt (alfabetisk ordning).
CREATE OR REPLACE TRIGGER aa_opti_tid_markera BEFORE INSERT ON fakt_skift
  FOR EACH ROW EXECUTE FUNCTION opti_tid_markera_gammal_import();
CREATE OR REPLACE TRIGGER aa_opti_tid_flagga BEFORE UPDATE ON fakt_skift
  FOR EACH ROW EXECUTE FUNCTION opti_tid_flagga('inloggning_tid', 'utloggning_tid', 'maskin_inloggning_tid');

CREATE OR REPLACE TRIGGER aa_opti_tid_markera BEFORE INSERT ON detalj_stam
  FOR EACH ROW EXECUTE FUNCTION opti_tid_markera_gammal_import();
CREATE OR REPLACE TRIGGER aa_opti_tid_flagga BEFORE UPDATE ON detalj_stam
  FOR EACH ROW EXECUTE FUNCTION opti_tid_flagga('tidpunkt');

CREATE OR REPLACE TRIGGER aa_opti_tid_markera BEFORE INSERT ON detalj_gps_spar
  FOR EACH ROW EXECUTE FUNCTION opti_tid_markera_gammal_import();
CREATE OR REPLACE TRIGGER aa_opti_tid_flagga BEFORE UPDATE ON detalj_gps_spar
  FOR EACH ROW EXECUTE FUNCTION opti_tid_flagga('tidpunkt');

CREATE OR REPLACE TRIGGER aa_opti_tid_markera BEFORE INSERT ON detalj_kontroll_stock
  FOR EACH ROW EXECUTE FUNCTION opti_tid_markera_gammal_import();
CREATE OR REPLACE TRIGGER aa_opti_tid_flagga BEFORE UPDATE ON detalj_kontroll_stock
  FOR EACH ROW EXECUTE FUNCTION opti_tid_flagga('machine_measurement_date', 'operator_measurement_date', 'harvest_date');

CREATE OR REPLACE TRIGGER aa_opti_tid_markera BEFORE INSERT ON hpr_filer
  FOR EACH ROW EXECUTE FUNCTION opti_tid_markera_gammal_import();
CREATE OR REPLACE TRIGGER aa_opti_tid_flagga BEFORE UPDATE ON hpr_filer
  FOR EACH ROW EXECUTE FUNCTION opti_tid_flagga('fil_datum');

-- ── 4. Befintliga triggrar görs medvetna om konventionen ──────────────────────────────────────────────────────────────
-- fakt_skift_bara_utoka: ett pass får bara UTÖKAS (tidigaste inloggning, senaste utloggning). Jämförelsen sker nu i VERKLIGT
-- UTC för både gamla och nya raden, och det som behålls läggs tillbaka i den NYA radens konvention. Annars hade en äldre rad
-- (väggklocka) jämförts mot en ny (UTC) och passet krympt eller växt två timmar. Allt annat är oförändrat (samma undantag för
-- syntetiska pass som kapats av en annan förares inloggning, samma bypass app.skift_tillat_andring).
CREATE OR REPLACE FUNCTION public.fakt_skift_bara_utoka()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  ersatt boolean := false;
  annan  boolean;
  o_in   timestamptz := opti_tid_utc(old.inloggning_tid, old.tid_ar_utc);
  o_mi   timestamptz := opti_tid_utc(old.maskin_inloggning_tid, old.tid_ar_utc);
  o_ut   timestamptz := opti_tid_utc(old.utloggning_tid, old.tid_ar_utc);
  n_in   timestamptz := opti_tid_utc(new.inloggning_tid, new.tid_ar_utc);
  n_mi   timestamptz := opti_tid_utc(new.maskin_inloggning_tid, new.tid_ar_utc);
  n_ut   timestamptz := opti_tid_utc(new.utloggning_tid, new.tid_ar_utc);
begin
  if coalesce(current_setting('app.skift_tillat_andring', true), '') = 'on' then
    return new;
  end if;
  if o_in is not null and (n_in is null or n_in > o_in) then
    new.inloggning_tid := opti_tid_fran_utc(o_in, new.tid_ar_utc);
    n_in := o_in;
    ersatt := true;
  end if;
  if o_mi is not null and (n_mi is null or n_mi > o_mi) then
    new.maskin_inloggning_tid := opti_tid_fran_utc(o_mi, new.tid_ar_utc);
  end if;
  if o_ut is not null and (n_ut is null or n_ut < o_ut) then
    annan := false;
    if n_ut is not null and old.shift_key like 'SYN\_%' then
      execute format(
        'select exists (select 1 from %I.%I o'
        || ' where o.maskin_id = $1 and o.datum = $2 and o.id <> $3'
        || '   and o.operator_id is distinct from $4'
        || '   and opti_tid_utc(o.inloggning_tid, o.tid_ar_utc) between $5 - interval ''1 second'' and $5 + interval ''1 second'')',
        TG_TABLE_SCHEMA, TG_TABLE_NAME)
      into annan
      using new.maskin_id, new.datum, new.id, new.operator_id, n_ut;
    end if;
    if not coalesce(annan, false) then
      new.utloggning_tid := opti_tid_fran_utc(o_ut, new.tid_ar_utc);
      n_ut := o_ut;
      ersatt := true;
    end if;
  end if;
  if ersatt and n_in is not null and n_ut is not null then
    new.langd_sek := floor(extract(epoch from (n_ut - n_in)))::int;
  end if;
  return new;
end;
$function$;

-- Konventionsflytten (opti_tider_till_utc) ändrar tidpunkt utan att tidpunkt_kalla ändras: det är INTE en ny tid ur filen och
-- ska inte släppa markeringen på de härledda (mom_dagfordelning) tiderna.
CREATE OR REPLACE FUNCTION public.detalj_stam_behall_harledd_tidpunkt()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF coalesce(current_setting('app.opti_tid_konvertering', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.tidpunkt IS NULL AND OLD.tidpunkt IS NOT NULL AND OLD.tidpunkt_kalla IS NOT NULL THEN
    NEW.tidpunkt := OLD.tidpunkt;
    NEW.tidpunkt_kalla := OLD.tidpunkt_kalla;
  ELSIF NEW.tidpunkt IS DISTINCT FROM OLD.tidpunkt
        AND NEW.tidpunkt_kalla IS NOT DISTINCT FROM OLD.tidpunkt_kalla THEN
    NEW.tidpunkt_kalla := NULL;
  END IF;
  RETURN NEW;
END $function$;

-- ── 5. Flytten av de befintliga raderna ───────────────────────────────────────────────────────────────────────────────
-- (tid AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm' — svensk sommar-/vintertid, inte ett fast tillägg. tid_ar_utc skiljer
-- flyttade rader (true) från äldre (false), så omkörning är ofarlig och aldrig dubbelkorrigerar. p_max begränsar antalet rader
-- per tabell och anrop (null = alla), för stora tabeller i omgångar.
CREATE OR REPLACE FUNCTION opti_tider_till_utc(p_tabell text DEFAULT NULL, p_max integer DEFAULT NULL)
RETURNS TABLE (tabell text, rader bigint)
LANGUAGE plpgsql AS $f$
DECLARE
  n         bigint;
  skift_las text := coalesce(current_setting('app.skift_tillat_andring', true), '');
BEGIN
  PERFORM set_config('app.opti_tid_gammal_import', '', true);
  PERFORM set_config('app.opti_tid_konvertering', 'on', true);

  IF p_tabell IS NULL OR p_tabell = 'fakt_skift' THEN
    PERFORM set_config('app.skift_tillat_andring', 'on', true);
    WITH v AS (SELECT id FROM fakt_skift WHERE NOT tid_ar_utc ORDER BY id LIMIT p_max)
    UPDATE fakt_skift s
       SET inloggning_tid        = opti_tid_utc(s.inloggning_tid, false),
           utloggning_tid        = opti_tid_utc(s.utloggning_tid, false),
           maskin_inloggning_tid = opti_tid_utc(s.maskin_inloggning_tid, false),
           tid_ar_utc = true
      FROM v WHERE s.id = v.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    tabell := 'fakt_skift'; rader := n; RETURN NEXT;
    PERFORM set_config('app.skift_tillat_andring', skift_las, true);
  END IF;

  IF p_tabell IS NULL OR p_tabell = 'detalj_stam' THEN
    WITH v AS (SELECT id FROM detalj_stam WHERE NOT tid_ar_utc ORDER BY id LIMIT p_max)
    UPDATE detalj_stam s
       SET tidpunkt = opti_tid_utc(s.tidpunkt, false), tid_ar_utc = true
      FROM v WHERE s.id = v.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    tabell := 'detalj_stam'; rader := n; RETURN NEXT;
  END IF;

  IF p_tabell IS NULL OR p_tabell = 'detalj_kontroll_stock' THEN
    WITH v AS (SELECT id FROM detalj_kontroll_stock WHERE NOT tid_ar_utc ORDER BY id LIMIT p_max)
    UPDATE detalj_kontroll_stock s
       SET machine_measurement_date  = opti_tid_utc(s.machine_measurement_date, false),
           operator_measurement_date = opti_tid_utc(s.operator_measurement_date, false),
           harvest_date              = opti_tid_utc(s.harvest_date, false),
           tid_ar_utc = true
      FROM v WHERE s.id = v.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    tabell := 'detalj_kontroll_stock'; rader := n; RETURN NEXT;
  END IF;

  IF p_tabell IS NULL OR p_tabell = 'hpr_filer' THEN
    WITH v AS (SELECT id FROM hpr_filer WHERE NOT tid_ar_utc ORDER BY id LIMIT p_max)
    UPDATE hpr_filer s
       SET fil_datum = opti_tid_utc(s.fil_datum, false), tid_ar_utc = true
      FROM v WHERE s.id = v.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    tabell := 'hpr_filer'; rader := n; RETURN NEXT;
  END IF;

  IF p_tabell = 'detalj_gps_spar' THEN
    WITH v AS (SELECT id FROM detalj_gps_spar WHERE NOT tid_ar_utc ORDER BY id LIMIT p_max)
    UPDATE detalj_gps_spar s
       SET tidpunkt = opti_tid_utc(s.tidpunkt, false), tid_ar_utc = true
      FROM v WHERE s.id = v.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    tabell := 'detalj_gps_spar'; rader := n; RETURN NEXT;
  END IF;

  PERFORM set_config('app.opti_tid_konvertering', '', true);
END $f$;
REVOKE ALL ON FUNCTION opti_tider_till_utc(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION opti_tider_till_utc(text, integer) TO service_role;
