-- GROT: markägarens önskade datum + skäl, per objekt (dim_objekt).
--
-- /grot (egen GROT-vy) visar överst "Markägaren vill ha det bort": objekt där markägaren har ett datum
-- då GROT senast ska vara bortkört, och skälet (markberedning / plantering / annat). Idag finns inget
-- att läsa: objekt.grot_deadline är satt på 2 av 63 objekt (båda historiska), objekt.grot_anteckning är
-- tom överallt och skälet har inget fält alls.
--
-- Kolumnerna läggs på dim_objekt, inte objekt: 13 av de 33 grot-trakterna saknar objekt-rad, och dim_objekt
-- bär alla. Fälten sätts i redigeringsvyn (datum + skäl-val) och läses av /grot. objekt.grot_deadline
-- (gamla GROT-fliken i översikten) rörs inte.
--
-- Rör inget befintligt: två nya, nullbara kolumner + en CHECK på skälet. Idempotent — kan köras om.
-- Inga triggers påverkas: dim_objekt_rensa_auto_ifyllt lyssnar på namngivna kolumner (skogsagare, inkopare,
-- avverkningsform, bolag, grot_anpassad, huvudtyp) och uppdaterad_tid-triggern sätter bara uppdaterad_tid.
-- Importen upsertar dim_objekt med sin egen kolumnuppsättning och nollar därför aldrig de nya fälten.

alter table public.dim_objekt
  add column if not exists grot_senast date,
  add column if not exists grot_skal   text;

-- Skälet är ett av tre värden (eller NULL). CHECK saknar IF NOT EXISTS i Postgres → kontrollera själv.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname  = 'dim_objekt_grot_skal_check'
      and conrelid = 'public.dim_objekt'::regclass
  ) then
    alter table public.dim_objekt
      add constraint dim_objekt_grot_skal_check
      check (grot_skal is null or grot_skal in ('markberedning', 'plantering', 'annat'));
  end if;
end
$$;

comment on column public.dim_objekt.grot_senast is
  'GROT: markägarens önskade datum — GROT ska vara bortkört senast detta datum. Sätts i redigeringsvyn, läses av /grot.';
comment on column public.dim_objekt.grot_skal is
  'GROT: skälet till grot_senast — markberedning | plantering | annat. Sätts i redigeringsvyn, läses av /grot.';

-- Låt PostgREST se kolumnerna direkt (Supabase gör det normalt av sig självt vid DDL).
notify pgrst, 'reload schema';

-- ── Kontroll (kör efteråt, ska ge 2 respektive 1 rad) ────────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'dim_objekt' and column_name in ('grot_senast', 'grot_skal');
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'dim_objekt_grot_skal_check';
--
-- ── Rollback (om det skulle behövas) ─────────────────────────────────────────────────────────────────
-- alter table public.dim_objekt drop constraint if exists dim_objekt_grot_skal_check;
-- alter table public.dim_objekt drop column if exists grot_senast, drop column if exists grot_skal;
