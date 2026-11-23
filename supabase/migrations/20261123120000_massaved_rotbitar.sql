-- Korta rotbitar: blev nästa bit timmer eller kubb efter 3 m? (Affärsuppföljning › Massaveden › Korta rotbitar)
--
-- En rotbit är stammens FÖRSTA stock när den är massa och kortare än 3,15 m (cirka 3 m,
-- maskinens kap för röta) OCH stammen har timmer eller kubb senare. Frågan är om stock nr 2
-- blev timmer eller kubb — då försvann rötan efter 3 m. Procenten räknas i sidan:
-- nasta_sagbar / rotbitar.
--
-- Räknar live ur detalj_stock (en stam = maskin + stem_key, stockarna i ordning efter log_key)
-- och hela objektet, aldrig en månad. Skild från sim_rotkap, som saknar rad för många objekt
-- och bara räknar stammar med kurva. Grupperna är samma som massaved_niva2 (vy_sortiment_klass).
--
-- Bara läsning, ändrar ingen befintlig funktion. Körs av Martin före release; sidan fungerar
-- utan funktionen (raden visas då inte).
CREATE OR REPLACE FUNCTION public.massaved_rotbitar(p_objekt_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH s AS (
  SELECT st.maskin_id, st.stem_key, st.langd_cm, k.grupp,
         row_number() OVER (PARTITION BY st.maskin_id, st.stem_key ORDER BY st.log_key) AS rn,
         bool_or(k.grupp IN ('Timmer','Kubb')) OVER (PARTITION BY st.maskin_id, st.stem_key) AS har_sagbar
  FROM detalj_stock st
  LEFT JOIN vy_sortiment_klass k ON k.sortiment_id = st.sortiment_id
  WHERE st.objekt_id = p_objekt_id AND st.stem_key IS NOT NULL AND st.log_key IS NOT NULL
), rot AS (
  SELECT b.grupp AS grupp2
  FROM s a
  LEFT JOIN s b ON b.maskin_id = a.maskin_id AND b.stem_key = a.stem_key AND b.rn = 2
  WHERE a.rn = 1 AND a.grupp = 'Massa' AND a.langd_cm < 315 AND a.har_sagbar
)
SELECT jsonb_build_object(
  'rotbitar',     COUNT(*),
  'nasta_sagbar', COUNT(*) FILTER (WHERE grupp2 IN ('Timmer','Kubb'))
) FROM rot;
$function$;

GRANT EXECUTE ON FUNCTION public.massaved_rotbitar(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.massaved_rotbitar(text) FROM anon;
