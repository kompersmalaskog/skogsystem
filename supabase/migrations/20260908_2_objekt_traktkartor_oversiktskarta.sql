-- 2026-09-08  objekt: flera traktkartor + översiktskarta
--
-- En stor trakt kan delas i flera traktkarteblad (889174: fyra, _01_TK.._04_TK) plus en
-- översiktskarta (_ÖK.pdf, nytt suffix). Tidigare tog traktkarta_url EN fil -> tre blad tappades.
--
--   traktkartor        jsonb [{namn, path, ordning}] — ALLA blad, ordning ur _NN_-suffixet.
--                      Samma mönster som ovriga_dokument. UI listar "Traktkarta 1 av N".
--   oversiktskarta_url text — egen kolumn för _ÖK.pdf (som traktdirektiv_url/valtlapp_url).
--                      Egen typ, inte ett arbetsblad -> inte i traktkartor-listan (grumlar
--                      räkningen "N av 4").
--
-- traktkarta_url BEHÅLLS och pekar på FÖRSTA bladet (ordning 1) så befintlig UI (objekt-pill,
-- objekt-prickar "Karta", planering dokRad) fungerar oförändrat. Ingen destruktiv migrering.
-- Fylls via samma merge (envz vinner där värde finns); ingen läggs i SKYDDADE (refreshas vid
-- omimport).

ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS traktkartor        jsonb,
  ADD COLUMN IF NOT EXISTS oversiktskarta_url text;
