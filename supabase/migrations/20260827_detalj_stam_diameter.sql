-- Avsmalningskurvan: en diameterserie per stam.
--
-- EN RAD PER STAM, serien som array — inte en rad per mätpunkt. Mätprovet gav
-- ~10,3 miljoner punkter över 114 810 stammar; radformen hade kostat ~700 MB
-- med index, arrayformen ~30 MB. Faktor 20, och en avsmalningskurva läses
-- ändå alltid hel — ingen frågar efter punkt 47 av 90.
--
-- Serien är en diameter var 10:e cm ÖVER BARK, mätt mellan start- och
-- sluthöjd. Positionen för element i är start_hojd_cm + i*steg_cm, så
-- positionerna behöver inte lagras.
--
-- ── DEN HÄR TABELLEN FÅR INTE LÄSAS AV EN SKÄRM ─────────────────────────
-- Den är analysunderlag, inte vydata. Samma princip som gjorde nivå 1 snabb:
-- arbetet ligger vid importen, inte hos den som tittar. Därför är RLS på UTAN
-- policy och rättigheterna återkallade för anon och authenticated — en vy
-- eller RPC som ändå försöker läsa får ett FEL, inte ett tomt svar. Tyst tomt
-- hade sett ut som "stammen saknar serie", vilket är en helt annan sak.
CREATE TABLE IF NOT EXISTS detalj_stam_diameter (
  maskin_id          text     NOT NULL,
  objekt_id          text     NOT NULL,
  stam_key           text     NOT NULL,
  diameter_kategori  text     NOT NULL DEFAULT 'Over bark',
  start_hojd_cm      int,
  slut_hojd_cm       int,
  steg_cm            int,
  forsta_position_cm int,
  diametrar          smallint[] NOT NULL,
  antal_punkter      int      NOT NULL,
  filnamn            text,
  uppdaterad         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (maskin_id, objekt_id, stam_key)
);

COMMENT ON TABLE detalj_stam_diameter IS
  'Avsmalningskurva per stam: diametrar i mm över bark, en punkt var steg_cm från start_hojd_cm. ANALYSUNDERLAG — får aldrig läsas av en vy eller RPC som en skärm anropar. RLS är på utan policy och rättigheterna är återkallade, så ett försök ger fel i stället för tyst tomt.';
COMMENT ON COLUMN detalj_stam_diameter.diametrar IS
  'Diameter i mm för position start_hojd_cm + i*steg_cm. Positionerna lagras inte — de är härledbara.';
COMMENT ON COLUMN detalj_stam_diameter.forsta_position_cm IS
  'Position för första elementet. Mätt på alla 115 074 serier är den 0 och steget 10 cm, men den lagras ändå — "alltid" var en observation, inte en garanti. Position för element i = forsta_position_cm + i*steg_cm. Ojämnt fördelade serier skrivs inte alls; arrayen får aldrig ljuga om var diametrarna satt.';
COMMENT ON COLUMN detalj_stam_diameter.antal_punkter IS
  'Redundant mot array_length, men gör täckningsfrågor billiga utan att packa upp arrayen.';

ALTER TABLE detalj_stam_diameter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON detalj_stam_diameter FROM anon, authenticated;

-- Uppslag från stamsidan. Ingen separat index på objekt_id — PK:n leder med
-- maskin_id och objekt_id kommer på andra plats, vilket räcker för
-- "alla serier på ett objekt".
CREATE INDEX IF NOT EXISTS idx_stam_diameter_objekt
  ON detalj_stam_diameter (objekt_id, maskin_id);
