-- maskin_kostnadsstalle: giltighetsdatum, så registret kan svara på FRÅGAN
-- "vilket kostnadsställe gällde den HÄR dagen".
-- Martin kör i Supabase SQL editor. Idempotent. Avbryter sig själv vid överlapp.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PROBLEMET: kostnadsstället har bytt, och registret kan bara svara "nu".
--
-- Ur fortnox_invoice_rows.costcenter, alltså vad som faktiskt bokfördes:
--
--   Scorpion ("Skördning Gigant")   M13  2026-01-09 → 2026-02-17   36 rader
--                                   SCO  2026-03-09 →              35 rader
--   Rottne   ("Skördning H8E")      M12  hela perioden, MEN av TVÅ maskiner
--   Flytt                           M8   2026-01-09 → 2026-04-17
--                                   TRA  2026-08-07 →
--
-- Bygger fakturaunderlaget ett underlag BAKÅT i tiden sätter det SCO på en
-- rad som bokfördes på M13, och fakturan stämmer inte med bokföringen för den
-- perioden. Samma felklass som taxornas giltig_fran (#570): ett register utan
-- tidsaxel svarar självsäkert fel om det förflutna.
--
-- INGEN #570-FÄLLA HÄR. Där fanns elva rader vars giltig_till låg före deras
-- eget giltig_fran, och en blind backdatering hade väckt dem till liv.
-- Kolumnerna införs först nu, så det finns inga aldrig-giltiga rader att
-- råka återuppliva — men kontrollen i steg 4 letar efter dem ändå, eftersom
-- det är billigare att pröva än att anta.
--
-- RADERAR INGENTING. Rader AVSLUTAS med giltig_till. Historiken ska överleva.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Kolumnerna ───────────────────────────────────────────────────────
alter table maskin_kostnadsstalle
  add column if not exists giltig_fran date,
  add column if not exists giltig_till date;

comment on column maskin_kostnadsstalle.giltig_fran is
  'Första dagen kostnadsstället gällde för maskinen. Sätts till maskinens '
  'första dag i faktadatan, eller till första fakturan som bokförde koden '
  'när faktadata saknas (JD810E). Aldrig ett globalt golv: en maskin ska '
  'inte ha ett kostnadsställe från innan den fanns — samma skäl som gjorde '
  'att A130743 inte backdaterades i #570.';

comment on column maskin_kostnadsstalle.giltig_till is
  'Sista dagen koden gällde. NULL = gäller fortfarande. Rader avslutas, '
  'raderas aldrig — ett underlag som byggs om för en gammal period ska få '
  'samma kostnadsställe som bokföringen har.';

-- ── 2. Unik-nyckeln måste rymma flera generationer ──────────────────────
-- UNIQUE (maskin_id, kostnadsstalle_kod) gör det omöjligt för en maskin att
-- återvända till en tidigare kod. Ingen har gjort det än, men nyckeln ska
-- inte vara det som hindrar det — och Scorpionen har redan två rader.
do $$ begin
  alter table maskin_kostnadsstalle drop constraint if exists maskin_kostnadsstalle_unik;
exception when undefined_object then null; end $$;

create unique index if not exists maskin_kostnadsstalle_unik
  on maskin_kostnadsstalle (maskin_id, kostnadsstalle_kod, giltig_fran);

-- ── 3. Sätt giltighet på de sju befintliga raderna ──────────────────────
-- giltig_fran = maskinens första dag i fakt_tid/fakt_produktion/fakt_lass.
-- Verifierat mot prod 2026-09-26. Skrivs som literaler och inte som en
-- subfråga, så att raden går att granska mot sitt eget underlag.
--
--   R64101              2023-02-24   (källornas absoluta ytterkant)
--   A030353             2024-06-05
--   PONS20SDJAA270231   2025-07-31
--   A110148             2025-12-03
--   R64428              2026-03-12
--   A130743             2026-08-13
--   JD810E              2026-01-09   se nedan
--
-- JD810E är undantaget: maskinen har INGEN fakt_tid och syns först
-- 2026-09-08 i fakt_lass (de manuellt inmatade lassen). Men M6 bokfördes
-- redan 2026-01-09. Faktadatumet hade lämnat januari–augusti utan
-- kostnadsställe för en maskin som fakturerades hela tiden, så här väger
-- fakturan tyngre än faktatabellen.

update maskin_kostnadsstalle set giltig_fran = date '2023-02-24' where maskin_id = 'R64101'            and giltig_fran is null;
update maskin_kostnadsstalle set giltig_fran = date '2024-06-05' where maskin_id = 'A030353'           and giltig_fran is null;
update maskin_kostnadsstalle set giltig_fran = date '2025-07-31' where maskin_id = 'PONS20SDJAA270231' and giltig_fran is null;
update maskin_kostnadsstalle set giltig_fran = date '2025-12-03' where maskin_id = 'A110148'           and giltig_fran is null;
update maskin_kostnadsstalle set giltig_fran = date '2026-03-12' where maskin_id = 'R64428'            and giltig_fran is null;
update maskin_kostnadsstalle set giltig_fran = date '2026-08-13' where maskin_id = 'A130743'           and giltig_fran is null;
update maskin_kostnadsstalle set giltig_fran = date '2026-01-09' where maskin_id = 'JD810E'            and giltig_fran is null;

-- Alla maskiner som skulle kunna tillkomma senare: hellre ett golv än NULL,
-- annars blir kolumnen nullable i praktiken och uppslaget måste gissa.
update maskin_kostnadsstalle set giltig_fran = date '2023-02-24' where giltig_fran is null;

alter table maskin_kostnadsstalle alter column giltig_fran set not null;
alter table maskin_kostnadsstalle alter column giltig_fran set default current_date;

-- ── 4a. DE TVÅ ROTTNE SOM DELAR M12 ─────────────────────────────────────
-- R64101 och R64428 har samma kostnadsställe. Utan datum är de omöjliga att
-- skilja åt; med datum är övergången exakt och verifierad i fakt_tid:
--   R64101  sista dagen   2026-03-11   (164 dagar, från 2023-02-24)
--   R64428  första dagen  2026-03-12   (145 dagar)
-- Inte en enda dags överlapp. Maskinbytet syns i datan utan att någon
-- behövde skriva ner det.
update maskin_kostnadsstalle
   set giltig_till = date '2026-03-11'
 where maskin_id = 'R64101' and kostnadsstalle_kod = 'M12' and giltig_till is null;

-- ── 4b. SCORPIONENS TIDIGARE KOSTNADSSTÄLLE M13 ─────────────────────────
-- NY RAD, byggd på bokförd data: 36 fakturarader på 33 fakturor bär M13 med
-- beskrivningar som alla är Scorpionens ("Skördning Gigant", "Skördning
-- Gigant VF", "Slutredovisning"), 2026-01-09 → 2026-02-17. Från 2026-03-09
-- bär samma beskrivningar SCO. Ingen annan maskin har någonsin bokförts på
-- M13.
--
-- Gränsen sätts vid 2026-03-08/09, alltså dagen före den första SCO-fakturan.
-- Den exakta bytesdagen är inte dokumenterad någonstans — mellan 2026-02-17
-- och 2026-03-09 finns ingen faktura alls. Att lägga gränsen vid den första
-- kända SCO-dagen är det val som aldrig ger FEL kostnadsställe på en rad som
-- faktiskt bokfördes: allt som bokfördes på M13 ligger före, allt på SCO
-- efter.
insert into maskin_kostnadsstalle (maskin_id, kostnadsstalle_kod, giltig_fran, giltig_till)
select 'PONS20SDJAA270231', 'M13', date '2025-07-31', date '2026-03-08'
where not exists (
  select 1 from maskin_kostnadsstalle
   where maskin_id = 'PONS20SDJAA270231' and kostnadsstalle_kod = 'M13');

update maskin_kostnadsstalle
   set giltig_fran = date '2026-03-09'
 where maskin_id = 'PONS20SDJAA270231' and kostnadsstalle_kod = 'SCO'
   and giltig_fran < date '2026-03-09';

-- M11 LÄGGS INTE TILL. Koden finns på EN enda fakturarad (2026-04-17,
-- "Skotning King "), och A110148 bär M10 på 43 rader både före och efter.
-- En kod som förekommer en gång mitt i en obruten serie är ett
-- inmatningsfel, inte en generation. Att bygga en giltighetsperiod av den
-- hade gett fel kostnadsställe på allt som kördes den dagen.
--
-- M8 och TRA LÄGGS INTE TILL HELLER. De bär flytt- och traillerrader och är
-- inte MASKINER — de hör inte hemma i det här registret. Radbyggaren lämnar
-- flyttradens kostnadsställe tomt tills det finns en källa, och
-- granskningen ska YTA att det saknas i stället för att gissa TRA.

-- ── 5. R64101:s öppna timprisrad ────────────────────────────────────────
-- Maskinen såldes och har ingen data efter 2026-03-11, men saveAllBracket
-- öppnade en ny prisrad för VARJE maskin 2026-08-10 — också för den sålda.
--
-- Den avslutas samma dag den öppnades. Två alternativ förkastades:
--   * radera  — historiken ska överleva, och raden ÄR en händelse: någon
--     sparade prislistan den dagen.
--   * backdatera giltig_till till försäljningen (2026-03-11) — då hamnar
--     giltig_till FÖRE giltig_fran och raden blir precis en sådan
--     aldrig-giltig zombie som #570 fick städa bort. Att laga ett fel med
--     samma fel vore magstarkt.
-- Ett endagsfönster 2026-08-10 kan aldrig träffas av ett uppslag för en dag
-- maskinen arbetade — all dess data ligger före 2026-03-11.
update maskin_timpris
   set giltig_till = giltig_fran
 where maskin_id = 'R64101' and giltig_fran = date '2026-08-10' and giltig_till is null;

-- De FEM zombieraderna (giltig_fran 2026-08-10, giltig_till 2026-08-09) på
-- A030353, A110148, JD810E, PONS20SDJAA270231 och R64428 rörs INTE här.
-- De tas bort tillsammans med rättningen av saveAllBracket, så att orsak och
-- städning hänger ihop — samma beslut som i #570.

-- ── 6. KONTROLL: avbryt om något fönster överlappar eller är omöjligt ────
do $$
declare n int;
begin
  select count(*) into n
    from maskin_kostnadsstalle a
    join maskin_kostnadsstalle b
      on a.ctid < b.ctid
     and a.maskin_id = b.maskin_id
     and a.giltig_fran <= coalesce(b.giltig_till, 'infinity'::date)
     and b.giltig_fran <= coalesce(a.giltig_till, 'infinity'::date);
  if n > 0 then
    raise exception 'AVBRYTER: % maskiner har två kostnadsställen giltiga samtidigt', n;
  end if;

  select count(*) into n from maskin_kostnadsstalle
   where giltig_till is not null and giltig_till < giltig_fran;
  if n > 0 then
    raise exception 'AVBRYTER: % aldrig-giltiga rader i maskin_kostnadsstalle', n;
  end if;

  -- Varje maskin med faktadata ska ha ETT kostnadsställe på sin första och
  -- sista arbetsdag. Ett hål betyder att en fakturarad skulle bli utan.
  select count(*) into n
    from (select maskin_id, min(datum) f, max(datum) t from fakt_tid group by 1) d
   where not exists (
     select 1 from maskin_kostnadsstalle k
      where k.maskin_id = d.maskin_id
        and k.giltig_fran <= d.f and coalesce(k.giltig_till, 'infinity'::date) >= d.f)
      or not exists (
     select 1 from maskin_kostnadsstalle k
      where k.maskin_id = d.maskin_id
        and k.giltig_fran <= d.t and coalesce(k.giltig_till, 'infinity'::date) >= d.t);
  if n > 0 then
    raise exception 'AVBRYTER: % maskiner saknar kostnadsställe på sin första eller sista arbetsdag', n;
  end if;
end $$;

-- ── 7. Kvitto ───────────────────────────────────────────────────────────
-- Förväntat: åtta rader (sju befintliga + M13), R64101 avslutad 2026-03-11,
-- Scorpionen M13 → 2026-03-08 och SCO från 2026-03-09, resten öppna.
select maskin_id, kostnadsstalle_kod, giltig_fran::text, coalesce(giltig_till::text, 'öppen') as giltig_till
from maskin_kostnadsstalle
order by maskin_id, giltig_fran;

-- Och R64101:s timprisrad ska vara stängd.
select maskin_id, timpris, giltig_fran::text, coalesce(giltig_till::text, 'ÖPPEN') as giltig_till
from maskin_timpris where maskin_id = 'R64101' order by giltig_fran;
