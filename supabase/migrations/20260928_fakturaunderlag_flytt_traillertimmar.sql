-- fakturaunderlag_flytt.traillertimmar — timmarna Martin skriver in.
-- Martin kör i Supabase SQL editor. Idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────
-- VARFÖR ETT FÄLT OCH INTE EN HÄRLEDNING
--
-- Artikel 3 "Traillerflytt" betalas per timme à 1 350. Radbyggaren tog först
-- timmarna ur maskin_flytt.tid_flytt_min — och det var fel källa.
--
-- tid_flytt_min mäter MASKINENS förflyttning: 33–98 minuter på de sexton
-- genomförda flyttarna. Fakturan avser LASTBILENS rundresa, från att den
-- lämnar LBC tills den är tillbaka. Därför är ingen fakturerad rad under två
-- timmar, och spannet är 2–7 h.
--
-- Skillnaden syns i lastbil_logg: den 25 september rullade lastbilen
-- 06:17–13:46, alltså 7,5 timmar och 180 km, och flyttade TVÅ maskiner
-- (A030353 44 km och A130743 18 km). Ungefär 3,5 timmar per flytt — inte
-- 1,28 som maskinens egen tid säger.
--
-- ATT HÄRLEDA TIMMARNA GÅR INTE ÄN, och därför görs det inte:
--   * var LBC ligger är inte registrerat någonstans
--   * hur en dag med flera flyttar delas upp är inte bestämt
-- En uppdelningsregel byggd på ett enda exempel vore en gissning. Samma
-- mönster som inmätt volym: ett fält, inte en formel.
--
-- LASTBILENS DATA VISAS BREDVID FÄLTET som stöd ("lastbilen rullade 7,5 tim
-- och 180 km den 25 september, två flyttar"), så att talet Martin skriver in
-- går att kontrollera mot något. Stöd, inte källa.
-- ─────────────────────────────────────────────────────────────────────────

alter table fakturaunderlag_flytt
  add column if not exists traillertimmar numeric;

comment on column fakturaunderlag_flytt.traillertimmar is
  'Timmar för artikel 3, INSKRIVNA av Martin. Avser lastbilens rundresa från '
  'LBC och tillbaka, inte maskinens förflyttning — maskin_flytt.tid_flytt_min '
  'mäter fel sak och får inte användas här. NULL = inte ifyllt, och raden kan '
  'då inte prissättas (fel_kod pris_saknas). Lastbilens dygnssummor ur '
  'lastbil_logg visas bredvid fältet som stöd.';

-- Inget CHECK på intervallet. Historiken spänner 2–7 h, men en riktigt lång
-- flytt kan gå utanför, och en gräns byggd på arton rader hade spärrat ett
-- riktigt värde. Orimliga tal ska YTAS bredvid lastbilens verkliga tid, inte
-- avvisas av en regel som gissar. Noll och negativt är däremot alltid fel.
do $$ begin
  alter table fakturaunderlag_flytt add constraint flytt_traillertimmar_positiv
    check (traillertimmar is null or traillertimmar > 0);
exception when duplicate_object then null; end $$;

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: kolumnen finns, är numeric och nullable, ingen rad ifylld än.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'fakturaunderlag_flytt' and column_name = 'traillertimmar';

select count(*) filter (where traillertimmar is not null) as ifyllda,
       count(*) filter (where status = 'aktiv') as aktiva,
       count(*) filter (where status = 'aktiv' and fran_objekt_id is null) as utan_fran_objekt
from fakturaunderlag_flytt;
