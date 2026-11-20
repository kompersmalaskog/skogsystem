-- Kontrollen efter backfillen: täckning, inte bara "gick igenom".
--
-- Två fel i den första versionen, båda funna genom att köra den:
--
-- 1. Parlistan kom ur en DISTINCT över detalj_stock. Den tar över 8 sekunder
--    och dog med 57014 när backfillskriptet anropade den som service-roll —
--    kontrollen fungerade alltså bara från ett verktyg utan timeout, vilket
--    är samma sak som att den inte fungerade. Paren kommer nu ur
--    fakt_sortiment, som är en SUPERSET (336 par mot 160, noll saknade).
--    Täckningen kan därmed bara underskattas, aldrig överskattas — rätt håll
--    för en kontroll.
--
-- 2. Kontrollen sa inget om VILKA objekt som saknar fönster. "329 av 336"
--    räcker inte för att veta om resten är en handfull gamla trakter eller
--    ett systematiskt hål, så objekten listas nu vid namn.
--
-- Kontroll 4 täcker båda omfången. Volymerna 126,7 (objektet) och 31,1
-- (augusti) är invarianter: rör de sig har fönstret läckt in i en beräkning
-- där det inte hör hemma. Sågbart SKA röra sig, men bara till 30,3 och 8,1.
--
-- Utfall efter backfillen 2026-08-25:
--   889 fönsterrader över 87 objekt, alla med både diameter- och längdtak
--   329 av 336 sågbara par ur maskinen, 7 härledda
--   2 objekt utan fil: Hushållningssällskapet 2, S Rimshult lövgallring
--   0 fönsterbyten
--   Åbogen 126,7 / 30,3 och augusti 31,1 / 8,1

CREATE OR REPLACE FUNCTION kontroll_apteringsfonster()
RETURNS jsonb LANGUAGE sql STABLE AS $k$
WITH falt AS (
  SELECT COUNT(*) AS rader,
         COUNT(*) FILTER (WHERE dia_max_mm IS NOT NULL)   AS med_diatak,
         COUNT(*) FILTER (WHERE langd_max_cm IS NOT NULL) AS med_langdtak,
         COUNT(DISTINCT objekt_id) AS objekt
  FROM dim_objekt_sortiment_fonster
),
-- Paren kommer ur fakt_sortiment, inte detalj_stock. En DISTINCT över
-- detalj_stock tar >8 s och dog med 57014 som service-roll. fakt_sortiment är
-- en superset (336 par mot 160, noll saknade), så täckningen kan bara
-- UNDERSKATTAS här — aldrig överskattas. Det är rätt håll för en kontroll.
par AS (
  SELECT DISTINCT f.objekt_id, f.sortiment_id
  FROM fakt_sortiment f JOIN vy_sortiment_klass k ON k.sortiment_id = f.sortiment_id
  WHERE k.grupp IN ('Timmer','Kubb') AND f.objekt_id IS NOT NULL
),
tackning AS (
  SELECT COUNT(*) AS sagbara_par,
         COUNT(o.sortiment_id) AS ur_maskinen,
         COUNT(*) - COUNT(o.sortiment_id) AS harlett
  FROM par LEFT JOIN dim_objekt_sortiment_fonster o
         ON o.objekt_id = par.objekt_id AND o.sortiment_id = par.sortiment_id
),
-- Objekt som har sågbart sortiment men INTE en enda fönsterrad: de har ingen
-- fil i Behandlade, eller en fil vars ProductDefinition saknar gränser.
utan_fil AS (
  SELECT p.objekt_id, COALESCE(d.object_name, '(namnlöst)') AS namn
  FROM (SELECT DISTINCT objekt_id FROM par) p
  LEFT JOIN dim_objekt d ON d.objekt_id = p.objekt_id
  WHERE NOT EXISTS (SELECT 1 FROM dim_objekt_sortiment_fonster o
                     WHERE o.objekt_id = p.objekt_id)
),
motsagelser AS (
  SELECT COUNT(*) AS antal FROM import_fel
  WHERE tabell = 'dim_objekt_sortiment_fonster' AND tid > now() - interval '30 days'
),
abogen AS (
  SELECT (massaved_niva2('11217413')->>'total_m3fub')::numeric AS total,
         (massaved_niva2('11217413')->'sagbar'->>'m3fub')::numeric AS sagbar,
         (massaved_niva2('11217413','2026-08-01')->>'total_m3fub')::numeric AS aug_total,
         (massaved_niva2('11217413','2026-08-01')->'sagbar'->>'m3fub')::numeric AS aug_sagbar
)
SELECT jsonb_build_object(
 'kord', now(),
 'kontroll_1_falt_fylls', jsonb_build_object(
    'status', CASE WHEN f.rader = 0 THEN 'väntar'
                   WHEN f.med_diatak = f.rader AND f.med_langdtak > 0 THEN 'ok'
                   ELSE 'AVVIKELSE' END,
    'rader', f.rader, 'objekt', f.objekt,
    'med_diatak', f.med_diatak, 'med_langdtak', f.med_langdtak,
    'not', 'Ett fönster utan diametertak är inte läst — då är hela poängen borta.'),
 'kontroll_2_tackning', jsonb_build_object(
    'status', CASE WHEN t.ur_maskinen = 0 THEN 'väntar' ELSE 'ok' END,
    'sagbara_par', t.sagbara_par, 'ur_maskinen', t.ur_maskinen, 'harlett', t.harlett,
    'objekt_utan_fonster', (SELECT COUNT(*) FROM utan_fil),
    'objekt_utan_fonster_exempel', COALESCE(
       (SELECT jsonb_agg(namn ORDER BY namn) FROM (SELECT namn FROM utan_fil ORDER BY namn LIMIT 12) x),
       '[]'::jsonb),
    'not', 'Härlett är inte ett fel — objekt utan HPR-fil i Behandlade kan inte få ett mätt fönster. Men andelen ska STIGA över tid, aldrig falla.'),
 'kontroll_3_motsagelser', jsonb_build_object(
    'status', CASE WHEN m.antal = 0 THEN 'ok' ELSE 'AVVIKELSE' END,
    'antal', m.antal,
    'atgard', 'Läs import_fel. Ett fönster som byter inom ett objekt betyder prislistbyte mitt i en trakt — då är per-objekt-nyckeln för grov och historiken behöver ett datum.'),
 'kontroll_4_abogen', jsonb_build_object(
    'status', CASE WHEN a.total <> 126.7 OR a.aug_total <> 31.1 THEN 'AVVIKELSE — VOLYMEN HAR RÖRT SIG'
                   WHEN a.sagbar = 30.3 AND a.aug_sagbar = 8.1 THEN 'ok — fönstret har landat'
                   WHEN a.sagbar = 35.2 AND a.aug_sagbar = 9.0 THEN 'väntar — fortfarande härlett'
                   ELSE 'AVVIKELSE' END,
    'objekt_m3fub', a.total, 'objekt_sagbar', a.sagbar,
    'augusti_m3fub', a.aug_total, 'augusti_sagbar', a.aug_sagbar,
    'vantat_harlett', '35,2 / 9,0', 'vantat_hpr', '30,3 / 8,1',
    'not', 'Volymerna 126,7 och 31,1 får ALDRIG ändras av den här migrationen. Rör de sig har fönstret läckt in i fel beräkning.'),
 'status', CASE WHEN m.antal > 0 OR a.total <> 126.7 OR a.aug_total <> 31.1
                     OR (f.rader > 0 AND f.med_diatak <> f.rader)
                THEN 'avvikelse' WHEN f.rader = 0 THEN 'väntar' ELSE 'ok' END
) FROM falt f, tackning t, motsagelser m, abogen a;
$k$;

COMMENT ON FUNCTION kontroll_apteringsfonster() IS
  'Fyra kontroller för apteringsfönstret, körbara som service-roll (paren ur fakt_sortiment, inte en DISTINCT över detalj_stock som timeoutar). Åbogen är facit: 126,7 och 31,1 m³ massaved får aldrig röra sig, sågbart ska stå på 30,3 respektive 8,1 när fönstret landat.';
