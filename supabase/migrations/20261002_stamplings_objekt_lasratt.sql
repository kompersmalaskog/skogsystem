-- Läsrätt på stamplings_objekt för inloggade — så att /affarsuppfoljning/medelstam kan räkna in röta.
--
-- stamplings_objekt har RLS påslaget men ingen policy och ingen GRANT till authenticated
-- (20261002_stamplingsmodell.sql öppnade bara stamplings_klass och stamplings_meta). Ett
-- inloggat anrop får därför "permission denied" och ingen rad. Det spelade ingen roll för
-- stämplingsvyn, som bara läser den färdiga modellen — men medelstamsvyn flyttar fönstrets
-- tal från fönstrets egen rötaandel till den valda, och det kräver varje objekts rot20.
--
-- Innehållet är det som redan är läsbart i utfall_objekt, plus en rad per objekt:
--   objekt_id, slutavverkning, stock-/stamantal, stammar20 (stammar ≥ 20 cm) och rot20.
-- Inget bolag, ingen markägare, inga belopp. Samma form som stamplings_klass_las.
--
-- Bara läsning. Ingen skrivrätt, ingen funktion, inget security definer. stamplings_cell
-- (en rad per objekt × slag × klass) lämnas stängd — ingen vy läser den.
--
-- Utan den här migrationen fungerar sidan ändå: den ser att rot20 inte går att läsa,
-- tar inte med någon rötakontroll och säger på skärmen att talen är fönstrets rena snitt.

DROP POLICY IF EXISTS stamplings_objekt_las ON stamplings_objekt;
CREATE POLICY stamplings_objekt_las ON stamplings_objekt FOR SELECT TO authenticated USING (true);
GRANT SELECT ON stamplings_objekt TO authenticated;
