-- Ledighet: självbetjäning istället för admin-only.
-- Grundfelet: RLS-policyn ledighet_ansokningar_admin (ar_admin(), ALL) gjorde
-- vyn tom och skrivskyddad för alla utom admin — utan felmeddelande.
-- Ny modell: alla inloggade läser allt (delad kalender), egna rader får
-- skapas/ändras/tas bort bara medan status='väntar', godkännare (chef/admin)
-- hanterar status på alla rader.

-- 1) Identitetskolumn — koppla ansökan till medarbetare (auth-baserat ägarskap)
ALTER TABLE ledighet_ansokningar
  ADD COLUMN IF NOT EXISTS medarbetare_id uuid REFERENCES medarbetare(id);

-- 2) Backfill: förnamn → medarbetare.
-- Spärr 1: samma förnamn får inte matcha flera medarbetare (annars fel rad tyst).
DO $$
DECLARE dubblett text;
BEGIN
  SELECT la.anvandare_id INTO dubblett
  FROM (SELECT DISTINCT anvandare_id FROM ledighet_ansokningar WHERE medarbetare_id IS NULL) la
  JOIN medarbetare m ON split_part(m.namn, ' ', 1) = la.anvandare_id
  GROUP BY la.anvandare_id
  HAVING count(*) > 1
  LIMIT 1;
  IF dubblett IS NOT NULL THEN
    RAISE EXCEPTION 'Backfill avbruten: förnamnet "%" matchar flera medarbetare — mappa manuellt', dubblett;
  END IF;
END $$;

UPDATE ledighet_ansokningar la
SET medarbetare_id = m.id
FROM medarbetare m
WHERE la.medarbetare_id IS NULL
  AND split_part(m.namn, ' ', 1) = la.anvandare_id;

-- Spärr 2: inga omatchade rader får bli kvar (hellre avbrott än tyst NULL).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ledighet_ansokningar WHERE medarbetare_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill avbruten: omatchade rader kvar i ledighet_ansokningar';
  END IF;
END $$;

ALTER TABLE ledighet_ansokningar ALTER COLUMN medarbetare_id SET NOT NULL;

-- 3) Godkännare = chef eller admin
CREATE OR REPLACE FUNCTION public.ar_godkannare()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM medarbetare
    WHERE user_id = auth.uid() AND roll IN ('chef', 'admin')
  );
$$;

-- 4) Policies: ersätt admin-only med självbetjäning
DROP POLICY IF EXISTS ledighet_ansokningar_admin ON ledighet_ansokningar;

-- Alla inloggade läser allt (delad kalender)
CREATE POLICY ledighet_select_alla ON ledighet_ansokningar
  FOR SELECT TO authenticated USING (true);

-- Egen ansökan: skapa — alltid som 'väntar' (ingen självgodkänning via insert)
CREATE POLICY ledighet_insert_egen ON ledighet_ansokningar
  FOR INSERT TO authenticated
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() AND status = 'väntar');

-- Egen ansökan: ändra/ta bort — bara medan den väntar.
-- Godkänd ledighet ändras via godkännare, inte i smyg av den anställde.
CREATE POLICY ledighet_update_egen ON ledighet_ansokningar
  FOR UPDATE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() AND status = 'väntar')
  WITH CHECK (medarbetare_id = aktuell_medarbetare_id() AND status = 'väntar');

CREATE POLICY ledighet_delete_egen ON ledighet_ansokningar
  FOR DELETE TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() AND status = 'väntar');

-- Godkännare: uppdatera alla rader (godkänn/neka; kolumnspärren "bara status"
-- sitter i UI:t, medvetet beslut för ett lag på sex) + ta bort (avbokning).
CREATE POLICY ledighet_update_godkannare ON ledighet_ansokningar
  FOR UPDATE TO authenticated
  USING (ar_godkannare()) WITH CHECK (ar_godkannare());

CREATE POLICY ledighet_delete_godkannare ON ledighet_ansokningar
  FOR DELETE TO authenticated
  USING (ar_godkannare());
