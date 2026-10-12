-- Kontroll: objekt som har stammar men inga stockar.
--
-- Det tillståndet är aldrig rimligt — en skördad stam har alltid minst en
-- stock — och det var osynligt i nio månader eftersom alla vyer bygger på
-- stockar: ett objekt utan stockar finns helt enkelt inte i dem.
--
-- Så uppstod det: stockparsningen i skogsmaskin_import_version_6.py fanns
-- inte förrän 2026-04-21 (koden skrevs 2026-04-05, togs i drift 04-21).
-- HPR-filerna för januari–april 2026 lästes 11 mars, 1 april och 21 april
-- med den parser som bara skrev detalj_stam, och meta_importerade_filer
-- markerade dem OK — så de lästes aldrig igen. 41 objekt, ~65 000 stammar.
-- Dessutom skrev parsern 21 april–7 maj stockar UTAN stem_key/log_key
-- (dedupe-nycklarna kom 2026-05-07): sex objekt till med 1,49 M rader som
-- inte går att joina mot stammen (Hössjömåla 1 457 004 av dem).
--
-- Räknas som "inga stockar": inga JOINBARA stockar, dvs. stem_key och
-- log_key satta. Rader utan nyckel syns inte i någon vy och är samma fel.
-- Hemved och sortiment spelar ingen roll här — det är stocken som saknas.
--
-- Läses av gap_check.py (statusrad 'stammar_utan_stockar' i
-- meta_datahalsa_status) och av reimport_hpr_stockar.py, som också får
-- filnamnen att läsa om ur Behandlade. stockar_utan_nyckel säger om objektet
-- redan har nyckellösa stockrader: då får en omimport INTE bara lägga till
-- rader med nyckel — de gamla måste rensas först, annars står två
-- uppsättningar i tabellen (se minnet om detalj_stock-dubbletter).
-- (Första versionen räknade ALLA rader här, inte bara nyckellösa — rättat
-- 2026-10-01 e.m.)
DROP FUNCTION IF EXISTS kontroll_stammar_utan_stockar(int);
CREATE FUNCTION kontroll_stammar_utan_stockar(p_min_stammar int DEFAULT 100)
RETURNS TABLE (
  objekt_id text, namn text, huvudtyp text, stammar bigint,
  forsta date, sista date, maskiner text, kalla text, filer text[],
  stockar_utan_nyckel bigint
) LANGUAGE sql STABLE AS $f$
  SELECT s.objekt_id, o.object_name, o.huvudtyp, count(*) AS stammar,
         min(s.tidpunkt)::date AS forsta, max(s.tidpunkt)::date AS sista,
         string_agg(DISTINCT s.maskin_id, ',') AS maskiner,
         CASE WHEN bool_and(s.filnamn ILIKE '%.hpr') THEN 'hpr'
              WHEN bool_and(s.filnamn ILIKE '%.mom') THEN 'mom'
              ELSE 'blandat' END AS kalla,
         array_agg(DISTINCT s.filnamn) AS filer,
         (SELECT count(*) FROM detalj_stock k
           WHERE k.objekt_id = s.objekt_id AND (k.stem_key IS NULL OR k.log_key IS NULL)) AS stockar_utan_nyckel
  FROM detalj_stam s
  LEFT JOIN dim_objekt o ON o.objekt_id = s.objekt_id
  WHERE s.objekt_id IS NOT NULL
  GROUP BY 1, 2, 3
  HAVING count(*) >= p_min_stammar
     AND NOT EXISTS (SELECT 1 FROM detalj_stock k
                     WHERE k.objekt_id = s.objekt_id
                       AND k.stem_key IS NOT NULL AND k.log_key IS NOT NULL)
  ORDER BY min(s.tidpunkt) NULLS FIRST, count(*) DESC;
$f$;

COMMENT ON FUNCTION kontroll_stammar_utan_stockar(int) IS
  'Objekt med minst p_min_stammar stammar i detalj_stam men inga joinbara stockar (stem_key/log_key satta) i detalj_stock. Aldrig rimligt. stockar_utan_nyckel = befintliga rader utan nyckel (måste rensas före omimport). Läses av gap_check.py (statusrad stammar_utan_stockar) och reimport_hpr_stockar.py.';

REVOKE ALL ON FUNCTION kontroll_stammar_utan_stockar(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kontroll_stammar_utan_stockar(int) TO authenticated, service_role;
