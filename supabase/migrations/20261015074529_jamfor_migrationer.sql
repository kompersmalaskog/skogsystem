-- jamfor_migrationer: svarar på "finns de här migrationsfilerna i prod, med samma version och samma namn?" utan att läcka något mer.
--
-- Varför: versionsglapp (filen heter en sak, prod stämplade en annan) och migrationer som aldrig körts syns inte förrän någon letar.
-- scripts/vad-slapps.mjs och CI-checken scripts/migrationskontroll.mjs anropar den här funktionen med anon-nyckeln (den som redan ligger i
-- webbläsaren) — ingen servicenyckel. Schemat supabase_migrations är inte läsbart för anon/authenticated, därför SECURITY DEFINER.
--
-- Funktionen JÄMFÖR, den LISTAR inte: den får in anroparens egna (version, namn) och svarar bara om just dem. Man kan alltså inte räkna upp
-- prods migrationer med den; det enda som kan läcka är prods version för ett namn man redan gissat. Svaret:
--   saknas         migrationer varken versionen eller namnet finns i prod för
--   versionsglapp  namnet finns i prod men med en annan version (prod_version) — filen ska döpas om till prods version
--   versionskrock  versionen finns i prod men med ett annat namn (prod_namn) — två migrationer vill ha samma version
--   ok             antal med samma version OCH namn
-- Innehållet jämförs inte (BEGIN/COMMIT, extra DROP IF EXISTS och kommentarer gör en md5-jämförelse till falsklarm).
--
-- Skydd: search_path tom + kvalificerade namn; högst 500 poster per anrop; execute bara för anon och authenticated (inte public).
-- Rör inga data och inga andra objekt. Additiv.
--
-- Verifiering (i en transaktion som rullas tillbaka, som anon): se PR-texten. Ångra:
--   drop function if exists public.jamfor_migrationer(jsonb);

create or replace function public.jamfor_migrationer(p_filer jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_antal   int;
  v_saknas  jsonb;
  v_glapp   jsonb;
  v_krock   jsonb;
  v_ok      int;
begin
  if p_filer is null or jsonb_typeof(p_filer) <> 'array' then
    raise exception 'p_filer måste vara en JSON-lista av {version, namn}';
  end if;
  v_antal := jsonb_array_length(p_filer);
  if v_antal > 500 then
    raise exception 'För många migrationer (% > 500)', v_antal;
  end if;

  with f as (
    select e->>'version' as version, e->>'namn' as namn
    from jsonb_array_elements(p_filer) e
  ),
  k as (
    select f.version, f.namn,
      exists (select 1 from supabase_migrations.schema_migrations p
               where p.version = f.version and p.name = f.namn) as lika,
      (select p.version from supabase_migrations.schema_migrations p
        where p.name = f.namn and p.version <> f.version order by p.version limit 1) as prod_version,
      (select p.name from supabase_migrations.schema_migrations p
        where p.version = f.version and p.name <> f.namn limit 1) as prod_namn
    from f
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('version', version, 'namn', namn))
             filter (where not lika and prod_version is null and prod_namn is null), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('version', version, 'namn', namn, 'prod_version', prod_version))
             filter (where not lika and prod_version is not null), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('version', version, 'namn', namn, 'prod_namn', prod_namn))
             filter (where not lika and prod_version is null and prod_namn is not null), '[]'::jsonb),
    count(*) filter (where lika)
  into v_saknas, v_glapp, v_krock, v_ok
  from k;

  return jsonb_build_object('saknas', v_saknas, 'versionsglapp', v_glapp, 'versionskrock', v_krock, 'ok', v_ok);
end;
$$;

revoke all on function public.jamfor_migrationer(jsonb) from public;
grant execute on function public.jamfor_migrationer(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
