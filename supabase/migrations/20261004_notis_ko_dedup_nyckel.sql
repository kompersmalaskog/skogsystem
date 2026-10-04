-- notis_kö får en dedup-nyckel: "en gång per tidpunkt" för påminnelser som inte hänger på ett datum + en mottagare.
--
-- GROT-påminnelserna (/api/grot/paminnelse, 7 och 2 dagar före markägarens datum) köar en rad per (trakt, datum, tidpunkt, mottagare).
-- Det befintliga dedup-indexet (typ, mottagare_id, datum) räcker inte: datumet i notis_kö är en enda kolumn och två trakter kan ha
-- samma datum — den andra skulle tyst tappas. Nyckeln `<VO eller dim-id>|<datum>|<tidpunkt>` ligger därför i en egen kolumn.
--
-- OBS: indexet är ETT VANLIGT unikt index (inte partiellt). PostgREST kan inte ange ett partiellt indexs WHERE i ON CONFLICT, så en
-- upsert som ignorerar dubbletter (insert … on conflict (typ, mottagare_id, dedup_nyckel) do nothing) hittar inte ett partiellt index.
-- Rader utan nyckel (alla befintliga och övriga notistyper) har dedup_nyckel NULL, och NULL räknas som olika värden i ett unikt
-- index — de påverkas alltså inte alls.
--
-- Rör inget befintligt: en ny nullbar kolumn + ett index. Idempotent — kan köras om.

alter table notis_kö add column if not exists dedup_nyckel text;

comment on column notis_kö.dedup_nyckel is
  'Dedup-nyckel för notiser där (typ, mottagare, datum) inte räcker, t.ex. grot_senast: <VO eller dim-id>|<datum>|<tidpunkt>. NULL för övriga typer.';

create unique index if not exists notis_ko_dedup_nyckel_unik
  on notis_kö (typ, mottagare_id, dedup_nyckel);

-- Låt PostgREST se kolumnen direkt (Supabase gör det normalt av sig självt vid DDL).
notify pgrst, 'reload schema';

-- ── Kontroll (kör efteråt, ska ge 1 respektive 1 rad) ────────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'notis_kö' and column_name = 'dedup_nyckel';
-- select indexname from pg_indexes where tablename = 'notis_kö' and indexname = 'notis_ko_dedup_nyckel_unik';
--
-- ── Rollback (om det skulle behövas) ─────────────────────────────────────────────────────────────────
-- drop index if exists notis_ko_dedup_nyckel_unik;
-- alter table notis_kö drop column if exists dedup_nyckel;
