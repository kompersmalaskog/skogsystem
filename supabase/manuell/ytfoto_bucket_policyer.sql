-- Bucketen ytfoto: alla inloggade får ladda upp (förut bara admin); radera får den som laddade upp filen (storage.objects.owner) eller admin. Läsning är publik som förut.
--
-- KÖRD 2026-10-20 av Martin via Supabase › Storage › Policies (SQL-editorn gav "must be owner of table objects": storage.objects ägs inte av
-- migrationsrollen). Verifierat i pg_policies samma dag. KÖR INTE IGEN — filen beskriver bara läget som det är i prod:
--   ytfoto_skapa_admin  INSERT  authenticated  with check (bucket_id = 'ytfoto')
--   ytfoto_radera_admin DELETE  authenticated  using (bucket_id = 'ytfoto' and (owner = auth.uid() or ar_admin()))
-- NAMNEN ÄR KVAR (…_admin) trots att policyerna inte längre är admin-bara; de döptes inte om. Läsning: ytfoto_las_publik (SELECT, public) orörd.
-- Ligger utanför supabase/migrations med flit: den registreras inte i schema_migrations och ska inte stoppa release-kontrollen.

alter policy ytfoto_skapa_admin on storage.objects with check (bucket_id = 'ytfoto');
alter policy ytfoto_radera_admin on storage.objects using (bucket_id = 'ytfoto' and (owner = auth.uid() or public.ar_admin()));
