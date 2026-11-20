-- fakturaunderlag_flytt.faktura_objekt_id — flytten ska gå att peka om.
-- Martin kör i Supabase SQL editor. Idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PROBLEMET SYNS INTE I DATAN, OCH DET ÄR HELA POÄNGEN.
--
-- Flytten den 25 september är registrerad på ackordsobjektet "Brokamåla
-- 1:5 V" (VO 11226833, Vida Skog). Maskinen flyttades dit för att köra GROT
-- — men GROT-objektet fanns inte upplagt när flytten registrerades, så
-- föraren tog det objekt som fanns.
--
-- Raden hamnar därmed på FEL KUND: ackordet faktureras Vida Skog (kundnr 1),
-- GROT skulle gå till Vida Energi (kundnr 12). 1 350 kr per timme på fel
-- faktura.
--
-- Och ingenting i datan avslöjar det. Flytten har ett giltigt objekt, ett
-- giltigt vo-nummer och rätt datum. Den ser korrekt ut, för registreringen
-- VAR korrekt när den gjordes.
--
-- DÄRFÖR EN OMPEKNING I GRANSKNINGEN, INTE EN RÄTTELSE I HISTORIKEN.
-- Flyttloggen ska inte skrivas om i efterhand — den beskriver vad som hände.
-- Underlaget ska däremot kunna säga "den här flytten hör till en annan
-- trakt", och det valet ska överleva att raderna byggs om.
--
-- Samma princip som terrang_kr_manuell och acord_andel_skordare_manuell:
-- systemet föreslår, användaren godkänner. Förslaget är objektet som valdes
-- vid flytten; godkännandet är att det går att ändra vid granskningen.
--
-- DET KOMMER HÄNDA IGEN. Varje gång en maskin flyttas till en trakt som inte
-- är upplagd finns inget rätt objekt att välja, och föraren tar det närmaste.
-- ─────────────────────────────────────────────────────────────────────────

alter table fakturaunderlag_flytt
  add column if not exists faktura_objekt_id text;

comment on column fakturaunderlag_flytt.faktura_objekt_id is
  'Objektet som BÄR flytten på fakturan, när det inte är till_objekt_id. '
  'uuid som text mot objekt.id, samma form som fran_objekt_id och '
  'till_objekt_id. NULL = använd till_objekt_id, alltså trakten maskinen kom '
  'till. Sätts vid granskningen när flytten registrerats på fel objekt — '
  'typiskt när måltrakten inte var upplagd än. Flyttloggen skrivs ALDRIG om: '
  'registreringen var riktig när den gjordes, det är faktureringen som ska '
  'peka rätt.';

create index if not exists ix_fakturaunderlag_flytt_faktura_objekt
  on fakturaunderlag_flytt (faktura_objekt_id) where faktura_objekt_id is not null;

-- Ingen FK mot objekt. Samma skäl som för de två befintliga kolumnerna: de är
-- text utan FK, och en ny spärr här hade bara gjort de tre inkonsekventa. Ett
-- ogiltigt uuid ger noll träffar och flytten hamnar då på INGEN trakt — det
-- ska ytas i granskningen, inte avvisas vid skrivning.

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: kolumnen finns, nullable, ingen rad omdirigerad än.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'fakturaunderlag_flytt' and column_name = 'faktura_objekt_id';

select count(*) filter (where faktura_objekt_id is not null) as omdirigerade,
       count(*) filter (where status = 'aktiv') as aktiva
from fakturaunderlag_flytt;
