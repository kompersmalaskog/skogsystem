DO $$
DECLARE
  t text;
  uppslagstabeller text[] := ARRAY[
    'dim_destination','dim_maskin','dim_objekt','dim_operator','dim_sortiment',
    'dim_sortiment_grupp','dim_sortiment_pris','dim_tradslag',
    'acord_flyttkostnad','acord_ovrigt','acord_priser','acord_skotningsavstand',
    'acord_sortiment_tillagg','acord_terrang','acord_traktstorlek',
    'kalibrering_diameter','kalibrering_kontroll_regler','kalibrering_kontroller','kalibrering_langd',
    'detalj_gps_spar','detalj_kontroll_stock','detalj_stam','detalj_stock',
    'fakt_lass_sortiment','fakt_maskin_statistik','fakt_skotning_status','fakt_sortiment',
    'fpr_filer','fpr_lass','gps_position','hpr_filer','hpr_stammar',
    'maskin_logg','maskin_position','mom_tider','skotning_uttag',
    'arbetsdag_objekt','atk_val','route_cache','meta_importerade_filer'
  ];
BEGIN
  FOREACH t IN ARRAY uppslagstabeller LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_admin_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (ar_admin()) WITH CHECK (ar_admin())', t||'_admin_write', t);
  END LOOP;
END $$;
