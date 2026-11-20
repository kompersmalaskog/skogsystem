-- PR 2: mätt hemresa. "Kör hem" avslutar inte längre rundan vid avfärd (då blev
-- hemresan en ORS-gissning) — den sätter "på väg hem" (start-tid + odometer).
-- "Framme på LBC" stänger rundan med MÄTT hem_km (odometer-diff) och hemkomsttid.
-- Glöms "Framme" stänger skyddsnätet ändå, mätt via loggen.
--
-- hemresa_matt = true → hem_km/tid_hem_min är mätta (dölj "(beräknad)").
-- Gamla rundor har allt NULL → "(beräknad)" som förut.

ALTER TABLE flyttdag
  ADD COLUMN IF NOT EXISTS hemresa_start_tid        timestamptz,
  ADD COLUMN IF NOT EXISTS hemresa_start_odometer_m bigint,
  ADD COLUMN IF NOT EXISTS hemresa_matt             boolean;
