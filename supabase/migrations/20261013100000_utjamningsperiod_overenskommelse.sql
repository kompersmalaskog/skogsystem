-- ─────────────────────────────────────────────────────────────
-- Utjämningsperiod: DATUM FÖR ÖVERENSKOMMELSEN
--
-- Skogsavtalet 2025–2027 §5 mom 2: ordinarie arbetstid är ett genomsnitt över en sammanhängande beräkningsperiod på HÖGST 16 VECKOR.
-- Perioder på högst 16 veckor kräver ingen överenskommelse. Över 16 veckor krävs en överenskommelse mellan arbetsgivaren och den
-- LOKALA FACKLIGA ORGANISATIONEN (inte med arbetstagaren). Fältet håller datumet för den överenskommelsen; tomt betyder inget
-- annat än att inget datum finns. Appen visar fältet och en orange varning i listan bara för perioder över 16 veckor, och visar
-- inget alls om överenskommelse för kortare perioder (utom ett datum som ändå finns).
--
-- En period = flera rader (en per förare, eller en med medarbetare_id NULL för Alla) med samma namn, start och slut. Appen skriver
-- SAMMA datum på alla rader i en grupp; databasen kräver det inte (ingen trigger, inget unikt index), så en rad som ändrats
-- utanför appen kan avvika. Admin → Avtal visar det första datumet i gruppen och skriver över alla rader vid nästa sparande.
--
-- Nullbar och utan backfill: ingen av de befintliga raderna (Gävle, 11 veckor) har ett datum, och en period på högst 16 veckor
-- behöver inget. Ingen RLS-ändring (policyerna gäller hela raden). Årsövertiden (app/api/lon/arsovertid) väljer sina egna kolumner
-- och rörs inte. Kör i prod av Martin eller Claude.
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE utjamningsperiod ADD COLUMN IF NOT EXISTS overenskommen_datum date;

COMMENT ON COLUMN utjamningsperiod.overenskommen_datum IS 'Datum för överenskommelsen med lokal facklig organisation (Skogsavtalet §5 mom 2: krävs bara för beräkningsperioder över 16 veckor; högst 16 veckor kräver ingen). NULL = inget datum. Samma värde på alla rader i en grupp (samma namn, start och slut); appen skriver det så.';

COMMIT;

-- Läs in schemat i PostgREST direkt (annars kan "Could not find the 'overenskommen_datum' column" visas en stund):
NOTIFY pgrst, 'reload schema';

-- EFTER:
--   select namn, startdatum, slutdatum, medarbetare_id, overenskommen_datum from utjamningsperiod order by startdatum, medarbetare_id;
--     → kolumnen finns; alla rader har overenskommen_datum = NULL.
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'utjamningsperiod' and column_name = 'overenskommen_datum';
--     → overenskommen_datum | date | YES
--
-- ÅNGRA (om det behövs):
--   alter table utjamningsperiod drop column if exists overenskommen_datum;
