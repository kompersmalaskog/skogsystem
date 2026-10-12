-- sortimentsutfall_manad: p_bolag = 'Alla' tar med alla objekt, oavsett bolag.
--
-- Månadssidan (/affarsuppfoljning/manad) öppnas från årsvyn, som har ett bolagsfilter (Alla / Vida). Trycker man
-- på en stapel med filtret på Alla ska månaden visa samma tal som staplen — inte bara Vidas del. Förut tog
-- funktionen bara ett bolagsnamn.
--
-- Ändringen är densamma på de två ställen där funktionen filtrerar på bolag (objekt och objekt_alla):
--   o.bolag = p_bolag   ->   (p_bolag = 'Alla' OR o.bolag = p_bolag)
-- Allt annat är orört: hemved bort på gruppen, grupperingen på VO, alla utdata. Standardvärdet 'Vida' är kvar, så
-- varje befintligt anrop svarar som förut. Objekt utan bolag (NULL) kommer bara med under 'Alla'.
--
-- Funktionen skrivs om ur den GÄLLANDE texten (pg_get_functiondef); mönstret måste hittas exakt två gånger.
-- Idempotent. Kör filen med LF-radslut.

DO $$
DECLARE
  d      text := pg_get_functiondef('sortimentsutfall_manad(date,text,text)'::regprocedure);
  gammal text := 'o.bolag = p_bolag';
  ny_    text := '(p_bolag = ''Alla'' OR o.bolag = p_bolag)';
  n_gammal int;
BEGIN
  IF position('p_bolag = ''Alla''' IN d) > 0 THEN
    RAISE NOTICE 'sortimentsutfall_manad stödjer redan Alla — inget att göra';
    RETURN;
  END IF;
  n_gammal := (length(d) - length(replace(d, gammal, ''))) / length(gammal);
  IF n_gammal <> 2 THEN
    RAISE EXCEPTION 'mönstret för bolag hittades % gånger i sortimentsutfall_manad (väntade 2) — avbryter', n_gammal;
  END IF;
  EXECUTE replace(d, gammal, ny_);
END $$;

COMMENT ON FUNCTION sortimentsutfall_manad(date, text, text) IS
  'Hela sortimentsutfallssidans underlag i ett anrop. Läser vy_skordarmatt_stock, aldrig fakt_sortiment. Hemved bort. p_bolag = ''Alla'' tar med alla objekt.';
