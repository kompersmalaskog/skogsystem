-- Provar skotar_skordat mot Steglehyltes form (P-VO, skördat under maskinobjektet) och en Vida-trakt.
insert into dim_sortiment values (1, 'Massa: BmavFall_V3'), (2, 'Hemved'), (3, 'Timmer: Vislanda');
-- Steglehylte: objekt P-1026, dim_objekt_id R64428_54, extra nummer k54 på R64428.
insert into objekt values ('6f5322f2-233e-463d-8c3b-d1451cfdcd27', 'P-1026', 'R64428_54');
insert into objekt_alt_nummer values ('6f5322f2-233e-463d-8c3b-d1451cfdcd27', 'k54', 'R64428');
insert into fakt_sortiment values ('R64428_54', 1, 100), ('R64428_54', 2, 13.7);
-- Ett annat P-jobb med bara extra nummer (ingen dim_objekt_id) — k-nummer → <maskin>_<nr>.
insert into objekt values ('00000000-0000-0000-0000-000000000002', 'P-1099', null);
insert into objekt_alt_nummer values ('00000000-0000-0000-0000-000000000002', 'k7', 'PONS1');
insert into fakt_sortiment values ('PONS1_7', 3, 50);
-- Vida-trakt: VO = kontraktsnummer, ett kontraktsnummer som extra nummer utan maskin.
insert into objekt values ('00000000-0000-0000-0000-000000000003', '11111111', null);
insert into objekt_alt_nummer values ('00000000-0000-0000-0000-000000000003', '22222222', null);
insert into fakt_sortiment values ('11111111', 3, 30), ('22222222', 3, 20), ('33333333', 3, 999);

do $$
declare r record; n int; m numeric;
begin
  select count(*), sum(m3) into n, m from skotar_skordat('6f5322f2-233e-463d-8c3b-d1451cfdcd27');
  if n <> 2 or m <> 113.7 then raise exception 'Steglehylte: väntade 2 rader / 113.7, fick % / %', n, m; end if;
  select m3 into m from skotar_skordat('6f5322f2-233e-463d-8c3b-d1451cfdcd27') where nyckel = 'ved_markagare';
  if m <> 13.7 then raise exception 'hemved → ved_markagare: %', m; end if;
  select sum(m3) into m from skotar_skordat('00000000-0000-0000-0000-000000000002');
  if m <> 50 then raise exception 'k7 på PONS1 ska bli PONS1_7: %', m; end if;
  select sum(m3) into m from skotar_skordat('00000000-0000-0000-0000-000000000003');
  if m <> 50 then raise exception 'Vida-trakt ska ge 30+20 = 50 (aldrig 33333333): %', m; end if;
  raise notice 'OK skotar_skordat';
end $$;
