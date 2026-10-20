-- Bucketen ytfoto: alla inloggade får ladda upp (förut bara admin); radera får den som laddade upp filen (storage.objects.owner) eller admin. Läsning är publik som förut.
-- KÖRS AV MARTIN I SUPABASE SQL-EDITORN (storage.objects ägs inte av migrationsrollen: "must be owner of table objects"). Bara policyerna ändras, ingen data.
-- Utan den här kan en förare inte ladda upp foton på Vidas objekt (kommentarer fungerar ändå).

alter policy ytfoto_skapa_admin on storage.objects with check (bucket_id = 'ytfoto');
alter policy ytfoto_radera_admin on storage.objects using (bucket_id = 'ytfoto' and (owner = auth.uid() or public.ar_admin()));
alter policy ytfoto_skapa_admin on storage.objects rename to ytfoto_skapa;
alter policy ytfoto_radera_admin on storage.objects rename to ytfoto_radera;
