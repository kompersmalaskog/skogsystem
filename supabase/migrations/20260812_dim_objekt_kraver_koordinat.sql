-- dim_objekt.kraver_koordinat
--
-- Markerar objekt som INTE är en fysisk arbetsplats (flyttobjekt, service,
-- uppställning). Sådana objekt bär ingen koordinat att rätta och ska hoppas
-- över av koordinatlarmet i datahälsan OCH av km-beräkningens val av
-- första/sista plats.
--
-- Default TRUE: ett nytt platslöst objekt kräver koordinat tills en människa
-- säger annat. Larmet visar det då EN gång; Martin lägger in en koordinat
-- eller sätter kraver_koordinat = false. Flaggan sätts för hand — importen
-- behöver aldrig veta vad ett flyttobjekt är.

ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS kraver_koordinat boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN dim_objekt.kraver_koordinat IS
  'false = ej fysisk arbetsplats (flytt/service/uppställning); hoppas över av koordinatlarm och km-platsval. Sätts för hand.';

-- Kända pseudo-objekt sätts för hand efter migrering (körs INTE här):
--   UPDATE dim_objekt SET kraver_koordinat = false
--   WHERE objekt_id IN ('5363','20250731','A030353_3','67824');
-- OBS: A030353_169 ("Flytt") HAR koordinat och A110148_199
-- ("Spåramåla FLYTT av Eved") är ett riktigt objekt — lämna dem true.
