-- vilobrott (uuid)
DROP POLICY IF EXISTS vilobrott_all ON vilobrott;
DROP POLICY IF EXISTS vilobrott_select ON vilobrott;
CREATE POLICY vilobrott_select ON vilobrott FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS vilobrott_update ON vilobrott;
CREATE POLICY vilobrott_update ON vilobrott FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS vilobrott_insert ON vilobrott;
CREATE POLICY vilobrott_insert ON vilobrott FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS vilobrott_admin_delete ON vilobrott;
CREATE POLICY vilobrott_admin_delete ON vilobrott FOR DELETE TO authenticated
  USING (ar_admin());
-- franvaro (uuid)
DROP POLICY IF EXISTS temp_all ON franvaro;
DROP POLICY IF EXISTS franvaro_select ON franvaro;
CREATE POLICY franvaro_select ON franvaro FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS franvaro_update ON franvaro;
CREATE POLICY franvaro_update ON franvaro FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS franvaro_insert ON franvaro;
CREATE POLICY franvaro_insert ON franvaro FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS franvaro_admin_delete ON franvaro;
CREATE POLICY franvaro_admin_delete ON franvaro FOR DELETE TO authenticated
  USING (ar_admin());
-- extra_tid (uuid)
DROP POLICY IF EXISTS temp_all ON extra_tid;
DROP POLICY IF EXISTS extra_tid_select ON extra_tid;
CREATE POLICY extra_tid_select ON extra_tid FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS extra_tid_update ON extra_tid;
CREATE POLICY extra_tid_update ON extra_tid FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS extra_tid_insert ON extra_tid;
CREATE POLICY extra_tid_insert ON extra_tid FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS extra_tid_admin_delete ON extra_tid;
CREATE POLICY extra_tid_admin_delete ON extra_tid FOR DELETE TO authenticated
  USING (ar_admin());
-- fakt_timmar (uuid)
DROP POLICY IF EXISTS temp_all ON fakt_timmar;
DROP POLICY IF EXISTS fakt_timmar_select ON fakt_timmar;
CREATE POLICY fakt_timmar_select ON fakt_timmar FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS fakt_timmar_update ON fakt_timmar;
CREATE POLICY fakt_timmar_update ON fakt_timmar FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS fakt_timmar_insert ON fakt_timmar;
CREATE POLICY fakt_timmar_insert ON fakt_timmar FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS fakt_timmar_admin_delete ON fakt_timmar;
CREATE POLICY fakt_timmar_admin_delete ON fakt_timmar FOR DELETE TO authenticated
  USING (ar_admin());
-- loneunderlag (TEXT — kräver ::text-cast)
DROP POLICY IF EXISTS temp_all ON loneunderlag;
DROP POLICY IF EXISTS loneunderlag_select ON loneunderlag;
CREATE POLICY loneunderlag_select ON loneunderlag FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id()::text OR ar_admin());
DROP POLICY IF EXISTS loneunderlag_update ON loneunderlag;
CREATE POLICY loneunderlag_update ON loneunderlag FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id()::text OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id()::text OR ar_admin());
DROP POLICY IF EXISTS loneunderlag_insert ON loneunderlag;
CREATE POLICY loneunderlag_insert ON loneunderlag FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id()::text OR ar_admin());
DROP POLICY IF EXISTS loneunderlag_admin_delete ON loneunderlag;
CREATE POLICY loneunderlag_admin_delete ON loneunderlag FOR DELETE TO authenticated
  USING (ar_admin());
