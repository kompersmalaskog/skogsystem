DROP POLICY IF EXISTS temp_all ON medarbetare;
DROP POLICY IF EXISTS medarbetare_select ON medarbetare;
CREATE POLICY medarbetare_select ON medarbetare FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR ar_admin());
DROP POLICY IF EXISTS medarbetare_update ON medarbetare;
CREATE POLICY medarbetare_update ON medarbetare FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR ar_admin())
  WITH CHECK (user_id = auth.uid() OR ar_admin());
DROP POLICY IF EXISTS medarbetare_admin_insert ON medarbetare;
CREATE POLICY medarbetare_admin_insert ON medarbetare FOR INSERT TO authenticated
  WITH CHECK (ar_admin());
DROP POLICY IF EXISTS medarbetare_admin_delete ON medarbetare;
CREATE POLICY medarbetare_admin_delete ON medarbetare FOR DELETE TO authenticated
  USING (ar_admin());
DROP POLICY IF EXISTS "Allow anon read" ON operator_medarbetare;
DROP POLICY IF EXISTS "Allow anon insert" ON operator_medarbetare;
DROP POLICY IF EXISTS operator_medarbetare_select ON operator_medarbetare;
CREATE POLICY operator_medarbetare_select ON operator_medarbetare FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS operator_medarbetare_admin_write ON operator_medarbetare;
CREATE POLICY operator_medarbetare_admin_write ON operator_medarbetare FOR ALL TO authenticated
  USING (ar_admin()) WITH CHECK (ar_admin());
