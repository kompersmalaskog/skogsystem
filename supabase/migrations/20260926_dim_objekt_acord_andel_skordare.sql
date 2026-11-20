-- dim_objekt.acord_andel_skordare_manuell — överskrivning av fördelningen.
-- Martin kör i Supabase SQL editor. Idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────
-- VAD: hur mycket av ackordets tillägg som läggs på SKÖRDARRADEN, i kr/m³fub.
-- Resten går till skotarraden. NULL = använd appens förslag (hälften,
-- avrundat ned till femtioöring, överskottet till skotaren — fordelaOvrigt).
--
-- VARFÖR DEN BEHÖVS: fördelningen är en BEDÖMNING, inte en formel. Av 31
-- riktiga Vida-fakturor följer 11 förslaget rakt av; resten är Martins val
-- per objekt. Brokamåla är exemplet: tillägget är 2,50 kr/m³, förslaget säger
-- 1,00 till skördaren, Martin la 2,00 — och först med den överskrivningen
-- reproducerar radbyggaren faktura 2026140 exakt (58,00 / 56,50).
--
-- TOTALEN PÅVERKAS ALDRIG. Fältet flyttar bara tillägget mellan de två
-- raderna; summan är pris_total(klass) + tillägg vad man än skriver in.
-- Det är därför fältet är ofarligt att ge Martin: han kan inte råka ändra
-- vad Vida betalar, bara hur det står på de två raderna.
--
-- ─────────────────────────────────────────────────────────────────────────
-- VARFÖR PÅ OBJEKTET OCH INTE PÅ RADEN
--
-- Önskemålet var "fördelningen ska gå att skriva över på raden". Den ska
-- REDIGERAS på raden i granskningen — men den kan inte LAGRAS där, av två skäl:
--
-- 1. faktura_rad.rad_pris_agare förbjuder a_pris på en 'app'-rad. Ett
--    överskrivet à-pris går alltså inte att spara på raden utan att bryta
--    kärnregeln om att bara leverantörsrader bär belopp — och den regeln är
--    hela skyddet mot att uträknade priser börjar lagras.
--
-- 2. Överskrivningen gäller BÅDA raderna samtidigt (det som inte går till
--    skördaren går till skotaren). Lagrad på varje rad kan de glida isär och
--    summan sluta stämma. Ett värde, en plats.
--
-- Objektet är dessutom där den hör hemma sakligt: det är samma sorts
-- bedömning som terrang_kr_manuell, som redan bor här. Ett à conto och dess
-- slutredovisning ska dela fördelning — annars ändras talet mitt i ett objekt
-- utan att någon bett om det.
-- ─────────────────────────────────────────────────────────────────────────

alter table dim_objekt
  add column if not exists acord_andel_skordare_manuell numeric;

comment on column dim_objekt.acord_andel_skordare_manuell is
  'Överskrivning av hur ackordets tillägg fördelas: kr/m³fub som läggs på '
  'skördarraden, resten går till skotarraden. NULL = använd appens förslag '
  '(lib/ekonomi/prisPerM3.fordelaOvrigt). Påverkar ALDRIG totalen, bara '
  'fördelningen mellan de två raderna. Samma sorts bedömning som '
  'terrang_kr_manuell. Redigeras på raden i granskningen men lagras här: '
  'faktura_rad.rad_pris_agare förbjuder belopp på app-rader, och värdet '
  'gäller båda raderna samtidigt.';

-- Ingen CHECK på intervallet. Tillägget kan vara NEGATIVT (traktspannen
-- 1500–2500 ger −1 och 2500+ ger −2), så varken "≥ 0" eller "≤ tillägget"
-- håller som regel här — och tillägget är inte känt på objektsnivå ändå,
-- det beror på volym och sortiment. Orimliga värden ska YTAS i granskningen
-- tillsammans med förslaget de ersätter, inte spärras av en gräns som
-- gissar. Härledningen visar alltid "Fördelning ändrad (förslag X)".

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: kolumnen finns, är numeric och nullable, och ingen rad har ett
-- värde än.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'dim_objekt' and column_name = 'acord_andel_skordare_manuell';

select count(*) filter (where acord_andel_skordare_manuell is not null) as satta,
       count(*) as objekt_totalt
from dim_objekt;
