-- Inventarier, två lådor (1/4): kolumnerna.
--
-- Två lådor = man räknar inte. Grejen står i två lådor på samma plats; när den första är tom börjar man på
-- reservlådan och skannar QR-koden på den. Det är beställsignalen — ett tryck per beställning, inte per uttag.
--
-- tva_lador = raden räknas inte (antal och min_antal är alltid NULL).
-- reserv_oppnad_tid/_av = reservlådan är påbörjad och inget har kommit in än. Sätts av inventarie_reserv_oppnad,
-- nollas av inventarie_kommit_in (och av Ångra direkt efter skanningen).
alter table public.inventarie_rad
  add column if not exists tva_lador boolean not null default false,
  add column if not exists reserv_oppnad_tid timestamptz,
  add column if not exists reserv_oppnad_av uuid references public.medarbetare(id) on delete set null;

alter table public.inventarie_rad
  add constraint inventarie_rad_tva_lador_raknas_inte
  check (not tva_lador or (antal is null and min_antal is null));

alter table public.inventarie_rad
  add constraint inventarie_rad_reserv_bara_tva_lador
  check (reserv_oppnad_tid is null or tva_lador);
