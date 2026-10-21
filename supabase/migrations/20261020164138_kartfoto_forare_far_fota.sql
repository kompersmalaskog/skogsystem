-- Förare får lägga till foton och ljud på Vidas objekt (objekt_yta_media + bucketen ytfoto) — Martin 2026-10-20. Förut bara admin.
--  - Lägga till: alla med en medarbetarrad (skapad_av = jag). Ändra bildtext: bara den som skapade raden. Radera: den som skapade raden, eller admin.
--  - skapad_at sätts av servern; en ändring kan bara röra bildtexten (inte författare, objekt, nyckel, url eller typ).
-- Bucketens policyer (storage.objects) ligger i en egen fil: Supabase-MCP:n äger inte storage.objects ("must be owner of table objects"), så den körs i SQL-editorn.
-- Inga DROP (hänger i Supabase-MCP:n): policyerna ändras med ALTER POLICY.

alter policy objekt_yta_media_insert on public.objekt_yta_media with check (skapad_av = public.korvy_min_medarbetare());
alter policy objekt_yta_media_update on public.objekt_yta_media
  using (skapad_av = public.korvy_min_medarbetare()) with check (skapad_av = public.korvy_min_medarbetare());
alter policy objekt_yta_media_delete on public.objekt_yta_media using (skapad_av = public.korvy_min_medarbetare() or public.ar_admin());

create or replace function public.objekt_yta_media_satt_tid()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.skapad_at := now();
  else
    new.skapad_at  := old.skapad_at;
    new.skapad_av  := old.skapad_av;
    new.objekt_id  := old.objekt_id;
    new.yta_nyckel := old.yta_nyckel;
    new.url        := old.url;
    new.typ        := old.typ;
  end if;
  return new;
end
$$;

create or replace trigger objekt_yta_media_tid
  before insert or update on public.objekt_yta_media
  for each row execute function public.objekt_yta_media_satt_tid();
