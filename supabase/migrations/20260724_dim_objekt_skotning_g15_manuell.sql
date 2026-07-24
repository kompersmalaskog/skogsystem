-- Manuell G15-tid för icke-filsändande skotare (JD810E, sander_filer=false).
-- Speglar skotad_volym_manuell: inga fejkade fakt_tid-rader, timmarna bor på
-- dim_objekt-raden och källmärks manuella. Uppföljningen använder fältet när
-- fakt_tid saknas för skotaren. Nullable numeric, inget objekt rörs.

ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS skotning_g15_manuell numeric;

COMMENT ON COLUMN dim_objekt.skotning_g15_manuell IS
  'Manuellt angivna G15-timmar för icke-filsändande skotare (JD810E, sander_filer=false). Speglar skotad_volym_manuell. NULL = ingen manuell tid. Uppföljningen använder den när fakt_tid saknas, källmärkt manuell.';
