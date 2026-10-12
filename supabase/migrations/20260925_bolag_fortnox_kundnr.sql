-- bolag.fortnox_kundnr — mappningen bolag → Fortnox-kund, på ETT ställe.
-- Martin kör i Supabase SQL editor. Idempotent.
--
-- VARFÖR HÄR: fakturaunderlaget grupperas på KUND + VO, inte bara VO — samma
-- trakt kan ge två fakturor (rundvirke till Vida Skog, GROT till Vida Energi).
-- Kundnumret måste alltså följa med från objektet till fakturan.
--
-- Det är INGEN prissats, så det får bo i appen. Men det ska vara DATA och inte
-- kod, av samma skäl som artikelnumren: ett annat företag har andra
-- kundnummer, och en ny kund ska kunna läggas till utan deploy. Martin väljer
-- bolag på objektet, kundnumret följer med, ingen dold mappning i koden.
--
-- NULLABLE MED FLIT. Ett bolag utan kundnummer är ett GILTIGT tillstånd:
--   Privat      per markägare, ingen gemensam kund
--   Karl Hedin  avslutade vindfällen, behövs inte framåt
--   JGA/Rönås/Södra  inga objekt idag
-- En rad vars bolag saknar kundnummer kan inte faktureras, och det ska SYNAS i
-- granskningen — samma spärr som faktura_rad.fel_kod = 'pris_saknas', aldrig
-- en default som gissar mottagare. Att skicka en faktura till fel kund är
-- värre än att inte kunna skicka den.

alter table bolag add column if not exists fortnox_kundnr integer;

comment on column bolag.fortnox_kundnr is
  'Kundnummer i Fortnox kundregister. NULL = bolaget har ingen gemensam kund '
  '(Privat faktureras per markägare) eller behövs inte framåt (Karl Hedin, '
  'avslutade vindfällen). NULL är ett giltigt tillstånd som ska ytas i '
  'granskningen, aldrig lösas med en default — fel mottagare är värre än '
  'ingen faktura.';

-- Ett kundnummer är ett positivt heltal. Noll eller negativt är alltid ett
-- inmatningsfel, inte ett tillstånd.
do $$ begin
  alter table bolag add constraint bolag_kundnr_positivt
    check (fortnox_kundnr is null or fortnox_kundnr > 0);
exception when duplicate_object then null; end $$;

-- Namnet är nyckeln som dim_objekt.bolag matchar mot (se nedan) — då måste det
-- vara unikt. Verifierat mot prod 2026-09-25: åtta rader, åtta distinkta namn.
create unique index if not exists ux_bolag_namn on bolag (namn);

-- Kundnumren, lästa direkt ur Fortnox kundregister 2026-09-24.
-- Idempotent: rör bara rader som inte redan har ett nummer.
update bolag set fortnox_kundnr = 1  where namn = 'Vida'        and fortnox_kundnr is null;
update bolag set fortnox_kundnr = 12 where namn = 'Vida Energi' and fortnox_kundnr is null;
update bolag set fortnox_kundnr = 53 where namn = 'ATA'         and fortnox_kundnr is null;

-- ── INGEN FK FRÅN dim_objekt.bolag, OCH DET ÄR ETT VAL ──────────────────
-- dim_objekt.bolag är text som matchar bolag.namn. Datan skulle klara en FK i
-- dag: verifierat mot prod 2026-09-25 matchar VARJE ifyllt värde en rad exakt
-- (Vida 81, Privat 31, Karl Hedin 14, Vida Energi 12, ATA 3), och de 12 objekt
-- som saknar bolag är alla exkluderade.
--
-- Men dim_objekt skrivs av IMPORTEN, som sätter bolag ur filens data. En FK
-- hade fått importen att FALLA på ett okänt bolagsnamn — och importen får
-- aldrig stanna för att en ny kund dykt upp. Den ska ta emot namnet och låta
-- en människa reda ut det, samma princip som människa-vinner-guarden i
-- upsert_maskin.
--
-- Avvikelser ska alltså YTAS i granskningen, inte blockera skrivningen:
-- ett objekt vars bolag saknas i den här tabellen går inte att fakturera och
-- ska synas som just det. Blir importen någon gång den enda skrivaren, och
-- bolagen stabila, kan FK:n läggas till då — nu vore den en spärr på fel
-- ställe i kedjan.

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: Vida 1, Vida Energi 12, ATA 53, övriga fem NULL.
select b.id, b.namn, b.fortnox_kundnr,
       (select count(*) from dim_objekt d where d.bolag = b.namn) as objekt,
       (select count(*) from dim_objekt d where d.bolag = b.namn and not coalesce(d.exkludera,false)) as ej_exkluderade
from bolag b order by b.id;
