-- bestallningar: alla inloggade får LÄSA, bara admin skriver, anon inget.
--
-- Mätt 2026-09-07: tabellen svarade med data för anon-nyckeln utan session,
-- så admin-only-policyn från 20260524153759 är i praktiken inte aktiv (RLS av,
-- eller policyn saknas). Förare ska se månadens beställning på /helikopter
-- (Läge-fliken) — därför SELECT för authenticated. Skrivning fortsatt admin.
-- Körs FÖRE security_invoker på helikopter-vyerna (de läser då som anroparen).

ALTER TABLE bestallningar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bestallningar_las_inloggade ON bestallningar;
CREATE POLICY bestallningar_las_inloggade ON bestallningar
  FOR SELECT TO authenticated USING (true);

-- Skrivning: admin (samma innebörd som 20260524153759, skapas om ifall den saknas).
DROP POLICY IF EXISTS bestallningar_admin ON bestallningar;
CREATE POLICY bestallningar_admin ON bestallningar
  FOR ALL TO authenticated USING (ar_admin()) WITH CHECK (ar_admin());

-- anon: ingen policy. Ta även bort grants så svaret blir "nekad", inte en tom lista.
REVOKE ALL ON bestallningar FROM anon;
