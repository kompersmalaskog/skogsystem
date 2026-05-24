ALTER TABLE medarbetare_certifikat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medarbetare_certifikat_select ON medarbetare_certifikat;
CREATE POLICY medarbetare_certifikat_select ON medarbetare_certifikat FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DROP POLICY IF EXISTS medarbetare_certifikat_admin_write ON medarbetare_certifikat;
CREATE POLICY medarbetare_certifikat_admin_write ON medarbetare_certifikat FOR ALL TO authenticated
  USING (ar_admin()) WITH CHECK (ar_admin());
ALTER TABLE medarbetare_lonesystem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medarbetare_lonesystem_admin ON medarbetare_lonesystem;
CREATE POLICY medarbetare_lonesystem_admin ON medarbetare_lonesystem FOR ALL TO authenticated
  USING (ar_admin()) WITH CHECK (ar_admin());
ALTER TABLE ledighet_ansokningar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledighet_ansokningar_admin ON ledighet_ansokningar;
CREATE POLICY ledighet_ansokningar_admin ON ledighet_ansokningar FOR ALL TO authenticated
  USING (ar_admin()) WITH CHECK (ar_admin());
