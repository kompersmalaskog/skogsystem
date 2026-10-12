-- REDAN APPLICERAD I PROD 2026-09-26 (Martin) — KÖR INTE OM.
-- Verifierat efteråt: domänen har tretton värden, befintlig data orörd.
--
-- Tre aktivitetstyper för tid som inte hör till ett maskinpass — Joacims
-- planeringsdagar: planering på trakt, restid mellan trakter (objektlös),
-- manuellt arbete (motorsåg, röjning). Domänen aktivitet_typ_t är EN lista
-- delad av extra_tid OCH arbetsdag_segment (20260814_arbetsdag_segment.sql),
-- så en ändring här räcker för båda tabellerna.
--
-- Varför `manuellt` och inte bara de två som frågades: faktureringens rad-
-- modell (20260917_faktura_radmodell.sql) skiljer art 10 Planering från art 9
-- Manuell fällning. Utan egen typ hade Joacims motorsågstimmar legat som
-- 'annat' och aldrig gått att skilja från övrigt i underlaget.
--
-- PostgreSQL saknar ALTER DOMAIN ... ALTER CONSTRAINT för CHECK-listor:
-- constrainten byts ut (drop + add), vilket validerar befintliga rader i båda
-- kolumnerna — de tio gamla värdena ligger kvar i listan så inget faller.

ALTER DOMAIN aktivitet_typ_t DROP CONSTRAINT aktivitet_typ_t_check;
ALTER DOMAIN aktivitet_typ_t ADD CONSTRAINT aktivitet_typ_t_check
  CHECK (VALUE IN ('rotben','reservdelar','markagare','service','mote',
                   'flytt','annat','utbildning','brandkontroll','reparation',
                   'planering','restid','manuellt'));

-- Verifiering:
-- SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
-- JOIN pg_type t ON t.oid = c.contypid WHERE t.typname = 'aktivitet_typ_t';
