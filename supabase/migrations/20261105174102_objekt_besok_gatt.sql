-- Besökaren har gått härifrån (markägarens knapp "Jag har gått härifrån"). Satt = besöket är över: hyttkortet och ringen försvinner.
-- Skrivs bara av servern (service-klienten via /api/besok/<token>/gatt); ingen policy ändras.
alter table public.objekt_besok add column if not exists gatt_at timestamptz;
comment on column public.objekt_besok.gatt_at is 'När besökaren tryckte "Jag har gått härifrån". Satt = besöket är över för hytten.';
