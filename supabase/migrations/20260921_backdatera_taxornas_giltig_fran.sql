-- Backdatera taxornas giltig_fran till avtalets datum + städa aldrig-giltiga rader.
-- Martin kör i Supabase SQL editor EFTER att ha sett före/efter i PR-texten.
-- Idempotent. Avbryter sig själv om resultatet blir överlappande fönster.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PROBLEMET: giltig_fran är INMATNINGSDATUM, inte prisets startdatum.
--
-- Varenda taxarad i alla sex acord_*-tabellerna har giltig_fran = 2026-04-21.
-- Det är dagen ekonomivyn byggdes och raderna knappades in. Avtalet (Vida,
-- slutavverkning 45811) är daterat 2025-06-03 och priserna är oförändrade
-- sedan dess — Martin bekräftar att prislistan aldrig justerats.
--
-- Avräkningsdatumen spänner 2025-12-12 → 2026-09-17. 44 av 130 objekt (34 %)
-- avräknades alltså FÖRE det datum taxorna påstår att de började gälla.
--
-- ⚠️ RÄTTELSE 2026-09-25, EFTER ATT MIGRATIONEN KÖRTS.
-- Den här filen påstod ursprungligen att TVÅ aktiva fel rättades. Det var ETT.
--
-- DET PÅSTÅDDA FELET SOM INTE FANNS: "kvalitetssäkringen ger 0 kr i
-- objektJamforelse men 1,50 i EkonomiClient, ~22 383 kr på 24 objekt."
-- Fel. ovrigtKrPerM3 hade en FALLBACK som förbisågs vid läsningen:
--     rader.find(datumgiltig) || rader.find(nyckel)
-- Hittades ingen datumgiltig rad togs första raden med rätt nyckel ändå, och
-- acord_ovrigt har exakt EN kvalitetssakring-rad. BÅDA vyerna gav alltså 1,50
-- hela tiden. Ingen divergens fanns. (Fallbacken är sedan borttagen i steg 1b
-- — den ljög tyst och dolde det datummärkningen finns för att fånga.)
--
-- DET VERKLIGA FELET, som migrationen rättade:
--  SKOTNINGSAVSTÅNDET. skotAvstandKr datumfiltrerar PER LASS och har INGEN
--  fallback — utan giltig config returnerar den 0. Enda formelraden började
--  2026-04-21, så 605 lass från 2025-12-11 (7 899 m³) fick noll
--  avståndstillägg. Storleksordning ~142 tkr med halverade avstånd, men den
--  perioden har opålitlig lassdata (oregistrerade lass före juli) — en
--  storleksordning, inte ett belopp.
--
-- Migrationen var värd att köra ändå: avståndsfelet var reellt, och de 11
-- aldrig-giltiga raderna behövde bort oavsett. Men den fixade EN sak, inte två.
--
-- Övriga tabeller ändrar INGENTING i dag, eftersom vyerna hämtar dem utan
-- datumfilter (acord_priser helt ofiltrerat) eller som "bara nuvarande"
-- (acord_traktstorlek, acord_sortiment_tillagg med .is('giltig_till', null)).
-- Backdateringen gör dem KORREKTA inför att uppslaget blir datumstyrt (1b) —
-- utan den hade datumstyrning nollställt grundpriset på 24 objekt, ~1,5 Mkr.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 0. Städa ALDRIG-GILTIGA rader FÖRST ────────────────────────────────
-- 11 rader med giltig_till FÖRE sitt eget giltig_fran: 8 i skotningsavstånd
-- (den gamla trappan) och 3 i sortimentstillägget (den gamla stegen).
--
-- De MÅSTE bort före backdateringen. Flyttas deras giltig_fran till
-- 2025-06-03 medan giltig_till står kvar på 2026-04-20 blir de giltiga hela
-- vintern — och då ligger gammal trappa och ny formel giltiga SAMTIDIGT,
-- där vinnaren avgörs av radernas sorteringsordning. En naiv
-- "UPDATE ... SET giltig_fran = '2025-06-03'" på hela tabellen gör precis det.
-- Rättelsen hade återuppväckt minan den var till för att stänga.
--
-- Raderna uppstod i ett spar-fel: saveAllBracket stänger öppna rader med
-- giltig_till = IGÅR och lägger in nya med giltig_fran = IDAG. Sparas samma
-- tabell två gånger samma dag får den nyss inlagda raden ett fönster som
-- slutar dagen innan det börjar. Tidsstämplarna visar det: båda
-- uppsättningarna skapades 2026-04-21 11:17:40.863544 och ersattes 11:36
-- respektive 11:52 samma dag. Samma mekanism ligger bakom maskin_timpris
-- zombierader — den rättas i sparandet, separat.
--
-- Ingenting går förlorat: de har aldrig varit giltiga en enda dag, och
-- ingen datumstyrd fråga har kunnat träffa dem.

delete from acord_priser            where giltig_till is not null and giltig_till < giltig_fran;
delete from acord_traktstorlek      where giltig_till is not null and giltig_till < giltig_fran;
delete from acord_terrang           where giltig_till is not null and giltig_till < giltig_fran;
delete from acord_ovrigt            where giltig_till is not null and giltig_till < giltig_fran;
delete from acord_sortiment_tillagg where giltig_till is not null and giltig_till < giltig_fran;
delete from acord_skotningsavstand  where giltig_till is not null and giltig_till < giltig_fran;

-- ── 1. Backdatera de AKTIVA raderna till avtalets datum ────────────────
-- Bara giltig_till IS NULL. Stängda rader är historik och rörs aldrig — de
-- beskriver en generation som faktiskt slutade gälla.

update acord_priser            set giltig_fran = date '2025-06-03' where giltig_till is null and giltig_fran > date '2025-06-03';
update acord_traktstorlek      set giltig_fran = date '2025-06-03' where giltig_till is null and giltig_fran > date '2025-06-03';
update acord_terrang           set giltig_fran = date '2025-06-03' where giltig_till is null and giltig_fran > date '2025-06-03';
update acord_ovrigt            set giltig_fran = date '2025-06-03' where giltig_till is null and giltig_fran > date '2025-06-03';
update acord_sortiment_tillagg set giltig_fran = date '2025-06-03' where giltig_till is null and giltig_fran > date '2025-06-03';
update acord_skotningsavstand  set giltig_fran = date '2025-06-03' where giltig_till is null and giltig_fran > date '2025-06-03';

-- ── 2. maskin_timpris: BARA ursprungsbatchen ───────────────────────────
-- Timpriserna står i samma prislista ("Extraordinära insatser") och har samma
-- lucka, fast liten: 2 av 85 timpengobjekt avräknades före 2026-01-01
-- (tidigaste 2025-12-29).
--
-- VILLKORET ÄR giltig_fran = '2026-01-01', INTE "tidigaste per maskin".
-- A130743 (nya Elefanten) har sin enda generation från 2026-08-13 — maskinen
-- fanns inte tidigare. "Tidigaste per maskin" hade gett den ett pris från juni
-- 2025, vilket är ofarligt för prissättningen men gör maskinbyteshistoriken
-- obegriplig.
--
-- Zombieraderna i maskin_timpris (giltig_fran 2026-08-10, giltig_till
-- 2026-08-09) rörs INTE här — de tas bort tillsammans med rättningen av
-- sparandet, så att orsak och städning hänger ihop.
-- A110148:s pris (1 275 mot avtalets 1 285) rörs INTE — maskinen är ur drift
-- och rättelsen är Martins beslut, inte ett sidoeffekt av den här migrationen.

update maskin_timpris set giltig_fran = date '2025-06-03'
where giltig_fran = date '2026-01-01';

-- ── 3. KONTROLL: avbryt om något fönster överlappar ────────────────────
-- Poängen med hela ordningen ovan. Skulle städningen eller backdateringen ha
-- skapat två giltiga generationer samtidigt per nyckel kastas ett fel och HELA
-- migrationen rullas tillbaka — hellre ett stopp än en tyst prisgaffel.

do $$
declare r record; n int;
begin
  for r in
    select * from (values
      ('acord_priser',            'medelstam'),
      ('acord_traktstorlek',      'fran_m3fub'),
      ('acord_terrang',           'namn'),
      ('acord_ovrigt',            'nyckel'),
      ('acord_sortiment_tillagg', 'grundantal'),
      ('acord_skotningsavstand',  'grundavstand_m'),
      ('maskin_timpris',          'maskin_id')
    ) as t(tabell, nyckel)
  loop
    execute format(
      'select count(*) from %1$I a join %1$I b
         on a.ctid < b.ctid
        and a.%2$I is not distinct from b.%2$I
        and a.giltig_fran <= coalesce(b.giltig_till, ''infinity''::date)
        and b.giltig_fran <= coalesce(a.giltig_till, ''infinity''::date)',
      r.tabell, r.nyckel) into n;
    if n > 0 then
      raise exception 'AVBRYTER: %-% har % överlappande giltighetsfönster', r.tabell, r.nyckel, n;
    end if;
  end loop;

  -- Och: ingen rad får finnas kvar som är giltig aldrig.
  for r in
    select unnest(array['acord_priser','acord_traktstorlek','acord_terrang',
                        'acord_ovrigt','acord_sortiment_tillagg',
                        'acord_skotningsavstand','maskin_timpris']) as tabell
  loop
    execute format(
      'select count(*) from %1$I where giltig_till is not null and giltig_till < giltig_fran',
      r.tabell) into n;
    if n > 0 and r.tabell <> 'maskin_timpris' then
      raise exception 'AVBRYTER: % har kvar % aldrig-giltiga rader', r.tabell, n;
    end if;
  end loop;
end $$;

-- ── 4. Kvitto ───────────────────────────────────────────────────────────
-- Förväntat: 11 raderade (8 skotningsavstånd + 3 sortiment), 23 backdaterade i
-- acord_* (9+6+2+4+1+1) och 6 i maskin_timpris — en januarirad per maskin.
-- A130743 rörs inte (enda generationen börjar 2026-08-13, maskinen fanns inte
-- tidigare). De 5 zombieraderna i maskin_timpris står också kvar med flit.

select 'acord_priser' t, count(*) rader, min(giltig_fran)::text tidigaste from acord_priser
union all select 'acord_traktstorlek',      count(*), min(giltig_fran)::text from acord_traktstorlek
union all select 'acord_terrang',           count(*), min(giltig_fran)::text from acord_terrang
union all select 'acord_ovrigt',            count(*), min(giltig_fran)::text from acord_ovrigt
union all select 'acord_sortiment_tillagg', count(*), min(giltig_fran)::text from acord_sortiment_tillagg
union all select 'acord_skotningsavstand',  count(*), min(giltig_fran)::text from acord_skotningsavstand
union all select 'maskin_timpris',          count(*), min(giltig_fran)::text from maskin_timpris
order by 1;
