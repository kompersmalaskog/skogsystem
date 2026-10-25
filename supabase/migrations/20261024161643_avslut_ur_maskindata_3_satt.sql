-- AVSLUT UR MASKINDATA, del 3 av 4: skrivningen.
--
-- avslut_ur_maskindata(p_skriv) går igenom räkningen (del 2) och, per objekt och maskinslag:
--   * HOPPAR ÖVER objektet om en människa redan bestämt: ett datum utan *_auto_skal (satt för hand eller via
--     Godkänn) eller *_ej_klar = true på någon rad i gruppen. Människan går alltid före.
--   * SÄTTER datumet (+ *_avslutad_auto = true, *_auto_skal = skälet) på gruppens rader när maskinslaget är klart.
--     Skotning sätts bara när skördningen är klar (räknad nu eller satt) — utom GROT utan skördat.
--   * ÄNDRAR datumet om automatiken satt det och räkningen nu säger en annan dag.
--   * TAR BORT sitt eget datum om maskinen har arbetat på objektet EFTER datumet (den kom tillbaka).
-- Exkluderade objekt, extern skördare (skördning) och egen/extern skotning (skotning) rörs inte.
-- p_skriv = false är en torrkörning: samma rader tillbaka, inget skrivs.

CREATE OR REPLACE FUNCTION public.avslut_ur_maskindata(p_skriv boolean DEFAULT false)
RETURNS TABLE (namn text, falt text, fore date, efter date, skal text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  hand_skord boolean; hand_skot boolean;
  auto_skord date; auto_skot date; satt_skord date;
  skord_ok boolean;
BEGIN
  FOR r IN SELECT * FROM avslut_ur_maskindata_berakna() b WHERE NOT b.alla_exkl LOOP
    SELECT
      bool_or((d.skordning_avslutad IS NOT NULL AND d.skordning_auto_skal IS NULL) OR d.skordning_ej_klar),
      bool_or((d.skotning_avslutad IS NOT NULL AND d.skotning_auto_skal IS NULL) OR d.skotning_ej_klar),
      max(d.skordning_avslutad) FILTER (WHERE d.skordning_auto_skal IS NOT NULL),
      max(d.skotning_avslutad) FILTER (WHERE d.skotning_auto_skal IS NOT NULL),
      max(d.skordning_avslutad)
    INTO hand_skord, hand_skot, auto_skord, auto_skot, satt_skord
    FROM dim_objekt d WHERE d.objekt_id = ANY (r.ids);

    -- SKÖRDNING
    IF NOT coalesce(hand_skord, false) AND NOT r.ext_skord AND r.skord_datum IS NOT NULL THEN
      IF r.skord_klar AND auto_skord IS DISTINCT FROM r.skord_datum THEN
        namn := r.namn; falt := 'skordning_avslutad'; fore := auto_skord; efter := r.skord_datum; skal := r.skord_skal;
        IF p_skriv THEN
          UPDATE dim_objekt d SET skordning_avslutad = r.skord_datum, skordning_avslutad_auto = true,
                 skordning_auto_skal = r.skord_skal
           WHERE d.objekt_id = ANY (r.ids) AND (d.skordning_avslutad IS NULL OR d.skordning_auto_skal IS NOT NULL);
        END IF;
        satt_skord := r.skord_datum;
        RETURN NEXT;
      ELSIF r.skord_klar AND auto_skord IS NOT NULL THEN
        -- samma dag — skälet kan ha fått ett nytt namn, skriv det utan att returnera något
        IF p_skriv THEN
          UPDATE dim_objekt d SET skordning_auto_skal = r.skord_skal
           WHERE d.objekt_id = ANY (r.ids) AND d.skordning_auto_skal IS NOT NULL
             AND d.skordning_auto_skal IS DISTINCT FROM r.skord_skal;
        END IF;
      ELSIF NOT r.skord_klar AND auto_skord IS NOT NULL AND r.skord_datum > auto_skord THEN
        namn := r.namn; falt := 'skordning_avslutad'; fore := auto_skord; efter := NULL;
        skal := 'Skördaren har arbetat här igen ' || sv_kort_datum(r.skord_datum);
        IF p_skriv THEN
          UPDATE dim_objekt d SET skordning_avslutad = NULL, skordning_avslutad_auto = false, skordning_auto_skal = NULL
           WHERE d.objekt_id = ANY (r.ids) AND d.skordning_auto_skal IS NOT NULL;
        END IF;
        satt_skord := NULL;
        RETURN NEXT;
      END IF;
    END IF;

    -- SKOTNING
    skord_ok := satt_skord IS NOT NULL OR r.skord_klar OR (r.grot AND r.skordat = 0);
    IF NOT coalesce(hand_skot, false) AND NOT r.ej_var_skot AND r.skot_datum IS NOT NULL THEN
      IF r.skot_klar AND skord_ok AND auto_skot IS DISTINCT FROM r.skot_datum THEN
        namn := r.namn; falt := 'skotning_avslutad'; fore := auto_skot; efter := r.skot_datum; skal := r.skot_skal;
        IF p_skriv THEN
          UPDATE dim_objekt d SET skotning_avslutad = r.skot_datum, skotning_avslutad_auto = true,
                 skotning_auto_skal = r.skot_skal
           WHERE d.objekt_id = ANY (r.ids) AND (d.skotning_avslutad IS NULL OR d.skotning_auto_skal IS NOT NULL);
        END IF;
        RETURN NEXT;
      ELSIF r.skot_klar AND skord_ok AND auto_skot IS NOT NULL THEN
        IF p_skriv THEN
          UPDATE dim_objekt d SET skotning_auto_skal = r.skot_skal
           WHERE d.objekt_id = ANY (r.ids) AND d.skotning_auto_skal IS NOT NULL
             AND d.skotning_auto_skal IS DISTINCT FROM r.skot_skal;
        END IF;
      ELSIF NOT r.skot_klar AND auto_skot IS NOT NULL AND r.skot_datum > auto_skot THEN
        namn := r.namn; falt := 'skotning_avslutad'; fore := auto_skot; efter := NULL;
        skal := 'Skotaren har arbetat här igen ' || sv_kort_datum(r.skot_datum);
        IF p_skriv THEN
          UPDATE dim_objekt d SET skotning_avslutad = NULL, skotning_avslutad_auto = false, skotning_auto_skal = NULL
           WHERE d.objekt_id = ANY (r.ids) AND d.skotning_auto_skal IS NOT NULL;
        END IF;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.avslut_ur_maskindata(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avslut_ur_maskindata(boolean) TO service_role;
