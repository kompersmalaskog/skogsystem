-- km_nattjobb_logg — EN rad per körning av /api/km/nattjobb (Vercel-cron 01:00 UTC).
--
-- Bakgrund 2026-09-04: nattjobbet hoppade Max 09-03 (ORS "no routable point") och Daniel
-- 09-03 (pseudo-objekt utan koordinat) — men rapporterade det BARA i sitt HTTP-svar, som
-- ingen läser. Vercels funktionsloggar är flyktiga. Resultatet fick gissas ur data.
-- Aldrig igen: varje körning skriver vad den såg, vad den fyllde och vad den hoppade
-- MED ORSAK, så "varför står Max på 0 km?" besvaras med en SELECT, inte en utredning.
--
-- fyllda/hoppade = jsonb-listor (samma form som HTTP-svaret): { id, medarbetare_id,
-- datum, km_morgon, km_kvall, källa, anm } resp. { id, medarbetare_id, datum, orsak }.
-- Skrivs BARA av service-rollen (nattjobbet). Admin/chef läser i appen; ingen insert-
-- policy för authenticated → RLS blockerar all klientskrivning.
create table if not exists km_nattjobb_logg (
  id             uuid primary key default gen_random_uuid(),
  startad_at     timestamptz not null default now(),
  avslutad_at    timestamptz,
  fonster_fran   date,
  fonster_till   date,
  kandidater     int  not null default 0,
  antal_fyllda   int  not null default 0,
  antal_hoppade  int  not null default 0,
  ors_anrop      int  not null default 0,
  fyllda         jsonb not null default '[]'::jsonb,
  hoppade        jsonb not null default '[]'::jsonb,
  fel            text                                  -- satt om körningen kraschade (då är listorna ev. ofullständiga)
);

create index if not exists km_nattjobb_logg_startad_idx on km_nattjobb_logg (startad_at desc);

alter table km_nattjobb_logg enable row level security;

-- Läsning: admin/chef (samma ar_admin()-mönster som övriga admin-tabeller).
drop policy if exists km_nattjobb_logg_sel on km_nattjobb_logg;
create policy km_nattjobb_logg_sel on km_nattjobb_logg
  for select to authenticated using (ar_admin());

comment on table km_nattjobb_logg is
  'En rad per nattjobbs-körning: kandidater, fyllda (med värden), hoppade (med orsak). Skrivs av service-rollen.';
