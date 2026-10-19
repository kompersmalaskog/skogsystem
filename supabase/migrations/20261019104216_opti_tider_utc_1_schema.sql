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
