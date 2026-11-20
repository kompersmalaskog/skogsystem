-- fakt_lass: förare får skriva MANUELLA lass för sin egen maskin. 2026-09-24.
--
-- LÄGET FÖRE (verifierat i repo + prod 2026-09-24): RLS är på (20260524153100). Enda
-- policyn är fakt_lass_select FOR SELECT TO authenticated USING (true) (20260804) —
-- alla inloggade läser allt. Ingen INSERT/UPDATE/DELETE-policy finns → ingen förare
-- kan skriva; importen skriver via service_role (kringgår RLS). anon får inget
-- (200 + 0 rader). Det ändras inte här: läsningen är oförändrad, importen oförändrad.
--
-- NYTT: två policies för rader med filnamn = 'manuell' på maskiner med
-- dim_maskin.datakalla = 'manuell':
--   * föraren (medarbetare.maskin_id = raden.maskin_id): datum inom de senaste 7 dagarna
--     (t.o.m. i morgon för nattskift över UTC-midnatt);
--   * admin (ar_admin()): alla datum.
-- Rader med annat filnamn (maskinfiler) kan fortfarande aldrig skrivas eller raderas
-- från appen. Ingen UPDATE-policy: appen ersätter dagens manuella rader (delete + insert).
--
-- OBS för JD810E: ingen medarbetare har maskin_id = 'JD810E' i prod 2026-09-24 — sätt
-- förarens maskin i /admin → Medarbetare, annars kan hon inte spara (bara admin kan).

-- Egen maskin ur medarbetare-raden, samma mönster som aktuell_medarbetare_id().
CREATE OR REPLACE FUNCTION public.min_maskin_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT maskin_id FROM medarbetare WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.maskin_har_manuell_datakalla(p_maskin_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM dim_maskin WHERE maskin_id = p_maskin_id AND datakalla = 'manuell');
$$;

DROP POLICY IF EXISTS fakt_lass_manuell_insert ON public.fakt_lass;
CREATE POLICY fakt_lass_manuell_insert ON public.fakt_lass
  FOR INSERT TO authenticated
  WITH CHECK (
    filnamn = 'manuell'
    AND maskin_har_manuell_datakalla(maskin_id)
    AND (
      ar_admin()
      OR (maskin_id = min_maskin_id()
          AND datum >= CURRENT_DATE - 7
          AND datum <= CURRENT_DATE + 1)
    )
  );

DROP POLICY IF EXISTS fakt_lass_manuell_delete ON public.fakt_lass;
CREATE POLICY fakt_lass_manuell_delete ON public.fakt_lass
  FOR DELETE TO authenticated
  USING (
    filnamn = 'manuell'
    AND maskin_har_manuell_datakalla(maskin_id)
    AND (
      ar_admin()
      OR (maskin_id = min_maskin_id()
          AND datum >= CURRENT_DATE - 7
          AND datum <= CURRENT_DATE + 1)
    )
  );

GRANT INSERT, DELETE ON public.fakt_lass TO authenticated;
