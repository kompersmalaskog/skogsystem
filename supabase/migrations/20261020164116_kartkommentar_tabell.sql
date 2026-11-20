-- Kommentarer på kartan: EN RAD PER KOMMENTAR med författare och tid (Martin 2026-10-20). Gäller Vidas objekt (yta_nyckel = nyckeln ur lib/vidaNycklar:
-- linje:<geometri-hash>, hansyn:<nr>, traktdel:<id> ...) och egna markeringar (marker:<id>). Förut fanns EN kommentar per objekt (objekt_yta_anteckning,
-- UNIQUE objekt_id+yta_nyckel) som den som sparade sist skrev över.
--  - Alla inloggade läser. Alla med en medarbetarrad får lägga till (skapad_av = jag) och ändra/ta bort SINA EGNA. Admin får radera andras (inte ändra deras text).
--  - skapad_at/andrad_at sätts av servern (trigger), aldrig av klienten — samma som korvy_kvittens_forare. En ändring kan inte byta författare, objekt eller nyckel.
--  - id skapas i klienten, så en lokal kö kan skicka om utan att ge dubbletter.
-- objekt_yta_anteckning lämnas orörd (äldre appversioner läser den); de 4 befintliga kommentarerna kopieras hit med sin författare och sin tid.

create table if not exists public.kartkommentar (
  id          uuid primary key default gen_random_uuid(),
  objekt_id   uuid not null references public.objekt(id) on delete cascade,
  yta_nyckel  text not null,
  text        text not null check (length(btrim(text)) > 0),
  skapad_av   uuid references public.medarbetare(id) on delete set null,
  skapad_at   timestamptz not null default now(),
  andrad_at   timestamptz not null default now()
);
create index if not exists kartkommentar_objekt_nyckel_idx on public.kartkommentar (objekt_id, yta_nyckel, skapad_at);

create or replace function public.kartkommentar_satt_tid()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Bara den engångskopiering som migrationen gör får behålla de gamla tiderna.
    if coalesce(current_setting('app.kartkommentar_import', true), '') <> 'on' then
      new.skapad_at := now();
      new.andrad_at := now();
    end if;
  else
    new.skapad_at  := old.skapad_at;
    new.skapad_av  := old.skapad_av;
    new.objekt_id  := old.objekt_id;
    new.yta_nyckel := old.yta_nyckel;
    new.andrad_at  := now();
  end if;
  return new;
end
$$;

create or replace trigger kartkommentar_tid
  before insert or update on public.kartkommentar
  for each row execute function public.kartkommentar_satt_tid();

alter table public.kartkommentar enable row level security;
create policy kartkommentar_select on public.kartkommentar for select to authenticated using (true);
create policy kartkommentar_insert on public.kartkommentar for insert to authenticated with check (skapad_av = public.korvy_min_medarbetare());
create policy kartkommentar_update on public.kartkommentar for update to authenticated
  using (skapad_av = public.korvy_min_medarbetare()) with check (skapad_av = public.korvy_min_medarbetare());
create policy kartkommentar_delete on public.kartkommentar for delete to authenticated
  using (skapad_av = public.korvy_min_medarbetare() or public.ar_admin());

comment on table public.kartkommentar is 'En rad per kommentar på ett objekt på kartan (Vidas objekt och egna markeringar). Författare och tid sätts av servern.';

select set_config('app.kartkommentar_import', 'on', true);
insert into public.kartkommentar (objekt_id, yta_nyckel, text, skapad_av, skapad_at, andrad_at)
select a.objekt_id, a.yta_nyckel, a.text, a.skapad_av, a.uppdaterad_at, a.uppdaterad_at
from public.objekt_yta_anteckning a
where btrim(a.text) <> ''
  and not exists (select 1 from public.kartkommentar k where k.objekt_id = a.objekt_id and k.yta_nyckel = a.yta_nyckel and k.skapad_av is not distinct from a.skapad_av and k.text = a.text);
