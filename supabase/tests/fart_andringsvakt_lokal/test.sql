\set ON_ERROR_STOP on
-- Bevis för att den nya vakten ger SAMMA resultat som den gamla fullständiga räkningen, och att den inte räknar när inget ändrats.
-- Metod: efter varje steg ögonblicksbilda det inkrementella läget, tvinga en fullständig omräkning (version borttagen + p_allt)
-- och kräv att allt utom tidsstämplar är identiskt.

create temp table ok_rakning (n int);
insert into ok_rakning values (0);

create or replace function pg_temp.bild() returns jsonb language sql as $$
  select jsonb_build_object(
    'utfall',   coalesce((select jsonb_agg(to_jsonb(t) - 'beraknad' - 'kontrollerad' - 'manad_beraknad' order by objekt_id) from utfall_objekt t), '[]'),
    'manad',    coalesce((select jsonb_agg(to_jsonb(t) - 'beraknad' order by objekt_id, manad) from utfall_manad t), '[]'),
    'stampl',   coalesce((select jsonb_agg(to_jsonb(t) - 'beraknad' order by objekt_id) from stamplings_objekt t), '[]'),
    'cell',     coalesce((select jsonb_agg(to_jsonb(t) order by objekt_id, slag, klass, rot) from stamplings_cell t), '[]'),
    'klass',    coalesce((select jsonb_agg(to_jsonb(t) - 'beraknad' order by slag, klass, rot) from stamplings_klass t), '[]'))
$$;

-- Kör båda funktionerna tills inget är kvar (som skripten); returnerar antal räknade objekt (utfall, stämpling) i första varvet.
create or replace function pg_temp.kor(p_max int default 100, out ut int, out st int) language plpgsql as $$
declare r jsonb; ar jsonb;
begin
  r := berakna_utfall_objekt(false, p_max, now()); ut := (r->>'raknade')::int;
  while (r->>'kvar')::int > 0 loop r := berakna_utfall_objekt(false, p_max, now()); end loop;
  ar := berakna_stamplingsmodell(false, p_max, now()); st := (ar->>'raknade')::int;
  while (ar->>'kvar')::int > 0 loop ar := berakna_stamplingsmodell(false, p_max, now()); end loop;
end $$;

create or replace function pg_temp.lika_som_full(steg text) returns void language plpgsql as $$
declare inkr jsonb; helt jsonb;
begin
  inkr := pg_temp.bild();
  delete from berakna_version;
  perform berakna_utfall_objekt(true, 1000, now() + interval '1 hour');
  perform berakna_stamplingsmodell(true, 1000, now() + interval '1 hour');
  helt := pg_temp.bild();
  if inkr is distinct from helt then
    raise exception 'STEG %: inkrementellt resultat skiljer sig från fullständig omräkning', steg using detail = inkr::text || E'\n----\n' || helt::text;
  end if;
  update ok_rakning set n = n + 1;
  -- Återställ vakten så nästa steg testar den inkrementella vägen.
  perform pg_temp.kor();
  raise notice 'OK  %', steg;
end $$;

create or replace function pg_temp.ar(namn text, fick int, vill int) returns void language plpgsql as $$
begin
  if fick is distinct from vill then raise exception '% : fick %, ville %', namn, fick, vill; end if;
  update ok_rakning set n = n + 1;
end $$;

-- ── Frö: tre objekt, fyra sortiment, två maskiner ──
insert into dim_tradslag values ('1','GRAN'),('2','TALL'),('3','BJÖRK');
insert into dim_sortiment values ('1','Timmer: A'),('2','Massa: BmavFall_V3'),('3','Hemved: X'),('4','Kubb: K');
insert into dim_objekt values ('A','Slutavverkning'),('B','Gallring'),('C','Slutavverkning');
insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, sortiment_id, sortiment_namn, volym_m3sub, langd_cm, tidpunkt, tradslag_id)
select 'M' || o, o, 's'||g, 'l'||l, (1 + (g + l) % 4)::text, 'x', 0.1 * (g % 7 + 1), 300 + l, timestamp '2026-10-01' + (g || ' days')::interval, (1 + g % 3)::text
from unnest(array['A','B','C']) o, generate_series(1, 40) g, generate_series(1, 3) l;
-- Stammarna delar stem_key med objektets stockar (stam_key = 's'||g) — olika maskin per objekt så (maskin_id, stam_key) är unik.
insert into detalj_stam (maskin_id, stam_key, filnamn, objekt_id, dbh_mm, tradslag_id)
select 'M' || o, 's' || g, 'f.hpr', o, 120 + g * 5, (1 + g % 3)::text from unnest(array['A','B','C']) o, generate_series(1, 40) g;

-- ── 1. Första körningen (ingen version): full väg, version noteras ──
select pg_temp.ar('första körningen räknar alla tre', (select ut from pg_temp.kor()), 3);
select pg_temp.ar('versionen är noterad för båda', (select count(*)::int from berakna_version where namn in ('utfall_objekt','stamplings_objekt')), 2);
select pg_temp.lika_som_full('1 första körningen = full räkning');

-- ── 2. Ingen ändring: ingenting räknas ──
select pg_temp.ar('orörd data räknar 0 (utfall)', (select ut from pg_temp.kor()), 0);
select pg_temp.ar('orörd data räknar 0 (stämpling)', (select st from pg_temp.kor()), 0);

-- ── 3. BEVIS att den inte räknar: en rad skriven förbi triggrarna syns inte, en vanlig ändring av annat objekt syns ──
set session_replication_role = replica;
insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, sortiment_id, volym_m3sub, langd_cm, tidpunkt, tradslag_id)
  values ('MB','B','tyst','1','1',1,300,'2026-10-02','1');
set session_replication_role = origin;
select pg_temp.ar('utan notering räknas inget (ingen helräkning)', (select ut from pg_temp.kor()), 0);
insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, sortiment_id, volym_m3sub, langd_cm, tidpunkt, tradslag_id)
  values ('MC','C','ny','1','1',1,300,'2026-10-02','1');
select pg_temp.ar('en vanlig insert räknar bara det objektet', (select ut from pg_temp.kor()), 1);
-- Den tysta raden i B räknades aldrig (det är invarianten: all skrivning går via triggrarna). Ta bort den förbi triggrarna igen.
set session_replication_role = replica;
delete from detalj_stock where stem_key = 'tyst';
set session_replication_role = origin;
select pg_temp.lika_som_full('3 tyst rad borttagen, ny rad i C');

-- ── 4. Omskrivning av befintliga rader (kumulativ HPR) ändrar inget antal: ingen notering ──
do $$ declare v0 bigint; begin
  select v into v0 from detalj_version;
  insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, sortiment_id, volym_m3sub, langd_cm, tidpunkt, tradslag_id)
    select maskin_id, objekt_id, stem_key, log_key, sortiment_id, volym_m3sub + 0, langd_cm, tidpunkt, tradslag_id from detalj_stock where objekt_id = 'A'
    on conflict (maskin_id, stem_key, log_key) do update set volym_m3sub = excluded.volym_m3sub;
  insert into detalj_stam (maskin_id, stam_key, filnamn, objekt_id, dbh_mm, tradslag_id)
    select maskin_id, stam_key, filnamn, objekt_id, dbh_mm, tradslag_id from detalj_stam where objekt_id = 'A'
    on conflict (maskin_id, stam_key) do update set dbh_mm = excluded.dbh_mm;
  if (select v from detalj_version) <> v0 then raise exception 'omskrivning av befintliga rader ska inte flytta versionen'; end if;
end $$;
select pg_temp.ar('omskrivning räknar 0', (select ut from pg_temp.kor()), 0);

-- ── 5. Blandat: nya + befintliga rader i en sats ──
insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, sortiment_id, volym_m3sub, langd_cm, tidpunkt, tradslag_id)
  select 'MA', 'A', 's' || g, 'l9', 1, 0.5, 310, '2026-10-03', 1 from generate_series(1, 5) g
  union all select 'MA','A','s1','l1','2',9,300,timestamp '2026-10-03','1'
  on conflict (maskin_id, stem_key, log_key) do update set volym_m3sub = excluded.volym_m3sub;
select pg_temp.ar('blandad sats räknar A', (select ut from pg_temp.kor()), 1);
select pg_temp.lika_som_full('5 blandad insert/upsert');

-- ── 6. Borttagning, och ett objekt som tappar all stockdata ──
delete from detalj_stock where objekt_id = 'B' and stem_key in ('s1','s2');
select pg_temp.ar('delete räknar B', (select ut from pg_temp.kor()), 1);
select pg_temp.lika_som_full('6a delete');
delete from detalj_stock where objekt_id = 'C';
select pg_temp.kor();
select pg_temp.ar('objekt utan stockar är borta ur utfall_objekt', (select count(*)::int from utfall_objekt where objekt_id = 'C'), 0);
select pg_temp.lika_som_full('6b objekt utan stockar');

-- ── 7. Rader flyttas mellan objekt; stem_key blir null ──
update detalj_stock set objekt_id = 'B' where objekt_id = 'A' and stem_key in ('s3','s4');
select pg_temp.ar('flytt räknar båda objekten', (select ut from pg_temp.kor()), 2);
select pg_temp.lika_som_full('7a flytt');
update detalj_stock set stem_key = null where objekt_id = 'A' and stem_key = 's5';
select pg_temp.ar('stem_key null räknar A', (select ut from pg_temp.kor()), 1);
select pg_temp.lika_som_full('7b stem_key null');
update detalj_stam set objekt_id = 'B' where objekt_id = 'A' and stam_key in ('s6','s7');
select pg_temp.ar('stam flyttas räknar två', (select ut from pg_temp.kor()), 2);
select pg_temp.lika_som_full('7c stam flyttad');

-- ── 8. dim_objekt.huvudtyp (stämplingsmodellen) ──
update dim_objekt set huvudtyp = 'Slutavverkning' where objekt_id = 'B';
select pg_temp.ar('huvudtyp-byte räknar B i stämplingsmodellen', (select st from pg_temp.kor()), 1);
select pg_temp.ar('B är nu slutavverkning', (select count(*)::int from stamplings_objekt where objekt_id = 'B' and slutavverkning), 1);
select pg_temp.lika_som_full('8 huvudtyp');
insert into dim_objekt values ('Z', 'Slutavverkning');
insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, sortiment_id, volym_m3sub, langd_cm, tidpunkt, tradslag_id)
  values ('MZ','Z','a','1','1',1,300,'2026-10-02','1');
insert into detalj_stam (maskin_id, stam_key, filnamn, objekt_id, dbh_mm, tradslag_id) values ('MZ','a','f.hpr','Z',200,'1');
select pg_temp.kor();
select pg_temp.lika_som_full('8b nytt objekt');

-- ── 9. Delkörning (p_max 1 med tre smutsiga): versionen noteras först när allt är räknat ──
update detalj_stock set volym_m3sub = volym_m3sub where false;
insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, sortiment_id, volym_m3sub, langd_cm, tidpunkt, tradslag_id)
  values ('MA','A','n1','1','1',1,300,'2026-10-04','1'), ('MB','B','n1','1','1',1,300,'2026-10-04','1'), ('MZ','Z','n1','1','1',1,300,'2026-10-04','1');
do $$ declare r jsonb; v_fore bigint; begin
  select v into v_fore from berakna_version where namn = 'utfall_objekt';
  r := berakna_utfall_objekt(false, 1, now());
  if (r->>'kvar')::int <> 2 then raise exception 'förväntade 2 kvar, fick %', r; end if;
  if (select v from berakna_version where namn = 'utfall_objekt') is distinct from v_fore then raise exception 'versionen får inte flyttas medan något är kvar'; end if;
  r := berakna_utfall_objekt(false, 1, now());
  r := berakna_utfall_objekt(false, 1, now());
  if (r->>'kvar')::int <> 0 then raise exception 'förväntade 0 kvar, fick %', r; end if;
  if (select v from berakna_version where namn = 'utfall_objekt') = v_fore then raise exception 'versionen ska flyttas när allt är räknat'; end if;
end $$;
select pg_temp.kor();
select pg_temp.lika_som_full('9 delkörning');

-- ── 10. TRUNCATE tvingar full väg ──
truncate detalj_stock;
select pg_temp.ar('truncate rensar versionerna', (select count(*)::int from berakna_version), 0);
select pg_temp.kor();
select pg_temp.ar('utfall tomt efter truncate', (select count(*)::int from utfall_objekt), 0);

-- ── 11. Rättigheter: en inloggad användare kan skriva detalj_stock utan att trigger-tabellerna är åtkomliga ──
grant insert, select on detalj_stock to authenticated;
grant usage on sequence detalj_stock_id_seq to authenticated;
set role authenticated;
insert into detalj_stock (maskin_id, objekt_id, stem_key, log_key, volym_m3sub) values ('MX','A','rattigheter','1',1);
do $$ begin
  begin perform 1 from detalj_version; raise exception 'authenticated ska inte kunna läsa detalj_version';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.ar('en markerad rad efter authenticated-insert', (select count(*)::int from detalj_smutsig where objekt_id = 'A' and v = (select v from detalj_version)), 1);
set role service_role;
select 'service_role läser versionen: ' || v from detalj_version;
reset role;

-- ── 12. diameter_filer: bara de som finns ──
insert into detalj_stam_diameter values ('M1','A','k1','a.hpr'),('M1','A','k2','a.hpr'),('M2','B','k1','b.hpr');
select pg_temp.ar('diameter_filer svarar för de som finns',
  (select count(*)::int from diameter_filer(array['a.hpr','b.hpr','saknas.hpr'])), 2);
select pg_temp.ar('diameter_filer tom lista', (select count(*)::int from diameter_filer(array[]::text[])), 0);
select pg_temp.ar('diameter-insert noterar objektet', (select count(*)::int from detalj_smutsig where objekt_id in ('A','B') and v = (select v from detalj_version)), 2);

select 'ALLA KONTROLLER GRÖNA: ' || n || ' st' from ok_rakning;
