-- Datahälsa: samlingsraden 'gap_check' tas bort ur meta_datahalsa_status.
--
-- gap_check.py (importdatorn) skrev förr HELA körningen i en rad, 'gap_check', där importfelen
-- (tabellen import_fel) låg blandade med övriga kontroller. Importfelen bevakas nu i databasen:
-- pg_cron-jobbet 'import-larm' kör import_larm_kontroll() var 15:e minut och skriver raden
-- 'import_live'. gap_check.py skriver i stället en rad per kontroll som bara importdatorn kan göra
-- (fakt_tid_mot_mom, deploy_drift, stammar_utan_stockar, fakt_sortiment_mot_stock,
-- parkerade_filer, inkommande_ko) och ingen samlingsrad.
--
-- ORDNING — KÖR DEN HÄR EFTER deploy_import.ps1:
-- den gamla gap_check.py skriver raden på nytt vid varje körning (upsert på id). Körs migrationen
-- före deployen av importkoden kommer raden tillbaka vid nästa körning. Appen visar aldrig raden
-- (lib/datahalsa/status: GAMMAL_SAMLINGSRAD), så det är ofarligt att den ligger kvar en stund.
--
-- Bara data, inget schema. Kan köras flera gånger (andra gången tar den bort noll rader).
-- Raden bär ingen historik: den skrevs över vid varje körning, och loggen finns i gap_logg.txt.

delete from public.meta_datahalsa_status where id = 'gap_check';

-- Kvitto (ska ge 0):
--   select count(*) from public.meta_datahalsa_status where id = 'gap_check';
