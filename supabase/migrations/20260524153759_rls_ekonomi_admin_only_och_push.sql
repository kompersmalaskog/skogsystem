ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_egen ON push_subscriptions;
CREATE POLICY push_subscriptions_egen ON push_subscriptions FOR ALL TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
DO $$
DECLARE
  t text;
  ekonomi text[] := ARRAY[
    'avtal','avtal_pamin_skickad','bestallningar','bestallningar_historik','bolag',
    'ekonomi_rad_override','fordon','fordon_pamin_skickad',
    'fortnox_export_logg','fortnox_invoice_rows','fortnox_sync_state','fortnox_voucher_rows',
    'gs_avtal','inkopare','lonesystem_artikelmappning','lonesystem_koppling',
    'maskin_kostnadsstalle','maskin_timpris','notis_kö',
    'objekt','objekt_ekonomi','objekt_priser','objekt_prisscenario'
  ];
BEGIN
  FOREACH t IN ARRAY ekonomi LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_admin', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (ar_admin()) WITH CHECK (ar_admin())', t||'_admin', t);
  END LOOP;
END $$;
