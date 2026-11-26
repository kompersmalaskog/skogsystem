
create or replace function public.mif_markera_delvis_fel()
returns trigger language plpgsql set search_path = public as $$
declare v_tabeller text;
begin
  if new.status = 'OK' then
    select string_agg(distinct tabell, ', ') into v_tabeller
      from import_fel
     where filnamn = new.filnamn and tid > now() - interval '5 minutes';
    if v_tabeller is not null then
      new.status := 'FEL';
      new.felmeddelande := coalesce(new.felmeddelande, 'Delvis import, fel i: ' || v_tabeller);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists mif_markera_delvis_fel on public.meta_importerade_filer;
create trigger mif_markera_delvis_fel
  before insert or update on public.meta_importerade_filer
  for each row execute function public.mif_markera_delvis_fel();

create table if not exists public.import_larm (
  id int primary key default 1 check (id = 1),
  oppen boolean not null default false,
  oppnad_at timestamptz,
  stangd_at timestamptz,
  text text,
  senast_kord timestamptz
);
alter table public.import_larm enable row level security;
insert into public.import_larm (id) values (1) on conflict do nothing;

create or replace function public.import_larm_kontroll()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_nu     timestamptz := now();
  v_lokal  timestamp   := now() at time zone 'Europe/Stockholm';
  v_idag   date        := (now() at time zone 'Europe/Stockholm')::date;
  v_rader  text[] := '{}';
  v_lage   import_larm%rowtype;
  v_text   text;
  v_n      int;
  r        record;
begin
  for r in
    select x.*, coalesce(d.visningsnamn, x.maskin_id) namn from (
      select distinct on (maskin_id, filtyp) maskin_id, filtyp, status, importerad_tid
        from meta_importerade_filer
       where importerad_tid > v_nu - interval '24 hours'
       order by maskin_id, filtyp, importerad_tid desc) x
    left join dim_maskin d on d.maskin_id = x.maskin_id
    where x.status <> 'OK'
    order by namn
  loop
    v_rader := v_rader || format('%s: %s-filen kl %s gick inte att importera',
      r.namn, r.filtyp, to_char(r.importerad_tid at time zone 'Europe/Stockholm', 'HH24:MI'));
  end loop;

  select count(distinct f.filnamn) into v_n
    from import_fel f
   where f.tid > v_nu - interval '2 hours'
     and not exists (select 1 from meta_importerade_filer m where m.filnamn = f.filnamn);
  if v_n > 0 then
    v_rader := v_rader || format('%s fil(er) felade utan att registreras', v_n);
  end if;

  for r in
    select t.maskin_id, coalesce(d.visningsnamn, t.maskin_id) namn, t.senast
      from (select maskin_id, max(importerad_tid) senast
              from meta_importerade_filer
             where importerad_tid > v_nu - interval '7 days' and filtyp in ('HPR','MOM')
             group by maskin_id having count(*) >= 40) t
      left join dim_maskin d on d.maskin_id = t.maskin_id
     where (t.senast at time zone 'Europe/Stockholm')::date = v_idag
       and (t.senast at time zone 'Europe/Stockholm')::time < time '14:00'
       and v_nu - t.senast > interval '3 hours'
     order by namn
  loop
    v_rader := v_rader || format('%s: inga nya filer sedan kl %s',
      r.namn, to_char(r.senast at time zone 'Europe/Stockholm', 'HH24:MI'));
  end loop;

  if extract(isodow from v_lokal) <= 5 and v_lokal::time between time '09:00' and time '18:00'
     and not exists (select 1 from meta_importerade_filer
                      where importerad_tid >= (v_idag::timestamp at time zone 'Europe/Stockholm')) then
    v_rader := v_rader || 'Inga filer alls har kommit in i dag. Kolla importdatorn.'::text;
  end if;

  v_text := array_to_string(v_rader, E'\n');
  select * into v_lage from import_larm where id = 1 for update;

  if coalesce(array_length(v_rader, 1), 0) > 0 then
    if not v_lage.oppen then
      update import_larm set oppen = true, oppnad_at = v_nu, stangd_at = null, text = v_text, senast_kord = v_nu where id = 1;
      insert into "notis_kö" (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      select m.id, 'import_larm',
             jsonb_build_object('rubrik', 'Importen felar', 'titel', 'Importen felar',
                                'text', v_text, 'body', v_text, 'url', '/datahalsa'),
             'infinity'::timestamptz, 'importlarm:' || v_nu::text
        from medarbetare m where m.roll = 'admin' and coalesce(m.aktiv, true)
      on conflict do nothing;
    else
      update import_larm set text = v_text, senast_kord = v_nu where id = 1;
    end if;
  elsif v_lage.oppen then
    if exists (select 1 from meta_importerade_filer
                where status = 'OK' and importerad_tid > v_lage.oppnad_at) then
      update import_larm set oppen = false, stangd_at = v_nu, text = null, senast_kord = v_nu where id = 1;
      insert into "notis_kö" (mottagare_id, typ, payload, skickas_at, dedup_nyckel)
      select m.id, 'import_ok',
             jsonb_build_object('rubrik', 'Importen fungerar igen', 'titel', 'Importen fungerar igen',
                                'text', 'Nya filer går in utan fel.', 'body', 'Nya filer går in utan fel.', 'url', '/datahalsa'),
             'infinity'::timestamptz, 'importok:' || v_nu::text
        from medarbetare m where m.roll = 'admin' and coalesce(m.aktiv, true)
      on conflict do nothing;
    else
      update import_larm set senast_kord = v_nu where id = 1;
      v_text := 'Felet verkar borta. Väntar på nästa fil för att bekräfta.';
    end if;
  else
    update import_larm set senast_kord = v_nu where id = 1;
  end if;

  select * into v_lage from import_larm where id = 1;

  insert into meta_datahalsa_status (id, kord_tid, status, larm_antal, sammanfattning)
  values ('import_live', v_nu,
          case when v_lage.oppen then 'LARM' else 'OK' end,
          case when v_lage.oppen then greatest(coalesce(array_length(v_rader, 1), 0), 1) else 0 end,
          case when v_lage.oppen
               then coalesce(nullif(v_text, ''), 'Larm öppet') || E'\nLarmet startade ' ||
                    to_char(v_lage.oppnad_at at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI')
               else 'Importen fungerar. Senaste fil ' ||
                    coalesce(to_char((select max(importerad_tid) from meta_importerade_filer) at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI'), '–')
          end)
  on conflict (id) do update set kord_tid = excluded.kord_tid, status = excluded.status,
     larm_antal = excluded.larm_antal, sammanfattning = excluded.sammanfattning;

  return case when v_lage.oppen then 'LARM' else 'OK' end;
end $$;

revoke all on function public.import_larm_kontroll() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'import-larm';
select cron.schedule('import-larm', '*/15 * * * *', 'select public.import_larm_kontroll()');
