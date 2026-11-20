-- REDAN APPLICERAD I PROD 2026-09-04 (Martin körde SQL:en för hand) — KÖR INTE OM.
-- Filen speglar prod-tabellen exakt; koden i app/api/km/nattjobb/route.ts skriver mot
-- precis dessa kolumnnamn. Ändras tabellen ska denna fil och routen ändras i samma PR.
--
-- km_nattjobb_logg — EN rad per körning av /api/km/nattjobb (Vercel-cron 01:00 UTC).
-- Bakgrund: nattjobbet hoppade Max 09-03 (ORS "no routable point") och Daniel 09-03
-- (pseudo-objekt utan koordinat) men rapporterade det BARA i sitt HTTP-svar, som ingen
-- läser. Vercels funktionsloggar är flyktiga. Utfallet fick gissas ur data. Aldrig igen:
-- varje körning skriver vad den såg, fyllde och hoppade MED ORSAK.
--
-- detaljer = { fyllda: [{ id, medarbetare_id, datum, km_morgon, km_kvall, källa, anm, bekraftad }],
--              hoppade: [{ id, medarbetare_id, datum, orsak }] }
-- Skrivs BARA av service-rollen (nattjobbet, går förbi RLS). Admin/chef läser.
create table if not exists km_nattjobb_logg (
  id            uuid primary key default gen_random_uuid(),
  kord_tid      timestamptz not null default now(),
  fonster_fran  date,
  fonster_till  date,
  kandidater    int  not null default 0,
  fyllda        int  not null default 0,
  hoppade       int  not null default 0,
  ors_anrop     int  not null default 0,
  detaljer      jsonb not null default '{}'::jsonb,
  fel           text                                  -- satt om körningen kraschade (detaljer ev. ofullständiga)
);

create index if not exists km_nattjobb_logg_kord_tid_idx on km_nattjobb_logg (kord_tid desc);

alter table km_nattjobb_logg enable row level security;

drop policy if exists km_nattjobb_logg_sel on km_nattjobb_logg;
create policy km_nattjobb_logg_sel on km_nattjobb_logg
  for select to authenticated using (ar_admin());
-- Ingen INSERT-policy: service-rollen går förbi RLS, klienter kan aldrig skriva.
