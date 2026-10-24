-- SÄKERHET: bucketen `audio` är PRIVAT (audit 2026-10-22, punkt 6).
--
-- Före: bucketen var publik och policyerna "Allow public upload/delete/read", `storage_las_publik` och
-- `storage_uppdatera_publik` (roll `public` = anon) lät VEM SOM HELST på internet läsa, ladda upp, skriva över och
-- radera ljud — utan konto, utan storleksgräns.
--
-- Efter: privat bucket, max 15 MB per fil. Läsa och ladda upp: bara en inloggad MEDARBETARE (en användare utan
-- medarbetarrad — t.ex. någon som registrerat sig själv — får ingenting). Radera: den som laddade upp filen eller admin.
-- Ingen UPDATE-policy: filerna skrivs aldrig över (appen laddar upp med upsert: false). Uppspelning sker via
-- createSignedUrl (lib/ljud.ts, 10 minuter), som kräver SELECT-policyn nedan.
--
-- KÖRS INTE AV KODSESSIONEN — Martin kör via apply_migration FÖRE release, sedan döps filen om till versionen prod stämplat.
-- Appen i production (gamla koden) spelar ljud via publika URL:er: de slutar fungera i samma ögonblick migrationen körs,
-- så kör den när den nya koden (LjudSpelare) är ute. Det finns inga ljud kopplade till någon rad i prod 2026-10-23
-- (feedback: 0, markeringar: 0, objekt_yta_media: 0); de tre filer som ligger i bucketen (mars 2026) är föräldralösa.

update storage.buckets
   set public = false,
       file_size_limit = 15728640
 where id = 'audio';

drop policy if exists "Allow public delete from audio" on storage.objects;
drop policy if exists "Allow public read from audio"   on storage.objects;
drop policy if exists "Allow public upload to audio"   on storage.objects;
drop policy if exists "storage_las_publik"             on storage.objects;
drop policy if exists "storage_uppdatera_publik"       on storage.objects;

create policy "audio_las_medarbetare" on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and public.aktuell_medarbetare_id() is not null);

create policy "audio_skapa_medarbetare" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and public.aktuell_medarbetare_id() is not null);

create policy "audio_radera_agare_eller_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio' and public.aktuell_medarbetare_id() is not null and (owner = auth.uid() or public.ar_admin()));
