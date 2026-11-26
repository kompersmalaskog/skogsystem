-- Fart 1 (2026-11-22): efterberäkningarna räknade om ALLT för att se om något ändrats.
--
-- Mätt i prod (pg_stat_statements sedan 2026-10-06 + EXPLAIN ANALYZE 2026-11-22):
--   berakna_utfall_objekt        7 346 anrop × 2 434 ms = 17 881 s   (varje anrop börjar med nyckel-CTE:n som räknar
--   berakna_stamplingsmodell     7 325 anrop ×   377 ms =  2 763 s    ALLA 741 000 stockar och 279 000 stammar: 4,1 s
--   vy_sim_rotkap_par            6 272 anrop × 1 842 ms = 11 552 s    varm, index-only scan, 66 000 buffertar)
--   rotkap_stockar_antal         1 766 anrop × 2 577 ms =  4 551 s   (samma sak, och går ofta över 8 s → fallback
--                                                                      med EN räknefråga per objekt: 271 639 anrop)
-- Räkningen görs för att upptäcka ändringar. Här flyttas upptäckten till skrivningen: en trigger per skrivsats på
-- detalj_stock/detalj_stam/detalj_stam_diameter noterar VILKA objekt som fick nya, borttagna eller flyttade rader,
-- och efterberäkningarna räknar bara om de objekten. Inget annat ändras: samma villkor, samma resultat, bara färre rader lästa.
--
-- Hur det hänger ihop
--   detalj_version     EN rad, räknas upp av varje skrivsats som kan ändra ett antal. Raden är låst till commit, så versionerna
--                      commit-ar i ordning: den som läser version v har sett ALLA ändringar med version <= v.
--   detalj_smutsig     senaste version som rörde ett objekt (en rad per objekt).
--   berakna_version    per konsument ('utfall_objekt', 'stamplings_objekt', 'rotkap'): den version som senast räknades KLART
--                      (alla objekt avstämda, inget kvar). Smutsigt för konsumenten = smutsig.v > berakna_version.v.
--   Saknas raden i berakna_version (första körningen, TRUNCATE) görs den gamla fullständiga räkningen — som förut.
--
-- Vad som INTE noteras, med flit (samma som gamla logiken, som bara jämförde antal): en UPPDATERING av en rad som inte flyttar
-- den mellan objekt och inte ändrar om stem_key/log_key är satta. En omimport av kumulativa HPR-filer (merge-duplicates) skriver
-- om redan befintliga rader — det ändrar inget antal och ska inte väcka något.
--
-- Körs av Martin FÖRE release (additiv; gamla koden fungerar oförändrat utan den). Efter den räknar de två funktionerna
-- med vakten första gången full (4 s) och därefter bara det som ändrats. Importskripten (berakna_rotkap.py,
-- import_diameterserie.py) använder vakten och faller tillbaka på det gamla när den inte finns.
-- Test: bash supabase/tests/fart_andringsvakt_lokal/kor.sh

-- ── 1. Tabellerna ─────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.detalj_version (
  id boolean primary key default true check (id),
  v  bigint not null default 0
);
insert into public.detalj_version (id, v) values (true, 0) on conflict (id) do nothing;

create table if not exists public.detalj_smutsig (
  objekt_id text primary key,
  v         bigint not null
);

create table if not exists public.berakna_version (
  namn text primary key,
  v    bigint not null,
  tid  timestamptz not null default now()
);

alter table public.detalj_version  enable row level security;
alter table public.detalj_smutsig  enable row level security;
alter table public.berakna_version enable row level security;
revoke all on public.detalj_version, public.detalj_smutsig, public.berakna_version from anon, authenticated;
grant select on public.detalj_version, public.detalj_smutsig to service_role;
grant select, insert, update, delete on public.berakna_version to service_role;

-- ── 2. Noteringen ─────────────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: den som skriver detalj_stock kan vara en inloggad användare utan rätt på tabellerna ovan.
create or replace function public.detalj_markera(p_objekt text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_ny bigint;
begin
  if p_objekt is null or cardinality(p_objekt) = 0 then return; end if;
  update public.detalj_version set v = v + 1 returning v into v_ny;
  insert into public.detalj_smutsig (objekt_id, v)
  select distinct o, v_ny from unnest(p_objekt) o where o is not null
  on conflict (objekt_id) do update set v = excluded.v;
end $$;

-- TRUNCATE kan inte ha övergångstabeller: tvinga fullständig räkning nästa gång.
create or replace function public.detalj_trunc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.detalj_version set v = v + 1;
  delete from public.berakna_version;
  return null;
end $$;

-- detalj_stock: räknas per objekt bland rader med stem_key OCH log_key satta.
create or replace function public.detalj_stock_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.detalj_markera(array(select distinct objekt_id::text from nya where objekt_id is not null)); return null; end $$;
create or replace function public.detalj_stock_del() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.detalj_markera(array(select distinct objekt_id::text from gamla where objekt_id is not null)); return null; end $$;
create or replace function public.detalj_stock_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.detalj_markera(array(
    select distinct x from (
      select unnest(array[n.objekt_id::text, g.objekt_id::text]) x
      from nya n join gamla g on g.id = n.id
      where n.objekt_id is distinct from g.objekt_id
         or (n.stem_key is null) <> (g.stem_key is null)
         or (n.log_key is null) <> (g.log_key is null)
    ) t where x is not null));
  return null;
end $$;

-- detalj_stam: räknas per objekt (objekt_id satt).
create or replace function public.detalj_stam_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.detalj_markera(array(select distinct objekt_id::text from nya where objekt_id is not null)); return null; end $$;
create or replace function public.detalj_stam_del() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.detalj_markera(array(select distinct objekt_id::text from gamla where objekt_id is not null)); return null; end $$;
create or replace function public.detalj_stam_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.detalj_markera(array(
    select distinct x from (
      select unnest(array[n.objekt_id::text, g.objekt_id::text]) x
      from nya n join gamla g on g.id = n.id
      where n.objekt_id is distinct from g.objekt_id
    ) t where x is not null));
  return null;
end $$;

-- detalj_stam_diameter: räknas per (objekt, maskin) som antal serier. Bara nya och borttagna rader ändrar antalet.
create or replace function public.detalj_diam_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.detalj_markera(array(select distinct objekt_id::text from nya where objekt_id is not null)); return null; end $$;
create or replace function public.detalj_diam_del() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.detalj_markera(array(select distinct objekt_id::text from gamla where objekt_id is not null)); return null; end $$;

-- dim_objekt behöver ingen trigger: stämplingsmodellen läser huvudtyp LEVANDE (join mot dim_objekt för alla objekt), så ett byte
-- upptäcks ändå. Bara ANTALEN (stockar/stammar) kommer ur vakten.

create or replace trigger a_andring_stock_ins after insert on public.detalj_stock
  referencing new table as nya for each statement execute function public.detalj_stock_ins();
create or replace trigger a_andring_stock_del after delete on public.detalj_stock
  referencing old table as gamla for each statement execute function public.detalj_stock_del();
create or replace trigger a_andring_stock_upd after update on public.detalj_stock
  referencing old table as gamla new table as nya for each statement execute function public.detalj_stock_upd();
create or replace trigger a_andring_stock_trunc after truncate on public.detalj_stock
  for each statement execute function public.detalj_trunc();

create or replace trigger a_andring_stam_ins after insert on public.detalj_stam
  referencing new table as nya for each statement execute function public.detalj_stam_ins();
create or replace trigger a_andring_stam_del after delete on public.detalj_stam
  referencing old table as gamla for each statement execute function public.detalj_stam_del();
create or replace trigger a_andring_stam_upd after update on public.detalj_stam
  referencing old table as gamla new table as nya for each statement execute function public.detalj_stam_upd();
create or replace trigger a_andring_stam_trunc after truncate on public.detalj_stam
  for each statement execute function public.detalj_trunc();

create or replace trigger a_andring_diam_ins after insert on public.detalj_stam_diameter
  referencing new table as nya for each statement execute function public.detalj_diam_ins();
create or replace trigger a_andring_diam_del after delete on public.detalj_stam_diameter
  referencing old table as gamla for each statement execute function public.detalj_diam_del();
create or replace trigger a_andring_diam_trunc after truncate on public.detalj_stam_diameter
  for each statement execute function public.detalj_trunc();

-- ── 3. Nyckeln: samma tal som den gamla CTE:n, men bara de smutsiga objekten räknas ───────────────────────────────
-- Utan berakna_version-rad: den gamla fullständiga räkningen. Med: smutsiga objekt räknas, resten tas ur konsumentens egen
-- tabell (som per definition är rätt för objekt som inte rörts sedan senaste kompletta körningen).
create or replace function public.utfall_nyckel(p_namn text)
returns table (objekt_id text, stockar_antal int, stammar_antal int)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare v_sedd bigint;
begin
  select b.v into v_sedd from public.berakna_version b where b.namn = p_namn;
  if v_sedd is null then
    return query
      select s.objekt_id::text, s.n::int, coalesce(m.n, 0)::int
      from (select d.objekt_id, count(*) as n from public.detalj_stock d
            where d.stem_key is not null and d.log_key is not null and d.objekt_id is not null group by 1) s
      left join (select d.objekt_id, count(*) as n from public.detalj_stam d
                 where d.objekt_id is not null group by 1) m on m.objekt_id = s.objekt_id;
    return;
  end if;
  return query
    with smutsiga as materialized (select d.objekt_id from public.detalj_smutsig d where d.v > v_sedd),
    ny as (
      select s.objekt_id::text as oi, s.n::int as sn, coalesce(m.n, 0)::int as mn
      from (select d.objekt_id, count(*) as n from public.detalj_stock d
            where d.objekt_id in (select x.objekt_id from smutsiga x)
              and d.stem_key is not null and d.log_key is not null group by 1) s
      left join (select d.objekt_id, count(*) as n from public.detalj_stam d
                 where d.objekt_id in (select x.objekt_id from smutsiga x) group by 1) m on m.objekt_id = s.objekt_id),
    lagrade as (
      select u.objekt_id::text as oi, u.stockar_antal::int as sn, u.stammar_antal::int as mn
      from public.utfall_objekt u where p_namn = 'utfall_objekt'
      union all
      select u.objekt_id::text, u.stockar_antal::int, u.stammar_antal::int
      from public.stamplings_objekt u where p_namn = 'stamplings_objekt')
    select ny.oi, ny.sn, ny.mn from ny
    union all
    select l.oi, l.sn, l.mn from lagrade l where l.oi not in (select x.objekt_id::text from smutsiga x);
end $$;
revoke all on function public.utfall_nyckel(text) from public, anon, authenticated;
grant execute on function public.utfall_nyckel(text) to service_role;

-- ── 4. De två funktionerna: byt nyckel-CTE:n och anteckna versionen när allt är räknat ────────────────────────────
-- Som tidigare migrationer: PATCH av befintlig definition (Supabase-MCP:n hänger på långa funktionstexter), med kontroll
-- att varje ersättning faktiskt träffade EXAKT en gång. Träffar den inte avbryts hela migrationen.
do $$
declare
  d text; d2 text;
begin
  -- berakna_utfall_objekt
  d := pg_get_functiondef('public.berakna_utfall_objekt(boolean,integer,timestamptz)'::regprocedure);
  d2 := regexp_replace(d, 'nyckel AS \(.*?\),\s*alla_andrade AS',
                       E'nyckel AS (SELECT * FROM utfall_nyckel(''utfall_objekt'')),\n  alla_andrade AS');
  if d2 = d then raise exception 'berakna_utfall_objekt: nyckel-CTE:n hittades inte'; end if;
  d := d2;
  d2 := replace(d, E'DECLARE\n  t0 timestamptz := clock_timestamp();',
                   E'DECLARE\n  t0 timestamptz := clock_timestamp();\n  v_start bigint := (SELECT v FROM detalj_version);');
  if d2 = d then raise exception 'berakna_utfall_objekt: DECLARE hittades inte'; end if;
  d := d2;
  d2 := replace(d, E'  RETURN jsonb_build_object(\n    ''raknade'', v_raknade',
                   E'  -- Allt avstämt: anteckna versionen (annars räknas samma smutsiga objekt om nästa gång).\n  IF v_kvar = 0 THEN\n    INSERT INTO berakna_version (namn, v, tid) VALUES (''utfall_objekt'', v_start, now())\n    ON CONFLICT (namn) DO UPDATE SET v = EXCLUDED.v, tid = now();\n  END IF;\n\n  RETURN jsonb_build_object(\n    ''raknade'', v_raknade');
  if d2 = d then raise exception 'berakna_utfall_objekt: RETURN hittades inte'; end if;
  execute d2;

  -- berakna_stamplingsmodell
  d := pg_get_functiondef('public.berakna_stamplingsmodell(boolean,integer,timestamptz)'::regprocedure);
  d2 := regexp_replace(d, 'nyckel AS \(.*?\),\s*alla_andrade AS',
                       E'nyckel AS (\n    SELECT n.objekt_id, n.stockar_antal, n.stammar_antal,\n           coalesce(o.huvudtyp = ''Slutavverkning'', false) AS slutavverkning\n    FROM utfall_nyckel(''stamplings_objekt'') n\n    LEFT JOIN dim_objekt o ON o.objekt_id = n.objekt_id),\n  alla_andrade AS');
  if d2 = d then raise exception 'berakna_stamplingsmodell: nyckel-CTE:n hittades inte'; end if;
  d := d2;
  d2 := replace(d, E'DECLARE\n  v_t0      timestamptz := clock_timestamp();',
                   E'DECLARE\n  v_t0      timestamptz := clock_timestamp();\n  v_start   bigint := (SELECT v FROM detalj_version);');
  if d2 = d then raise exception 'berakna_stamplingsmodell: DECLARE hittades inte'; end if;
  d := d2;
  d2 := replace(d, E'  SELECT count(*) INTO v_rader FROM stamplings_klass;\n  RETURN jsonb_build_object(',
                   E'  SELECT count(*) INTO v_rader FROM stamplings_klass;\n  -- Allt avstämt: anteckna versionen.\n  IF v_alla - v_raknade = 0 THEN\n    INSERT INTO berakna_version (namn, v, tid) VALUES (''stamplings_objekt'', v_start, now())\n    ON CONFLICT (namn) DO UPDATE SET v = EXCLUDED.v, tid = now();\n  END IF;\n  RETURN jsonb_build_object(');
  if d2 = d then raise exception 'berakna_stamplingsmodell: RETURN hittades inte'; end if;
  execute d2;
end $$;

-- ── 5. Importens existenskontroll: en fråga per körning i stället för en per HPR-fil ──────────────────────────────
-- import_diameterserie.py frågade "finns filen redan i detalj_stam_diameter?" en gång per fil i Behandlade vid VARJE
-- efterberäkning: 286 456 anrop. Samma fråga, alla filer i ett anrop.
create or replace function public.diameter_filer(p_filnamn text[]) returns setof text
language sql stable set search_path = public as $$
  select f from unnest(p_filnamn) f
  where exists (select 1 from public.detalj_stam_diameter d where d.filnamn = f)
$$;
revoke all on function public.diameter_filer(text[]) from public, anon, authenticated;
grant execute on function public.diameter_filer(text[]) to service_role;

-- Kvitto efter körning (ska ge: 3 tabeller, 11 triggrar, båda funktionerna patchade):
--   select count(*) from pg_trigger where tgname like 'a_andring_%' and not tgisinternal;                      -- 11
--   select prosrc like '%utfall_nyckel(''utfall_objekt'')%' from pg_proc where proname = 'berakna_utfall_objekt';  -- t
--   select prosrc like '%utfall_nyckel(''stamplings_objekt'')%' from pg_proc where proname = 'berakna_stamplingsmodell'; -- t
