-- sortimentsutfall_manad och berakna_utfall_objekt läser stammens tid via flaggan tid_ar_utc (svensk väggklocka) i stället för
-- det råa värdet. Patchar av befintliga definitioner (se 3d för varför det inte är hela funktioner); varje ersättning har
-- antalskontroll. Kroppar kontrollerade mot prod: sortimentsutfall_manad f0057ac90e4bb54f388e097c6130dc4e,
-- berakna_utfall_objekt a1b79b022dcc249ffddda38647dac730.
--
-- berakna_utfall_objekt: utfall_manad / utfall_objekt är lagrade härledda tal. Efter flytten av detalj_stam: kör
-- select * from berakna_utfall_objekt(true, 5); så de räknas om med rätt månadsgräns (stammar nära månadsskiftet kan byta månad).
CREATE OR REPLACE FUNCTION pg_temp.opti_patch(p_sig regprocedure, p_gammal text, p_ny text, p_antal int) RETURNS void
LANGUAGE plpgsql AS $p$
DECLARE
  d text := pg_get_functiondef(p_sig);
  n int := (length(d) - length(replace(d, p_gammal, ''))) / length(p_gammal);
BEGIN
  IF n <> p_antal THEN
    RAISE EXCEPTION '% : väntade % träffar på "%", fick %', p_sig, p_antal, p_gammal, n;
  END IF;
  EXECUTE replace(d, p_gammal, p_ny);
END $p$;

SELECT pg_temp.opti_patch('public.sortimentsutfall_manad(date,text,text)'::regprocedure,
  'WHERE v.tidpunkt >= gr.fran AND v.tidpunkt < gr.till',
  'WHERE v.tidpunkt_lokal >= gr.fran AND v.tidpunkt_lokal < gr.till', 2);
SELECT pg_temp.opti_patch('public.sortimentsutfall_manad(date,text,text)'::regprocedure,
  'WHERE sm.tidpunkt >= gr.fran AND sm.tidpunkt < gr.till',
  'WHERE opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) >= gr.fran AND opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) < gr.till', 1);
SELECT pg_temp.opti_patch('public.berakna_utfall_objekt(boolean,integer,timestamptz)'::regprocedure,
  'v.volym_m3sub, v.tidpunkt, v.tradslag_id, v.langd_cm',
  'v.volym_m3sub, v.tidpunkt_lokal AS tidpunkt, v.tradslag_id, v.langd_cm', 1);
