-- Skördarens GPS-spår → förenklade STRÅK (underlag för skotarens körvy, PR 1 av skotarvy-serien).
-- Precomputeras server-side av scripts/berakna_skordarstrak.py ur detalj_gps_spar:
--   steg 0: DEDUP på (maskin, objekt, tidpunkt, lat, lon) — arbetspositions-bursten (en rad per
--           stock på samma uppställning) viktar annars stråket mot stockrika stopp.
--   steg 1: segmentering på tidslucka (+ säkerhets-split på långa avståndshopp).
--   steg 2: RDP-förenkling (gles sampling → låg tolerans, behåller formen).
-- Volymerna ligger INTE här — kvar-etiketten per stråk är dynamisk (klumpning hög→stråk +
-- lib/skotat.draAvUttagFranHogar, PR 2/3). Denna tabell bär bara den STATISKA geometrin.

create table if not exists skordarstrak (
  id                uuid primary key default gen_random_uuid(),
  objekt_id         uuid not null references objekt(id) on delete cascade,  -- mappad app-objekt (via vo_nummer)
  vo_nummer         text not null,                                          -- rå detalj_gps_spar.objekt_id (Vida VO)
  maskin_id         text not null,                                          -- skördaren som körde stråket
  strak_nr          int  not null,                                          -- löpnummer inom (objekt, maskin)
  geometri          jsonb not null,                                         -- [[lng,lat], ...] förenklad linje (WGS84)
  antal_punkter_ra  int  not null,                                          -- efter dedup, före RDP
  antal_punkter     int  not null,                                          -- efter RDP (det som lagras i geometri)
  langd_m           double precision not null,                              -- haversine-summa längs stråket
  tid_start         timestamptz,
  tid_slut          timestamptz,
  berakning         jsonb,                                                  -- {tidslucka_s, hopp_m, rdp_m} som användes
  skapad_at         timestamptz not null default now()
);

create index if not exists skordarstrak_objekt_idx on skordarstrak (objekt_id);
create index if not exists skordarstrak_vo_idx     on skordarstrak (vo_nummer);

-- RLS: läsbar för inloggade (som övriga uppslagstabeller). Skrivs BARA av service-role-skriptet
-- (service-nyckeln kringgår RLS → ingen insert/update/delete-policy behövs).
alter table skordarstrak enable row level security;
drop policy if exists skordarstrak_select on skordarstrak;
create policy skordarstrak_select on skordarstrak for select to authenticated using (true);
