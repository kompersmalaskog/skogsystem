-- 2026-08-09  objekt: markägar-/fastighets-/kontraktsfält ur OGI (import v2)
--
-- Fält som finns i envz:ens OGI (ObjectDefinition) men inte lagrats förut:
--   markagare_adress      ForestOwner/Address (Street + ", " + City, som EN sträng)
--   inkopare_epost        LoggingOrganisation/ContactInformation/Email — enda vägen att nå
--                         VIDA när något är fel på en trakt; saknade hemvist helt tidigare
--   fastighetsbeteckning  RealEstateIDObject (t.ex. "JOHANNISHUS 1:2")
--   kontraktsnummer       ContractNumber
-- markagare/markagare_tel/markagare_epost/inkopare finns redan. Fylls via samma merge
-- (envz vinner där värde finns); ingen av dem läggs i SKYDDADE (refreshas vid omimport).

ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS markagare_adress     text,
  ADD COLUMN IF NOT EXISTS inkopare_epost       text,
  ADD COLUMN IF NOT EXISTS fastighetsbeteckning text,
  ADD COLUMN IF NOT EXISTS kontraktsnummer      text;
