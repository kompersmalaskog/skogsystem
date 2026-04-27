-- Stöd för flera objekt per arbetsdag. Tidigare hade arbetsdag.objekt_id ett
-- enstaka värde — om föraren körde flera objekt samma dag (t.ex. Hössjömåla
-- + Flytt) tappades alla utom ett vid MOM-import.

CREATE TABLE IF NOT EXISTS arbetsdag_objekt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arbetsdag_id  uuid NOT NULL REFERENCES arbetsdag(id) ON DELETE CASCADE,
  objekt_id     text,
  objekt_namn   text,
  maskin_id     text,
  start_tid     time,
  slut_tid      time,
  arbetad_min   int,
  ordning       int NOT NULL DEFAULT 1,
  skapad_av     text NOT NULL DEFAULT 'manuell' CHECK (skapad_av IN ('mom','manuell','hpr_synth','migration')),
  skapad        timestamptz NOT NULL DEFAULT now(),
  uppdaterad    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ado_arbetsdag ON arbetsdag_objekt(arbetsdag_id);
CREATE INDEX IF NOT EXISTS idx_ado_objekt    ON arbetsdag_objekt(objekt_id);
CREATE INDEX IF NOT EXISTS idx_ado_ordning   ON arbetsdag_objekt(arbetsdag_id, ordning);

-- Migrera befintlig data: en rad per arbetsdag som har objekt_id satt.
INSERT INTO arbetsdag_objekt (arbetsdag_id, objekt_id, objekt_namn, maskin_id, start_tid, slut_tid, arbetad_min, ordning, skapad_av)
SELECT
  a.id,
  a.objekt_id,
  d.object_name,
  a.maskin_id,
  a.start_tid,
  a.slut_tid,
  a.arbetad_min,
  1,
  'migration'
FROM arbetsdag a
LEFT JOIN dim_objekt d ON d.objekt_id = a.objekt_id
WHERE a.objekt_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM arbetsdag_objekt ao WHERE ao.arbetsdag_id = a.id
  );

COMMENT ON COLUMN arbetsdag.objekt_id IS
  'Primärt/först-objekt för dagen. Övriga objekt finns i arbetsdag_objekt.';
