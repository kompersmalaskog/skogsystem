-- Massavedsvyn blir en objektlista. Datalagret.
--
-- Ersätter den nästlade sortiment/trädslag-strukturen. Fyra indragsnivåer
-- beskrev sortimentens form, inte den fråga bruket ställde.
--
-- ── MÅLTALET ─────────────────────────────────────────────────────────────
-- 4,6 m ligger i kravprofil, inte hårdkodat och inte i normalisering_karta
-- (som är en strängmatchningskarta utan skalär-semantik — det finns inget
-- 'monster' att matcha på).
--
-- MÅLTAL, inte krav: Vidas kravprofil innehöll före detta BARA
-- kalibreringsmått (träffprocent, standardavvikelse, systematisk avvikelse
-- för längd och diameter). Någon avtalad mållängd för massaved finns inte i
-- systemet. golv = 0 betyder "inget avtalat golv" — att spegla måltalet, som
-- BIOMETRIA-raderna gör, hade lästs som att allt under 4,6 bryter mot ett
-- krav. Något sådant krav är inte belagt.
INSERT INTO kravprofil (profil, variabel, metrik, riktning, mal, golv, enhet, tolerans)
SELECT 'VIDA', 'massaved_langd', 'medellangd', 'hog_bra', 4.6, 0, 'm', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM kravprofil WHERE profil='VIDA' AND variabel='massaved_langd' AND metrik='medellangd');

CREATE OR REPLACE FUNCTION massaved_mal()
RETURNS numeric LANGUAGE sql STABLE AS $f$
  SELECT mal FROM kravprofil
  WHERE profil='VIDA' AND variabel='massaved_langd' AND metrik='medellangd';
$f$;

COMMENT ON FUNCTION massaved_mal() IS
  'Måltalet för massavedens medellängd (m). MÅLTAL, inte krav — golv=0 eftersom ingen avtalad mållängd finns. Ändras i kravprofil, aldrig i vy eller frontend.';

-- ── VYN ──────────────────────────────────────────────────────────────────
-- En rad per objekt, månad och välta.
--
-- VÄLTA: Barr = 'Massa: BmavFall_V3', Björk = 'Massa: BjörkmavFall_V3'.
-- De lastas separat och får ALDRIG slås ihop till ett tal. Övriga
-- massasortiment hamnar under 'Övrig massaved' i stället för att tyst
-- försvinna (augusti 2026: Aspmav 3,2 m³).
--
-- HEMVED exkluderas — den går till markägaren, aldrig till bruket, och hör
-- inte hemma i en längdvy som beskriver vad bruket får. 17,3 m³ i augusti.
--
-- ROTKEDJA = sammanhängande massabitar från stammens början fram till första
-- timmer- eller kubbstocken. ROTKAP = sådan bit kortare än 320 cm.
--
-- Rotkap KRÄVER att stammen fått en sågbar stock. Rotkap är ett kapbeslut
-- för att nå sågbart virke; har stammen ingen sågbar stock finns inget
-- beslut att avläsa, bara ett klent träd. De korta bitarna därifrån
-- redovisas som massa_utan_sagbar_stock — aldrig som rotkap, och ordet
-- rotkap får inte förekomma i fältnamnet.
--
-- Uppmätt augusti 2026, Vida, korta massabitar (< 320 cm):
--   rotkedja (före sågbar stock)   600 st  115,5 m³   -> rotkap
--   stam utan sågbar stock         507 st   24,0 m³   -> egen post
--   massa EFTER sågbar stock       298 st   15,2 m³   -> vanlig massaved
-- 115,5 + 24,0 = 139,5 är alltså INTE uttömmande. Den tredje kategorin är
-- korta bitar högre upp på stammen — varken kapbeslut eller klent träd, utan
-- vanlig massaved som råkar vara kort. Den namnges inte och bakas inte in.
--
-- AVKAP = sortimenten 'Energi: AvkapGran_V3' och 'Energi: AvkapTall_V3'.
-- Inget härlett, inget kaporsaksfält. Båda är barr och hör därför till
-- Barr-vältan; att lägga dem på båda hade dubbelräknat.
--
-- STATUS härleds ur dim_objekt, ALDRIG ur datum eller volym. Objektens
-- start_date/end_date är opålitliga: Räveboda AU 2026 har end_date FÖRE
-- start_date, och Jätsbygd au 2026 har end_date 2026-08-20 medan skördningen
-- avslutades 2026-08-10. Vyn rör inte de fälten.
CREATE OR REPLACE VIEW vy_massaved_objekt
WITH (security_invoker = true) AS
WITH stock AS (
  SELECT v.objekt_id, v.maskin_id, v.stem_key, v.log_key, v.langd_cm, v.volym_m3sub, v.tidpunkt,
         k.grupp, ds.namn AS sortnamn,
         MIN(CASE WHEN k.grupp IN ('Timmer','Kubb') THEN v.log_key END)
           OVER (PARTITION BY v.maskin_id, v.stem_key, v.objekt_id) AS forsta_sagbar
  FROM vy_skordarmatt_stock v
  LEFT JOIN dim_sortiment ds      ON ds.sortiment_id = v.sortiment_id
  LEFT JOIN vy_sortiment_klass k  ON k.sortiment_id  = v.sortiment_id
  WHERE v.tidpunkt IS NOT NULL
),
massa AS (
  SELECT objekt_id, date_trunc('month', tidpunkt)::date AS manad,
         CASE WHEN sortnamn = 'Massa: BmavFall_V3'      THEN 'Barr'
              WHEN sortnamn = 'Massa: BjörkmavFall_V3'  THEN 'Björk'
              ELSE 'Övrig massaved' END AS valta,
         volym_m3sub, langd_cm, log_key, forsta_sagbar
  FROM stock
  WHERE grupp = 'Massa'
    AND lower(COALESCE(sortnamn,'')) NOT LIKE '%hemved%'
),
avkap AS (
  SELECT objekt_id, date_trunc('month', tidpunkt)::date AS manad, 'Barr'::text AS valta,
         SUM(volym_m3sub) AS avkap_m3, COUNT(*)::int AS avkap_st
  FROM stock WHERE sortnamn IN ('Energi: AvkapGran_V3','Energi: AvkapTall_V3')
  GROUP BY 1,2,3
),
agg AS (
  SELECT objekt_id, manad, valta,
         SUM(volym_m3sub) AS m3fub,
         COUNT(*)::int    AS antal_bitar,
         SUM(langd_cm*volym_m3sub)/NULLIF(SUM(volym_m3sub),0)/100 AS medellangd_m,
         SUM(langd_cm*volym_m3sub) FILTER (WHERE forsta_sagbar IS NULL OR log_key >= forsta_sagbar)
           / NULLIF(SUM(volym_m3sub) FILTER (WHERE forsta_sagbar IS NULL OR log_key >= forsta_sagbar),0)/100
           AS medellangd_utan_rotkedja_m,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE forsta_sagbar IS NOT NULL
                    AND log_key < forsta_sagbar AND langd_cm < 320),0) AS rotkap_m3,
         COALESCE(COUNT(*) FILTER (WHERE forsta_sagbar IS NOT NULL
                    AND log_key < forsta_sagbar AND langd_cm < 320),0)::int AS rotkap_st,
         COALESCE(SUM(volym_m3sub) FILTER (WHERE forsta_sagbar IS NULL AND langd_cm < 320),0)
           AS massa_utan_sagbar_stock_m3,
         COALESCE(COUNT(*) FILTER (WHERE forsta_sagbar IS NULL AND langd_cm < 320),0)::int
           AS massa_utan_sagbar_stock_st
  FROM massa GROUP BY 1,2,3
)
SELECT a.objekt_id, a.manad, a.valta,
       o.object_name AS objekt_namn, o.bolag, o.huvudtyp,
       -- Ponsse skriver tidsstämplar i vo_nummer. Visa bara rent numeriskt.
       CASE WHEN o.vo_nummer ~ '^[0-9]+$' THEN o.vo_nummer END AS vo_visning,
       ROUND(a.m3fub::numeric,1)        AS m3fub,
       a.antal_bitar,
       ROUND(a.medellangd_m::numeric,2) AS medellangd_m,
       ROUND(a.medellangd_utan_rotkedja_m::numeric,2) AS medellangd_utan_rotkedja_m,
       ROUND(a.rotkap_m3::numeric,1)    AS rotkap_m3,
       a.rotkap_st,
       ROUND(100*a.rotkap_m3::numeric/NULLIF(a.m3fub,0)::numeric,1) AS rotkap_andel_pct,
       ROUND(a.massa_utan_sagbar_stock_m3::numeric,1) AS massa_utan_sagbar_stock_m3,
       a.massa_utan_sagbar_stock_st,
       ROUND(COALESCE(av.avkap_m3,0)::numeric,2) AS avkap_m3,
       COALESCE(av.avkap_st,0)          AS avkap_st,
       CASE WHEN o.skotning_avslutad  IS NOT NULL THEN 'Avslutat'
            WHEN o.skordning_avslutad IS NOT NULL THEN 'Skördat, väntar skotning'
            ELSE 'Pågår' END AS status
FROM agg a
JOIN dim_objekt o ON o.objekt_id = a.objekt_id
LEFT JOIN avkap av ON av.objekt_id = a.objekt_id AND av.manad = a.manad AND av.valta = a.valta;

COMMENT ON VIEW vy_massaved_objekt IS
  'En rad per objekt, månad och välta. Barr och Björk lastas separat och får ALDRIG slås ihop. Hemved exkluderad (går till markägaren). Rotkap kräver att stammen fått en sågbar stock; klena träd utan sådan redovisas som massa_utan_sagbar_stock, aldrig som rotkap. Avkap = Energi: AvkapGran_V3/AvkapTall_V3, båda barr, därför på Barr-vältan.';

-- ── RPC ──────────────────────────────────────────────────────────────────
-- Sorterad på LÄGST medellängd först, inte på volym: det är de korta
-- objekten frågan gäller.
--
-- Allt-fliken tar med objekt UTAN bolag. Marie Krokshult vindf har
-- bolag = NULL — inte bara huvudtyp och atgard NULL som först antogs — och
-- faller därför ur redan på bolagsfiltret. Utan det här villkoret göms den.
CREATE OR REPLACE FUNCTION massaved_objektlista(
  p_manad date, p_atgard text DEFAULT 'Slutavverkning', p_valta text DEFAULT 'Barr'
) RETURNS jsonb LANGUAGE sql STABLE AS $o$
WITH rader AS (
  SELECT * FROM vy_massaved_objekt m
  WHERE m.manad = date_trunc('month', p_manad)::date
    AND m.valta = p_valta
    AND CASE WHEN p_atgard = 'Allt'
             THEN (m.bolag = 'Vida' OR m.bolag IS NULL)
             ELSE m.bolag = 'Vida' AND m.huvudtyp = p_atgard END
)
SELECT jsonb_build_object(
  'manad', to_char(date_trunc('month', p_manad), 'YYYY-MM'),
  'atgard', p_atgard, 'valta', p_valta,
  'mal_m', massaved_mal(),
  'total_m3fub', ROUND(COALESCE((SELECT SUM(m3fub) FROM rader),0),1),
  'medellangd_m', (SELECT ROUND(SUM(medellangd_m*m3fub)/NULLIF(SUM(m3fub),0),2) FROM rader),
  'objekt', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'objekt_id', objekt_id, 'namn', objekt_namn, 'vo', vo_visning,
      'm3fub', m3fub, 'antal_bitar', antal_bitar,
      'medellangd_m', medellangd_m,
      'medellangd_utan_rotkedja_m', medellangd_utan_rotkedja_m,
      'rotkap_m3', rotkap_m3, 'rotkap_st', rotkap_st, 'rotkap_andel_pct', rotkap_andel_pct,
      'massa_utan_sagbar_stock_m3', massa_utan_sagbar_stock_m3,
      'massa_utan_sagbar_stock_st', massa_utan_sagbar_stock_st,
      'avkap_m3', avkap_m3, 'avkap_st', avkap_st,
      'status', status,
      'atgard', COALESCE(huvudtyp, 'Okänd åtgärd'))
    ORDER BY medellangd_m ASC) FROM rader), '[]'::jsonb)
);
$o$;

COMMENT ON FUNCTION massaved_objektlista(date, text, text) IS
  'Objektlista för massavedsvyn, sorterad på LÄGST medellängd först — inte på volym. Allt-fliken tar med objekt utan bolag så inget göms.';
