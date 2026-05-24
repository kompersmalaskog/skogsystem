CREATE OR REPLACE FUNCTION public.mina_operator_ids()
RETURNS TABLE(operator_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT om.operator_id FROM operator_medarbetare om
  WHERE om.medarbetare_id = aktuell_medarbetare_id();
$$;
ALTER TABLE fakt_skift ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fakt_skift_select ON fakt_skift;
CREATE POLICY fakt_skift_select ON fakt_skift FOR SELECT TO authenticated
  USING (operator_id IN (SELECT mina_operator_ids()) OR ar_admin());
ALTER TABLE fakt_tid ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fakt_tid_select ON fakt_tid;
CREATE POLICY fakt_tid_select ON fakt_tid FOR SELECT TO authenticated
  USING (operator_id IN (SELECT mina_operator_ids()) OR ar_admin());
ALTER TABLE fakt_produktion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fakt_produktion_select ON fakt_produktion;
CREATE POLICY fakt_produktion_select ON fakt_produktion FOR SELECT TO authenticated
  USING (operator_id IN (SELECT mina_operator_ids()) OR ar_admin());
ALTER TABLE fakt_avbrott ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fakt_avbrott_select ON fakt_avbrott;
CREATE POLICY fakt_avbrott_select ON fakt_avbrott FOR SELECT TO authenticated
  USING (operator_id IN (SELECT mina_operator_ids()) OR ar_admin());
ALTER TABLE fakt_lass ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fakt_lass_select ON fakt_lass;
CREATE POLICY fakt_lass_select ON fakt_lass FOR SELECT TO authenticated
  USING (operator_id IN (SELECT mina_operator_ids()) OR ar_admin());
ALTER TABLE fakt_kalibrering ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fakt_kalibrering_select ON fakt_kalibrering;
CREATE POLICY fakt_kalibrering_select ON fakt_kalibrering FOR SELECT TO authenticated
  USING (operator_id IN (SELECT mina_operator_ids()) OR ar_admin());
ALTER TABLE fakt_kalibrering_historik ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fakt_kalibrering_historik_select ON fakt_kalibrering_historik;
CREATE POLICY fakt_kalibrering_historik_select ON fakt_kalibrering_historik FOR SELECT TO authenticated
  USING (operator_id IN (SELECT mina_operator_ids()) OR ar_admin());
