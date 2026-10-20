-- RADERA 11 TOMMA EGENKONTROLLRUNDOR (Martin 2026-10-20) — körs av Martin, aldrig av Claude.
--
-- Bakgrund: rundorna skapades av att någon öppnade objektet och innehåller bara de genererade punkterna (158 st). Inga svar, inga foton,
-- inga provytor, inga observationer, ingen kommentar (kontrollerat mot prod 2026-10-20 09:5x UTC). De 8 pågående rundor som HAR svar
-- (Rävemåla 25, Ulfsnäs 22, Krokshult 12, Jätsbygd 4, Akelius 3, Betet AU 2, Hössjömåla 2, Betet gallring 1) och de 5 klara rörs inte.
--
-- De 11 (egenkontroll.id):
--   66995a97-3fb3-4b14-b407-a778d20951c5  Aramo Marcus AU 2026           12 punkter
--   b44fe8e3-07e0-4ccc-8807-908ed3f8a95e  Bjällerhult au + ga            16
--   0ba79da8-d3c6-4458-a13f-41b3c357fa08  Brokamåla 1:5 V               11
--   8432f148-33d4-4d5a-be20-596a68713d99  Bromåla AU 2026               13
--   334a3f8d-40c6-423a-a0f9-24627069fa12  Hålabäck au 2025              13
--   70669805-d9b2-4413-a4f3-fa880f235fae  Hålabäck gallring 2026        10
--   a5148685-ca02-4989-904f-e7db2da70692  Hallaslätt AU 2026             9
--   e9ad9020-6fee-49a9-bcb8-8ecc0d35c780  Östra-Hoka 1:7 A-C -25        19
--   731a62d8-ba9c-486f-9267-a69a8363bd28  Räveboda gallring 2026        12
--   671d6cef-2bd8-4484-8a93-4ddaaf0d9f9a  Stänkelsmåla 2025             28
--   faabeece-2e8f-4813-ab4e-4d2f9c946192  Toftåsa gallring 2026         15
--
-- Hur: ETT DO-block (allt eller inget). Villkoren läses om i själva raderingsögonblicket — blir någon av rundorna besvarad medan du
-- läser det här faller blocket med ett felmeddelande och ingenting är raderat. Rundorna och punkterna kopieras först till två
-- säkerhetstabeller (RLS på, inga policyer = otillgängliga via API:et); punkterna följer rundorna via ON DELETE CASCADE.
-- Förväntat resultat: NOTICE "raderade 11 rundor och 158 punkter".
--
-- EFTER RADERINGEN: öppnas objektet i appen skapas en NY tom runda (nya id:n) med dagens ryggrad och, för gallring, nya provytor lottade
-- med dagens origo. Hålabäck gallring (70669805…) är en av de raderade — den väntande omlottningen av dess provytor blir därmed överflödig.

do $$
declare
  c_ids   constant uuid[] := array[
    '66995a97-3fb3-4b14-b407-a778d20951c5','b44fe8e3-07e0-4ccc-8807-908ed3f8a95e','0ba79da8-d3c6-4458-a13f-41b3c357fa08',
    '8432f148-33d4-4d5a-be20-596a68713d99','334a3f8d-40c6-423a-a0f9-24627069fa12','70669805-d9b2-4413-a4f3-fa880f235fae',
    'a5148685-ca02-4989-904f-e7db2da70692','e9ad9020-6fee-49a9-bcb8-8ecc0d35c780','731a62d8-ba9c-486f-9267-a69a8363bd28',
    '671d6cef-2bd8-4484-8a93-4ddaaf0d9f9a','faabeece-2e8f-4813-ab4e-4d2f9c946192']::uuid[];
  n_rundor int;
  n_punkter int;
  n_borta int;
begin
  create table egenkontroll_tomma_rundor_20261020 as
    select e.* from egenkontroll e
     where e.id = any (c_ids)
       and e.status = 'pagaende'
       and coalesce(e.kommentar, '') = ''
       and not exists (select 1 from egenkontroll_punkt p
                        where p.egenkontroll_id = e.id
                          and (p.status is not null or p.besvarad is not null or p.kalla = 'observation' or coalesce(p.kommentar, '') <> ''))
       and not exists (select 1 from egenkontroll_foto f where f.egenkontroll_id = e.id)
       and not exists (select 1 from egenkontroll_provyta y where y.egenkontroll_id = e.id);
  select count(*) into n_rundor from egenkontroll_tomma_rundor_20261020;
  if n_rundor <> 11 then
    raise exception 'Väntade 11 tomma rundor men hittade % — inget raderat (någon har troligen börjat svara)', n_rundor;
  end if;

  create table egenkontroll_tomma_punkter_20261020 as
    select p.* from egenkontroll_punkt p where p.egenkontroll_id in (select id from egenkontroll_tomma_rundor_20261020);
  select count(*) into n_punkter from egenkontroll_tomma_punkter_20261020;
  if n_punkter <> 158 then
    raise exception 'Väntade 158 punkter men hittade % — inget raderat', n_punkter;
  end if;

  alter table egenkontroll_tomma_rundor_20261020 enable row level security;
  alter table egenkontroll_tomma_punkter_20261020 enable row level security;

  delete from egenkontroll where id in (select id from egenkontroll_tomma_rundor_20261020);
  get diagnostics n_borta = row_count;
  if n_borta <> 11 then
    raise exception 'Raderade % rundor, väntade 11 — allt rullas tillbaka', n_borta;
  end if;
  if exists (select 1 from egenkontroll_punkt where egenkontroll_id in (select id from egenkontroll_tomma_rundor_20261020)) then
    raise exception 'Punkter finns kvar efter raderingen — allt rullas tillbaka';
  end if;
  raise notice 'raderade % rundor och % punkter', n_borta, n_punkter;
end $$;

-- ÅNGRA (om du ångrar dig): läser tillbaka exakt de raderna. Fungerar om objekten inte hunnit få en ny runda; har någon öppnat objektet sedan
-- raderingen finns redan en ny pågående runda och återinsättningen faller på det unika indexet egenkontroll_en_pagaende_per_objekt — öppna då bara objektet, den nya rundan är likvärdig.
--
--   begin;
--   insert into egenkontroll        select * from egenkontroll_tomma_rundor_20261020;
--   insert into egenkontroll_punkt  select * from egenkontroll_tomma_punkter_20261020;
--   commit;
--
-- STÄDA när du är säker (separat körning): 
--   drop table egenkontroll_tomma_rundor_20261020, egenkontroll_tomma_punkter_20261020;
