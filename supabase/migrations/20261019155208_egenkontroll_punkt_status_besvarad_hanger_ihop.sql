-- Ett svar och tiden för svaret hör ihop: en punkt har antingen både status och besvarad, eller ingetdera.
-- Alla läsare som räknar "besvarad" (A4-rapporten, "N kvar", Vidas rapport) och alla som räknar på status ska alltid svara detsamma.
-- Passerar på alla befintliga rader (prod 2026-10-19: 308 punkter, 186 med båda null, 122 med båda satta, 0 undantag).
ALTER TABLE public.egenkontroll_punkt
  ADD CONSTRAINT status_och_besvarad_hanger_ihop
  CHECK ((status IS NULL) = (besvarad IS NULL));
