-- Scania-lastbilens odometer per flyttdag. Mätt totalsträcka (hrTotalVehicleDistance,
-- METER) vid dagens start och slut — VID SIDAN av den rutt-beräknade total_km, aldrig
-- i stället. matare_km = (slut−start)/1000, en decimal, härledd för visning.
-- odometer_stale = avläsningens tidsstämpel var > 30 min gammal (sparas ändå).
-- Additiv och idempotent; rör ingen befintlig data. Redan körd i prod 2026-07-25.
ALTER TABLE flyttdag ADD COLUMN IF NOT EXISTS start_odometer_m   bigint;
ALTER TABLE flyttdag ADD COLUMN IF NOT EXISTS start_odometer_tid timestamptz;
ALTER TABLE flyttdag ADD COLUMN IF NOT EXISTS slut_odometer_m    bigint;
ALTER TABLE flyttdag ADD COLUMN IF NOT EXISTS slut_odometer_tid  timestamptz;
ALTER TABLE flyttdag ADD COLUMN IF NOT EXISTS matare_km          numeric;
ALTER TABLE flyttdag ADD COLUMN IF NOT EXISTS odometer_stale     boolean NOT NULL DEFAULT false;
