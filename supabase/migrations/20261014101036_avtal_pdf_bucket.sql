-- AVTALETS PDF: privat bucket `avtal` + kolumnen gs_avtal.avtal_pdf_path.
-- OBS: KÖRS AV PLANERINGSCHATTEN via Supabase — den här filen är underlaget, den har INTE applicerats av kodsessionen.
--
-- Varför: "Läs hela avtalet" i Mitt avtal öppnade /avtal/skogsavtalet-2025-2027.pdf, en fil som aldrig fanns → 404.
-- Avtalet kommer från Grönas medlemssidor och ska bara nå inloggade, så filen ligger i en PRIVAT bucket och öppnas med en
-- signerad länk (60 s). Vilken fil som gäller styrs av avtalsraden: nytt avtal = ny uppladdning, ingen kodändring.
--
-- Uppladdning: Admin → Avtal → "Avtalet som PDF" (bara admin). Sökväg: "<gs_avtal.id>.pdf", en fil per avtalsrad, en ny
-- uppladdning ersätter den förra (upsert → kräver UPDATE-policy).
--
-- Ordning: kör den här FÖRE production förs fram (och efter 20261014120000_gs_avtal_las_for_inloggade.sql, annars kan
-- förarna inte läsa avtalsraden och därmed inte sökvägen). Före migrationen: knappen står inaktiv med "Avtalet är inte
-- uppladdat än", och Admin → Avtal säger att kolumnen saknas.

-- 1) Kolumnen: sökvägen i bucketen. Null = inte uppladdat.
ALTER TABLE public.gs_avtal ADD COLUMN IF NOT EXISTS avtal_pdf_path text;
COMMENT ON COLUMN public.gs_avtal.avtal_pdf_path IS
  'Sökväg i Storage-bucketen avtal (privat) till avtalets PDF, t.ex. "<id>.pdf". Null = inte uppladdat. Skrivs av Admin → Avtal.';

-- 2) Bucketen: privat, max 20 MB, bara PDF. Ingen anon-policy finns för den (de globala policyerna är en vitlista:
--    bara audio och ytfoto är publika), så en ny bucket är stängd för anon från början.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avtal', 'avtal', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) Policyer: läsa = alla inloggade (krävs för createSignedUrl); skriva/ersätta/radera = bara admin
--    (public.ar_admin är SECURITY DEFINER, kollar medarbetare.user_id = auth.uid() AND roll = 'admin').
DROP POLICY IF EXISTS "avtal_las_inloggad" ON storage.objects;
CREATE POLICY "avtal_las_inloggad" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avtal');

DROP POLICY IF EXISTS "avtal_skriv_admin" ON storage.objects;
CREATE POLICY "avtal_skriv_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avtal' AND public.ar_admin());

DROP POLICY IF EXISTS "avtal_uppdatera_admin" ON storage.objects;
CREATE POLICY "avtal_uppdatera_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avtal' AND public.ar_admin())
  WITH CHECK (bucket_id = 'avtal' AND public.ar_admin());

DROP POLICY IF EXISTS "avtal_radera_admin" ON storage.objects;
CREATE POLICY "avtal_radera_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avtal' AND public.ar_admin());

-- Verifiering:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avtal';
--     → public = false, 20971520, {application/pdf}
--   select policyname, cmd, roles from pg_policies where schemaname = 'storage' and policyname like 'avtal_%' order by 1;
--     → 4 rader (SELECT för authenticated, INSERT/UPDATE/DELETE med ar_admin())
--   select column_name, data_type from information_schema.columns where table_name = 'gs_avtal' and column_name = 'avtal_pdf_path';
--   Som anon (ingen inloggning): GET /storage/v1/object/public/avtal/<id>.pdf ska ge 400/404, aldrig filen.
--
-- Återställning:
--   DROP POLICY IF EXISTS "avtal_las_inloggad" ON storage.objects;  (och de tre andra)
--   DELETE FROM storage.buckets WHERE id = 'avtal';   -- bara när bucketen är tom
--   ALTER TABLE public.gs_avtal DROP COLUMN IF EXISTS avtal_pdf_path;
