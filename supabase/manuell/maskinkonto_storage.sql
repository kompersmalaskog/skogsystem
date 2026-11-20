-- Hör till migrationen 20261120150002_maskinkonto_2_sparr.sql. Körs i Supabase SQL Editor (eller Storage › Policies) bara om migrationen
-- sa "storage.objects: saknar rättighet" — det är rollen som äger storage.objects som får skapa policyer där. Kör INTE via apply_migration.
-- Ett maskinkonto får aldrig läsa eller skriva bucketarna avtal och utbildningsbevis; alla andra påverkas inte.
create policy maskinkonto_nekar_filer on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('avtal', 'utbildningsbevis') or not (select public.ar_maskinkonto()))
  with check (bucket_id not in ('avtal', 'utbildningsbevis') or not (select public.ar_maskinkonto()));
