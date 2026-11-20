-- Realtids-körspår från maskinernas hytt-enheter (appen loggar KÖRSPÅRET live, för båda maskinerna).
-- EN rad per (objekt, roll, datum) → resume-bar: samma dag/objekt/roll fyller vidare samma rad om
-- körvyn stängs och öppnas igen. points = RDP-gallrat [{lat,lng,tid}] i klienten (håller arrayen liten
-- över ett helt skift → billiga skrivningar). SKILT från gps_tracks (som bär manuella planeringslinjer)
-- — den blandningen vore tvetydig, en egen tabell är billigare.
create table if not exists hyttspar (
  id           uuid primary key default gen_random_uuid(),
  objekt_id    uuid references objekt(id) on delete cascade,
  maskin_id    text,                                 -- best-effort (skördarens ur dim_objekt); roll är nyckeln
  roll         text not null,                        -- 'skordare' | 'skotare'
  datum        date not null,
  points       jsonb not null default '[]'::jsonb,   -- [{lat,lng,tid}] RDP-gallrat
  status       text not null default 'recording',    -- 'recording' | 'completed'
  antal_punkter int  not null default 0,
  skapad_at    timestamptz not null default now(),
  uppdaterad_at timestamptz not null default now(),
  avslutad_at  timestamptz,
  unique (objekt_id, roll, datum)                     -- en rad per förare per objekt per dag
);
create index if not exists hyttspar_objekt_idx on hyttspar (objekt_id);

alter table hyttspar enable row level security;
-- Förare är authenticated och skriver sitt EGET spår live. Samma öppna authenticated-mönster som
-- skotning_uttag sedan #372 (spåren är objekt-delade arbetsdata, ej per-användare-scopade).
create policy hyttspar_sel on hyttspar for select to authenticated using (true);
create policy hyttspar_ins on hyttspar for insert to authenticated with check (true);
create policy hyttspar_upd on hyttspar for update to authenticated using (true) with check (true);

-- STÄDNING: 12 körspår-rader i gps_tracks sitter kvar i 'recording' (auto-start på geofence, ingen
-- tillförlitlig stopp). Föräldralöst data ska inte ligga och ljuga status → sätt completed.
update gps_tracks
   set status = 'completed', completed_at = coalesce(completed_at, updated_at, now())
 where line_type = 'korspår' and status = 'recording';
