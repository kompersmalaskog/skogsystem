-- Stämplingslängdens tal på objektet, skrivet av en människa med enhet. Talet finns bara inuti en PDF (stamplingslangd_url) och extraheras inte;
-- det skrivs in en gång i objektvyn och jämförs sedan med objektets volym (m³fub). Enheten lagras med talet: m³sk (skogskubikmeter) eller m³fub.
-- Omräkningsfaktorn m³sk → m³fub ligger i koden (lib/objekt/stamplingslangd.ts, M3SK_TILL_M3FUB), inte här: inget lagrat tal räknas om.
-- Additiv. Utan migrationen läser och visar vyn allt som förut; bara själva inskrivningen svarar att fältet saknas.
alter table public.objekt add column if not exists stamplingslangd_volym double precision;
alter table public.objekt add column if not exists stamplingslangd_enhet text;

alter table public.objekt add constraint objekt_stamplingslangd_enhet_check
  check (stamplingslangd_enhet is null or stamplingslangd_enhet in ('m3sk', 'm3fub'));
alter table public.objekt add constraint objekt_stamplingslangd_tal_check
  check ((stamplingslangd_volym is null and stamplingslangd_enhet is null) or (stamplingslangd_volym > 0 and stamplingslangd_enhet is not null));
