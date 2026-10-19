-- Opti-tider som verkliga UTC-ögonblick: fakt_skift, detalj_stam, detalj_gps_spar, detalj_kontroll_stock, hpr_filer.
--
-- PROBLEMET. Maskinens klocka är svensk väggklocka. Importen klippte offseten ur filernas tidsstämplar och PostgREST tolkade
-- resten som UTC: "09:04 svensk tid" lagrades som 09:04Z (verkligt 07:04Z). Uppmätt 2026-10-19 mot skördarens hyttspår:
-- stammarnas tidpunkt ligger 120,3 min (Rottne R64428) och 125,2 min (Ponsse, varav ca 5 min maskinklocka) efter verklig tid.
-- Samma fel som FPR-tiderna (20261019073645_fpr_tider_utc.sql), men i fler tabeller och med fler läsare.
--
-- ÅTGÄRD. (1) Importen skriver verkligt UTC och märker raden `tid_ar_utc = true`. (2) Läsarna tolkar ALLTID via flaggan
-- (opti_tid_utc / opti_tid_lokal nedan), så rätt tid kommer ut oavsett vilken konvention en rad har — också under övergången
-- då en äldre importversion fortfarande skriver rader i den gamla (de får flaggan false via triggrarna). Ordningen
-- migration → import eller import → migration spelar därmed ingen roll för vad läsarna visar; bara det att den NYA importen
-- kräver kolumnen (kör migrationen först). (3) De befintliga raderna flyttas med opti_tider_till_utc(): de SMÅ tabellerna
-- (fakt_skift, hpr_filer, detalj_kontroll_stock, ca 4 400 rader) i den här migrationen; detalj_stam (245 000 rader, mätt ca
-- 0,3 ms/rad = över en minut) och detalj_gps_spar (7 miljoner rader) i OMGÅNGAR efteråt, utan att något väntar på dem —
-- läsarna är flaggmedvetna och ger samma svar i blandläge (bevisat 2026-10-19 mot prod-data i en återrullad körning):
--   select * from opti_tider_till_utc('detalj_stam', 25000);        -- upprepa tills den ger 0 rader (ca 10 anrop)
--   select * from opti_tider_till_utc('detalj_gps_spar', 200000);   -- valfritt, ingen läsare i appen
--
-- LÄSARE (kartlagt 2026-10-19; alla ändrade i den här migrationen eller i appen/skripten, inget dubbelkorrigeras):
--   SQL: vy_skordarmatt_stock (nya kolumner tid_ar_utc, tidpunkt_lokal), vy_virke_karta, massaved_rader, massaved_langder,
--        massaved_niva2, massaved_niva3, sortimentsutfall_manad, sortimentsutfall_granser, affar_oversikt (inbyggd
--        planeringsoptimering bevarad: sargable ±3 h-fönster + exakt filter), berakna_utfall_objekt (utfall_manad, utfall_objekt),
--        rebuild_fakt_sortiment (fakt_sortiment.datum), hogar_for_objekt, kontroll_stammar_utan_stockar,
--        maskindata_flertrad_period (räknade redan om från UTC — var fel för de äldre raderna), fakt_skift_bara_utoka,
--        detalj_stam_behall_harledd_tidpunkt (släpper inte markeringen vid en konvention-flytt).
--   TypeScript: /api/mom-import (arbetsdagens start/slut ur fakt_skift — lönekedjan), app/maskinvy/IdagNy.tsx (timme per stam),
--        hpr_filer.fil_datum i markägarrapporten, useFildata, OkopplFilerKort/objektNummer, datum per stam i markägarrapportens
--        aggregat (lib/markagarrapport/aggregate.ts) och högarnas datum i planeringsvyn (app/planering/page.tsx). Alla läser
--        tid_ar_utc, så MIGRATIONEN MÅSTE KÖRAS INNAN den nya appen släpps (frågorna väljer kolumnen).
--   Python: skogsmaskin_import_version_6.py (skriver + läser tillbaka), import_hpr.py, scripts/berakna_skordarstrak.py,
--        scripts/rebuild-arbetsdag-2026.py.
-- UTANFÖR (med skäl): fakt_produktion.monitoring_start och fakt_kalibrering_historik.datum ingår i tabellernas UNIKA nyckel —
-- en ändrad konvention ger dubbletter när gammal och ny import blandas, och ingen läsare behöver dem som UTC.
-- dim_objekt.start_date/end_date är en NAIV kolumn (utan tidszon) och är svensk tid redan. mom_tider och FPR-tiderna är redan rätt.
--
-- ÅNGRA (flyttar tillbaka allt som flyttats; kör bara om importen också rullas tillbaka — readers behöver inte röras):
--   update fakt_skift set inloggning_tid = opti_tid_fran_utc(inloggning_tid,false), utloggning_tid = opti_tid_fran_utc(utloggning_tid,false),
--          maskin_inloggning_tid = opti_tid_fran_utc(maskin_inloggning_tid,false), tid_ar_utc = false where tid_ar_utc;   -- med
--          set_config('app.skift_tillat_andring','on',true) först
--   update detalj_stam set tidpunkt = opti_tid_fran_utc(tidpunkt,false), tid_ar_utc = false where tid_ar_utc;               -- med
--          set_config('app.opti_tid_konvertering','on',true) först
--   (samma för detalj_kontroll_stock med tre kolumner, hpr_filer.fil_datum och detalj_gps_spar.tidpunkt)

-- ── 1. Flagga: vilken konvention en rad har ───────────────────────────────────────────────────────────────────────────
-- NOT NULL DEFAULT false är en metadataändring (ingen omskrivning av tabellen), också för detalj_gps_spar.
ALTER TABLE fakt_skift             ADD COLUMN IF NOT EXISTS tid_ar_utc boolean NOT NULL DEFAULT false;
ALTER TABLE detalj_stam            ADD COLUMN IF NOT EXISTS tid_ar_utc boolean NOT NULL DEFAULT false;
ALTER TABLE detalj_gps_spar        ADD COLUMN IF NOT EXISTS tid_ar_utc boolean NOT NULL DEFAULT false;
ALTER TABLE detalj_kontroll_stock  ADD COLUMN IF NOT EXISTS tid_ar_utc boolean NOT NULL DEFAULT false;
ALTER TABLE hpr_filer              ADD COLUMN IF NOT EXISTS tid_ar_utc boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN fakt_skift.tid_ar_utc IS
  'true = inloggning_tid/utloggning_tid/maskin_inloggning_tid är verkliga UTC-ögonblick. false = äldre rad där svensk väggklocka lagrats som UTC. Läs via opti_tid_utc()/opti_tid_lokal().';
COMMENT ON COLUMN detalj_stam.tid_ar_utc IS
  'true = tidpunkt är ett verkligt UTC-ögonblick. false = äldre rad där svensk väggklocka lagrats som UTC. Läs via opti_tid_utc()/opti_tid_lokal().';
COMMENT ON COLUMN detalj_gps_spar.tid_ar_utc IS
  'true = tidpunkt är ett verkligt UTC-ögonblick. false = äldre rad där svensk väggklocka lagrats som UTC (flyttas i omgångar: opti_tider_till_utc(''detalj_gps_spar'', n)).';
COMMENT ON COLUMN detalj_kontroll_stock.tid_ar_utc IS
  'true = machine_/operator_measurement_date och harvest_date är verkliga UTC-ögonblick. false = äldre rad där svensk väggklocka lagrats som UTC.';
COMMENT ON COLUMN hpr_filer.tid_ar_utc IS
  'true = fil_datum är ett verkligt UTC-ögonblick. false = äldre rad där svensk väggklocka lagrats som UTC.';

-- ── 2. Läsfunktioner: ETT ställe som vet konventionen ─────────────────────────────────────────────────────────────────
-- opti_tid_utc: verkligt ögonblick. opti_tid_lokal: svensk väggklocka (timestamp utan zon). opti_tid_fran_utc: omvänd, lägger ett
-- verkligt ögonblick i en rads konvention. Europe/Stockholm, aldrig ett fast tillägg.
CREATE OR REPLACE FUNCTION opti_tid_utc(t timestamptz, ar_utc boolean) RETURNS timestamptz
LANGUAGE sql STABLE PARALLEL SAFE AS $f$
  SELECT CASE WHEN t IS NULL OR ar_utc THEN t ELSE (t AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm' END
$f$;

CREATE OR REPLACE FUNCTION opti_tid_lokal(t timestamptz, ar_utc boolean) RETURNS timestamp
LANGUAGE sql STABLE PARALLEL SAFE AS $f$
  SELECT CASE WHEN t IS NULL THEN NULL
              WHEN ar_utc THEN t AT TIME ZONE 'Europe/Stockholm'
              ELSE t AT TIME ZONE 'UTC' END
$f$;

CREATE OR REPLACE FUNCTION opti_tid_fran_utc(v timestamptz, ar_utc boolean) RETURNS timestamptz
LANGUAGE sql STABLE PARALLEL SAFE AS $f$
  SELECT CASE WHEN v IS NULL OR ar_utc THEN v ELSE (v AT TIME ZONE 'Europe/Stockholm') AT TIME ZONE 'UTC' END
$f$;

COMMENT ON FUNCTION opti_tid_utc(timestamptz, boolean) IS 'Verkligt UTC-ögonblick för en Opti-tid och radens tid_ar_utc.';
COMMENT ON FUNCTION opti_tid_lokal(timestamptz, boolean) IS 'Svensk väggklocka (timestamp) för en Opti-tid och radens tid_ar_utc. Använd den för dag-/månadsgränser.';
COMMENT ON FUNCTION opti_tid_fran_utc(timestamptz, boolean) IS 'Lägger ett verkligt ögonblick i radens konvention (true: oförändrat, false: väggklocka lagrad som UTC).';

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
    -- Filen har ingen tid; den härledda står kvar.
    NEW.tidpunkt := OLD.tidpunkt;
    NEW.tidpunkt_kalla := OLD.tidpunkt_kalla;
  ELSIF NEW.tidpunkt IS DISTINCT FROM OLD.tidpunkt
        AND NEW.tidpunkt_kalla IS NOT DISTINCT FROM OLD.tidpunkt_kalla THEN
    -- Tidpunkten byttes utan att källan sattes: det är filens egen tid
    -- (importen skriver aldrig tidpunkt_kalla). Markeringen släpps.
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
  -- Ingen markering från en INSERT tidigare i samma transaktion ska råka flagga flytten som en äldre import (jfr FPR-migrationen).
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

  -- detalj_gps_spar ingår bara när den efterfrågas uttryckligen (7 miljoner rader): select * from opti_tider_till_utc('detalj_gps_spar', 200000);
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

-- ── 6. Vyer ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- tidpunkt behåller sitt namn och sin typ (det lagrade värdet); tid_ar_utc och tidpunkt_lokal läggs sist så att CREATE OR REPLACE
-- räcker. Läsare som vill ha dag/månad använder tidpunkt_lokal — den är svensk väggklocka oavsett radens konvention.
CREATE OR REPLACE VIEW vy_skordarmatt_stock WITH (security_invoker = true) AS
 SELECT st.id AS stock_id,
    st.maskin_id,
    st.objekt_id,
    st.stem_key,
    st.log_key,
    st.sortiment_id,
    st.volym_m3sub,
    st.toppdia_ub_mm,
    sm.tidpunkt,
    st.langd_cm,
    sm.tradslag_id,
    sm.tid_ar_utc,
    opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) AS tidpunkt_lokal
   FROM (detalj_stock st
     JOIN detalj_stam sm ON (((sm.maskin_id = st.maskin_id) AND (sm.stam_key = st.stem_key) AND (sm.objekt_id = st.objekt_id))))
  WHERE ((st.stem_key IS NOT NULL) AND (st.log_key IS NOT NULL));

CREATE OR REPLACE VIEW vy_virke_karta AS
 SELECT s.id,
    s.latitude,
    s.longitude,
    st.sortiment_namn,
    st.volym_m3sub,
    o.vo_nummer,
    o.object_name AS trakt,
    (opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS datum
   FROM ((detalj_stam s
     JOIN detalj_stock st ON ((s.id = st.stam_id)))
     JOIN dim_objekt o ON ((s.objekt_id = o.objekt_id)))
  WHERE (s.latitude IS NOT NULL);

-- ── 7. Läsare (SQL) ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Samma logik som före migrationen; det enda som ändrats är att dag och månad tas ur SVENSK väggklocka via flaggan.

CREATE OR REPLACE FUNCTION public.massaved_rader(p_manad date)
 RETURNS TABLE(objekt_id text, valta text, tradslag text, maskin_id text, m3fub numeric, antal_bitar integer, medellangd_m numeric, medellangd_utan_tre_m_stock_m numeric, tre_m_stock_m3 numeric, tre_m_stock_st integer, timmerdimension_m3 numeric, massa_utan_sagbar_stock_m3 numeric, massa_utan_sagbar_stock_st integer)
 LANGUAGE sql
 STABLE
AS $function$
WITH gr AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
klass AS MATERIALIZED (
  SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass
),
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id
  FROM detalj_stam sm CROSS JOIN gr
  WHERE opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) >= gr.fran AND opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) < gr.till
),
stock AS (
  SELECT st.objekt_id, st.maskin_id, st.log_key, st.langd_cm, st.volym_m3sub,
         st.toppdia_ub_mm, sm.tradslag_id, k.grupp, k.namn AS sortnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN st.log_key END)
           OVER (PARTITION BY st.maskin_id, st.stem_key, st.objekt_id) AS forsta_sagbar
  FROM stam sm
  JOIN detalj_stock st
         ON st.objekt_id = sm.objekt_id AND st.maskin_id = sm.maskin_id
        AND st.stem_key = sm.stam_key
        AND st.stem_key IS NOT NULL AND st.log_key IS NOT NULL
  LEFT JOIN klass k ON k.sortiment_id = st.sortiment_id
)
SELECT s.objekt_id,
       CASE WHEN s.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
            WHEN s.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
            ELSE 'Övrig massaved' END,
       COALESCE(initcap(lower(dt.namn)), 'Okänt trädslag'),
       s.maskin_id,
       SUM(s.volym_m3sub),
       COUNT(*)::int,
       SUM(s.langd_cm*s.volym_m3sub)/NULLIF(SUM(s.volym_m3sub),0)/100,
       SUM(s.langd_cm*s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL OR s.log_key >= s.forsta_sagbar)
         / NULLIF(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL OR s.log_key >= s.forsta_sagbar),0)/100,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0),
       COALESCE(COUNT(*) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320),0)::int,
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NOT NULL
                  AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320
                  AND s.toppdia_ub_mm >= 180),0),
       COALESCE(SUM(s.volym_m3sub) FILTER (WHERE s.forsta_sagbar IS NULL AND s.langd_cm < 320),0),
       COALESCE(COUNT(*) FILTER (WHERE s.forsta_sagbar IS NULL AND s.langd_cm < 320),0)::int
FROM stock s
LEFT JOIN dim_tradslag dt ON dt.tradslag_id = s.tradslag_id
WHERE s.grupp = 'Massa'
GROUP BY 1,2,3,4;
$function$;

CREATE OR REPLACE FUNCTION public.massaved_langder(p_manad date, p_atgard text DEFAULT 'Slutavverkning'::text, p_bolag text DEFAULT 'Vida'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH gransen AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
objekt AS (
  SELECT o.objekt_id FROM dim_objekt o
  WHERE o.bolag = p_bolag
    AND CASE WHEN p_atgard = 'Allt'
             THEN (o.huvudtyp IN ('Slutavverkning','Gallring') OR o.huvudtyp IS NULL)
             ELSE o.huvudtyp = p_atgard END
),
allt AS (
  SELECT v.volym_m3sub, v.langd_cm, v.log_key, v.toppdia_ub_mm,
         COALESCE(dt.namn, 'Okänt trädslag') AS tradslag,
         COALESCE(normalisera('massasortiment', k.namn), 'Övrig massaved') AS sortiment,
         (k.grupp = 'Hemved') AS ar_hemved
  FROM vy_skordarmatt_stock v
  JOIN objekt ob ON ob.objekt_id = v.objekt_id
  CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  LEFT JOIN dim_tradslag dt ON dt.tradslag_id = v.tradslag_id
  WHERE v.tidpunkt_lokal >= gr.fran AND v.tidpunkt_lokal < gr.till
    AND k.grupp IN ('Massa','Hemved')
),
m AS (SELECT * FROM allt WHERE NOT ar_hemved),
per AS (
  SELECT sortiment, tradslag,
         SUM(volym_m3sub) AS volym,
         SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/10 AS dm,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310) AS tre_m,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key=1) AS rotkap,
         SUM(volym_m3sub) FILTER (WHERE langd_cm BETWEEN 290 AND 310 AND log_key=1
                                    AND toppdia_ub_mm >= 180) AS timmermatt
  FROM m GROUP BY 1,2
),
synliga AS (SELECT * FROM per WHERE volym >= 1),
sort_tot AS (
  SELECT sortiment, SUM(volym) AS volym FROM synliga GROUP BY 1 HAVING SUM(volym) >= 1
)
SELECT jsonb_build_object(
  'manad',  (SELECT to_char(fran,'YYYY-MM') FROM gransen),
  'atgard', p_atgard,
  'bolag',  p_bolag,
  'total_volym',   ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM m),0)::numeric,1),
  'medellangd_dm', ROUND((SELECT SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/10 FROM m)::numeric,1),
  'hemved_volym',  ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM allt WHERE ar_hemved),0)::numeric,1),
  'sortiment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'namn',  st.sortiment,
      'volym', ROUND(st.volym::numeric,0),
      'tradslag', (SELECT jsonb_agg(jsonb_build_object(
            'namn',         initcap(lower(sv.tradslag)),
            'volym',        ROUND(sv.volym::numeric,0),
            'dm',           ROUND(sv.dm::numeric,1),
            'tre_m_andel',  ROUND(100*COALESCE(sv.tre_m,0)::numeric/NULLIF(sv.volym,0)::numeric,1),
            'tre_m_volym',  ROUND(COALESCE(sv.tre_m,0)::numeric,0),
            'rotkap',       ROUND(COALESCE(sv.rotkap,0)::numeric,0),
            'timmermatt',   ROUND(COALESCE(sv.timmermatt,0)::numeric,0))
          ORDER BY sv.volym DESC)
        FROM synliga sv WHERE sv.sortiment = st.sortiment))
    ORDER BY st.volym DESC) FROM sort_tot st), '[]'::jsonb),
  'dolda_rader', (SELECT COUNT(*) FROM per WHERE volym < 1)
);
$function$;

CREATE OR REPLACE FUNCTION public.massaved_niva2(p_objekt_id text, p_manad date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH klass AS MATERIALIZED (
  SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass
),
-- Objektets HELA period, oberoende av valt omfång. Bär växlingen: finns bara
-- en månad har den inget att välja mellan och göms.
alla_manader AS (
  SELECT to_char(date_trunc('month', opti_tid_lokal(tidpunkt, tid_ar_utc)),'YYYY-MM') AS manad
  FROM detalj_stam WHERE objekt_id = p_objekt_id AND tidpunkt IS NOT NULL
  GROUP BY 1
),
-- Omfånget filtreras på STAMMEN, aldrig på stocken: fönsterfunktionen måste
-- se hela stammen för att veta var första sågbara stocken satt.
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id, opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) AS tidpunkt
  FROM detalj_stam sm
  WHERE sm.objekt_id = p_objekt_id AND sm.tidpunkt IS NOT NULL
    AND (p_manad IS NULL
         OR (opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) >= date_trunc('month', p_manad::timestamp)
         AND opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) <  date_trunc('month', p_manad::timestamp) + interval '1 month'))
),
stock AS (
  SELECT st.maskin_id, st.log_key, st.langd_cm, st.volym_m3sub, st.toppdia_ub_mm,
         st.sortiment_id, sm.tradslag_id, sm.tidpunkt, k.grupp, k.namn AS sortnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN st.log_key END)
           OVER (PARTITION BY st.maskin_id, st.stem_key, st.objekt_id) AS forsta_sagbar
  FROM stam sm
  JOIN detalj_stock st
         ON st.objekt_id = sm.objekt_id AND st.maskin_id = sm.maskin_id
        AND st.stem_key  = sm.stam_key
        AND st.stem_key IS NOT NULL AND st.log_key IS NOT NULL
  LEFT JOIN klass k ON k.sortiment_id = st.sortiment_id
),
fonster AS MATERIALIZED (
  SELECT DISTINCT ds.namn, k.grupp,
         COALESCE(o.langd_min_cm, h.langd_min_cm)     AS langd_min_cm,
         o.langd_max_cm                               AS langd_max_cm,
         COALESCE(o.dia_min_top_mm, h.dia_min_mm)     AS dia_min_mm,
         COALESCE(o.dia_max_mm, h.dia_max_harledd_mm) AS dia_max_mm,
         CASE WHEN o.sortiment_id IS NOT NULL THEN 'hpr' ELSE 'harledd' END AS kalla
  FROM (SELECT DISTINCT sortiment_id FROM stock) s
  JOIN dim_sortiment ds     ON ds.sortiment_id = s.sortiment_id
  JOIN vy_sortiment_klass k ON k.sortiment_id  = s.sortiment_id
  LEFT JOIN vy_sagbart_fonster_harlett h ON h.sortiment_id = s.sortiment_id
  LEFT JOIN dim_objekt_sortiment_fonster o
         ON o.sortiment_id = s.sortiment_id AND o.objekt_id = p_objekt_id
  WHERE k.grupp IN ('Timmer','Kubb')
    AND COALESCE(o.dia_min_top_mm, h.dia_min_mm) IS NOT NULL
),
massa AS MATERIALIZED (
  SELECT s.*,
         (s.forsta_sagbar IS NOT NULL AND s.log_key < s.forsta_sagbar AND s.langd_cm < 320) AS ar_tre_m,
         EXISTS (SELECT 1 FROM fonster f
                  WHERE s.langd_cm >= f.langd_min_cm
                    AND (f.langd_max_cm IS NULL OR s.langd_cm <= f.langd_max_cm)
                    AND s.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_mm) AS sagbar
  FROM stock s
  WHERE s.grupp = 'Massa'
),
summa AS (
  SELECT SUM(volym_m3sub) AS m3, SUM(langd_cm*volym_m3sub) AS langdvol,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE ar_tre_m),0) AS tre_m3,
         COALESCE(COUNT(*)        FILTER (WHERE ar_tre_m),0) AS tre_st,
         SUM(langd_cm*volym_m3sub) FILTER (WHERE NOT ar_tre_m) AS langdvol_utan,
         SUM(volym_m3sub)          FILTER (WHERE NOT ar_tre_m) AS m3_utan,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE sagbar),0) AS sagbar_m3,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE forsta_sagbar IS NULL AND langd_cm < 320),0) AS usm3,
         COALESCE(COUNT(*)         FILTER (WHERE forsta_sagbar IS NULL AND langd_cm < 320),0) AS usst
  FROM massa
),
per_sortiment AS (
  SELECT f.namn, f.grupp, f.langd_min_cm, f.langd_max_cm, f.dia_min_mm, f.dia_max_mm, f.kalla,
         COALESCE((SELECT SUM(m.volym_m3sub) FROM massa m
                    WHERE m.langd_cm >= f.langd_min_cm
                      AND (f.langd_max_cm IS NULL OR m.langd_cm <= f.langd_max_cm)
                      AND m.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_mm),0) AS m3
  FROM fonster f
),
tradslag_agg AS (
  SELECT CASE WHEN m.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
              WHEN m.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta,
         COALESCE(initcap(lower(dt.namn)),'Okänt trädslag') AS tradslag,
         SUM(m.volym_m3sub) AS m3fub,
         SUM(m.langd_cm*m.volym_m3sub)/NULLIF(SUM(m.volym_m3sub),0)/100 AS medellangd_m,
         COALESCE(SUM(m.volym_m3sub) FILTER (WHERE m.sagbar),0) AS sagbar_m3
  FROM massa m LEFT JOIN dim_tradslag dt ON dt.tradslag_id = m.tradslag_id
  GROUP BY 1,2
),
valta_agg AS (
  SELECT valta, SUM(m3fub) AS m3fub,
         SUM(medellangd_m*m3fub)/NULLIF(SUM(m3fub),0) AS medellangd_m,
         COUNT(*)::int AS antal_tradslag,
         jsonb_agg(jsonb_build_object('namn', tradslag, 'm3fub', ROUND(m3fub,1),
           'medellangd_m', ROUND(medellangd_m,2),
           'sagbar_m3', ROUND(sagbar_m3,1)) ORDER BY m3fub DESC) AS tradslag
  FROM tradslag_agg GROUP BY valta
),
langd_agg AS (
  SELECT klass, ordning, niva, SUM(volym_m3sub) AS m3, COUNT(*)::int AS st,
         COUNT(*) FILTER (WHERE ar_tre_m)::int AS varav_tre_m_st,
         100*SUM(volym_m3sub)/NULLIF(SUM(SUM(volym_m3sub)) OVER (),0) AS andel
  FROM (
    SELECT volym_m3sub, ar_tre_m,
      CASE WHEN langd_cm < 300 THEN 'Under 3,00 m'
           WHEN langd_cm < 315 THEN '3,00–3,14 m'
           WHEN langd_cm < 350 THEN '3,15–3,49 m'
           WHEN langd_cm < 400 THEN '3,5–3,9 m'
           WHEN langd_cm < 460 THEN '4,0–4,59 m'
           WHEN langd_cm < 500 THEN '4,6–4,99 m'
           ELSE '5,0 m och över' END AS klass,
      CASE WHEN langd_cm < 300 THEN 0 WHEN langd_cm < 315 THEN 1 WHEN langd_cm < 350 THEN 2
           WHEN langd_cm < 400 THEN 3 WHEN langd_cm < 460 THEN 4
           WHEN langd_cm < 500 THEN 5 ELSE 6 END AS ordning,
      CASE WHEN langd_cm BETWEEN 300 AND 314 THEN 'tre_m'
           WHEN langd_cm < 460 THEN 'under_mal' ELSE 'over_mal' END AS niva
    FROM massa) x
  GROUP BY 1,2,3
),
avkap AS (
  SELECT CASE WHEN s.langd_cm < 50 THEN '3 dm' ELSE '6 dm' END AS kap,
         COUNT(*)::int AS st, SUM(s.volym_m3sub) AS m3
  FROM stock s JOIN dim_sortiment ds ON ds.sortiment_id = s.sortiment_id
  WHERE ds.namn LIKE 'Energi: Avkap%' GROUP BY 1
)
SELECT jsonb_build_object(
  'objekt_id', p_objekt_id,
  'namn',   (SELECT object_name FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'status', (SELECT CASE WHEN skotning_avslutad IS NOT NULL THEN 'Avslutat'
                         WHEN skordning_avslutad IS NOT NULL THEN 'Skördat, väntar skotning'
                         ELSE 'Pågår' END FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'omfang', CASE WHEN p_manad IS NULL THEN 'objekt' ELSE 'manad' END,
  'manad',  to_char(date_trunc('month', p_manad),'YYYY-MM'),
  'manader', COALESCE((SELECT jsonb_agg(manad ORDER BY manad) FROM alla_manader),'[]'::jsonb),
  'period_fran', (SELECT MIN(manad) FROM alla_manader),
  'period_till', (SELECT MAX(manad) FROM alla_manader),
  'onskad_medellangd_m', massaved_mal(),
  'medellangd_m', ROUND(s.langdvol/NULLIF(s.m3,0)/100,2),
  'total_m3fub',  ROUND(COALESCE(s.m3,0),1),
  'tre_m_stock', jsonb_build_object(
     'm3fub', ROUND(s.tre_m3,1), 'st', s.tre_st,
     'andel', ROUND(100*s.tre_m3/NULLIF(s.m3,0),1),
     'medellangd_utan_m3', ROUND(s.langdvol_utan/NULLIF(s.m3_utan,0)/100,2)),
  'sagbar', jsonb_build_object(
     'm3fub', ROUND(s.sagbar_m3,1),
     'andel', ROUND(100*s.sagbar_m3/NULLIF(s.m3,0),1),
     'sortiment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'namn', namn, 'grupp', grupp, 'langd_min_m', ROUND(langd_min_cm/100.0,2),
          'langd_max_m', ROUND(langd_max_cm/100.0,2),
          'dia_min_mm', dia_min_mm, 'dia_max_mm', dia_max_mm, 'kalla', kalla,
          'm3fub', ROUND(m3,1)) ORDER BY grupp, namn) FROM per_sortiment), '[]'::jsonb),
     'antal_ur_maskinen', (SELECT COUNT(*) FROM fonster WHERE kalla='hpr'),
     'antal_harledda',    (SELECT COUNT(*) FROM fonster WHERE kalla='harledd'),
     'overlapp_m3', ROUND(GREATEST(COALESCE((SELECT SUM(m3) FROM per_sortiment),0) - s.sagbar_m3, 0),1)),
  'valtor', COALESCE((SELECT jsonb_agg(jsonb_build_object('valta', valta, 'm3fub', ROUND(m3fub,1),
      'medellangd_m', ROUND(medellangd_m,2), 'antal_tradslag', antal_tradslag,
      'tradslag', tradslag) ORDER BY valta) FROM valta_agg), '[]'::jsonb),
  'langdfordelning', COALESCE((SELECT jsonb_agg(jsonb_build_object('klass', klass,
      'ordning', ordning, 'niva', niva, 'm3fub', ROUND(m3,1), 'st', st,
      'varav_tre_m_st', varav_tre_m_st, 'andel', ROUND(andel,1)) ORDER BY ordning)
      FROM langd_agg), '[]'::jsonb),
  'avkap', jsonb_build_object(
     'st',    COALESCE((SELECT SUM(st) FROM avkap),0),
     'm3fub', ROUND(COALESCE((SELECT SUM(m3) FROM avkap),0),2),
     'delar', COALESCE((SELECT jsonb_agg(jsonb_build_object('kap', kap, 'st', st,
                'm3fub', ROUND(m3,2)) ORDER BY kap) FROM avkap), '[]'::jsonb)),
  'hemved_m3', ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM stock
       WHERE grupp='Hemved'),0),1),
  'massa_utan_sagbar_stock_m3', ROUND(s.usm3,1),
  'massa_utan_sagbar_stock_st', s.usst
) FROM summa s;
$function$;

CREATE OR REPLACE FUNCTION public.massaved_niva3(p_objekt_id text, p_valta text DEFAULT 'Barr'::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH klass AS MATERIALIZED (
  SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass
),
stam AS MATERIALIZED (
  SELECT sm.maskin_id, sm.stam_key, sm.objekt_id, sm.tradslag_id, opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) AS tidpunkt
  FROM detalj_stam sm WHERE sm.objekt_id = p_objekt_id AND sm.tidpunkt IS NOT NULL
),
alla AS (
  SELECT st.stem_key, st.log_key, st.langd_cm, st.volym_m3sub, st.toppdia_ub_mm,
         st.sortiment_id, sm.tradslag_id, sm.tidpunkt, k.grupp, k.namn AS sortnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN st.log_key END)
           OVER (PARTITION BY st.maskin_id, st.stem_key, st.objekt_id) AS forsta_sagbar
  FROM stam sm
  JOIN detalj_stock st
         ON st.objekt_id = sm.objekt_id AND st.maskin_id = sm.maskin_id
        AND st.stem_key  = sm.stam_key
        AND st.stem_key IS NOT NULL AND st.log_key IS NOT NULL
  LEFT JOIN klass k ON k.sortiment_id = st.sortiment_id
),
-- HPR-fonstret nar det finns, harlett nar det inte gor det. kalla foljer
-- med ut till skarmen: "ur maskinen" och "harlett" far inte se likadana ut.
fonster AS MATERIALIZED (
  SELECT DISTINCT ds.namn, k.grupp,
         COALESCE(o.langd_min_cm, h.langd_min_cm)     AS langd_min_cm,
         o.langd_max_cm                               AS langd_max_cm,
         COALESCE(o.dia_min_top_mm, h.dia_min_mm)     AS dia_min_mm,
         COALESCE(o.dia_max_mm, h.dia_max_harledd_mm) AS dia_max_mm,
         CASE WHEN o.sortiment_id IS NOT NULL THEN 'hpr' ELSE 'harledd' END AS kalla
  FROM (SELECT DISTINCT sortiment_id FROM alla) s
  JOIN dim_sortiment ds     ON ds.sortiment_id = s.sortiment_id
  JOIN vy_sortiment_klass k ON k.sortiment_id  = s.sortiment_id
  LEFT JOIN vy_sagbart_fonster_harlett h ON h.sortiment_id = s.sortiment_id
  LEFT JOIN dim_objekt_sortiment_fonster o
         ON o.sortiment_id = s.sortiment_id AND o.objekt_id = p_objekt_id
  WHERE k.grupp IN ('Timmer','Kubb')
    AND COALESCE(o.dia_min_top_mm, h.dia_min_mm) IS NOT NULL
),
b AS (
  SELECT a.*, COALESCE(initcap(lower(dt.namn)),'Okänt') AS tradslag,
         CASE WHEN a.sortnamn = 'Massa: BmavFall_V3'     THEN 'Barr'
              WHEN a.sortnamn = 'Massa: BjörkmavFall_V3' THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta,
         EXISTS (SELECT 1 FROM fonster f
                  WHERE a.langd_cm >= f.langd_min_cm
                    AND (f.langd_max_cm IS NULL OR a.langd_cm <= f.langd_max_cm)
                    AND a.toppdia_ub_mm BETWEEN f.dia_min_mm AND f.dia_max_mm) AS sagbar
  FROM alla a LEFT JOIN dim_tradslag dt ON dt.tradslag_id = a.tradslag_id
  WHERE a.grupp = 'Massa'
)
SELECT jsonb_build_object(
  'objekt_id', p_objekt_id, 'valta', p_valta,
  'namn', (SELECT object_name FROM dim_objekt WHERE objekt_id = p_objekt_id),
  'antal_totalt', (SELECT COUNT(*) FROM b WHERE valta = p_valta),
  'visas', LEAST(p_limit, (SELECT COUNT(*) FROM b WHERE valta = p_valta)),
  'bitar', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'stam', stem_key, 'bit', log_key,
      'langd_m', ROUND(langd_cm/100.0,2), 'volym_m3fub', ROUND(volym_m3sub,3),
      'toppdia_mm', toppdia_ub_mm, 'tradslag', tradslag,
      'dag', to_char(tidpunkt,'YYYY-MM-DD'),
      'tre_m_stock', (forsta_sagbar IS NOT NULL AND log_key < forsta_sagbar AND langd_cm < 320),
      'sagbar', sagbar)
    ORDER BY langd_cm ASC, stem_key, log_key)
    FROM (SELECT * FROM b WHERE valta = p_valta ORDER BY langd_cm ASC LIMIT p_limit) x), '[]'::jsonb)
);
$function$;

CREATE OR REPLACE FUNCTION public.sortimentsutfall_granser()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object('fran', to_char(MIN(opti_tid_lokal(tidpunkt, tid_ar_utc)),'YYYY-MM'), 'till', to_char(MAX(opti_tid_lokal(tidpunkt, tid_ar_utc)),'YYYY-MM'))
  FROM detalj_stam WHERE tidpunkt IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.sortimentsutfall_manad(p_manad date, p_atgard text DEFAULT 'Slutavverkning'::text, p_bolag text DEFAULT 'Vida'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH gransen AS (
  SELECT date_trunc('month', p_manad)::date AS fran,
         (date_trunc('month', p_manad) + interval '1 month')::date AS till
),
objekt AS (
  SELECT o.objekt_id, o.object_name, o.vo_nummer, o.huvudtyp,
         o.skotning_avslutad, o.skordning_avslutad,
         CASE WHEN o.vo_nummer ~ '^[0-9]+$' THEN o.vo_nummer ELSE o.objekt_id END AS grupp_nyckel
  FROM dim_objekt o
  WHERE (p_bolag = 'Alla' OR o.bolag = p_bolag)
    AND CASE WHEN p_atgard = 'Allt'
             THEN (o.huvudtyp IN ('Slutavverkning','Gallring') OR o.huvudtyp IS NULL)
             ELSE o.huvudtyp = p_atgard END
),
objekt_alla AS (
  SELECT o.objekt_id, COALESCE(o.huvudtyp,'Ej angiven') AS huvudtyp
  FROM dim_objekt o WHERE (p_bolag = 'Alla' OR o.bolag = p_bolag)
),
-- Hemved går till markägaren och når aldrig någon industri. Den ingår
-- aldrig i volym som redovisas mot Vida — inte i totalen, inte i någon
-- grupp, inte i objektens volymer. Gruppen bär regeln, inte ett namnfilter.
rader AS (
  SELECT v.volym_m3sub, v.toppdia_ub_mm, v.objekt_id, ob.grupp_nyckel,
         COALESCE(k.grupp, 'Ej klassad') AS sortimentsgrupp,
         k.destination AS industri
  FROM vy_skordarmatt_stock v
  JOIN objekt ob ON ob.objekt_id = v.objekt_id
  CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  WHERE v.tidpunkt_lokal >= gr.fran AND v.tidpunkt_lokal < gr.till
    AND COALESCE(k.grupp, '') <> 'Hemved'
),
total AS (SELECT COALESCE(SUM(volym_m3sub),0) AS volym FROM rader),
grupper AS (SELECT sortimentsgrupp AS namn, SUM(volym_m3sub) AS volym FROM rader GROUP BY 1),
sagbart AS (SELECT * FROM rader WHERE sortimentsgrupp IN ('Timmer','Kubb')),
diameter AS (
  SELECT COALESCE(industri,'Industri ej angiven') AS industri,
         CASE WHEN toppdia_ub_mm IS NULL OR toppdia_ub_mm = 0 THEN 'Okänd'
              WHEN toppdia_ub_mm < 160 THEN 'Under 16' WHEN toppdia_ub_mm < 200 THEN '16–19'
              WHEN toppdia_ub_mm < 240 THEN '20–23'    WHEN toppdia_ub_mm < 280 THEN '24–27'
              WHEN toppdia_ub_mm < 320 THEN '28–31'    ELSE '32+' END AS klass,
         CASE WHEN toppdia_ub_mm IS NULL OR toppdia_ub_mm = 0 THEN 9
              WHEN toppdia_ub_mm < 160 THEN 1 WHEN toppdia_ub_mm < 200 THEN 2
              WHEN toppdia_ub_mm < 240 THEN 3 WHEN toppdia_ub_mm < 280 THEN 4
              WHEN toppdia_ub_mm < 320 THEN 5 ELSE 6 END AS ordning,
         volym_m3sub
  FROM sagbart
),
industrier AS (SELECT COALESCE(industri,'Industri ej angiven') AS namn, SUM(volym_m3sub) AS volym FROM sagbart GROUP BY 1),
objekt_volym AS (SELECT grupp_nyckel, SUM(volym_m3sub) AS volym FROM rader GROUP BY 1),
objekt_status AS (
  SELECT ob.grupp_nyckel,
         MIN(ob.object_name) FILTER (WHERE ob.object_name IS NOT NULL) AS namn,
         MIN(ob.vo_nummer)   FILTER (WHERE ob.vo_nummer ~ '^[0-9]+$')  AS vo_nummer,
         BOOL_OR(ob.huvudtyp IS NULL)               AS saknar_atgard,
         MAX(ob.skotning_avslutad)                  AS skotning_avslutad,
         BOOL_OR(ob.skordning_avslutad IS NOT NULL) AS nagon_skordning_klar,
         BOOL_OR(EXISTS (SELECT 1 FROM fakt_lass_sortiment fl WHERE fl.objekt_id = ob.objekt_id)) AS har_lass
  FROM objekt ob GROUP BY 1
),
objektlista AS (
  SELECT s.grupp_nyckel, s.namn, s.vo_nummer, ov.volym, s.saknar_atgard,
         CASE WHEN s.skotning_avslutad IS NOT NULL THEN 'Skotat'
              WHEN s.har_lass                      THEN 'Skotning pågår'
              WHEN NOT s.nagon_skordning_klar      THEN 'Avverkning pågår'
              ELSE 'Ej markerad' END AS status,
         s.skotning_avslutad AS status_datum
  FROM objekt_status s JOIN objekt_volym ov ON ov.grupp_nyckel = s.grupp_nyckel
),
stammar AS (
  SELECT COUNT(*) AS i_urval FROM detalj_stam sm
  JOIN objekt ob ON ob.objekt_id = sm.objekt_id CROSS JOIN gransen gr
  WHERE opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) >= gr.fran AND opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) < gr.till
),
per_atgard AS (
  SELECT oa.huvudtyp AS namn, SUM(v.volym_m3sub) AS volym
  FROM vy_skordarmatt_stock v
  JOIN objekt_alla oa ON oa.objekt_id = v.objekt_id CROSS JOIN gransen gr
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = v.sortiment_id
  WHERE v.tidpunkt_lokal >= gr.fran AND v.tidpunkt_lokal < gr.till
    AND COALESCE(k.grupp, '') <> 'Hemved'
  GROUP BY 1
)
SELECT jsonb_build_object(
  'manad', (SELECT to_char(fran,'YYYY-MM') FROM gransen),
  'atgard', p_atgard, 'bolag', p_bolag,
  'total_volym', ROUND((SELECT volym FROM total)::numeric, 1),
  'antal_objekt', (SELECT COUNT(*) FROM objektlista),
  'stammar_i_urval', (SELECT i_urval FROM stammar),
  'grupper', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'namn', namn, 'volym', ROUND(volym::numeric,1),
      'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100*volym::numeric/(SELECT volym FROM total),1) ELSE 0 END)
    ORDER BY volym DESC) FROM grupper), '[]'::jsonb),
  'sagbart', jsonb_build_object(
    'volym', ROUND(COALESCE((SELECT SUM(volym_m3sub) FROM sagbart),0)::numeric,1),
    'andel', CASE WHEN (SELECT volym FROM total) > 0
                  THEN ROUND(100*COALESCE((SELECT SUM(volym_m3sub) FROM sagbart),0)::numeric/(SELECT volym FROM total),1) ELSE 0 END,
    'industrier', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'namn', i.namn, 'volym', ROUND(i.volym::numeric,1),
        'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100*i.volym::numeric/(SELECT volym FROM total),1) ELSE 0 END,
        'klasser', COALESCE((SELECT jsonb_agg(jsonb_build_object('klass', k.klass, 'ordning', k.ordning, 'volym', k.v) ORDER BY k.ordning)
                             FROM (SELECT d.klass, d.ordning, ROUND(SUM(d.volym_m3sub)::numeric,1) AS v
                                   FROM diameter d WHERE d.industri = i.namn
                                   GROUP BY d.klass, d.ordning) k), '[]'::jsonb))
      ORDER BY i.volym DESC) FROM industrier i), '[]'::jsonb)),
  'objekt', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'nyckel', grupp_nyckel, 'namn', namn, 'vo_nummer', vo_nummer,
      'volym', ROUND(volym::numeric,1), 'status', status,
      'status_datum', status_datum, 'saknar_atgard', saknar_atgard)
    ORDER BY volym DESC) FROM objektlista), '[]'::jsonb),
  'volym_per_atgard', COALESCE((SELECT jsonb_agg(jsonb_build_object('namn', namn, 'volym', ROUND(volym::numeric,1)) ORDER BY volym DESC) FROM per_atgard), '[]'::jsonb)
);
$function$;

-- affar_oversikt: planeringsoptimeringen i kommentaren är bevarad. Frågan bygger fortfarande timestamptz-LITERALER mot den råa
-- kolumnen (så planeraren uppskattar antalet stammar rätt och väljer hash join) — fönstret är nu ±3 timmar vidare än månaden/året,
-- eftersom en rad i den gamla konventionen ligger upp till två timmar åt andra hållet — och det exakta urvalet sker sedan på den
-- svenska väggklockan (tidpunkt_lokal) bara på de rader som kommit med.
CREATE OR REPLACE FUNCTION public.affar_oversikt(p_ar integer DEFAULT NULL::integer, p_manad date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_fran date;
  v_till date;
  v_fran_ts timestamptz;
  v_till_ts timestamptz;
  r      jsonb;
BEGIN
  IF p_manad IS NULL THEN
    v_fran := make_date(COALESCE(p_ar, EXTRACT(YEAR FROM now())::int), 1, 1);
    v_till := (v_fran + interval '1 year')::date;
  ELSE
    v_fran := date_trunc('month', p_manad)::date;
    v_till := (v_fran + interval '1 month')::date;
  END IF;
  v_fran_ts := (v_fran::timestamp AT TIME ZONE 'Europe/Stockholm') - interval '3 hours';
  v_till_ts := (v_till::timestamp AT TIME ZONE 'Europe/Stockholm') + interval '3 hours';

  EXECUTE format($sql$
WITH omfang AS (SELECT %1$L::date AS fran, %2$L::date AS till),
-- Klassningen (grupp, industri) görs EN gång per sortiment (~285 rader) — inte per stockrad. Utan MATERIALIZED inlinas vyn
-- vy_sortiment_klass och normalisera() körs för varje stock (~420 000 gånger per år), vilket mer än fördubblade körtiden för ett helt år.
klass AS MATERIALIZED (SELECT sortiment_id, grupp, destination FROM vy_sortiment_klass),
-- Stockarna summeras först på heltalsnycklar (månad, objekt, sortiment, trädslag): ~1 100 rader i stället för 420 000 att sortera.
-- Tidsgränserna är LITERALER av typen timestamptz (funktionen bygger frågan per anrop): planeraren ser datumen OCH jämför samma typ som
-- kolumnen, och uppskattar därför rätt antal stammar (~232 800 för ett år) och väljer hash join (~1,8 s). Med okända parametrar (ren
-- SQL-funktion) eller med date-literaler mot en timestamptz-kolumn (korstyp-operator utan histogramstöd) uppskattar den ~1 stam, väljer
-- nested loop med 160 000-620 000 indexuppslag och tar 8,6 s — över PostgREST:s 8 s-gräns som authenticated.
-- Fönstret är ±3 h vidare än perioden (båda konventionerna ryms); det exakta urvalet är det svenska datumet i tidpunkt_lokal.
bas AS (
  SELECT date_trunc('month', v.tidpunkt_lokal)::date AS manad, v.objekt_id, v.sortiment_id, v.tradslag_id, SUM(v.volym_m3sub) AS volym
  FROM vy_skordarmatt_stock v
  JOIN dim_objekt o ON o.objekt_id = v.objekt_id AND o.bolag = 'Vida'
  WHERE v.tidpunkt >= %4$L::timestamptz AND v.tidpunkt < %5$L::timestamptz
    AND v.tidpunkt_lokal >= %1$L::date AND v.tidpunkt_lokal < %2$L::date
  GROUP BY 1, 2, 3, 4
),
-- Allt som räknas, ett steg: per månad, objekt, trädslagsklass, sortimentgrupp och industri. Resten är summor av den här.
-- Bara Vida, alla huvudtyper (grot och objekt utan åtgärd ingår), Hemved borträknad — den går till markägaren, inte Vida.
-- Barr = gran + tall, löv = allt annat. Allt som inte är Timmer/Kubb/Massa hamnar i Energi och övrigt (energi, toppar och rens,
-- stammar utan sortiment), så delarna alltid summerar till totalen.
rader AS (
  SELECT b.manad, b.objekt_id,
         CASE t.namn WHEN 'GRAN' THEN 'gran' WHEN 'TALL' THEN 'tall' ELSE 'lov' END AS slag,
         CASE WHEN k.grupp IN ('Timmer','Kubb','Massa') THEN k.grupp ELSE 'Energi' END AS grupp,
         k.destination AS industri,
         SUM(b.volym) AS volym
  FROM bas b
  LEFT JOIN klass k ON k.sortiment_id = b.sortiment_id
  LEFT JOIN dim_tradslag t ON t.tradslag_id = b.tradslag_id
  WHERE COALESCE(k.grupp, '') <> 'Hemved'
  GROUP BY 1, 2, 3, 4, 5
),
total AS (SELECT COALESCE(SUM(volym), 0) AS volym FROM rader),
barr_rader AS (
  SELECT CASE WHEN grupp = 'Timmer' AND slag = 'gran' THEN 'grantimmer'
              WHEN grupp = 'Timmer' AND slag = 'tall' THEN 'talltimmer'
              WHEN grupp = 'Kubb'  THEN 'kubb'
              WHEN grupp = 'Massa' THEN 'massaved'
              ELSE 'energi' END AS nyckel, industri, volym
  FROM rader WHERE slag IN ('gran', 'tall')
),
lov_rader AS (
  SELECT CASE grupp WHEN 'Timmer' THEN 'timmer' WHEN 'Kubb' THEN 'kubb' WHEN 'Massa' THEN 'massaved' ELSE 'energi' END AS nyckel, volym
  FROM rader WHERE slag = 'lov'
),
barr_def(nyckel, namn, ordning) AS (VALUES ('grantimmer','Grantimmer',1), ('talltimmer','Talltimmer',2), ('kubb','Kubb',3), ('massaved','Massaved',4), ('energi','Energi och övrigt',5)),
lov_def(nyckel, namn, ordning)  AS (VALUES ('timmer','Timmer',1), ('kubb','Kubb',2), ('massaved','Massaved',3), ('energi','Energi och övrigt',4)),
barr_summa AS (
  SELECT d.nyckel, d.namn, d.ordning, COALESCE(SUM(b.volym), 0) AS volym
  FROM barr_def d LEFT JOIN barr_rader b ON b.nyckel = d.nyckel GROUP BY 1, 2, 3
),
lov_summa AS (
  SELECT d.nyckel, d.namn, d.ordning, COALESCE(SUM(l.volym), 0) AS volym
  FROM lov_def d LEFT JOIN lov_rader l ON l.nyckel = d.nyckel GROUP BY 1, 2, 3
),
-- Industri bara för de sågbara sortimenten. Stödlängd är ingen industri (ar_industri = false) och ligger sist, dämpat; ett
-- sortiment utan känd industri syns som 'Industri ej angiven' i stället för att försvinna.
industrier AS (
  SELECT b.nyckel, COALESCE(b.industri, 'Industri ej angiven') AS namn,
         (b.industri IS NOT NULL AND b.industri <> 'Stödlängd') AS ar_industri, SUM(b.volym) AS volym
  FROM barr_rader b WHERE b.nyckel IN ('grantimmer', 'talltimmer', 'kubb') GROUP BY 1, 2, 3
),
manader AS (
  SELECT (om.fran + g.n * interval '1 month')::date AS manad, COALESCE(SUM(r.volym), 0) AS volym
  FROM omfang om CROSS JOIN generate_series(0, 11) g(n)
  LEFT JOIN rader r ON r.manad = (om.fran + g.n * interval '1 month')::date
  WHERE %3$s
  GROUP BY 1
),
objekt AS (SELECT r.objekt_id, SUM(r.volym) AS volym FROM rader r GROUP BY 1)
SELECT jsonb_build_object(
  'bolag', 'Vida',
  'ar', (SELECT EXTRACT(YEAR FROM fran)::int FROM omfang),
  'manad', CASE WHEN %3$s THEN NULL ELSE to_char((SELECT fran FROM omfang), 'YYYY-MM') END,
  'total_volym', ROUND((SELECT volym FROM total)::numeric, 1),
  'antal_objekt', (SELECT COUNT(*) FROM objekt),
  'barr', jsonb_build_object(
    'volym', ROUND((SELECT COALESCE(SUM(volym), 0) FROM barr_summa)::numeric, 1),
    'andel', CASE WHEN (SELECT volym FROM total) > 0
                  THEN ROUND(100 * (SELECT SUM(volym) FROM barr_summa)::numeric / (SELECT volym FROM total), 1) ELSE 0 END,
    'rader', (SELECT jsonb_agg(jsonb_build_object(
        'nyckel', s.nyckel, 'namn', s.namn, 'volym', ROUND(s.volym::numeric, 1),
        'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100 * s.volym::numeric / (SELECT volym FROM total), 1) ELSE 0 END,
        'sagbart', s.nyckel IN ('grantimmer', 'talltimmer', 'kubb'),
        'industrier', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'namn', i.namn, 'volym', ROUND(i.volym::numeric, 1),
            'andel', CASE WHEN s.volym > 0 THEN ROUND(100 * i.volym::numeric / s.volym, 1) ELSE 0 END,
            'ar_industri', i.ar_industri) ORDER BY i.ar_industri DESC, i.volym DESC)
          FROM industrier i WHERE i.nyckel = s.nyckel), '[]'::jsonb)) ORDER BY s.ordning) FROM barr_summa s)
  ),
  'lov', jsonb_build_object(
    'volym', ROUND((SELECT COALESCE(SUM(volym), 0) FROM lov_summa)::numeric, 1),
    'andel', CASE WHEN (SELECT volym FROM total) > 0
                  THEN ROUND(100 * (SELECT SUM(volym) FROM lov_summa)::numeric / (SELECT volym FROM total), 1) ELSE 0 END,
    'rader', (SELECT jsonb_agg(jsonb_build_object(
        'nyckel', s.nyckel, 'namn', s.namn, 'volym', ROUND(s.volym::numeric, 1),
        'andel', CASE WHEN (SELECT volym FROM total) > 0 THEN ROUND(100 * s.volym::numeric / (SELECT volym FROM total), 1) ELSE 0 END)
        ORDER BY s.ordning) FROM lov_summa s)
  ),
  'manader', COALESCE((SELECT jsonb_agg(jsonb_build_object('manad', to_char(m.manad, 'YYYY-MM'), 'volym', ROUND(m.volym::numeric, 1)) ORDER BY m.manad) FROM manader m), '[]'::jsonb),
  'objekt', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'objekt_id', ob.objekt_id, 'namn', d.object_name, 'vo_nummer', d.vo_nummer, 'volym', ROUND(ob.volym::numeric, 1))
      ORDER BY ob.volym DESC) FROM objekt ob JOIN dim_objekt d ON d.objekt_id = ob.objekt_id), '[]'::jsonb)
)
  $sql$, v_fran, v_till, (p_manad IS NULL)::text, v_fran_ts, v_till_ts) INTO r;

  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hogar_for_objekt(p_objekt_id text)
 RETURNS TABLE(lat double precision, lng double precision, volym numeric, stammar integer, grot_stammar integer, tradslag_json jsonb, sortiment_json jsonb, datum date)
 LANGUAGE sql
 STABLE
AS $function$
  WITH stam AS (
    SELECT ds.latitude, ds.longitude, COALESCE(ds.total_volym, 0) AS vol,
      COALESCE(dt.namn, 'OKÄNT') AS tradslag, ds.sortiment, ds.bio_energy_adaption,
      opti_tid_lokal(ds.tidpunkt, ds.tid_ar_utc) AS tidpunkt,
      floor(ds.latitude / 0.00009)::bigint AS gy, floor(ds.longitude / 0.00016)::bigint AS gx
    FROM detalj_stam ds LEFT JOIN dim_tradslag dt ON dt.tradslag_id = ds.tradslag_id
    WHERE ds.objekt_id = p_objekt_id AND ds.latitude IS NOT NULL AND ds.longitude IS NOT NULL
  ),
  grp AS (
    SELECT gx, gy, avg(latitude) AS lat, avg(longitude) AS lng, sum(vol) AS volym, count(*) AS stammar,
      count(*) FILTER (WHERE bio_energy_adaption IS NOT NULL) AS grot_stammar, max(tidpunkt) AS tid
    FROM stam GROUP BY gx, gy
  ),
  ts AS (SELECT gx, gy, jsonb_object_agg(tradslag, c) AS j FROM (SELECT gx, gy, tradslag, count(*) AS c FROM stam GROUP BY gx, gy, tradslag) x GROUP BY gx, gy),
  so AS (SELECT gx, gy, jsonb_object_agg(sortiment, v) AS j FROM (SELECT gx, gy, sortiment, sum(vol) AS v FROM stam WHERE sortiment IS NOT NULL GROUP BY gx, gy, sortiment) y GROUP BY gx, gy)
  SELECT grp.lat, grp.lng, round(grp.volym::numeric, 2) AS volym, grp.stammar::integer, grp.grot_stammar::integer,
    COALESCE(ts.j, '{}'::jsonb) AS tradslag_json, COALESCE(so.j, '{}'::jsonb) AS sortiment_json, grp.tid::date AS datum
  FROM grp LEFT JOIN ts USING (gx, gy) LEFT JOIN so USING (gx, gy)
  WHERE grp.volym > 0.01;
$function$;

CREATE OR REPLACE FUNCTION public.kontroll_stammar_utan_stockar(p_min_stammar integer DEFAULT 100)
 RETURNS TABLE(objekt_id text, namn text, huvudtyp text, stammar bigint, forsta date, sista date, maskiner text, kalla text, filer text[], stockar_utan_nyckel bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT s.objekt_id, o.object_name, o.huvudtyp, count(*) AS stammar,
         min(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS forsta, max(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS sista,
         string_agg(DISTINCT s.maskin_id, ',') AS maskiner,
         CASE WHEN bool_and(s.filnamn ILIKE '%.hpr') THEN 'hpr'
              WHEN bool_and(s.filnamn ILIKE '%.mom') THEN 'mom'
              ELSE 'blandat' END AS kalla,
         array_agg(DISTINCT s.filnamn) AS filer,
         (SELECT count(*) FROM detalj_stock k
           WHERE k.objekt_id = s.objekt_id AND (k.stem_key IS NULL OR k.log_key IS NULL)) AS stockar_utan_nyckel
  FROM detalj_stam s
  LEFT JOIN dim_objekt o ON o.objekt_id = s.objekt_id
  WHERE s.objekt_id IS NOT NULL
  GROUP BY 1, 2, 3
  HAVING count(*) >= p_min_stammar
     AND NOT EXISTS (SELECT 1 FROM detalj_stock k
                     WHERE k.objekt_id = s.objekt_id
                       AND k.stem_key IS NOT NULL AND k.log_key IS NOT NULL)
  ORDER BY min(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc)) NULLS FIRST, count(*) DESC;
$function$;

-- Räknade redan om tidpunkt från UTC till Stockholm — vilket var FEL för de äldre raderna (väggklocka lagrad som UTC): en stam
-- kl 22–24 svensk tid hamnade på nästa dag. Nu via flaggan. Det råa tidsfiltret behålls (±1/+2 dygn, rymmer båda
-- konventionerna); den exakta dagen avgörs på tidpunkt_lokal.
CREATE OR REPLACE FUNCTION public.maskindata_flertrad_period(p_maskin_ids text[], p_start date, p_slut date)
 RETURNS TABLE(dag date, stammar_alla bigint, stammar_matta bigint, bunt_stammar bigint, grepp bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH matta_filer AS (
    SELECT DISTINCT filnamn FROM detalj_stam
    WHERE maskin_id = ANY(p_maskin_ids) AND filnamn IS NOT NULL
      AND skapad_tid >= TIMESTAMPTZ '2026-08-23 00:00:00+00'
  ),
  rader AS (
    SELECT opti_tid_lokal(s.tidpunkt, s.tid_ar_utc)::date AS dag,
           s.maskin_id, s.objekt_id, s.stam_bunt_nyckel,
           (s.filnamn IS NOT NULL AND s.filnamn IN (SELECT filnamn FROM matta_filer)) AS matt
    FROM detalj_stam s
    WHERE s.maskin_id = ANY(p_maskin_ids) AND s.tidpunkt IS NOT NULL
      AND s.tidpunkt >= (p_start - 1)::timestamp AT TIME ZONE 'Europe/Stockholm'
      AND s.tidpunkt <  (p_slut  + 2)::timestamp AT TIME ZONE 'Europe/Stockholm'
      AND opti_tid_lokal(s.tidpunkt, s.tid_ar_utc)::date BETWEEN p_start AND p_slut
  )
  SELECT dag,
    COUNT(*)                                                      AS stammar_alla,
    COUNT(*) FILTER (WHERE matt)                                  AS stammar_matta,
    COUNT(*) FILTER (WHERE matt AND stam_bunt_nyckel IS NOT NULL) AS bunt_stammar,
    COUNT(DISTINCT (maskin_id, objekt_id, stam_bunt_nyckel))
      FILTER (WHERE matt AND stam_bunt_nyckel IS NOT NULL)        AS grepp
  FROM rader GROUP BY dag ORDER BY dag
$function$;

-- fakt_sortiment.datum är maskinens LOKALA dag (som förut: tidpunkt AT TIME ZONE 'UTC' på en väggklocka-som-UTC), nu via flaggan.
CREATE OR REPLACE FUNCTION public.rebuild_fakt_sortiment(p_maskin_id text, p_objekt_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_nya       int;
  v_gamla     int;
  v_vol_fore  numeric;
  v_vol_efter numeric;
BEGIN
  CREATE TEMP TABLE _ny_fakt_sortiment ON COMMIT DROP AS
  SELECT opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc)::date AS datum,
         st.maskin_id,
         st.objekt_id,
         st.sortiment_id,
         COUNT(*)::int                    AS stockar,
         SUM(st.volym_m3sob)              AS volym_m3sob,
         SUM(st.volym_m3sub)              AS volym_m3sub,
         AVG(NULLIF(st.langd_cm, 0))      AS medel_langd_cm,
         AVG(NULLIF(st.toppdia_ob_mm, 0)) AS medel_toppdia_mm
  FROM detalj_stock st
  JOIN detalj_stam sm
         ON sm.maskin_id = st.maskin_id
        AND sm.stam_key  = st.stem_key
        AND sm.objekt_id = st.objekt_id
  WHERE st.maskin_id = p_maskin_id
    AND st.objekt_id = p_objekt_id
    AND st.stem_key  IS NOT NULL
    AND st.log_key   IS NOT NULL
    AND sm.tidpunkt  IS NOT NULL
  GROUP BY 1, 2, 3, 4;

  SELECT COUNT(*) INTO v_nya FROM _ny_fakt_sortiment;

  SELECT COUNT(*), COALESCE(SUM(volym_m3sub), 0) INTO v_gamla, v_vol_fore
  FROM fakt_sortiment WHERE maskin_id = p_maskin_id AND objekt_id = p_objekt_id;

  IF v_nya = 0 THEN
    RETURN jsonb_build_object(
      'status', 'hoppad', 'skal', 'inga joinbara stockar — rör ingenting',
      'maskin_id', p_maskin_id, 'objekt_id', p_objekt_id,
      'rader_fore', v_gamla, 'rader_efter', v_gamla,
      'volym_fore', ROUND(v_vol_fore, 1), 'volym_efter', ROUND(v_vol_fore, 1));
  END IF;

  DELETE FROM fakt_sortiment WHERE maskin_id = p_maskin_id AND objekt_id = p_objekt_id;

  INSERT INTO fakt_sortiment (datum, maskin_id, objekt_id, sortiment_id, stockar,
                              volym_m3sob, volym_m3sub, medel_langd_cm, medel_toppdia_mm, filnamn)
  SELECT datum, maskin_id, objekt_id, sortiment_id, stockar,
         volym_m3sob, volym_m3sub, medel_langd_cm, medel_toppdia_mm, NULL
  FROM _ny_fakt_sortiment;

  SELECT COALESCE(SUM(volym_m3sub), 0) INTO v_vol_efter
  FROM fakt_sortiment WHERE maskin_id = p_maskin_id AND objekt_id = p_objekt_id;

  RETURN jsonb_build_object(
    'status', 'ombyggd',
    'maskin_id', p_maskin_id, 'objekt_id', p_objekt_id,
    'rader_fore', v_gamla, 'rader_efter', v_nya,
    'volym_fore', ROUND(v_vol_fore, 1), 'volym_efter', ROUND(v_vol_efter, 1));
END
$function$;

-- berakna_utfall_objekt: enda ändringen är att stock-steget hämtar den svenska väggklockan (tidpunkt_lokal) i stället för det
-- råa värdet. Resten (månad per stam, första dag, utfall_manad) bygger på den som förut.
-- OBS: utfall_manad / utfall_objekt är lagrade härledda tal. Efter migrationen: kör berakna_utfall_objekt(true, <antal>) så att
-- de räknas om med rätt månadsgräns (stammar nära månadsskiftet kan byta månad).
CREATE OR REPLACE FUNCTION public.berakna_utfall_objekt(p_allt boolean DEFAULT false, p_max integer DEFAULT 5, p_fore timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  t0 timestamptz := clock_timestamp();
  v_hemved text[];
  v_lov text[];
  v_raknade int; v_kvar int; v_borttagna int;
BEGIN
  -- Hemvedsortimenten som en ARRAY, inte en join. Som CTE valde planeraren
  -- nested loop anti join mot den per stock — 143 396 × 277 rader, 6 s för
  -- tio objekt — eftersom den underskattar batchen till tolv rader. Ett
  -- = ANY mot tjugo värden går inte att planera fel.
  SELECT coalesce(array_agg(sortiment_id), '{}') INTO v_hemved
  FROM vy_sortiment_klass WHERE grupp = 'Hemved';

  -- Lövträdslagen som en ARRAY av tradslag_id, av samma skäl som hemved ovan.
  SELECT coalesce(array_agg(tradslag_id), '{}') INTO v_lov
  FROM dim_tradslag WHERE namn IN ('BJÖRK', 'ÖVR_LÖV', 'ÖVR LÖV', 'LÖV', 'LOV2');

  WITH nyckel AS (
    SELECT s.objekt_id, s.n::int AS stockar_antal, coalesce(m.n, 0)::int AS stammar_antal
    FROM (SELECT objekt_id, count(*) AS n FROM detalj_stock
          WHERE stem_key IS NOT NULL AND log_key IS NOT NULL AND objekt_id IS NOT NULL
          GROUP BY 1) s
    LEFT JOIN (SELECT objekt_id, count(*) AS n FROM detalj_stam
               WHERE objekt_id IS NOT NULL GROUP BY 1) m ON m.objekt_id = s.objekt_id
  ),
  alla_andrade AS (
    SELECT n.* FROM nyckel n
    LEFT JOIN utfall_objekt u ON u.objekt_id = n.objekt_id
    WHERE u.objekt_id IS NULL
       OR u.stockar_antal <> n.stockar_antal OR u.stammar_antal <> n.stammar_antal
       OR (p_allt AND u.beraknad < p_fore)
       OR u.lov_m3 IS NULL
       OR u.manad_beraknad IS NULL
  ),
  andrade AS (SELECT * FROM alla_andrade ORDER BY objekt_id LIMIT p_max),
  klass AS MATERIALIZED (SELECT sortiment_id, namn, grupp FROM vy_sortiment_klass),
  -- Batchens stockar, hemved bort på gruppen INNAN något summeras. IS NULL-
  -- vakten: en stock utan sortiment ska vara kvar, precis som
  -- coalesce(grupp, '') <> 'Hemved' höll den kvar live.
  stock AS (
    SELECT v.objekt_id, v.maskin_id, v.stem_key, v.sortiment_id, v.volym_m3sub, v.tidpunkt_lokal AS tidpunkt, v.tradslag_id, v.langd_cm
    FROM vy_skordarmatt_stock v
    JOIN andrade a ON a.objekt_id = v.objekt_id
    WHERE v.sortiment_id IS NULL OR NOT (v.sortiment_id = ANY (v_hemved))
  ),
  -- Klassen sätts på (objekt, sortiment) — ett par hundra rader — inte per
  -- stock. Per stock underskattade planeraren batchen till tolv rader och
  -- valde nested loop mot klasslistan: 143 396 stockar × 277 rader, 9,5 s
  -- för tio objekt. Summorna är desamma, numeric adderas exakt.
  per_objekt AS (
    SELECT objekt_id, min(tidpunkt)::date AS forsta,
           count(DISTINCT (maskin_id, stem_key)) AS stammar, sum(volym_m3sub) AS volym,
           coalesce(sum(volym_m3sub) FILTER (WHERE tradslag_id = ANY (v_lov)), 0) AS lov
    FROM stock GROUP BY 1
  ),
  per_grupp AS (
    SELECT s.objekt_id, k.grupp, sum(s.volym) AS volym
    FROM (SELECT objekt_id, sortiment_id, sum(volym_m3sub) AS volym FROM stock GROUP BY 1, 2) s
    LEFT JOIN klass k ON k.sortiment_id = s.sortiment_id
    GROUP BY 1, 2
  ),
  -- Per objekt och MÅNAD (stammens tidpunkt), hemved bort: samma bas som sortimentsutfall_manad.
  manad_tal AS (
    SELECT m.objekt_id, m.manad, sum(m.volym) AS volym,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp IN ('Kubb', 'Klentimmer')), 0) AS kubb,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Massa'), 0) AS massa,
           coalesce(sum(m.volym) FILTER (WHERE k.grupp = 'Massa' AND k.namn = 'Massa: BmavFall_V3'), 0) AS massa_barr,
           coalesce(sum(m.lm) FILTER (WHERE k.grupp = 'Massa' AND k.namn = 'Massa: BmavFall_V3'), 0) AS massa_barr_lm,
           sum(m.stockar)::int AS stockar
    FROM (SELECT objekt_id, date_trunc('month', tidpunkt)::date AS manad, sortiment_id,
                 sum(volym_m3sub) AS volym, sum(langd_cm * volym_m3sub) AS lm, count(*) AS stockar
          FROM stock WHERE tidpunkt IS NOT NULL GROUP BY 1, 2, 3) m
    LEFT JOIN klass k ON k.sortiment_id = m.sortiment_id
    GROUP BY 1, 2
  ),
  tal AS (
    SELECT o.objekt_id, o.forsta, o.stammar, o.volym, o.lov,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Timmer'), 0) AS timmer,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp IN ('Kubb', 'Klentimmer')), 0) AS kubb,
           coalesce(sum(g.volym) FILTER (WHERE g.grupp = 'Massa'),  0) AS massa
    FROM per_objekt o LEFT JOIN per_grupp g ON g.objekt_id = o.objekt_id
    GROUP BY 1, 2, 3, 4, 5
  ),
  skrivna AS (
    INSERT INTO utfall_objekt (objekt_id, forsta, stammar, volym, timmer_m3, kubb_m3, massa_m3, lov_m3,
                               stockar_antal, stammar_antal, beraknad, kontrollerad, manad_beraknad)
    -- LEFT JOIN: ett objekt vars alla stockar är hemved får en rad med noll,
    -- annars vore det "ändrat" vid varje körning.
    SELECT a.objekt_id, t.forsta, coalesce(t.stammar, 0), coalesce(t.volym, 0),
           coalesce(t.timmer, 0), coalesce(t.kubb, 0), coalesce(t.massa, 0), coalesce(t.lov, 0),
           a.stockar_antal, a.stammar_antal, now(), now(), now()
    FROM andrade a LEFT JOIN tal t ON t.objekt_id = a.objekt_id
    ON CONFLICT (objekt_id) DO UPDATE SET
      forsta = EXCLUDED.forsta, stammar = EXCLUDED.stammar, volym = EXCLUDED.volym,
      timmer_m3 = EXCLUDED.timmer_m3, kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3, lov_m3 = EXCLUDED.lov_m3,
      stockar_antal = EXCLUDED.stockar_antal, stammar_antal = EXCLUDED.stammar_antal,
      beraknad = now(), kontrollerad = now(), manad_beraknad = now()
    RETURNING 1
  ),
  skrivna_manad AS (
    INSERT INTO utfall_manad (objekt_id, manad, volym, timmer_m3, kubb_m3, massa_m3,
                              massa_barr_m3, massa_barr_lm, stockar, beraknad)
    SELECT objekt_id, manad, volym, timmer, kubb, massa, massa_barr, massa_barr_lm, stockar, now()
    FROM manad_tal
    ON CONFLICT (objekt_id, manad) DO UPDATE SET
      volym = EXCLUDED.volym, timmer_m3 = EXCLUDED.timmer_m3, kubb_m3 = EXCLUDED.kubb_m3, massa_m3 = EXCLUDED.massa_m3,
      massa_barr_m3 = EXCLUDED.massa_barr_m3, massa_barr_lm = EXCLUDED.massa_barr_lm, stockar = EXCLUDED.stockar,
      beraknad = now()
    RETURNING 1
  )
  SELECT count(*), (SELECT count(*) FROM alla_andrade) - count(*)
    INTO v_raknade, v_kvar FROM skrivna;

  -- Objekt som inte längre har stockdata (omimport under ny nyckel): raden bort.
  DELETE FROM utfall_objekt u
  WHERE NOT EXISTS (SELECT 1 FROM detalj_stock s
                    WHERE s.objekt_id = u.objekt_id AND s.stem_key IS NOT NULL AND s.log_key IS NOT NULL);
  GET DIAGNOSTICS v_borttagna = ROW_COUNT;

  DELETE FROM utfall_manad m
  WHERE NOT EXISTS (SELECT 1 FROM utfall_objekt u WHERE u.objekt_id = m.objekt_id);
  -- En månad som objektet inte längre har stockar i: raden skrevs inte om nu, och objektet gjorde det.
  DELETE FROM utfall_manad m
  USING utfall_objekt u
  WHERE u.objekt_id = m.objekt_id AND u.manad_beraknad = now() AND m.beraknad < now();

  -- Oförändrade rader: bara avstämningstiden flyttas.
  UPDATE utfall_objekt SET kontrollerad = now() WHERE kontrollerad < now();

  RETURN jsonb_build_object(
    'raknade', v_raknade, 'kvar', v_kvar, 'borttagna', v_borttagna,
    'rader', (SELECT count(*) FROM utfall_objekt),
    'manadrader', (SELECT count(*) FROM utfall_manad),
    'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000),
    'roll', current_user,
    'statement_timeout', current_setting('statement_timeout'));
END $function$;

-- ── 8. Flytten av de små tabellerna (en gång) och kvitto ──────────────────────────────────────────────────────────────
-- detalj_stam och detalj_gps_spar flyttas i omgångar efteråt (se början av filen).
SELECT * FROM opti_tider_till_utc('fakt_skift');
SELECT * FROM opti_tider_till_utc('hpr_filer');
SELECT * FROM opti_tider_till_utc('detalj_kontroll_stock');

DO $kvitto$
DECLARE
  kvar bigint;
BEGIN
  SELECT (SELECT count(*) FROM fakt_skift WHERE NOT tid_ar_utc)
       + (SELECT count(*) FROM detalj_kontroll_stock WHERE NOT tid_ar_utc)
       + (SELECT count(*) FROM hpr_filer WHERE NOT tid_ar_utc) INTO kvar;
  IF kvar <> 0 THEN
    RAISE EXCEPTION 'Opti-tider: % rader är fortfarande märkta som äldre efter flytten — avbryter', kvar;
  END IF;
  -- Före flytten låg dagens tider upp till två timmar i framtiden (väggklocka tolkad som UTC). Efter: inga.
  IF EXISTS (SELECT 1 FROM fakt_skift WHERE utloggning_tid > now() + interval '30 minutes') THEN
    RAISE EXCEPTION 'Opti-tider ligger fortfarande i framtiden efter flytten — avbryter';
  END IF;
END $kvitto$;
