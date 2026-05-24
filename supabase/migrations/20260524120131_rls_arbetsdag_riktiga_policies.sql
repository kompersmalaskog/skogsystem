DROP POLICY IF EXISTS temp_all ON arbetsdag;
DROP POLICY IF EXISTS arbetsdag_forare_select ON arbetsdag;
CREATE POLICY arbetsdag_forare_select ON arbetsdag FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS arbetsdag_forare_update ON arbetsdag;
CREATE POLICY arbetsdag_forare_update ON arbetsdag FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS arbetsdag_forare_insert ON arbetsdag;
CREATE POLICY arbetsdag_forare_insert ON arbetsdag FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS arbetsdag_admin_delete ON arbetsdag;
CREATE POLICY arbetsdag_admin_delete ON arbetsdag FOR DELETE TO authenticated
  USING (ar_admin());
