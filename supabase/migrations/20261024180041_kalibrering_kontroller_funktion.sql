-- kalibrering_kontroller(): de kontroller som ÄR kontroller (2026-10-24).
--
-- En kontroll (en rad i fakt_kalibrering, en HQC-fil) räknas bara om den har minst en EGEN stock i
-- detalj_kontroll_stock. En fil vars stockar alla redan låg i en tidigare ackumulerande fil är en
-- omexport, inte en kontroll (efter rensningen på fysisk identitet: 59 av 333). Raden finns kvar i
-- fakt_kalibrering — den raderas aldrig — men Kontroller och kalendern läser kontrollerna HÄRIFRÅN.
--
-- En funktion och inte en vy: `returns setof fakt_kalibrering` följer tabellens kolumner när de
-- ändras (en vy med k.* fryser kolumnlistan vid skapandet, och väder- och historikkolumner har
-- lagts till efterhand). SECURITY INVOKER (standard): anroparens RLS gäller, och båda tabellerna är
-- läsbara för alla inloggade.
--
-- Anropas från webbläsaren och servern med supabase.rpc('kalibrering_kontroller') och går att
-- filtrera, sortera och paginera som en tabell.
CREATE OR REPLACE FUNCTION kalibrering_kontroller()
RETURNS SETOF fakt_kalibrering
LANGUAGE sql
STABLE
AS $$
  SELECT k.*
    FROM fakt_kalibrering k
   WHERE EXISTS (
     SELECT 1
       FROM detalj_kontroll_stock s
      WHERE s.filnamn = k.filnamn
        AND s.maskin_id = k.maskin_id
   );
$$;
