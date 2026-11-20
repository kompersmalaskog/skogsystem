-- fakt_tid: fånga StanForD otherWorkCategory-fördelningen per dag/operatör.
-- other_work_sek förblir TOTALEN; other_work_kategorier = {kategori: sekunder}.
-- Körd mot prod 2026-07-24 (migration fakt_tid_other_work_kategorier).
alter table fakt_tid
  add column if not exists other_work_kategorier jsonb not null default '{}'::jsonb;

comment on column fakt_tid.other_work_kategorier is
  'StanForD IndividualMachineRunTimeCategory@otherWorkCategory → sekunder per kategori '
  '(Road travel / Preparing strip roads / Towing other machine / Roadside loading of truck / '
  'Unspecified / OKÄND:<värde>). Summan = other_work_sek (varje sekund i totalen har en kategori). '
  '{} = ingen other_work eller rad importerad före PR B.';
