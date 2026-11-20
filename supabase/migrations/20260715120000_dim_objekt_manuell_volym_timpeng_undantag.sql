-- Sheet-ombyggnaden (punkt 3 + 5): manuell skotad volym + timpeng-undantag.
--
-- skotad_volym_manuell: skotaren registrerar inte alltid lass. Verklig skotad
-- volym anges manuellt så uppföljningen stämmer. Vyer använder denna NÄR DEN
-- FINNS, annars SUM(fakt_lass) — och märker alltid ut vilken källa som visas
-- ("manuellt angivet" vs "lass"). Falska lass skrivs ALDRIG i fakt_lass.
--
-- timpeng_undantag_*: ett ackordobjekt kan ha en del som körs på timpeng
-- (t.ex. 5,5 h specialarbete). Båda anges — exakt, ingen gissning:
--   timmar  -> faktureras timpris
--   volym   -> dras bort från ackordsvolymen (annars dubbelbetalt)
-- Ekonomimotorn (lib/ekonomi/acord.ts) räknar:
--   ackord = (total volym - undantag_volym) x pris + undantag_timmar x timpris

ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS skotad_volym_manuell numeric,
  ADD COLUMN IF NOT EXISTS timpeng_undantag_timmar numeric,
  ADD COLUMN IF NOT EXISTS timpeng_undantag_volym numeric;

COMMENT ON COLUMN dim_objekt.skotad_volym_manuell IS
  'Verklig skotad volym (m3fub) angiven manuellt när skotaren inte registrerat lass. Vyer använder denna när den finns, annars SUM(fakt_lass); källan ska alltid märkas ut i UI. Aldrig falska lass i fakt_lass.';
COMMENT ON COLUMN dim_objekt.timpeng_undantag_timmar IS
  'Timmar (decimal, t.ex. 5.5) på ackordobjekt som faktureras timpeng. Paras alltid med timpeng_undantag_volym.';
COMMENT ON COLUMN dim_objekt.timpeng_undantag_volym IS
  'Volym (m3fub) som hör till timpeng-undantaget och dras bort från ackordsvolymen — annars dubbelbetald.';

-- Enighet om timpeng-flaggan: dim_objekt.timpeng är DEN levande källan
-- (7 objekt satta; används av redigeringen, dagvyn och affärsuppföljningen).
-- objekt_ekonomi.rakna_som_timpeng är tom och pensioneras — per-objekt-vyn
-- migreras till dim_objekt.timpeng i UI-bygget. Ingen datamigrering behövs
-- (verifierat: objekt_ekonomi har 0 rader 2026-07-15).
COMMENT ON COLUMN dim_objekt.timpeng IS
  'Objektet faktureras på timpeng istället för ackord. ENDA källan för flaggan — objekt_ekonomi.rakna_som_timpeng är pensionerad.';
