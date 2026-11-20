-- Återställ ATK-status till 'bekräftad' (väntar på admin-godkännande igen)
-- om en arbetsdag som ligger inom en GODKÄND ATK-period redigeras.
--
-- Triggas vid UPDATE på arbetsdag när någon löne-/tidspåverkande kolumn ändras.
-- ATK-perioden är år (period = 'YYYY'), så vi matchar arbetsdagens datum-år.

CREATE OR REPLACE FUNCTION reset_atk_pa_arbetsdag_andring()
RETURNS TRIGGER AS $$
BEGIN
  IF (
       NEW.arbetad_min   IS DISTINCT FROM OLD.arbetad_min
    OR NEW.start_tid     IS DISTINCT FROM OLD.start_tid
    OR NEW.slut_tid      IS DISTINCT FROM OLD.slut_tid
    OR NEW.rast_min      IS DISTINCT FROM OLD.rast_min
    OR NEW.km_morgon     IS DISTINCT FROM OLD.km_morgon
    OR NEW.km_kvall      IS DISTINCT FROM OLD.km_kvall
    OR NEW.traktamente   IS DISTINCT FROM OLD.traktamente
    OR NEW.extra_tid_min IS DISTINCT FROM OLD.extra_tid_min
  ) THEN
    UPDATE atk_val
    SET status = 'bekräftad'
    WHERE medarbetare_id = NEW.medarbetare_id
      AND status = 'godkand'
      AND period = to_char(NEW.datum::date, 'YYYY');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_atk_pa_arbetsdag ON arbetsdag;
CREATE TRIGGER trg_reset_atk_pa_arbetsdag
AFTER UPDATE ON arbetsdag
FOR EACH ROW
EXECUTE FUNCTION reset_atk_pa_arbetsdag_andring();
