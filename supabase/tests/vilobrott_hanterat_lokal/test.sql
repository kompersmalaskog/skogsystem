\set ON_ERROR_STOP 0
create or replace function pg_temp.som(r text, uid text) returns void language sql as $$
  select set_config('role', r, false), set_config('test.role', r, false), set_config('test.uid', uid, false) $$;
create or replace function pg_temp.ok(villkor boolean, namn text) returns void language plpgsql as $$
begin raise notice '%', case when villkor then 'OK ' else 'FEL ' end || namn; end $$;
\set QUIET 1
\o /dev/null
-- 1. Föraren kan inte kvittera sitt eget brott.
select pg_temp.som('authenticated', '10000000-0000-0000-0000-00000000000f');
do $$ begin
  begin update vilobrott set kvitterad_tid = now(), kvitterad_anteckning = 'själv' where datum = '2026-10-12';
    raise notice 'FEL förare kvitterade';
  exception when insufficient_privilege then raise notice 'OK förare nekas kvittering (42501)'; end;
  begin insert into vilobrott (medarbetare_id, typ, datum, vila_h, krav_h, kvitterad_tid) values ('00000000-0000-0000-0000-00000000000f','veckovila','2026-10-12',30,36, now());
    raise notice 'FEL förare skapade kvitterat brott';
  exception when insufficient_privilege then raise notice 'OK förare nekas kvitterad insert'; end;
end $$;
-- 2. Föraren kan fortfarande svara och re-analysen uppdatera siffrorna.
do $$ declare n int; begin
  update vilobrott set vila_h = 8.4, orsak = 'annat', orsak_fritext = 'storm' where datum = '2026-10-12';
  get diagnostics n = row_count;
  raise notice '%', case when n = 1 then 'OK förare svarar och siffror uppdateras' else 'FEL förarens uppdatering nekad' end;
  insert into vilobrott (medarbetare_id, typ, datum, vila_h, krav_h) values ('00000000-0000-0000-0000-00000000000f','dygnsvila','2026-10-13',9,11);
  raise notice 'OK förare skapar obesvarat brott utan kvittering';
end $$;
-- 3. Admin kvitterar: tid och vem sätts av databasen, det klienten skickar ignoreras.
select pg_temp.som('authenticated', '10000000-0000-0000-0000-00000000000a');
update vilobrott set kvitterad_tid = '2000-01-01', kvitterad_av_chef = '00000000-0000-0000-0000-00000000000f', kvitterad_anteckning = '  Kompledigt 3 h 14 okt  ' where datum = '2026-10-12' and typ = 'dygnsvila';
do $$ declare r record; begin
  select * into r from vilobrott where datum = '2026-10-12' and typ = 'dygnsvila';
  raise notice '%', case when r.kvitterad_tid > now() - interval '1 minute' then 'OK tiden satt av databasen' else 'FEL tiden från klienten: ' || r.kvitterad_tid end;
  raise notice '%', case when r.kvitterad_av_chef = '00000000-0000-0000-0000-00000000000a' then 'OK vem = admin' else 'FEL vem = ' || coalesce(r.kvitterad_av_chef::text,'null') end;
  raise notice '%', case when r.kvitterad_anteckning = 'Kompledigt 3 h 14 okt' then 'OK anteckningen trimmad' else 'FEL anteckning ' || coalesce(r.kvitterad_anteckning,'null') end;
  raise notice '%', case when r.orsak = 'annat' and r.besvarat_av_forare then 'OK förarens svar orört' else 'FEL förarens svar ändrat' end;
end $$;
-- 4. Föraren kan inte ta bort eller ändra admins kvittering, men kan svara vidare.
select pg_temp.som('authenticated', '10000000-0000-0000-0000-00000000000f');
do $$ begin
  begin update vilobrott set kvitterad_tid = null where datum = '2026-10-12' and typ = 'dygnsvila'; raise notice 'FEL förare tog bort kvitteringen';
  exception when insufficient_privilege then raise notice 'OK förare kan inte ta bort kvitteringen'; end;
  begin update vilobrott set kvitterad_anteckning = 'ändrat' where datum = '2026-10-12' and typ = 'dygnsvila'; raise notice 'FEL förare ändrade anteckningen';
  exception when insufficient_privilege then raise notice 'OK förare kan inte ändra anteckningen'; end;
  update vilobrott set orsak_fritext = 'storm i natt' where datum = '2026-10-12' and typ = 'dygnsvila';
  raise notice 'OK förare svarar på kvitterat brott';
end $$;
-- 5. Admin ångrar: allt töms.
select pg_temp.som('authenticated', '10000000-0000-0000-0000-00000000000a');
update vilobrott set kvitterad_tid = null where datum = '2026-10-12' and typ = 'dygnsvila';
do $$ declare r record; begin
  select * into r from vilobrott where datum = '2026-10-12' and typ = 'dygnsvila';
  raise notice '%', case when r.kvitterad_tid is null and r.kvitterad_av_chef is null and r.kvitterad_anteckning is null then 'OK ångra tömmer allt' else 'FEL ångra lämnade kvar' end;
end $$;
-- 6. Admin skapar ett kvitterat brott som ännu inte fanns.
insert into vilobrott (medarbetare_id, typ, datum, vila_h, krav_h, kvitterad_tid, kvitterad_anteckning) values ('00000000-0000-0000-0000-00000000000f','veckovila','2026-10-18',30,36, '2000-01-01', 'Kompledigt');
do $$ declare r record; begin
  select * into r from vilobrott where datum = '2026-10-18';
  raise notice '%', case when r.kvitterad_tid > now() - interval '1 minute' and r.kvitterad_av_chef = '00000000-0000-0000-0000-00000000000a' and not r.besvarat_av_forare then 'OK admin skapar kvitterat brott, obesvarat av föraren' else 'FEL admin-insert' end;
end $$;
-- 7. Service-nyckeln går igenom orörd.
select pg_temp.som('service_role', '');
update vilobrott set kvitterad_tid = '2001-01-01', kvitterad_av_chef = null where datum = '2026-10-18';
do $$ declare r record; begin
  select * into r from vilobrott where datum = '2026-10-18';
  raise notice '%', case when r.kvitterad_tid = '2001-01-01' then 'OK service_role orörd' else 'FEL service_role ändrad' end;
end $$;
