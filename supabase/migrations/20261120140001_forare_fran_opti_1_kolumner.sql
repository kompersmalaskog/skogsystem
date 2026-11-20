-- Föraren från Opti (2026-11-20, Martin): lass och kvittenser ska stå på den som FAKTISKT körde, inte på den som råkade vara
-- inloggad i appen. Maskinen är inloggad på en förare (Elefanten = Daniel) och allt hamnade på honom. Opti vet vem som körde:
-- inloggningsfönstren ligger i fakt_skift och profilen kopplas till en medarbetare via operator_medarbetare.
--
-- Del 1: kolumnerna. Originalet bevaras — det som appen skrev (den inloggade) ligger kvar i `registrerad_av`, så en rättning
-- går att ångra och granska. Reglerna ligger i del 2–4, historiken rättas i del 5.
--
-- * skotar_lass: `medarbetare_id` BLIR den rättade föraren (ingen läsare använder den som nyckel, RLS är öppen);
--   `registrerad_av` = den som var inloggad, `forare_kalla` = hur föraren avgjordes (opti | schema | inloggad).
-- * korvy_kvittens_forare och kommentar_sett_forare: `forare_id` RÖRS INTE. Den är enhetens egen nyckel — RLS (forare_id = den
--   inloggade), upserten (objekt, markering, förare) och läsningen "vad har den här enheten redan kvitterat" bygger på den. Skrivs
--   den om slutar enheten hitta sina kvittenser och varje larm kommer tillbaka, och upserten nekas av RLS. Den rättade föraren
--   ligger i `utford_av` (+ `utford_kalla`); det är den som visning och statistik per förare ska läsa.
-- * objekt_besok_kvittens skrivs bara av servern (insert-policyn är false) och läses inte per enhet: där skrivs `forare_id` om,
--   och den inloggade sparas i `registrerad_av`.
--
-- Additiv. Inga rader ändras här utom registrerad_av (kopia av medarbetare_id).

alter table public.skotar_lass
  add column if not exists registrerad_av uuid references public.medarbetare(id) on delete set null,
  add column if not exists forare_kalla text;
do $$ begin
  alter table public.skotar_lass add constraint skotar_lass_forare_kalla_check check (forare_kalla is null or forare_kalla in ('opti', 'schema', 'inloggad'));
exception when duplicate_object then null; end $$;
update public.skotar_lass set registrerad_av = medarbetare_id where registrerad_av is null and medarbetare_id is not null;
create index if not exists skotar_lass_maskin_datum_idx on public.skotar_lass (maskin_id, datum);

alter table public.korvy_kvittens_forare
  add column if not exists utford_av uuid references public.medarbetare(id) on delete set null,
  add column if not exists utford_kalla text;
alter table public.kommentar_sett_forare
  add column if not exists utford_av uuid references public.medarbetare(id) on delete set null,
  add column if not exists utford_kalla text;
do $$ begin
  alter table public.korvy_kvittens_forare add constraint korvy_kvittens_forare_utford_kalla_check check (utford_kalla is null or utford_kalla in ('opti', 'inloggad'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.kommentar_sett_forare add constraint kommentar_sett_forare_utford_kalla_check check (utford_kalla is null or utford_kalla in ('opti', 'inloggad'));
exception when duplicate_object then null; end $$;

alter table public.objekt_besok_kvittens
  add column if not exists registrerad_av uuid references public.medarbetare(id) on delete set null,
  add column if not exists forare_kalla text;
do $$ begin
  alter table public.objekt_besok_kvittens add constraint objekt_besok_kvittens_forare_kalla_check check (forare_kalla is null or forare_kalla in ('opti', 'schema', 'inloggad'));
exception when duplicate_object then null; end $$;
update public.objekt_besok_kvittens set registrerad_av = forare_id where registrerad_av is null and forare_id is not null;
