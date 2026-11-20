-- Tröskelvärden för vilo-detektering. Tidigare hårdkodade på 7 ställen i
-- lib/vilobrott.ts och components/arbetsrapport/Arbetsrapport.tsx.
-- Flyttas hit så de kan justeras utan deploy och så att alla tre kodställen
-- läser samma värden.

ALTER TABLE gs_avtal
  ADD COLUMN IF NOT EXISTS dygnsvila_krav_h             NUMERIC NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS dygnsvila_varning_h          NUMERIC NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS veckovila_krav_h             NUMERIC NOT NULL DEFAULT 36,
  ADD COLUMN IF NOT EXISTS veckovila_fonster_dagar      INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS kompensation_deadline_dagar  INTEGER NOT NULL DEFAULT 14;

COMMENT ON COLUMN gs_avtal.dygnsvila_krav_h IS
  'Krav på sammanhängande dygnsvila i timmar (§13 arbetstidslagen).';
COMMENT ON COLUMN gs_avtal.dygnsvila_varning_h IS
  'Tröskel för orange "kort dygnsvila"-varning. Mellan krav_h och varning_h = varning, under krav_h = brott. Ska visas konsekvent i alla förarvyer (Dag + Min tid).';
COMMENT ON COLUMN gs_avtal.veckovila_krav_h IS
  'Krav på sammanhängande veckovila i timmar (§14 arbetstidslagen).';
COMMENT ON COLUMN gs_avtal.veckovila_fonster_dagar IS
  'Rullande fönster för veckovila i dagar. 7 = lagkravet.';
COMMENT ON COLUMN gs_avtal.kompensation_deadline_dagar IS
  'Dagar inom vilka kompensationsvila ska tas ut efter ett vilobrott. EU-domstolen: ska klistra fast vid nästa dygnsvila, men vi använder en deadline tills automatiken finns.';

-- Postgres 11+ fyller befintliga rader automatiskt vid ADD COLUMN ... DEFAULT.
-- Verifiering: SELECT dygnsvila_krav_h, veckovila_krav_h FROM gs_avtal;
