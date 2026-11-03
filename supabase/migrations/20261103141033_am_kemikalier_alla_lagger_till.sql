-- Kemikalier, steg 2 (2026-11-03).
-- 1. Alla med en medarbetarrad får LÄGGA TILL en produkt (den som köpt något lägger in det på plats, med ett foto på etiketten).
--    Ändra och ta bort är fortfarande bara admin och skyddsombud (ar_am_lasare).
-- 2. Etikettens foto: am_kemikalie.etikett_sokvag, i samma privata bucket (am-sdb), som nu också tar bilder.
-- 3. Saknas säkerhetsbladet köas pushen am_kemikalie till aktiva admin utom den som lade till (skickas_at = 'infinity':
--    den gamla flushen på production skickar okända typer som "Notis"; den nya tar typen oavsett). Texten byggs färskt i flushen.
-- 4. Riskbedömningen får en femte typ: kemikalier (oljor, bränsle, sprayer, avgaser) — gäller alla förare.
-- Additivt: ingenting tas bort.

alter table public.am_kemikalie add column if not exists etikett_sokvag text
  check (etikett_sokvag is null or length(etikett_sokvag) <= 300);

alter policy am_kemikalie_skapa on public.am_kemikalie
  with check (public.aktuell_medarbetare_id() is not null and aktiv);

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'am-sdb';

alter policy am_sdb_skapa on storage.objects
  with check (bucket_id = 'am-sdb' and public.aktuell_medarbetare_id() is not null);

create or replace function public."kö_am_kemikalie"() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.sdb_sokvag is null and new.aktiv then
      insert into notis_kö (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      select m.id, 'am_kemikalie', jsonb_build_object('kemikalie_id', new.id::text), 'infinity'::timestamptz, new.id::text
        from medarbetare m
       where coalesce(m.aktiv, true)
         and m.roll = 'admin'
         and m.id is distinct from new.skapad_av
      on conflict (typ, mottagare_id, dedup_nyckel) do nothing;
    end if;
  exception when others then
    raise warning 'kö_am_kemikalie: %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public."kö_am_kemikalie"() from public, anon, authenticated;

create or replace trigger "trg_kö_am_kemikalie" after insert on public.am_kemikalie
  for each row execute function public."kö_am_kemikalie"();

alter table public.am_riskbedomning drop constraint if exists am_riskbedomning_maskintyp_check;
alter table public.am_riskbedomning add constraint am_riskbedomning_maskintyp_check
  check (maskintyp in ('skordare', 'skotare', 'lastbil', 'motorsag', 'kemikalier'));
alter table public.am_riskbedomning_last drop constraint if exists am_riskbedomning_last_maskintyp_check;
alter table public.am_riskbedomning_last add constraint am_riskbedomning_last_maskintyp_check
  check (maskintyp in ('skordare', 'skotare', 'lastbil', 'motorsag', 'kemikalier'));
