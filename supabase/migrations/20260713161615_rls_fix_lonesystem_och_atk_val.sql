-- FIX: medarbetare_lonesystem var admin-only → låste ute förare från sitt EGET
-- semestersaldo (Saldon-fliken fastnade i "Hämtar saldo..." för evigt).
-- Och atk_val hade SELECT USING(true) → alla såg allas val (för öppet).
-- Rätt modell (samma som arbetsdag/vilobrott): förare ser sitt eget, admin ser allt.

DROP POLICY IF EXISTS medarbetare_lonesystem_admin ON medarbetare_lonesystem;
DROP POLICY IF EXISTS medarbetare_lonesystem_select ON medarbetare_lonesystem;
CREATE POLICY medarbetare_lonesystem_select ON medarbetare_lonesystem FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS medarbetare_lonesystem_admin_write ON medarbetare_lonesystem;
CREATE POLICY medarbetare_lonesystem_admin_write ON medarbetare_lonesystem FOR ALL TO authenticated
  USING (ar_admin()) WITH CHECK (ar_admin());

DROP POLICY IF EXISTS atk_val_select ON atk_val;
CREATE POLICY atk_val_select ON atk_val FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS atk_val_admin_write ON atk_val;
DROP POLICY IF EXISTS atk_val_insert ON atk_val;
CREATE POLICY atk_val_insert ON atk_val FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS atk_val_update ON atk_val;
CREATE POLICY atk_val_update ON atk_val FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS atk_val_admin_delete ON atk_val;
CREATE POLICY atk_val_admin_delete ON atk_val FOR DELETE TO authenticated
  USING (ar_admin());
