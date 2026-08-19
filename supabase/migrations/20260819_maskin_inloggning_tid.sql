-- KÖRS AV MARTIN mot prod FÖRE koden deployas. Skriv inte om.
--
-- UPPFÖLJNING av maskinstart, INTE korrigering. Angiven start (inloggning_tid)
-- styr arbetsdag/lön precis som förr — "ställer dom att börja 05:00 ska dom ha
-- betalt från 05:00". Dessa två fält gör bara skillnaden mot maskinens EGEN login
-- synlig och klassificerbar. Föraren tappar aldrig tid han ska ha betalt för.
--
-- fakt_skift.maskin_inloggning_tid
--   Maskinens egen OperatorLoginTime (StanForD) — rå, per skift, vid sidan av
--   inloggning_tid (den angivna). Idag kastas den bort: parsern läser bara
--   OperatorShiftDefinition (som Rottne saknar) och syntetiserar annars skiftet ur
--   tidigaste WorkTime-blocket — vilket kan vara ett handsatt/testblock. Den äkta
--   login-tiden finns i OperatorLoginTime och importeras nu separat.
--
-- arbetsdag.tidigarelagd_start
--   Härledd signal + kvittens. Sätts av mom-import när maskinen loggade in
--   > 30 min EFTER angiven start (= föraren angav en TIDIGARE start än maskinen
--   registrerade). Normal morgonrutin (maskin-login FÖRE eller vid angiven start)
--   ger aldrig utslag. Namnges medvetet UTAN "avvikelse": arbetsdag har redan
--   synk_avvikelse (bekräftad tid mot MOM-filen), en helt annan jämförelse.
--     Form:     { angiven_start, maskin_start, gap_min, upptackt }
--     Kvittens: { kvitterad, val: 'markt_segment' | 'hoppad', aktivitet, segment_id }
--   Perioden (angiven_start → maskin_start) ligger INOM arbetsdagen och är REDAN
--   betald → klassas som arbetsdag_segment, ALDRIG extra_tid (skulle dubbelbetala).

ALTER TABLE fakt_skift ADD COLUMN IF NOT EXISTS maskin_inloggning_tid timestamptz;
ALTER TABLE arbetsdag  ADD COLUMN IF NOT EXISTS tidigarelagd_start jsonb;

COMMENT ON COLUMN fakt_skift.maskin_inloggning_tid IS
  'Maskinens egen OperatorLoginTime (StanForD). Rå audit-tid vid sidan av '
  'inloggning_tid (den angivna som styr arbetsdag/lön). Skiljer angiven start '
  'från maskinregistrerad login.';

COMMENT ON COLUMN arbetsdag.tidigarelagd_start IS
  'Angiven start ligger > 30 min FÖRE maskinens login: '
  '{angiven_start, maskin_start, gap_min, upptackt} + kvittens '
  '{kvitterad, val, aktivitet, segment_id}. Perioden ligger inom dagen (redan '
  'betald) → klassas som arbetsdag_segment, aldrig extra_tid. Skilt från synk_avvikelse.';
