-- Kemikalier (2026-11-04): faroangivelserna (H-koder) ur säkerhetsbladet, lästa av appen när bladet läggs in.
-- null = bladet är inte läst än; tom lista = inga koder. Additivt.
alter table public.am_kemikalie add column if not exists h_koder text[]
  check (h_koder is null or (cardinality(h_koder) <= 60 and array_to_string(h_koder, ',') ~ '^(H[0-9]{3}[A-Za-z]{0,2}(,H[0-9]{3}[A-Za-z]{0,2})*)?$'));
