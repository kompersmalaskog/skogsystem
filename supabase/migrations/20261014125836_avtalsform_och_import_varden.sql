-- 2026-10-15  Avtalsform som eget fält + importens minne av vad den satte.
--
-- Bakgrund: `atgard` blandade två frågor — HUR trakten är avtalad (Au, Rp, LRK, VF/Bark) och VAD som görs (Gallring, Första gallring,
-- Föryngring, Special …). Importen hårdkodade dessutom Au för alla slutavverkningar; Skälviken (rotpost) stod som Au. Nu läser importen
-- avtalsformen ur TD:ns "Ursprung" och åtgärden ur "Arbetsform" (lib/trakt/avtalsform.ts), och omimport skriver bara över det importen
-- själv satte (lib/trakt/befintligt.ts byggOmimportPatch).
--
-- Additiv: tre nya kolumner. Koden tål att migrationen inte är körd (importen sparar objektet utan dem och loggar KOLUMN_SAKNAS i import_fel;
-- läsarna faller tillbaka på `atgard`), men avtalsformen och skyddet mot överskrivna rättningar fungerar först efter den här.
-- Kör den FÖRE production förs fram.

-- objekt: avtalsform (Au | Rp | LRK | VF/Bark) och import_varden ({fält: värdet importen senast satte}).
ALTER TABLE objekt
  ADD COLUMN IF NOT EXISTS avtalsform    text,
  ADD COLUMN IF NOT EXISTS import_varden jsonb;

-- dim_objekt: avtalsform (redigeras i /redigering, bara för slutavverkning).
ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS avtalsform text;

COMMENT ON COLUMN objekt.avtalsform IS
  'Hur trakten är avtalad: Au (avverkningsuppdrag), Rp (rotpost), LRK, VF/Bark. Läses ur TD:ns "Ursprung" vid import; tom om filen saknar/har okänt värde. Åtgärd (Gallring, Första gallring, Föryngring …) ligger i atgard.';
COMMENT ON COLUMN objekt.import_varden IS
  'Vad trakt-importen senast satte per fält ({"atgard":"Gallring","volym":950,…}). Omimport skriver bara över ett fält som är tomt eller fortfarande har exakt detta värde — annars har någon rättat det för hand och det lämnas orört. Satt av /api/import-trakt, aldrig för hand.';
COMMENT ON COLUMN dim_objekt.avtalsform IS
  'Avtalsform (Au | Rp | LRK | VF/Bark) — Martins egen, redigeras i /redigering. Åtgärd ligger i atgard.';

-- Flytta Martins egna avtalsformer ur dim_objekt.atgard. Triggern fyll_dim_fran_trakt fyller ALDRIG atgard, så varje Au/Rp/LRK/VF/Bark där
-- är handsatt. objekt.atgard rörs INTE: ett 'Au' där går inte att skilja från den gamla hårdkodningen och flyttas därför inte.
-- Idempotent: bara rader där avtalsform ännu är tom, och atgard töms först när värdet är flyttat (samma sats).
UPDATE dim_objekt
SET avtalsform = CASE lower(btrim(atgard))
                   WHEN 'au'      THEN 'Au'
                   WHEN 'rp'      THEN 'Rp'
                   WHEN 'lrk'     THEN 'LRK'
                   WHEN 'vf/bark' THEN 'VF/Bark'
                 END,
    atgard = NULL
WHERE avtalsform IS NULL
  AND lower(btrim(atgard)) IN ('au', 'rp', 'lrk', 'vf/bark');

DO $$
DECLARE v_flyttade int;
BEGIN
  SELECT count(*) INTO v_flyttade FROM dim_objekt WHERE avtalsform IS NOT NULL;
  RAISE NOTICE 'dim_objekt.avtalsform satt på % rader (flyttade från atgard)', v_flyttade;
END $$;

-- Kontroll efter körning (ska ge 0 rader):
--   SELECT objekt_id, atgard FROM dim_objekt WHERE lower(btrim(atgard)) IN ('au','rp','lrk','vf/bark');
-- Ångra (om nödvändigt): UPDATE dim_objekt SET atgard = avtalsform, avtalsform = NULL WHERE atgard IS NULL AND avtalsform IS NOT NULL;
