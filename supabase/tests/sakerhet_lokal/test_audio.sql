\set ON_ERROR_STOP on
-- Punkt 2: bucketen audio. Förväntan efter migrationen 20261023120000_audio_bucket_privat.sql.
select test.forvanta('bucketen är privat och har storleksgräns', (select not public and file_size_limit = 15728640 from storage.buckets where id = 'audio'));
select test.forvanta('inga publika policyer kvar på audio', (select count(*) = 0 from pg_policies where schemaname = 'storage' and tablename = 'objects' and 'public' = any(roles::text[]) and (coalesce(qual, '') like '%audio%' or coalesce(with_check, '') like '%audio%')));

-- anon (utloggad, bara den publika nyckeln)
select test.forvanta('anon: läser inget i audio',          test.som('anon', $$select 1 from storage.objects where bucket_id = 'audio'$$) = '0');
select test.forvanta('anon: kan inte ladda upp',           test.som('anon', $$insert into storage.objects (bucket_id, name) values ('audio', 'anon/x.webm')$$) = 'fel:42501');
select test.forvanta('anon: kan inte radera',              test.som('anon', $$delete from storage.objects where bucket_id = 'audio'$$) = '0');
select test.forvanta('anon: kan inte skriva över',         test.som('anon', $$update storage.objects set name = 'hackat' where bucket_id = 'audio'$$) = '0');
select test.forvanta('kontroll: ytfoto är fortfarande publik', test.som('anon', $$select 1 from storage.objects where bucket_id = 'ytfoto'$$) = '1');

-- inloggad utan medarbetarrad (någon som registrerat sig själv)
select test.forvanta('inloggad utan medarbetarrad: läser inget', test.som('u', $$select 1 from storage.objects where bucket_id = 'audio'$$) = '0');
select test.forvanta('inloggad utan medarbetarrad: kan inte ladda upp', test.som('u', $$insert into storage.objects (bucket_id, name, owner) values ('audio', 'u/x.webm', auth.uid())$$) = 'fel:42501');

-- förare
select test.forvanta('förare: läser (för att kunna signera)', test.som('f1', $$select 1 from storage.objects where bucket_id = 'audio'$$) = '1');
select test.forvanta('förare: kan ladda upp',                 test.som('f1', $$insert into storage.objects (bucket_id, name, owner) values ('audio', 'f1/x.webm', auth.uid())$$) = '1');
select test.forvanta('förare: kan inte skriva över',          test.som('f1', $$update storage.objects set name = 'hackat' where bucket_id = 'audio'$$) = '0');
select test.forvanta('förare: kan inte radera en kollegas fil', test.som('f2', $$delete from storage.objects where bucket_id = 'audio' and name = 'f1/x.webm'$$) = '0');
select test.forvanta('förare: kan inte radera den föräldralösa filen', test.som('f2', $$delete from storage.objects where bucket_id = 'audio' and name = 'gammal/ljud.webm'$$) = '0');
select test.forvanta('förare: radera sin egen fil',           test.som('f1', $$delete from storage.objects where bucket_id = 'audio' and name = 'f1/x.webm'$$) = '1');

-- admin
select test.forvanta('förberedelse: f2 laddar upp',           test.som('f2', $$insert into storage.objects (bucket_id, name, owner) values ('audio', 'f2/y.webm', auth.uid())$$) = '1');
select test.forvanta('admin: kan radera andras filer',        test.som('admin', $$delete from storage.objects where bucket_id = 'audio' and name = 'f2/y.webm'$$) = '1');
select test.forvanta('admin: läser',                          test.som('admin', $$select 1 from storage.objects where bucket_id = 'audio'$$) = '1');
select 'AUDIO: allt grönt' as resultat;
