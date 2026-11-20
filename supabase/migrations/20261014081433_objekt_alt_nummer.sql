-- Extra nummer på ett objekt: en HPR-fil vars ordernummer inte är objektets vo_nummer kopplas ändå till objektet.
--
-- BAKGRUND (2026-10-14): maskinens ordernummer i filen kan skilja sig från objekt.vo_nummer (Bågskyttebanan: filen 11271849,
-- objektet 11166440; Mölleryd: 11271883 mot 11166477). Appen läser per objekt på numret (hpr_filer.objekt_nyckel
-- '<maskin>:<nummer>' och detalj_stam.objekt_id), så skotaren fick inga produktionshögar — utan felmeddelande.
-- Importen (objekt_koppling.py) provar nu: nummer → extra nummer (den här tabellen) → objektnamnet (exakt EN träff), och sparar
-- numret här när namnet träffade, så nästa fil med samma nummer kopplas direkt. "Koppla till objekt" i /redigering skriver hit.
--
-- Nummer: kontraktsnummer (siffror) gäller globalt → maskin_id NULL. Maskinens eget jobbnummer när kontraktsnr saknas ('k132'
-- = 'k' + ObjectKey) är bara unikt per maskin → maskin_id satt. Nyckeln filen skrivs under ändras aldrig av detta.
--
-- ADDITIV och idempotent (IF NOT EXISTS; policyer i DO-block, inget DROP). Rör ingen befintlig tabell, vy eller funktion.
-- Skrivning: bara admin (public.ar_admin(), som i resten av Skogsystem) och service_role (importen). Läsning: inloggad
-- (planeringsvyn läser objektets extra nummer för att visa högarna).
--
-- ROLLBACK:  drop table public.objekt_alt_nummer;   (importen faller då tillbaka på att namnkoppla varje gång; läsarna
--            hittar inga extra nummer och beter sig som före)

create table if not exists public.objekt_alt_nummer (
  id         uuid primary key default gen_random_uuid(),
  objekt_id  uuid not null references public.objekt(id) on delete cascade,
  nummer     text not null,
  maskin_id  text,
  kalla      text not null check (kalla in ('namn', 'manuell')),
  filnamn    text,
  skapad     timestamptz not null default now(),
  skapad_av  uuid default auth.uid(),
  constraint objekt_alt_nummer_form check (
    (nummer ~ '^[0-9]+$' and maskin_id is null)
    or (nummer ~ '^k[0-9]+$' and maskin_id is not null)
  )
);

comment on table public.objekt_alt_nummer is
  'Extra nummer på ett objekt: ordernummer i HPR-filer som inte är objekt.vo_nummer. kalla=namn: importen hittade exakt ett objekt med filens namn; manuell: Martin kopplade i /redigering.';
comment on column public.objekt_alt_nummer.nummer is
  'Siffror = kontraktsnummer (globalt unikt). k<ObjectKey> = maskinens eget jobbnummer när kontraktsnr saknas (kräver maskin_id).';

-- Ett nummer (per maskin för k-nummer) hör till högst ETT objekt.
create unique index if not exists objekt_alt_nummer_unik on public.objekt_alt_nummer (nummer, coalesce(maskin_id, ''));
create index if not exists objekt_alt_nummer_objekt_idx on public.objekt_alt_nummer (objekt_id);

alter table public.objekt_alt_nummer enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'objekt_alt_nummer' and policyname = 'objekt_alt_nummer_las') then
    create policy objekt_alt_nummer_las on public.objekt_alt_nummer for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'objekt_alt_nummer' and policyname = 'objekt_alt_nummer_skriv_admin') then
    create policy objekt_alt_nummer_skriv_admin on public.objekt_alt_nummer for insert to authenticated
      with check ((select public.ar_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'objekt_alt_nummer' and policyname = 'objekt_alt_nummer_radera_admin') then
    create policy objekt_alt_nummer_radera_admin on public.objekt_alt_nummer for delete to authenticated
      using ((select public.ar_admin()));
  end if;
end $$;
