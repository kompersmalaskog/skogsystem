-- KÖRS AV MARTIN mot prod FÖRE koden deployas. Skriv inte om.
--
-- km_kalla skiljer förarens MEDVETNA km-värde (inkl. medveten 0 — boende på plats
-- med traktamente, där noll km är RÄTT svar) från automatiskt beräknad/oberäknad km.
-- Utan den kan vakten "km = 0" inte skilja en avsiktlig 0 från en dag som bara
-- aldrig beräknats, och nattjobbet/write-backen skulle skriva över förarens 0.
--
--   'forare' = föraren satte km själv (idag-/redigera-km-arket) → helpern rör den ALDRIG.
--   'auto'   = beraknaOchPersisteraDagKm() skrev den → får räknas om fritt.
--   null     = aldrig beräknad (historik/nya MOM-synk-rader) → FYLLBAR.
--
-- Nullable, ingen default: en ny arbetsdag-rad (MOM-synk eller manuell) är null tills
-- någon — förare eller helper — sätter källan.
--
-- BESLUT om null: helpern behandlar null som "aldrig beräknad" och FÅR fylla den.
-- Att lämna null hade gett 900 historiska rader ett skydd de inte förtjänar och
-- lämnat de bekräftade-men-oberäknade dagarna (t.ex. Stefan 2026-08-18, noll km på
-- objekt med koordinat) tomma för alltid. Boende-på-plats-dagar skyddas ändå:
-- långa sådana (Dalarna, > 25 mil enkel väg) fångas av 250-km-vakten, och en förare
-- kan när som helst sätta en oförstörbar 0 via km-arket (km_kalla='forare').

ALTER TABLE arbetsdag ADD COLUMN IF NOT EXISTS km_kalla text
  CHECK (km_kalla IS NULL OR km_kalla IN ('forare', 'auto'));

COMMENT ON COLUMN arbetsdag.km_kalla IS
  'Källa för km_morgon/km_kvall: forare=manuellt satt (rör aldrig), auto=beräknat av '
  'helpern (får räknas om), null=aldrig beräknad (fyllbar). Skiljer avsiktlig 0 från '
  'oberäknad 0 — se lib/routing beraknaOchPersisteraDagKm().';
