-- KÖRS AV MARTIN mot prod. RLS-policyer för arbetsdag_segment.
-- Utan dessa når föraren inte tabellen alls (RLS är påslaget men tomt).
-- Ägarskap-only, samma mönster som arbetsdag: förare ser/skapar/ändrar/RADERAR
-- sina EGNA rader, admin allt. (aktuell_medarbetare_id() + ar_admin() finns redan.)
-- Idempotent via DROP POLICY IF EXISTS.

DROP POLICY IF EXISTS seg_select ON arbetsdag_segment;
CREATE POLICY seg_select ON arbetsdag_segment FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());

DROP POLICY IF EXISTS seg_insert ON arbetsdag_segment;
CREATE POLICY seg_insert ON arbetsdag_segment FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());

DROP POLICY IF EXISTS seg_update ON arbetsdag_segment;
CREATE POLICY seg_update ON arbetsdag_segment FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin())
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());

DROP POLICY IF EXISTS seg_delete ON arbetsdag_segment;
CREATE POLICY seg_delete ON arbetsdag_segment FOR DELETE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
