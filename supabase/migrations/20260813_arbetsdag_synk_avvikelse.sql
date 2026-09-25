-- arbetsdag.synk_avvikelse — dokumenterar en kolumn som redan finns i prod men
-- skapades utanför migrations-spåret (ingen tidigare migration, ingen kodreferens).
-- Idempotent: IF NOT EXISTS så den inte försöker återskapa den befintliga kolumnen.
--
-- Semantik: sätts av app/api/mom-import när en BEKRÄFTAD dags maskinfält
-- (start_tid, slut_tid, rast_min, objekt_id) byggs om till andra värden än de
-- som föraren skrev under på. Bär över förarens bekräftelse men gör det INTE
-- tyst — sparar vad som bekräftades (fore) och vad det blev (efter) per fält.
--
-- Form (jsonb, nullable, ingen default):
--   null  = ingen avvikelse (dagens tider = de bekräftade)
--   {
--     "bekraftad_tid": "<iso>",              -- när dagen skrevs under
--     "upptackt":      "<iso>",              -- när ombyggnaden upptäckte skillnaden
--     "andrat": {                            -- bara de fält som skiljer sig
--       "slut_tid":  { "fore": "12:04", "efter": "13:27" },
--       "objekt_id": { "fore": "11077137", "efter": "11240372" }
--     }
--   }
-- Det signerade "fore" bevaras genom upprepade ombyggnader och löser upp sig
-- självt (→ null) om värdet återgår till det bekräftade.

ALTER TABLE arbetsdag ADD COLUMN IF NOT EXISTS synk_avvikelse jsonb;

COMMENT ON COLUMN arbetsdag.synk_avvikelse IS
  'Sätts av mom-import: en bekräftad dags maskintider har byggts om till andra '
  'värden än de bekräftade. jsonb { bekraftad_tid, upptackt, andrat:{ falt:{ fore, efter } } }. '
  'null = ingen avvikelse. Bär över bekräftelsen utan att dölja att tiderna ändrats.';
