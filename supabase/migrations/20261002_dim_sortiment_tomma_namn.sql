-- dim_sortiment: elva rader med TOMT namn får sitt riktiga namn.
--
-- vy_sortiment_klass härleder grupp ur dim_sortiment.namn (och produktgrupp).
-- Med namn = '' och produktgrupp NULL blev gruppen NULL → "Utan sortiment",
-- och virket syntes varken som timmer, kubb eller massaved i något som läser
-- gruppen: utfall_objekt (/affarsuppfoljning/medelstam) visade massa 0 % för
-- Jeppshoka 1:14 (634 m³ massaved), Äskebäck, Korpalycke, Bommerstorp och
-- Krokshult, och massavedsvyerna missade samma virke.
--
-- ELVA rader, inte tio: tio Scorpion-sortiment (PONS20SDJAA270231_208, 218,
-- 261, 266, 289, 294, 297, 299, 300, 301) och Rottnes R64101_1048
-- ("Unspecified", 2 stockar, grupp förblir Utan sortiment).
--
-- Namnen är ENTYDIGA: varje sortiment-id har exakt ett namn i sina stockar
-- (detalj_stock.sortiment_namn, kontrollerat 2026-10-02: antal_olika_namn = 1
-- för alla elva) och det är samma namn dagens parser ger ur HPR-filens
-- ProductDefinition (provkört på Jeppshoka-filen 20260409041821_1.hpr:
-- 'Massa: BmavFall_V3', produktgrupp 'Massa', kundkod '100-1').
--
-- VARFÖR de var tomma: skapade 2026-03-10, 2026-04-01 och 2026-04-21 (alla
-- före 2026-04-22) och aldrig uppdaterade — importen hoppar redan importerade
-- filer, så en senare, rättad parser aldrig fick skriva namnet. Ingen ny tom
-- rad har tillkommit sedan dess. Exakt vilken körning som skrev '' går inte
-- att härleda ur data.
--
-- GUARD: bara rader som FORTFARANDE har tomt namn uppdateras — ett namn som
-- någon hunnit sätta skrivs aldrig över. dim_sortiment_grupp (Acord-motorns
-- prisgruppering) rörs INTE.
--
-- produktgrupp och kundkod lämnas NULL: vyn behöver bara namnet
-- (harled_produktgrupp), och att fylla dem är en separat sak.
UPDATE dim_sortiment ds
SET namn = v.nytt_namn
FROM (VALUES
  ('PONS20SDJAA270231_208', 'Energi: Engved3mTall_V3'),
  ('PONS20SDJAA270231_218', 'Energi: Engved3mBjörk_V3'),
  ('PONS20SDJAA270231_261', 'kubb: BERGoBERG EK-KUBB_V3'),
  ('PONS20SDJAA270231_266', 'Massa: AspmavFall_V3'),
  ('PONS20SDJAA270231_289', 'Kubb: Alvesta275_V3'),
  ('PONS20SDJAA270231_294', 'Massa: BjörkmavFall_V3'),
  ('PONS20SDJAA270231_297', 'Massa: BmavFall_V3'),
  ('PONS20SDJAA270231_299', 'Massa: BmavFall_V3'),
  ('PONS20SDJAA270231_300', 'Massa: BjörkmavFall_V3'),
  ('PONS20SDJAA270231_301', 'Massa: BjörkmavFall_V3'),
  ('R64101_1048',           'Unspecified')
) AS v(sortiment_id, nytt_namn)
WHERE ds.sortiment_id = v.sortiment_id
  AND coalesce(trim(ds.namn), '') = '';

-- Efter ändringen ska utfall_objekt och stämplingsmodellen räknas om (gruppen
-- ändras utan att någon stock rörs, så de ser det inte själva):
--   python berakna_utfall_objekt.py --alla
--   python berakna_stamplingsmodell.py --alla
