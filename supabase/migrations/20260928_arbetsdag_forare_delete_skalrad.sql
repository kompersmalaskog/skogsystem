-- KÖRS AV MARTIN mot prod. Idempotent.
--
-- Föraren får ta bort sin egen TOMMA SKALRAD i arbetsdag: raden utan klockslag
-- och utan maskin som skapas av en perioddags första period (#592). Raderas
-- sista perioden ska raden med — annars står en tom (ibland bekräftad) dag
-- kvar som inte går att göra något med (Martin 2026-09-28, tre rader fick
-- raderas i databasen). Admin-policyn arbetsdag_admin_delete finns kvar;
-- policyer OR:as.
--
-- Villkoren speglar appens skalradTom (Arbetsrapport.tsx): inga klockslag,
-- ingen maskin. En rad med km eller traktamente är inte tom — appen raderar
-- den aldrig, men policyn låter bli att vara smartare än så: klockslag och
-- maskin är det som gör raden till en MASKINDAG, och en maskindag får en
-- förare aldrig radera (MOM-synken äger den).
--
-- Innan policyn är körd träffar appens delete 0 rader (verifierat sparande)
-- och faller tillbaka på att nolla bekräftelsen — dagen blir aldrig låst,
-- men raden ligger kvar.

DROP POLICY IF EXISTS arbetsdag_forare_delete_skalrad ON arbetsdag;
CREATE POLICY arbetsdag_forare_delete_skalrad ON arbetsdag FOR DELETE TO authenticated
  USING (
    medarbetare_id = aktuell_medarbetare_id()
    AND start_tid IS NULL
    AND slut_tid IS NULL
    AND maskin_id IS NULL
  );

-- Verifiering:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'arbetsdag' AND cmd = 'DELETE';
-- → arbetsdag_admin_delete (ar_admin()) + arbetsdag_forare_delete_skalrad
