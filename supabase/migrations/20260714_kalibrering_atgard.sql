-- Åtgärdsmarkörer för kalibreringsvyns diagnos-läge.
-- Föraren sätter en markör (datum + fritext, t.ex. "höjde trycket till 400 mm").
-- Visas i alla tidsvyer så man ser vilken siffra som svarade på vilken åtgärd.
-- Befintliga händelser (reparationer m.m.) läses read-only ur
-- fakt_kalibrering_historik — de kopieras INTE hit.
--
-- KÖRD MOT PROD 2026-07-14.

create table if not exists kalibrering_atgard (
  id          bigserial primary key,
  maskin_id   text not null,
  datum       date not null,
  text        text not null,
  skapad_av   text,
  skapad_tid  timestamptz not null default now()
);

create index if not exists ix_kalibrering_atgard_maskin_datum
  on kalibrering_atgard (maskin_id, datum desc);

alter table kalibrering_atgard enable row level security;

-- Autentiserade får läsa alla markörer …
create policy kalibrering_atgard_select on kalibrering_atgard
  for select to authenticated using (true);

-- … och infoga nya (förare sätter markörer från appen).
create policy kalibrering_atgard_insert on kalibrering_atgard
  for insert to authenticated with check (true);
