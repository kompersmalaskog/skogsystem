-- object_key maskinskopas: "{machineKey}:{ObjectKey}".
-- StanForD:s ObjectKey är en maskin-lokal räknare (verifierat: Hushållnings-
-- sällskapet = 100 och 109 på Scorpion, Brokamåla = 112) — utan maskinprefix
-- skulle en Rottne-fil med ObjectKey 112 tyst mergeas in i Brokamåla.
-- Samma läxa som maskin:vo-nyckeln i gamla hpr-importen (#78).
--
-- Prefixet 'PONS20SDJAA270231:' är säkert att hårdkoda här: enda datat i
-- tabellerna vid denna migration är etapp 1-testimporten av Brokamåla-filen
-- (en fil, en maskin). Ny data skrivs redan skopad av routen.

insert into harvest_objects (object_key, object_name, status, completed_at, last_file_at)
select 'PONS20SDJAA270231:' || object_key, object_name, status, completed_at, last_file_at
from harvest_objects where object_key not like '%:%';

update products set object_key = 'PONS20SDJAA270231:' || object_key where object_key not like '%:%';
update logs set object_key = 'PONS20SDJAA270231:' || object_key where object_key not like '%:%';
update hpr_files set object_key = 'PONS20SDJAA270231:' || object_key where object_key not like '%:%';
update distribution_snapshots set object_key = 'PONS20SDJAA270231:' || object_key where object_key not like '%:%';

delete from harvest_objects where object_key not like '%:%';
