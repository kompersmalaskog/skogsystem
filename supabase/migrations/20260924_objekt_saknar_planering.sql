-- Steg B: objekt som auto-skapas från maskinfilen (importen) markeras saknar_planering=true.
-- Flaggan nollas (false) när objektet sparats med trakt-uppgifter i /redigering.
-- Default false → alla befintliga och manuellt skapade objekt är oförändrade.
ALTER TABLE objekt ADD COLUMN IF NOT EXISTS saknar_planering boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN objekt.saknar_planering IS
  'Steg B: objekt auto-skapat från maskinfil utan planering. Sätts false när objektet sparats med trakt-uppgifter i /redigering.';
