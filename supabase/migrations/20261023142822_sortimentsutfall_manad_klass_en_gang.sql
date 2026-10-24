-- sortimentsutfall_manad: läs sortimentsklasserna EN gång.
--
-- Månadsskärmen i Affärsuppföljningen föll ofta med "Utfallet kunde inte hämtas". Funktionen tog 6,5–7,5 s som
-- inloggad användare (oktober 2026, Allt, Vida), mot appens gräns på 8 s — ibland över. Orsaken: vy_sortiment_klass
-- (2 ms ensam) kopplades till stockarna med en plan som räknade om vyn per stock: 2,5 s per koppling, och funktionen
-- kopplar två gånger (rader och per_atgard). Läst en gång (MATERIALIZED) tar samma koppling 0,36 s.
--
-- Bara planen ändras, inte svaret: md5 av svaret för fyra månader/val är identiskt före och efter.
--
-- Patch av befintlig definition (pg_get_functiondef + replace med antalskontroll), som opti-tids-patcharna:
-- Supabase-MCP:n hänger på hela funktionstexter.

DO $$
DECLARE
  def text;
  ny  text;
BEGIN
  SELECT pg_get_functiondef('public.sortimentsutfall_manad(date,text,text)'::regprocedure) INTO def;

  IF (length(def) - length(replace(def, 'WITH gransen AS (', ''))) / length('WITH gransen AS (') <> 1 THEN
    RAISE EXCEPTION 'sortimentsutfall_manad: väntade exakt en "WITH gransen AS ("';
  END IF;
  IF (length(def) - length(replace(def, 'LEFT JOIN vy_sortiment_klass k ON', ''))) / length('LEFT JOIN vy_sortiment_klass k ON') <> 2 THEN
    RAISE EXCEPTION 'sortimentsutfall_manad: väntade exakt två kopplingar till vy_sortiment_klass';
  END IF;

  ny := replace(def, 'WITH gransen AS (',
    E'WITH klass AS MATERIALIZED (\n  SELECT sortiment_id, grupp, destination FROM vy_sortiment_klass\n),\ngransen AS (');
  ny := replace(ny, 'LEFT JOIN vy_sortiment_klass k ON', 'LEFT JOIN klass k ON');

  EXECUTE ny;
END $$;
