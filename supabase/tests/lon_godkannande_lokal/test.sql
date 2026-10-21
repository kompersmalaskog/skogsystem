-- Förarens godkännande: en ändring i en godkänd månad nollställer godkännandet och köar EN ny notis (migrationen 20261021100000).
-- Varje rad i resultatet ska säga true. Slutar med antalet rader som INTE är true (ska vara 0).
create temp table resultat (vad text, ok boolean);
grant all on resultat to public;
create function forvanta(p_vad text, p_sql text, p_state text) returns void language plpgsql as $$
declare s text;
begin
  begin execute p_sql; s := null; exception when others then s := sqlstate; end;
  insert into resultat values (p_vad, s is not distinct from p_state);
end $$;

-- A = förare, B = annan förare, L = företagsledare, K = admin
insert into medarbetare (id, user_id, namn, roll, foretagsledare) values
  ('a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'Anna', 'forare', false),
  ('b0000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', 'Bo', 'forare', false),
  ('c0000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-00000000000c', 'Martin', 'admin', true),
  ('d0000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-00000000000d', 'Karin', 'admin', false);

-- Godkännanden för september (period = ARBETSmånad). Anna och Martin har godkänt, Bo har bara en gammal 'inskickat'-rad för augusti.
insert into loneunderlag (medarbetare_id, period, status, skickat_tidpunkt) values
  ('a0000000-0000-4000-8000-00000000000a', '2026-09', 'godkand_av_forare', '2026-10-02 10:00:00+00'),
  ('a0000000-0000-4000-8000-00000000000a', '2026-08', 'godkand_av_forare', '2026-09-02 10:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000c', '2026-09', 'godkand_av_forare', '2026-10-02 10:00:00+00'),
  ('b0000000-0000-4000-8000-00000000000b', '2026-09', 'inskickat', '2026-10-03 10:00:00+00');

create function status_av(p_med text, p_period text) returns text language sql as $$ select status from loneunderlag where medarbetare_id = p_med and period = p_period $$;
create function antal_notis(p_med uuid, p_typ text) returns int language sql as $$ select count(*)::int from "notis_kö" where mottagare_id = p_med and typ = p_typ $$;
create function aterstall() returns void language sql as $$
  update loneunderlag set status = 'godkand_av_forare', nollstalld_at = null, nollstalld_datum = null, skickat_tidpunkt = '2026-10-02 10:00:00+00'
   where medarbetare_id in ('a0000000-0000-4000-8000-00000000000a','c0000000-0000-4000-8000-00000000000c') and period = '2026-09';
  delete from "notis_kö";
$$;

-- ── arbetsdag: en dag i en godkänd månad ändras ──────────────────────────────────────────────────────────
insert into arbetsdag (id, medarbetare_id, datum, start_tid, slut_tid, rast_min, km_totalt, arbetad_min, maskin_id, bekraftad)
  values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', '2026-09-10', '06:00', '15:00', 30, 80, 510, 'R64428', true);
-- (INSERT ovan hände i en godkänd månad: nollställer. Börja därför om rent.)
insert into resultat select 'INSERT av en ny dag i en godkänd månad nollställer', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
select aterstall();
create temp table dag0 as select * from arbetsdag where id = 'e0000000-0000-4000-8000-000000000001';
grant all on dag0 to public;

update arbetsdag set slut_tid = '16:00' where id = 'e0000000-0000-4000-8000-000000000001';
insert into resultat select 'ändrad sluttid nollställer (status NULL)', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
insert into resultat select 'nollställningen bär tidpunkt och den ändrade dagen', (select nollstalld_at is not null and nollstalld_datum = '2026-09-10' from loneunderlag where medarbetare_id = 'a0000000-0000-4000-8000-00000000000a' and period = '2026-09');
insert into resultat select 'EN notis lon_andrad till föraren', antal_notis('a0000000-0000-4000-8000-00000000000a', 'lon_andrad') = 1;
insert into resultat select 'notisen bär arbetsmånaden och köas med skickas_at infinity', (select payload->>'arbetsmanad' = '2026-09' and skickas_at = 'infinity' from "notis_kö" where typ = 'lon_andrad' limit 1);
insert into resultat select 'augusti (annan månad) rörs inte', status_av('a0000000-0000-4000-8000-00000000000a','2026-08') = 'godkand_av_forare';
insert into resultat select 'en annan förares godkännande rörs inte', status_av('b0000000-0000-4000-8000-00000000000b','2026-09') = 'inskickat';

-- Ännu en ändring medan godkännandet redan är nollställt: ingen ny notis (godkännandet finns inte längre att nollställa)
update arbetsdag set slut_tid = '16:30' where id = 'e0000000-0000-4000-8000-000000000001';
insert into resultat select 'ändring efter nollställning ger ingen andra notis', antal_notis('a0000000-0000-4000-8000-00000000000a', 'lon_andrad') = 1;

-- Godkänns på nytt (Arbetsrapport skriver status + ny tidpunkt) och ändras igen: en NY notis, för den nya omgången
update loneunderlag set status = 'godkand_av_forare', skickat_tidpunkt = '2026-10-04 12:00:00+00' where medarbetare_id = 'a0000000-0000-4000-8000-00000000000a' and period = '2026-09';
update arbetsdag set slut_tid = '17:00' where id = 'e0000000-0000-4000-8000-000000000001';
insert into resultat select 'ny omgång (nytt godkännande, ny ändring) ger en ny notis', antal_notis('a0000000-0000-4000-8000-00000000000a', 'lon_andrad') = 2;
select aterstall();

-- Varje lönerelevant kolumn nollställer; kolumner utan betydelse för lönen gör det inte.
create function nollstaller(p_set text) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform aterstall();
  execute format('update arbetsdag set %s where id = %L', p_set, 'e0000000-0000-4000-8000-000000000001');
  r := status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
  delete from arbetsdag where id = 'e0000000-0000-4000-8000-000000000001';
  insert into arbetsdag select * from dag0;     -- raden tillbaka som den var (så varje fall utgår från samma dag)
  perform aterstall();
  return r;
end $$;
insert into resultat select 'arbetad_min nollställer', nollstaller('arbetad_min = 511');
insert into resultat select 'start_tid nollställer', nollstaller($$start_tid = '05:00'$$);
insert into resultat select 'rast_min nollställer', nollstaller('rast_min = 45');
insert into resultat select 'km_totalt nollställer', nollstaller('km_totalt = 90');
insert into resultat select 'km_morgon nollställer', nollstaller('km_morgon = 40');
insert into resultat select 'km_kvall nollställer', nollstaller('km_kvall = 40');
insert into resultat select 'maskin_id nollställer', nollstaller($$maskin_id = 'R64101'$$);
insert into resultat select 'dagtyp nollställer', nollstaller($$dagtyp = 'bytesdag'$$);
insert into resultat select 'traktamente nollställer', nollstaller('traktamente = true');
insert into resultat select 'brandrisk_beordrad nollställer', nollstaller('brandrisk_beordrad = true');
insert into resultat select 'tidigarelagd_start nollställer', nollstaller($$tidigarelagd_start = '{"x":1}'$$);
insert into resultat select 'datum flyttat nollställer', nollstaller($$datum = '2026-09-11'$$);
insert into resultat select 'bekraftad ensam nollställer INTE', not nollstaller('bekraftad = false');
insert into resultat select 'kommentar ensam nollställer INTE', not nollstaller($$kommentar = 'hej'$$);
insert into resultat select 'objekt_id ensam nollställer INTE', not nollstaller($$objekt_id = '123'$$);
insert into resultat select 'redigerad-flaggan ensam nollställer INTE', not nollstaller('redigerad = true');
insert into resultat select 'samma värde skrivet igen nollställer INTE', not nollstaller('arbetad_min = 510');
insert into resultat select 'NULL → NULL räknas inte som ändring', not nollstaller('km_morgon = null');
insert into resultat select 'tidsfragor_svar ensam nollställer INTE', not nollstaller($$tidsfragor_svar = '{"a":1}'$$);

-- DELETE av en dag
select aterstall();
delete from arbetsdag where id = 'e0000000-0000-4000-8000-000000000001';
insert into resultat select 'DELETE av en dag nollställer', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
select aterstall();

-- ── flytt av dag mellan månader: båda månaderna nollställs ───────────────────────────────────────────────
insert into arbetsdag (id, medarbetare_id, datum, arbetad_min) values ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', '2026-10-01', 100);
select aterstall();
update arbetsdag set datum = '2026-09-30' where id = 'e0000000-0000-4000-8000-000000000002';
insert into resultat select 'dag flyttad INTO godkänd månad nollställer den', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
select aterstall();
update loneunderlag set status = 'godkand_av_forare' where medarbetare_id = 'a0000000-0000-4000-8000-00000000000a' and period = '2026-08';
update arbetsdag set datum = '2026-10-01' where id = 'e0000000-0000-4000-8000-000000000002';
insert into resultat select 'dag flyttad UR godkänd månad nollställer den', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
update loneunderlag set status = 'godkand_av_forare' where medarbetare_id = 'a0000000-0000-4000-8000-00000000000a' and period = '2026-08';

-- ── extra_tid ────────────────────────────────────────────────────────────────────────────────────────────
select aterstall();
insert into extra_tid (id, medarbetare_id, datum, typ, minuter, start_tid, slut_tid) values ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', '2026-09-12', 'manuell', 60, '10:00', '11:00');
insert into resultat select 'INSERT av extra tid nollställer', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
create temp table ex0 as select * from extra_tid where id = 'f0000000-0000-4000-8000-000000000001';
grant all on ex0 to public;
create function nollstaller_extra(p_set text) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform aterstall();
  execute format('update extra_tid set %s where id = %L', p_set, 'f0000000-0000-4000-8000-000000000001');
  r := status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
  delete from extra_tid where id = 'f0000000-0000-4000-8000-000000000001';
  insert into extra_tid select * from ex0;
  perform aterstall();
  return r;
end $$;
insert into resultat select 'extra_tid.minuter nollställer', nollstaller_extra('minuter = 90');
insert into resultat select 'extra_tid.slut_tid nollställer', nollstaller_extra($$slut_tid = '12:00'$$);
insert into resultat select 'extra_tid.typ nollställer', nollstaller_extra($$typ = 'planering'$$);
insert into resultat select 'extra_tid.debiterbar nollställer', nollstaller_extra('debiterbar = true');
insert into resultat select 'extra_tid.datum nollställer', nollstaller_extra($$datum = '2026-09-13'$$);
insert into resultat select 'extra_tid.kommentar ensam nollställer INTE', not nollstaller_extra($$kommentar = 'x'$$);
insert into resultat select 'extra_tid.objekt_namn ensam nollställer INTE', not nollstaller_extra($$objekt_namn = 'x'$$);
select aterstall();
delete from extra_tid where id = 'f0000000-0000-4000-8000-000000000001';
insert into resultat select 'DELETE av extra tid nollställer', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
select aterstall();

-- ── företagsledare: nollställs men får ALDRIG en notis ───────────────────────────────────────────────────
insert into arbetsdag (id, medarbetare_id, datum, arbetad_min) values ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000c', '2026-09-15', 100);
insert into resultat select 'företagsledare: ingen notis', antal_notis('c0000000-0000-4000-8000-00000000000c', 'lon_andrad') = 0;
select aterstall();

-- ── ändring i en månad där ingen har godkänt: inget händer, ingen notis ──────────────────────────────────
insert into arbetsdag (id, medarbetare_id, datum, arbetad_min) values ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-00000000000b', '2026-07-15', 100);
insert into resultat select 'månad utan godkännande: ingen notis, ingen rad skapas', antal_notis('b0000000-0000-4000-8000-00000000000b', 'lon_andrad') = 0 and status_av('b0000000-0000-4000-8000-00000000000b','2026-07') is null;

-- ── äldre status 'inskickat' är också ett godkännande och nollställs lika ────────────────────────────────
insert into arbetsdag (id, medarbetare_id, datum, arbetad_min) values ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-00000000000b', '2026-09-16', 100);
insert into resultat select 'inskickat (äldre status) nollställs och ger en notis', status_av('b0000000-0000-4000-8000-00000000000b','2026-09') is null and antal_notis('b0000000-0000-4000-8000-00000000000b', 'lon_andrad') = 1;
update loneunderlag set status = 'inskickat' where medarbetare_id = 'b0000000-0000-4000-8000-00000000000b' and period = '2026-09';

-- ── en trigger får aldrig välta skrivningen ─────────────────────────────────────────────────────────────
select aterstall();
alter table "notis_kö" rename to notis_ko_tillfalligt;
select forvanta('notisfel välter inte skrivningen (arbetsdag)', $$update arbetsdag set arbetad_min = 999 where id = 'e0000000-0000-4000-8000-000000000004'$$, null);
select forvanta('notisfel välter inte skrivningen (på godkänd månad)', $$insert into arbetsdag (id, medarbetare_id, datum, arbetad_min) values ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000a', '2026-09-20', 5)$$, null);
insert into resultat select 'nollställningen står kvar trots notisfelet (den är det som räknas)', status_av('a0000000-0000-4000-8000-00000000000a','2026-09') is null;
alter table notis_ko_tillfalligt rename to "notis_kö";
insert into resultat select 'skrivningen gick igenom trots notisfelet', exists (select 1 from arbetsdag where id = 'e0000000-0000-4000-8000-000000000005');

-- ── kvittering: lon_kvittering ───────────────────────────────────────────────────────────────────────────
select forvanta('kvittering kan skrivas', $$insert into lon_kvittering (medarbetare_id, period, punkt, text) values ('a0000000-0000-4000-8000-00000000000a', '2026-09', 'orim-2026-09-10', '10 sep: passet är 14,2 tim')$$, null);
select forvanta('samma punkt två gånger avvisas (unik)', $$insert into lon_kvittering (medarbetare_id, period, punkt, text) values ('a0000000-0000-4000-8000-00000000000a', '2026-09', 'orim-2026-09-10', 'x')$$, '23505');
select forvanta('samma punkt för en annan förare går', $$insert into lon_kvittering (medarbetare_id, period, punkt, text) values ('b0000000-0000-4000-8000-00000000000b', '2026-09', 'orim-2026-09-10', 'x')$$, null);

-- ── rättigheter och RLS ─────────────────────────────────────────────────────────────────────────────────
insert into resultat select 'anon har inga rättigheter på kvitteringen', not has_table_privilege('anon', 'lon_kvittering', 'select');
set role authenticated;
set test.uid = '10000000-0000-4000-8000-00000000000a';   -- Anna (förare)
insert into resultat select 'förare ser inga kvitteringar (RLS)', (select count(*) from lon_kvittering) = 0;
select forvanta('förare kan inte kvittera (RLS)', $$insert into lon_kvittering (medarbetare_id, period, punkt, text) values ('a0000000-0000-4000-8000-00000000000a', '2026-09', 'ny', 'x')$$, '42501');
set test.uid = '10000000-0000-4000-8000-00000000000d';   -- Karin (admin)
insert into resultat select 'admin ser kvitteringarna', (select count(*) from lon_kvittering) = 2;
select forvanta('admin kan kvittera', $$insert into lon_kvittering (medarbetare_id, period, punkt, text, kvitterad_av) values ('a0000000-0000-4000-8000-00000000000a', '2026-09', 'rast-2026-09-11', 'x', 'd0000000-0000-4000-8000-00000000000d')$$, null);
select forvanta('admin kan ta bort en kvittering', $$delete from lon_kvittering where punkt = 'rast-2026-09-11'$$, null);
reset role;

select vad, ok from resultat order by ok, vad;
select count(*) filter (where not ok) as rader_som_inte_ar_true, count(*) as rader from resultat;
