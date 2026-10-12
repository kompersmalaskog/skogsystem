-- ─────────────────────────────────────────────────────────────
-- Utjämningsperiod: DATUM FÖR ÖVERENSKOMMELSEN
--
-- Skogsavtalet §5 mom 2 förutsätter att utjämning över mer än en vecka är överenskommen (lokalt, och över 16 veckor
-- kräver det uttryckligen lokal överenskommelse). Raden i utjamningsperiod var bara "vad som gjordes", inte ett bevis på att det
-- var avtalat. Fältet visar när överenskommelsen gjordes; tomt = "Ej dokumenterad överenskommelse" (visas grått i listan).
--
-- En period = flera rader (en per förare, eller en med medarbetare_id NULL för Alla) med samma namn, start och slut. Appen skriver
-- SAMMA datum på alla rader i en grupp; databasen kräver det inte (ingen trigger, inget unikt index), så en rad som ändrats
-- utanför appen kan avvika. Admin → Avtal visar det första datumet i gruppen och skriver över alla rader vid nästa sparande.
--
-- Nullbar och utan backfill: ingen av de befintliga raderna (Gävle) har en dokumenterad överenskommelse, och appen ska inte
-- påstå det. Ingen RLS-ändring (policyerna gäller hela raden). Årsövertiden (app/api/lon/arsovertid) väljer sina egna kolumner
-- och rörs inte. Kör i prod av Martin eller Claude.
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE utjamningsperiod ADD COLUMN IF NOT EXISTS overenskommen_datum date;

COMMENT ON COLUMN utjamningsperiod.overenskommen_datum IS 'Datum då utjämningen överenskoms (lokal överenskommelse, Skogsavtalet §5 mom 2). NULL = ej dokumenterad. Samma värde på alla rader i en grupp (samma namn, start och slut); appen skriver det så.';

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
