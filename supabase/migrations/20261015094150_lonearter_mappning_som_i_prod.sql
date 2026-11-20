-- Lönearternas koppling: lonesystem_artikelmappning med det schema prod faktiskt har.
--
-- Bakgrund: 20260418_lonesystem.sql skapade tabellen med foretag_id, uppdaterad och UNIQUE(intern_typ). Prod ser annorlunda ut
-- (verifierat mot prod 2026-10-15): lonesystem_id (FK -> lonesystem_koppling, ON DELETE CASCADE), skapad, UNIQUE(lonesystem_id,
-- intern_typ), och varken foretag_id eller uppdaterad. Ändringen gjordes direkt i prod utan migration. Exportens läsning
-- (.eq('lonesystem_id', koppling.id)) och adminsidans skrivning (Lön -> Lönearter) bygger på prods schema, så en databas byggd
-- från migrationerna saknade kolumnen som exporten filtrerar på.
--
-- Den här filen är därför ENBART en beskrivning av prod: i prod är varje sats en no-op (kolumnerna och constrainten finns redan).
-- Inget data ändras, ingen rad läggs till. En löneart utan rad = "Ej kopplad" (tom kod): helglön, och varje framtida löneart,
-- behöver alltså ingen seed — admin fyller i koden under Lön -> Lönearter, och en tom kod tar bort raden.
--
-- Additiv och idempotent. Inga DROP-satser. Ångra: inget att ångra (prod är oförändrad).

alter table public.lonesystem_artikelmappning
  add column if not exists lonesystem_id uuid references public.lonesystem_koppling(id) on delete cascade;

alter table public.lonesystem_artikelmappning
  add column if not exists skapad timestamptz default now();

-- Samma namn som prods constraint: i prod finns indexet redan och satsen hoppar över.
create unique index if not exists lonesystem_artikelmappning_lonesystem_id_intern_typ_key
  on public.lonesystem_artikelmappning (lonesystem_id, intern_typ);

comment on table public.lonesystem_artikelmappning is
  'Vilken Fortnox-löneart (extern_kod, med namnet i beskrivning) varje löneart i appen (intern_typ, lib/lonesystem/loneart.ts) skickas som. Ingen rad = ej kopplad: ingen rad skickas och exporten varnar. Redigeras under Lön -> Lönearter.';
