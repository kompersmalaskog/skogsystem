-- Kvittens för körvyns proximitets-notis (symboler i skördarens körvy). Per (objekt, marker) —
-- INGEN förar-kolumn (kvitterat = tyst för alla förare på objektet, enligt beslut).
-- innehall_hash = hash av symbolens typ+kommentar → ändras innehållet skiljer hashen och symbolen
-- ÅTERUPPSTÅR okvitterad.
--
-- DEDIKERAD tabell — skild från planeringsvyns activeWarning (håll isär, ingen koppling nu). OBS:
-- den tabell koden idag pekar på för activeWarning-kvittensen, `public.warning_acknowledgments`,
-- EXISTERAR INTE i databasen (PostgREST: "Could not find the table") — drivingMode-kvittensen har
-- alltså aldrig persisterat. Vi rör inte det spåret här; körvy-notisen får sin egen tabell.
create table if not exists korvy_kvittens (
  id            uuid primary key default gen_random_uuid(),
  objekt_id     uuid references objekt(id) on delete cascade,
  marker_id     text not null,
  marker_type   text,
  marker_name   text,
  innehall_hash text,
  kvitterad_at  timestamptz not null default now(),
  unique (objekt_id, marker_id)          -- en kvittens per symbol per objekt; upsert vid ny hash
);
create index if not exists korvy_kvittens_objekt_idx on korvy_kvittens (objekt_id);

alter table korvy_kvittens enable row level security;
-- Förare är authenticated och skriver sina kvittenser (samma öppna mönster som skotning_uttag #372).
create policy kk_sel on korvy_kvittens for select to authenticated using (true);
create policy kk_ins on korvy_kvittens for insert to authenticated with check (true);
create policy kk_upd on korvy_kvittens for update to authenticated using (true) with check (true);
