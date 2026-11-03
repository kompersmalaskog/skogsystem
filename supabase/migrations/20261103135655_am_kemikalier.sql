-- Kemikalieförteckningen (2026-11-03): varje produkt vi har (olja, spray, bränsle …), var den finns och dess säkerhetsdatablad (PDF).
-- AFS 2023:10 kräver en förteckning och att säkerhetsdatabladen finns tillgängliga för den som jobbar med produkten.
-- Alla med en medarbetarrad läser (förarna ska kunna öppna bladet); admin och skyddsombud (ar_am_lasare) lägger till och ändrar.
-- En produkt tas aldrig bort, den sätts till aktiv = false. Vem och när sätts av databasen.
-- Säkerhetsdatabladen ligger i den privata bucketen am-sdb (bara PDF, högst 20 MB), sökväg <kemikaliens id>/<tid>.pdf.
-- Additivt: ny tabell och ny bucket, ingenting befintligt ändras.

create table if not exists public.am_kemikalie (
  id            uuid primary key default gen_random_uuid(),
  namn          text not null check (length(btrim(namn)) between 1 and 120),
  var_finns     text check (var_finns is null or length(var_finns) <= 120),
  sdb_sokvag    text check (sdb_sokvag is null or length(sdb_sokvag) <= 300),
  sdb_tid       timestamptz,
  aktiv         boolean not null default true,
  skapad_tid    timestamptz not null default now(),
  skapad_av     uuid references public.medarbetare(id),
  andrad_tid    timestamptz not null default now(),
  andrad_av     uuid references public.medarbetare(id)
);

create or replace function public.am_kemikalie_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.skapad_tid := now();
    new.skapad_av := public.aktuell_medarbetare_id();
    new.sdb_tid := case when new.sdb_sokvag is null then null else now() end;
  else
    new.skapad_tid := old.skapad_tid;
    new.skapad_av := old.skapad_av;
    new.sdb_tid := case
      when new.sdb_sokvag is null then null
      when new.sdb_sokvag is distinct from old.sdb_sokvag then now()
      else old.sdb_tid end;
  end if;
  new.andrad_tid := now();
  new.andrad_av := public.aktuell_medarbetare_id();
  return new;
end $$;

create or replace trigger a_am_kemikalie_vakt before insert or update on public.am_kemikalie
  for each row execute function public.am_kemikalie_vakt();

alter table public.am_kemikalie enable row level security;

create policy am_kemikalie_las on public.am_kemikalie for select to authenticated
  using (public.aktuell_medarbetare_id() is not null);
create policy am_kemikalie_skapa on public.am_kemikalie for insert to authenticated
  with check (public.ar_am_lasare());
create policy am_kemikalie_andra on public.am_kemikalie for update to authenticated
  using (public.ar_am_lasare()) with check (public.ar_am_lasare());

revoke all on public.am_kemikalie from anon;
revoke delete, truncate, trigger, references on public.am_kemikalie from authenticated;
grant select, insert, update on public.am_kemikalie to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('am-sdb', 'am-sdb', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy am_sdb_las on storage.objects for select to authenticated
  using (bucket_id = 'am-sdb' and public.aktuell_medarbetare_id() is not null);
create policy am_sdb_skapa on storage.objects for insert to authenticated
  with check (bucket_id = 'am-sdb' and public.ar_am_lasare());
