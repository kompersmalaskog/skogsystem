-- GROT: "hämtat" sköter sig självt (Martin 2026-11-21: "det måste gå automatiskt annars kommer det inte att bli gjort").
--
-- Två delar, båda körda av timjobbet `avslut_ur_maskindata` (minut 25), EFTER att risjobbets skotning
-- avslutats av maskindatan och FÖRE objektens status:
--
--   1. KOPPLINGEN risjobb → hygge sätts av appen. Skotarens körspår i hytten (`hyttspar`, roll skotare) de
--      dagar maskinen körde risjobbets lass jämförs med var skördaren fällde (`detalj_stam`). Ett hygge där
--      minst en fjärdedel av körspåret ligger intill fällda stammar kopplas (`kalla = 'auto'`). Ett risjobb
--      som en människa redan kopplat (`kalla = 'manuell'`) rörs aldrig. Utan körspår (äldre jobb, maskin
--      utan appen) kopplas inget — då är det en fråga i Redigering som förut. Energiklippning (t.ex.
--      "Klipp") ligger inte på ett hygge och får därför ingen koppling.
--
--   2. HÄMTAT: när risjobbets skotning är avslutad sätts `dim_objekt.grot_hamtad` på de kopplade hyggena till
--      det datumet — bara där det är tomt (människan går före). `grot_koppling.auto_avbockad_datum` är kvittot.
--      Öppnas risjobbet igen (maskinen kom tillbaka) tas automatikens datum bort, men bara om det fortfarande
--      är exakt det automatiken satte.
--
-- Samma regler som klientens `grotHamtadAutomatik`/`angraGrotHamtadAutomatik` (lib/grot-koppling.ts), som
-- fortfarande körs när någon trycker i Redigering — de två ger samma resultat och skriver aldrig över varandra.
--
-- Torrkörning: select * from public.grot_auto(false);   Skarpt: select * from public.grot_auto(true);
-- Ångra allt automatiken gjort:
--   update dim_objekt d set grot_hamtad = null from grot_koppling k
--     where k.avverknings_objekt_id = d.objekt_id and k.auto_avbockad_datum is not null and d.grot_hamtad = k.auto_avbockad_datum;
--   update grot_koppling set auto_avbockad_datum = null where auto_avbockad_datum is not null;
--   delete from grot_koppling where kalla = 'auto';

alter table public.grot_koppling
  add column if not exists kalla text not null default 'manuell',
  add column if not exists andel numeric;

do $$ begin
  alter table public.grot_koppling add constraint grot_koppling_kalla_check check (kalla in ('manuell', 'auto'));
exception when duplicate_object then null; end $$;

comment on column public.grot_koppling.kalla is
  'manuell = satt av en människa i Redigering (rörs aldrig av appen); auto = satt av grot_auto() ur körspåren.';
comment on column public.grot_koppling.andel is
  'Bara auto: andelen av skotarens körspår på risjobbet som låg intill hyggets fällda stammar (0..1).';

-- ── Förslag: vilka hyggen ligger risjobbets körspår på? ─────────────────────────────────────────────
-- Rutnät om ca 28 × 28 m (0,00025° lat × 0,00045° lng vid 56–57° N). En spårpunkt räknas för ett hygge
-- när någon av hyggets fällda stammar ligger i samma ruta eller en granne (alltså inom ca 28–55 m).
-- Bara slutavverkning och gallring som inte är exkluderade, och bara stammar fällda före risjobbets sista dag.
create or replace function public.grot_koppling_forslag(p_risjobb text)
returns table (avverknings_objekt_id text, andel numeric, traffar bigint, punkter bigint)
language sql stable security definer set search_path = public as $$
  with dagar as (
    select distinct l.maskin_id, l.datum from helikopter_lass l where l.objekt_id = p_risjobb
  ),
  sista as (select max(datum) d from dagar),
  pts as materialized (
    select (p->>'lat')::float8 lat, (p->>'lng')::float8 lng
    from dagar d
    join hyttspar h on h.maskin_id = d.maskin_id and h.datum = d.datum and h.roll = 'skotare'
    cross join lateral jsonb_array_elements(h.points) p
    where (p->>'lat') is not null and (p->>'lng') is not null
  ),
  tot as (select count(*) n from pts),
  pc as materialized (
    select floor(lat / 0.00025)::int a, floor(lng / 0.00045)::int b, count(*) n from pts group by 1, 2
  ),
  bb as (
    select min(lat) - 0.01 la0, max(lat) + 0.01 la1, min(lng) - 0.02 lo0, max(lng) + 0.02 lo1 from pts
  ),
  sc as materialized (
    select distinct s.objekt_id, floor(s.latitude / 0.00025)::int a, floor(s.longitude / 0.00045)::int b
    from bb
    join detalj_stam s on s.latitude between bb.la0 and bb.la1 and s.longitude between bb.lo0 and bb.lo1
    join dim_objekt h on h.objekt_id = s.objekt_id
    where s.objekt_id <> p_risjobb
      and h.huvudtyp in ('Slutavverkning', 'Gallring')
      and not coalesce(h.exkludera, false)
      and (s.tidpunkt is null or s.tidpunkt::date <= (select d from sista))
  ),
  tr as (
    select distinct pc.a, pc.b, pc.n, sc.objekt_id
    from pc
    cross join generate_series(-1, 1) da
    cross join generate_series(-1, 1) db
    join sc on sc.a = pc.a + da and sc.b = pc.b + db
  )
  select tr.objekt_id, round(sum(tr.n)::numeric / nullif((select n from tot), 0), 3), sum(tr.n), (select n from tot)
  from tr group by tr.objekt_id
$$;

-- ── Automatiken ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.grot_auto(p_skriv boolean default false)
returns table (handelse text, risjobb text, avverkning text, detalj text)
language plpgsql security definer set search_path = public as $$
declare
  c_min_andel   constant numeric := 0.25;  -- minst en fjärdedel av körspåret intill hyggets stammar
  c_min_traff   constant int     := 50;    -- och minst 50 spårpunkter (ett par minuters körning)
  c_min_punkter constant int     := 100;   -- för lite körspår = ingen koppling
  c_dagar       constant int     := 90;    -- bara risjobb med lass de senaste 90 dagarna räknas om
  r record; f record; k record;
  v_ska text[];
  v_tot bigint;
begin
  -- 1. Kopplingen.
  for r in
    select d.objekt_id, d.object_name, d.skotning_avslutad
    from dim_objekt d
    where (d.huvudtyp = 'Grot' or coalesce(d.risskotning, false))
      and not coalesce(d.exkludera, false)
      and not exists (select 1 from grot_koppling m where m.risjobb_objekt_id = d.objekt_id and m.kalla = 'manuell')
      and exists (select 1 from helikopter_lass l where l.objekt_id = d.objekt_id and l.datum >= current_date - c_dagar)
  loop
    v_ska := '{}';
    v_tot := 0;
    for f in select * from grot_koppling_forslag(r.objekt_id) order by andel desc loop
      v_tot := f.punkter;
      if f.punkter >= c_min_punkter and f.andel >= c_min_andel and f.traffar >= c_min_traff then
        v_ska := v_ska || f.avverknings_objekt_id;
        if not exists (select 1 from grot_koppling x where x.risjobb_objekt_id = r.objekt_id and x.avverknings_objekt_id = f.avverknings_objekt_id) then
          handelse := 'koppla'; risjobb := r.objekt_id; avverkning := f.avverknings_objekt_id;
          detalj := r.object_name || ' → ' || coalesce((select object_name from dim_objekt where objekt_id = f.avverknings_objekt_id), '?')
                    || ' · ' || round(f.andel * 100) || ' % av körspåret';
          return next;
          if p_skriv then
            insert into grot_koppling (risjobb_objekt_id, avverknings_objekt_id, kalla, andel)
            values (r.objekt_id, f.avverknings_objekt_id, 'auto', f.andel)
            on conflict do nothing;
          end if;
        elsif p_skriv then
          update grot_koppling set andel = f.andel
          where risjobb_objekt_id = r.objekt_id and avverknings_objekt_id = f.avverknings_objekt_id and kalla = 'auto';
        end if;
      end if;
    end loop;

    -- En automatisk koppling som inte längre håller tas bort — men aldrig en som redan bockat av ett hygge.
    for k in
      select x.avverknings_objekt_id from grot_koppling x
      where x.risjobb_objekt_id = r.objekt_id and x.kalla = 'auto' and x.auto_avbockad_datum is null
        and not (x.avverknings_objekt_id = any (v_ska))
    loop
      handelse := 'ta_bort_koppling'; risjobb := r.objekt_id; avverkning := k.avverknings_objekt_id;
      detalj := r.object_name || ' · körspåret räcker inte längre (' || v_tot || ' punkter)';
      return next;
      if p_skriv then
        delete from grot_koppling where risjobb_objekt_id = r.objekt_id and avverknings_objekt_id = k.avverknings_objekt_id
          and kalla = 'auto' and auto_avbockad_datum is null;
      end if;
    end loop;
  end loop;

  -- 2a. Hämtat: risjobbet är skotat → hyggets grot_hamtad (bara där det är tomt).
  for k in
    select x.risjobb_objekt_id, x.avverknings_objekt_id, ris.skotning_avslutad, ris.object_name rn, hy.object_name hn
    from grot_koppling x
    join dim_objekt ris on ris.objekt_id = x.risjobb_objekt_id
    join dim_objekt hy  on hy.objekt_id  = x.avverknings_objekt_id
    where ris.skotning_avslutad is not null and not coalesce(ris.exkludera, false)
      and hy.grot_hamtad is null and x.auto_avbockad_datum is null
  loop
    handelse := 'hamtad'; risjobb := k.risjobb_objekt_id; avverkning := k.avverknings_objekt_id;
    detalj := k.hn || ' · riset hämtat ' || k.skotning_avslutad || ' (' || k.rn || ')';
    return next;
    if p_skriv then
      update dim_objekt set grot_hamtad = k.skotning_avslutad
        where objekt_id = k.avverknings_objekt_id and grot_hamtad is null;
      if found then
        update grot_koppling set auto_avbockad_datum = k.skotning_avslutad
          where risjobb_objekt_id = k.risjobb_objekt_id and avverknings_objekt_id = k.avverknings_objekt_id;
      end if;
    end if;
  end loop;

  -- 2b. Risjobbet öppnat igen → ta bort automatikens datum (bara om det är exakt det automatiken satte).
  for k in
    select x.risjobb_objekt_id, x.avverknings_objekt_id, x.auto_avbockad_datum, hy.grot_hamtad, hy.object_name hn
    from grot_koppling x
    join dim_objekt ris on ris.objekt_id = x.risjobb_objekt_id
    join dim_objekt hy  on hy.objekt_id  = x.avverknings_objekt_id
    where x.auto_avbockad_datum is not null and ris.skotning_avslutad is null
  loop
    handelse := 'ej_hamtad'; risjobb := k.risjobb_objekt_id; avverkning := k.avverknings_objekt_id;
    detalj := k.hn || ' · risjobbet pågår igen' ||
              case when k.grot_hamtad is distinct from k.auto_avbockad_datum then ' (datumet ändrat av en människa, rörs inte)' else '' end;
    return next;
    if p_skriv then
      update dim_objekt set grot_hamtad = null
        where objekt_id = k.avverknings_objekt_id and grot_hamtad = k.auto_avbockad_datum;
      update grot_koppling set auto_avbockad_datum = null
        where risjobb_objekt_id = k.risjobb_objekt_id and avverknings_objekt_id = k.avverknings_objekt_id;
    end if;
  end loop;
end $$;

revoke all on function public.grot_koppling_forslag(text) from public, anon, authenticated;
revoke all on function public.grot_auto(boolean) from public, anon, authenticated;
grant execute on function public.grot_koppling_forslag(text) to service_role;
grant execute on function public.grot_auto(boolean) to service_role;

-- Timjobbet: avslutet först (sätter risjobbets skotning), sedan GROT, sedan objektens status.
select cron.schedule(
  'avslut_ur_maskindata',
  '25 * * * *',
  $c$SELECT count(*) FROM public.avslut_ur_maskindata(true); SELECT count(*) FROM public.grot_auto(true); SELECT count(*) FROM public.objekt_status_ur_maskindata(true);$c$
);
