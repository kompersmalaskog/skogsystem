-- Uppladdade stämplingsrapporter, med resultatet: stamplings_rapport + privat lagring stamplingsrapporter.
--
-- Stämplingsvyn läser en PDF (Claude API, dokument → JSON), kontrollerar den med vanlig kod och sparar både filen
-- och allt som hände: AI:ns orörda läsning (las), användarens rättade version (rattad, NULL = oförändrad) och den
-- senaste kontrollen. Så går en rapport att öppna igen utan ny läsning (och utan nytt API-anrop att betala för), och
-- det går att se vad AI:n läste jämfört med vad som räknades på.
--
-- ÅTKOMST: allt går via API-rutterna (/api/stampling/rapport…) med service-rollen efter inloggningskontroll. Tabellen
-- har RLS påslaget och INGA policyer, och REVOKE ALL från anon och authenticated — Supabase ger annars authenticated
-- alla tabellrättigheter, även TRUNCATE. Bucketen är privat; webbläsaren laddar upp med en signerad uppladdnings-URL som
-- rutten skapar (ingen storage-policy behövs) och filen läses bara av servern.
--
-- STATUS: uppladdad (filen finns, ej läst) · lasning (pågår) · stammer (kontrollen går ihop) · avviker (åtgärd behövs) ·
-- fel (läsningen misslyckades; fel säger varför).

CREATE TABLE IF NOT EXISTS stamplings_rapport (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  skapad           timestamptz NOT NULL DEFAULT now(),
  uppdaterad       timestamptz NOT NULL DEFAULT now(),
  skapad_av        text,                                     -- inloggades e-post
  filnamn          text        NOT NULL,                     -- som användaren döpte filen; används aldrig i sökvägar
  storage_path     text        NOT NULL,                     -- <id>/<slump>.pdf i bucketen stamplingsrapporter
  status           text        NOT NULL DEFAULT 'uppladdad'
                   CHECK (status IN ('uppladdad', 'lasning', 'stammer', 'avviker', 'fel')),
  modell           text,                                     -- vilken Claude-modell som läste
  las              jsonb,                                    -- AI:ns läsning, orörd
  rattad           jsonb,                                    -- användarens rättade version; NULL = oförändrad
  kontroll         jsonb,                                    -- senaste kontrollen av den gällande versionen
  namn             text,                                     -- ur den gällande versionen, för listan
  forrattare       text,
  datum            date,
  total_volym_m3sk numeric,
  fel              text
);

COMMENT ON TABLE stamplings_rapport IS
  'Uppladdade stämplingsrapporter med AI:ns läsning, användarens rättning och kontrollen. Åtkomst bara via /api/stampling/rapport (service-rollen).';
COMMENT ON COLUMN stamplings_rapport.las IS 'AI:ns läsning exakt som den kom (rapport.ts: Lasning). Ändras aldrig efter läsningen.';
COMMENT ON COLUMN stamplings_rapport.rattad IS 'Användarens rättade version av las. Kontrollen och beräkningen använder rattad om den finns, annars las.';

CREATE INDEX IF NOT EXISTS stamplings_rapport_skapad_idx ON stamplings_rapport (skapad DESC);

ALTER TABLE stamplings_rapport ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stamplings_rapport FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('stamplingsrapporter', 'stamplingsrapporter', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
