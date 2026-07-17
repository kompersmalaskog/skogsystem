-- Förare får radera sina EGNA extra_tid-poster (M+L-beslut 2026-07-17).
-- Det är förarens egen data, precis som arbetsdagar. Tidigare var DELETE
-- admin-only (extra_tid_admin_delete från 20260524125051), vilket gjorde
-- felinmatade poster (t.ex. 0-minutersposter från start+stopp direkt)
-- permanent olåsta — de kunde varken ändras eller tas bort av föraren.
--
-- Samma predikat som tabellens select/update/insert-policyer:
-- egen rad via aktuell_medarbetare_id(), admin ser/gör allt via ar_admin().

DROP POLICY IF EXISTS extra_tid_admin_delete ON extra_tid;
DROP POLICY IF EXISTS extra_tid_delete ON extra_tid;

CREATE POLICY extra_tid_delete ON extra_tid FOR DELETE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_admin());
