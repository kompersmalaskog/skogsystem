-- GROT: markägarens markkrav, per objekt (dim_objekt).
--
-- GROT-arket i /oversikt-v2 visar "bara torrt/tjäle" i orange på listraden och i objekt-arket när markägaren bara
-- tillåter körning på torr mark eller tjäle. Förman/admin sätter värdet i arkets sektion "Markägaren" (två knappar:
-- Tål blött · Bara torrt/tjäle). NULL = ingen uppgift — det vanliga.
--
--   tal_blott          marken tål blött
--   torrt_eller_tjale  bara torrt eller tjäle
--
-- Samma form som 20261002_grot_markagarens_datum.sql: en ny, nullbar kolumn på dim_objekt (13 av de 33 grot-trakterna
-- saknar objekt-rad, och dim_objekt bär alla) + en CHECK. Rör inget befintligt. Idempotent — kan köras om.
-- Importen upsertar dim_objekt med sin egen kolumnuppsättning och nollar därför aldrig det nya fältet, och
-- triggerna lyssnar på namngivna kolumner (se 20261002) — ingen av dem berörs.
--
-- KÖR DEN HÄR INNAN PR:en mergas (och innan Vercel-previewn öppnas): /oversikt-v2 läser kolumnen med namn i sin
-- select. Finns den inte än fallerar GROT-läsningen och GROT-chippen försvinner från kartan.

alter table public.dim_objekt
  add column if not exists grot_markkrav text;

-- Värdet är ett av två (eller NULL). CHECK saknar IF NOT EXISTS i Postgres → kontrollera själv.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname  = 'dim_objekt_grot_markkrav_check'
      and conrelid = 'public.dim_objekt'::regclass
  ) then
    alter table public.dim_objekt
      add constraint dim_objekt_grot_markkrav_check
      check (grot_markkrav is null or grot_markkrav in ('tal_blott', 'torrt_eller_tjale'));
  end if;
end
$$;

comment on column public.dim_objekt.grot_markkrav is
  'GROT: markägarens markkrav — tal_blott | torrt_eller_tjale. NULL = ingen uppgift. Sätts i GROT-arket i /oversikt-v2 (förman/admin).';

-- Låt PostgREST se kolumnen direkt (Supabase gör det normalt av sig självt vid DDL).
notify pgrst, 'reload schema';

-- ── Kontroll (kör efteråt, ska ge 1 respektive 1 rad) ────────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'dim_objekt' and column_name = 'grot_markkrav';
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'dim_objekt_grot_markkrav_check';
--
-- ── Rollback (om det skulle behövas) ─────────────────────────────────────────────────────────────────
-- alter table public.dim_objekt drop constraint if exists dim_objekt_grot_markkrav_check;
-- alter table public.dim_objekt drop column if exists grot_markkrav;
