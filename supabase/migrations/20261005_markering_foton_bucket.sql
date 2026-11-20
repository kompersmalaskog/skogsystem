-- BUCKET FÖR PLANERINGSVYNS MARKERINGSFOTON (PR 2 av 3).
-- OBS: KÖRS AV MARTIN/CHATTEN-CLAUDE via Supabase — den här filen är underlaget, den har
-- INTE applicerats av kodsessionen.
--
-- Privat bucket. Sökväg: {objekt_id}/{marker_id}.jpg. Läsning via createSignedUrl (kräver
-- SELECT för inloggade). Skrivning för alla inloggade (planerare + förare lägger foton i
-- planeringsvyn). Samma mönster som kartbilder / egenkontroll-foto.

-- 1) Bucketen: privat, max 5 MB, bara JPEG (klienten komprimerar till max 1600 px / JPEG 0.7)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('markering-foton', 'markering-foton', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- 2) Policyer för inloggade
CREATE POLICY "markering_foton_las_inloggad" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'markering-foton');

CREATE POLICY "markering_foton_skriv_inloggad" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'markering-foton');

-- UPDATE krävs: ett omtag skriver över {marker_id}.jpg (upload med upsert: true)
CREATE POLICY "markering_foton_uppdatera_inloggad" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'markering-foton')
  WITH CHECK (bucket_id = 'markering-foton');

CREATE POLICY "markering_foton_radera_inloggad" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'markering-foton');

-- De globala dfrif8-policyerna behöver INTE undantas: 20260805_1 ersatte dem med en vitlista
-- (bara 'audio' är publik). En ny bucket är alltså stängd för anon från början.
