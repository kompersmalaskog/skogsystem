-- Cache-först vägdata: väggeometri per objekt, fylld server-side (bakgrund/cron) och läst av
-- /planering (checkBoundaryTma) för TMA-väglinjen. Frikopplar förarappen HELT från live-anrop
-- till Overpass/NVDB — ett säkerhetsunderlag får aldrig hänga på en flakig extern tjänst.
--
-- geometri lagras i Overpass-"elements"-form som ett KÄLLOBEROENDE KONTRAKT: PR 2 (checkBoundaryTma)
-- läser data.elements oförändrat oavsett om hämtaren använde Overpass (reserv) eller NVDB (primär).

create table if not exists objekt_vagdata (
  objekt_id   uuid primary key references objekt(id) on delete cascade,
  geometri    jsonb,                              -- { elements: [ {type:'way', tags:{highway,maxspeed,ref,name}, geometry:[{lat,lon}]} ] }
  kalla       text,                               -- 'overpass' | 'nvdb'
  status      text not null default 'vantar',     -- 'vantar' | 'pagar' | 'ok' | 'misslyckad'
  hamtad_at   timestamptz,
  bbox        jsonb,                              -- { minLat, minLon, maxLat, maxLon } — idempotent omhämtning
  fel         text,                               -- sista felet vid 'misslyckad' (diagnostik — aldrig tyst)
  updated_at  timestamptz not null default now()
);

create index if not exists objekt_vagdata_status_idx on objekt_vagdata (status);

-- RLS: LÄSNING öppen för appen (planeringsdatat läses klientsidan, som planering_markeringar).
-- SKRIVNING sker bara server-side med service-role (kringgår RLS) → klienter kan inte skriva.
-- Väggeometri är publik data (OSM/NVDB), inte känslig.
alter table objekt_vagdata enable row level security;
create policy objekt_vagdata_read on objekt_vagdata for select using (true);
