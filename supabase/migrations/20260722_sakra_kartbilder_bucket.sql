-- SÄKRA KARTBILDER-BUCKETEN (task_7fbb4f1d) — den var PUBLIC och serverade
-- markägardata (namn/telefon/e-post i traktdirektiv-PDF:er) via osignerade
-- URL:er. Efter detta: privat bucket, läsning via signerade URL:er
-- (lib/kartfiler.ts), skrivning bara för admin.

-- 1) Bucketen privat — stänger /storage/v1/object/public/kartbilder/*
UPDATE storage.buckets SET public = false WHERE name = 'kartbilder';

-- 2) Bort med anon-policyerna på kartbilder (läs + två uppladdningsvägar)
DROP POLICY IF EXISTS "Allow all reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow all uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads dfrif8_0" ON storage.objects;

-- 3) De GLOBALA alla-buckets-policyerna (SELECT/UPDATE med qual=true, roll
--    public) undantar nu kartbilder. OBS: de är en egen säkerhetsröra för
--    audio/utbildningsbevis — städas i separat PR, ändras inte i övrigt här.
ALTER POLICY "Allow all updates dfrif8_0" ON storage.objects
  USING (bucket_id <> 'kartbilder');
ALTER POLICY "Allow all updates dfrif8_1" ON storage.objects
  USING (bucket_id <> 'kartbilder');

-- 4) Nya kartbilder-policies: läs för inloggade (krävs för createSignedUrl),
--    skriv/ändra/radera bara för admin (public.ar_admin är SECURITY DEFINER,
--    kollar medarbetare.user_id = auth.uid() AND roll = 'admin')
CREATE POLICY "kartbilder_las_inloggad" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kartbilder');

CREATE POLICY "kartbilder_skriv_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kartbilder' AND public.ar_admin());

CREATE POLICY "kartbilder_uppdatera_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'kartbilder' AND public.ar_admin())
  WITH CHECK (bucket_id = 'kartbilder' AND public.ar_admin());

CREATE POLICY "kartbilder_radera_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'kartbilder' AND public.ar_admin());

-- 5) objekt-tabellen: lagrade FULLA publika URL:er -> STORAGE-PATHS.
--    Läsningen signerar vid behov (lib/kartfiler.ts tål båda formaten
--    under övergången, men datat ska vara rent).
UPDATE objekt SET kartbild_url = regexp_replace(kartbild_url, '^https?://[^/]+/storage/v1/object/public/kartbilder/', '')
  WHERE kartbild_url ~ '/storage/v1/object/public/kartbilder/';
UPDATE objekt SET traktdirektiv_url = regexp_replace(traktdirektiv_url, '^https?://[^/]+/storage/v1/object/public/kartbilder/', '')
  WHERE traktdirektiv_url ~ '/storage/v1/object/public/kartbilder/';
UPDATE objekt SET stamplingslangd_url = regexp_replace(stamplingslangd_url, '^https?://[^/]+/storage/v1/object/public/kartbilder/', '')
  WHERE stamplingslangd_url ~ '/storage/v1/object/public/kartbilder/';
