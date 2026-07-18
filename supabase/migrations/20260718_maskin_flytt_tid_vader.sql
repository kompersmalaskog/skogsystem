-- Maskinflytt v2: tidsben + väder.
--
-- starttid BYTER SEMANTIK: flödesstart (maskinvalet), skickas explicit av
-- klienten. hamtad_tid = när "Hämta här" trycktes. Därmed:
--   tid_till_maskin_min = hamtad_tid - starttid   (MÄTT, bas→A)
--   tid_flytt_min       = sluttid - hamtad_tid    (MÄTT, A→B)
--   tid_hem_min         = ORS-restid B→hem        (BERÄKNAD — får ALDRIG
--                         summeras ihop med mätta ben utan märkning)
-- Skräptidsskydd i klienten: orimligt långa ben sparas som NULL, inte som
-- siffror som ser äkta ut. fakturerbar styrs oförändrat av enbart flytt_km>=30.

ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS hamtad_tid timestamptz;
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS tid_till_maskin_min numeric;
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS tid_flytt_min numeric;
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS tid_hem_min numeric;

-- Väder vid avslut (Open-Meteo, WMO weather code). NULL = anropet misslyckades.
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS vader_temp_c numeric;
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS vader_kod smallint;
ALTER TABLE maskin_flytt ADD COLUMN IF NOT EXISTS vader_nederbord_mm numeric;

-- route_cache: restid cachas bredvid km så hem-uppskattningen slipper nya
-- ORS-anrop. NULL på gamla rader = restid okänd (behandlas som cache-miss
-- när restid efterfrågas).
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS duration_min integer;
