-- Index för per-objekt-läsning ur detalj_gps_spar (~7,4 M rader).
-- Utan detta blir `WHERE objekt_id = X ORDER BY id` en SEQ-SCAN → statement-timeout (HTTP 500)
-- på stora / sent-importerade objekt (bekräftat: objekt med ~90k punkter timeout:ade på 11,7 s).
-- Med indexet blir samma fråga en index-range-scan. Gynnar även framtida app-läsning per objekt.
--
-- OBS lås: en vanlig CREATE INDEX tar ett kort ACCESS SHARE-lås under bygget. Vill man undvika att
-- blockera importerns skrivningar: kör istället manuellt (utanför transaktion, ej via apply_migration):
--     CREATE INDEX CONCURRENTLY detalj_gps_spar_objekt_id_idx ON detalj_gps_spar (objekt_id, id);
create index if not exists detalj_gps_spar_objekt_id_idx on detalj_gps_spar (objekt_id, id);
