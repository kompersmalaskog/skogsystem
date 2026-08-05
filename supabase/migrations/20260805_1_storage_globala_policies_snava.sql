-- 2026-08-05  storage.objects: snäva in de globala "dfrif8"-policyerna
--
-- De två dfrif8-policyerna gav rollen public (= anon-nyckeln, ingen inloggning) SELECT+UPDATE
-- på ALLA buckets utom kartbilder (USING bucket_id <> 'kartbilder'). Det gjorde raw-files
-- (122 HPR-filer) anon-läsbara och skulle automatiskt exponera varje NY bucket, t.ex. den
-- kommande privata trakt-inbox med markägares personuppgifter.
--
-- Verifierat innan drop: ingen legitim anon-läsare finns.
--   - Appen (alla .storage.from) rör bara audio (public=true, egna policies), kartbilder
--     (undantagen) och utbildningsbevis (authenticated). Aldrig raw-files.
--   - Alla raw-files-vägar (auto_import_watch.py, backfill_fordelning_hpr.py,
--     .tmp/stada-incoming.py, /api/hpr-import download+remove) använder service-role,
--     som går förbi RLS och därför är opåverkade.
--   - Bucket-lista bekräftad mot prod: audio, kartbilder, raw-files, utbildningsbevis.
--     Ingen okänd bucket hänger på dfrif8.
--
-- Ersätt "undanta en"-logiken med en explicit vitlista. audio behåller sina egna
-- dedikerade INSERT/DELETE/SELECT-policies; SELECT/UPDATE nedan är en tydlig
-- säkerhetsmarginal så nästa läsare ser vad som är avsiktligt publikt.

DROP POLICY IF EXISTS "Allow all updates dfrif8_1" ON storage.objects;  -- var SELECT, public
DROP POLICY IF EXISTS "Allow all updates dfrif8_0" ON storage.objects;  -- var UPDATE, public

CREATE POLICY storage_las_publik ON storage.objects
  FOR SELECT TO public USING (bucket_id IN ('audio'));

CREATE POLICY storage_uppdatera_publik ON storage.objects
  FOR UPDATE TO public USING (bucket_id IN ('audio'));
