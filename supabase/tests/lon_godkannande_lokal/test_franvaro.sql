-- Ändrad frånvaro nollställer förarens godkännande (migrationen 20261025140000). Körs efter test.sql eller fristående efter migrationerna.
-- Varje rad ska säga true. Slutar med antalet rader som INTE är true (ska vara 0).
create temp table fresultat (vad text, ok boolean);
create function fforvanta(p_vad text, p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into fresultat values (p_vad, true);
  exception when others then insert into fresultat values (p_vad || ' (fel: ' || sqlerrm || ')', false); end;
end $$;

delete from ledighet_ansokningar; delete from fortnox_export_logg; delete from "notis_kö"; delete from loneunderlag;
insert into medarbetare (id, user_id, namn, roll, foretagsledare) values
  ('f0000000-0000-4000-8000-00000000000f', '20000000-0000-4000-8000-00000000000f', 'Stefan', 'forare', false)
  on conflict (id) do nothing;

create function fst(p text) returns text language sql as $$ select status from loneunderlag where medarbetare_id = 'f0000000-0000-4000-8000-00000000000f' and period = p $$;
create function fnotis() returns int language sql as $$ select count(*)::int from "notis_kö" where mottagare_id = 'f0000000-0000-4000-8000-00000000000f' and typ = 'lon_andrad' $$;
create function fgodkann() returns void language sql as $$
  delete from loneunderlag where medarbetare_id = 'f0000000-0000-4000-8000-00000000000f';
  insert into loneunderlag (medarbetare_id, period, status, skickat_tidpunkt) values
    ('f0000000-0000-4000-8000-00000000000f', '2026-08', 'godkand_av_forare', '2026-09-02 10:00+00'),
    ('f0000000-0000-4000-8000-00000000000f', '2026-09', 'godkand_av_forare', '2026-10-02 10:00+00'),
    ('f0000000-0000-4000-8000-00000000000f', '2026-10', 'godkand_av_forare', '2026-11-02 10:00+00');
  delete from "notis_kö";
$$;

-- Registrerad sjuk 15 sep (morgonkortet / admin i efterhand)
select fgodkann();
insert into ledighet_ansokningar (id, medarbetare_id, typ, startdatum, slutdatum, status)
  values ('a1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000f', 'sjuk', '2026-09-15', '2026-09-15', 'registrerad');
insert into fresultat select 'sjuk i efterhand nollställer september', fst('2026-09') is null;
insert into fresultat select 'nollställningen bär dagen 15 sep', (select nollstalld_datum = '2026-09-15' from loneunderlag where medarbetare_id = 'f0000000-0000-4000-8000-00000000000f' and period = '2026-09');
insert into fresultat select 'EN notis lon_andrad', fnotis() = 1;
insert into fresultat select 'augusti och oktober rörs inte', fst('2026-08') = 'godkand_av_forare' and fst('2026-10') = 'godkand_av_forare';

-- Kommentaren ändras: lönen läser den inte
select fgodkann();
update ledighet_ansokningar set kommentar = 'feber', kalla = 'admin' where id = 'a1000000-0000-4000-8000-000000000001';
insert into fresultat select 'ändrad kommentar/källa nollställer inte', fst('2026-09') = 'godkand_av_forare' and fnotis() = 0;

-- Slutdatum flyttas
update ledighet_ansokningar set slutdatum = '2026-09-16' where id = 'a1000000-0000-4000-8000-000000000001';
insert into fresultat select 'ändrat slutdatum nollställer', fst('2026-09') is null;

-- Deldagens klockslag ändras
select fgodkann();
update ledighet_ansokningar set fran_tid = '12:00' where id = 'a1000000-0000-4000-8000-000000000001';
insert into fresultat select 'ändrat klockslag (deldag) nollställer', fst('2026-09') is null;

-- Typ ändras
select fgodkann();
update ledighet_ansokningar set typ = 'vab' where id = 'a1000000-0000-4000-8000-000000000001';
insert into fresultat select 'ändrad typ nollställer', fst('2026-09') is null;

-- Raden tas bort
select fgodkann();
delete from ledighet_ansokningar where id = 'a1000000-0000-4000-8000-000000000001';
insert into fresultat select 'borttagen frånvaro nollställer', fst('2026-09') is null;

-- Ansökan som väntar: lönen läser den inte
select fgodkann();
insert into ledighet_ansokningar (id, medarbetare_id, typ, startdatum, slutdatum, status)
  values ('a1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000f', 'semester', '2026-09-28', '2026-10-02', 'väntar');
insert into fresultat select 'ny ansökan som väntar nollställer inte', fst('2026-09') = 'godkand_av_forare' and fst('2026-10') = 'godkand_av_forare';
update ledighet_ansokningar set slutdatum = '2026-10-05' where id = 'a1000000-0000-4000-8000-000000000002';
insert into fresultat select 'ändrad ansökan som väntar nollställer inte', fst('2026-09') = 'godkand_av_forare' and fnotis() = 0;

-- Godkänns: semestern 28 sep–5 okt gäller nu i både september och oktober
update ledighet_ansokningar set status = 'godkänd' where id = 'a1000000-0000-4000-8000-000000000002';
insert into fresultat select 'godkänd semester över månadsskiftet nollställer båda månaderna', fst('2026-09') is null and fst('2026-10') is null;
insert into fresultat select '... men inte augusti', fst('2026-08') = 'godkand_av_forare';
insert into fresultat select 'en notis per månad (två)', fnotis() = 2;
insert into fresultat select 'oktobers dag är 1 okt (periodens första dag i månaden)', (select nollstalld_datum = '2026-10-01' from loneunderlag where medarbetare_id = 'f0000000-0000-4000-8000-00000000000f' and period = '2026-10');

-- Nekas i efterhand (godkänd → nekad): den gamla versionen gällde, nu inte
select fgodkann();
update ledighet_ansokningar set status = 'nekad' where id = 'a1000000-0000-4000-8000-000000000002';
insert into fresultat select 'godkänd → nekad nollställer', fst('2026-09') is null and fst('2026-10') is null;

-- Flyttas mellan månader: både gamla och nya månaden
select fgodkann();
update ledighet_ansokningar set status = 'godkänd', startdatum = '2026-08-10', slutdatum = '2026-08-12' where id = 'a1000000-0000-4000-8000-000000000002';
insert into fresultat select 'nekad → godkänd i augusti nollställer augusti, inte sep/okt', fst('2026-08') is null and fst('2026-09') = 'godkand_av_forare';
select fgodkann();
update ledighet_ansokningar set startdatum = '2026-10-20', slutdatum = '2026-10-21' where id = 'a1000000-0000-4000-8000-000000000002';
insert into fresultat select 'flyttad från augusti till oktober nollställer båda', fst('2026-08') is null and fst('2026-10') is null and fst('2026-09') = 'godkand_av_forare';

-- Tjänstledig 1 okt omger en röd dag i september? Räknas ±10 dagar → september nollställs också.
select fgodkann();
insert into ledighet_ansokningar (medarbetare_id, typ, startdatum, slutdatum, status)
  values ('f0000000-0000-4000-8000-00000000000f', 'tjanstledig', '2026-10-01', '2026-10-01', 'godkänd');
insert into fresultat select 'tjänstledig 1 okt nollställer även september (helglön)', fst('2026-09') is null and fst('2026-10') is null;
select fgodkann();
insert into ledighet_ansokningar (medarbetare_id, typ, startdatum, slutdatum, status)
  values ('f0000000-0000-4000-8000-00000000000f', 'semester', '2026-10-01', '2026-10-01', 'godkänd');
insert into fresultat select 'semester 1 okt nollställer bara oktober', fst('2026-09') = 'godkand_av_forare' and fst('2026-10') is null;

-- Redan skickad månad: ingen nollställning, ingen notis, märks på loggen (loneperiod = arbetsmånad + 1)
select fgodkann();
insert into fortnox_export_logg (medarbetare_id, period, status) values ('f0000000-0000-4000-8000-00000000000f', '2026-10', 'skickat');
insert into ledighet_ansokningar (medarbetare_id, typ, startdatum, slutdatum, status)
  values ('f0000000-0000-4000-8000-00000000000f', 'sjuk', '2026-09-22', '2026-09-22', 'registrerad');
insert into fresultat select 'skickad september: godkännandet står kvar och ingen notis', fst('2026-09') = 'godkand_av_forare' and fnotis() = 0;
insert into fresultat select 'skickad september: dagen märks på loggen', (select andrad_efter_skickat_dagar = '{2026-09-22}' from fortnox_export_logg where medarbetare_id = 'f0000000-0000-4000-8000-00000000000f' and period = '2026-10');
delete from fortnox_export_logg;

-- Felskriven period långt fram: begränsas, välter inget
select fforvanta('period på 40 år välter inte skrivningen', $$insert into ledighet_ansokningar (medarbetare_id, typ, startdatum, slutdatum, status) values ('f0000000-0000-4000-8000-00000000000f', 'foraldraledig', '2026-01-01', '2066-01-01', 'godkänd')$$);

-- Fel i nollställningen välter aldrig ledigheten
alter table loneunderlag rename to loneunderlag_tillfalligt;
select fforvanta('fel i nollställningen välter inte skrivningen', $$insert into ledighet_ansokningar (medarbetare_id, typ, startdatum, slutdatum, status) values ('f0000000-0000-4000-8000-00000000000f', 'sjuk', '2026-09-03', '2026-09-03', 'registrerad')$$);
alter table loneunderlag_tillfalligt rename to loneunderlag;

insert into fresultat select 'förare kan inte anropa funktionen direkt', not has_function_privilege('authenticated', 'ledighet_nollstall_manader(uuid, text, date, date)', 'execute');

select vad, ok from fresultat order by ok, vad;
select count(*) filter (where not ok) as rader_som_inte_ar_true, count(*) as rader from fresultat;
