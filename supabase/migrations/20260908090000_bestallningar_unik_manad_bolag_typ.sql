-- Dubbelräkningsskydd för helikoptervyn.
--
-- helikopter_oversikt är FROM bestallningar (en rad per beställning) med
-- avverkat/utskotat joinat på (bolag, ar, manad, typ). Två beställningar för
-- samma nyckel skulle ge samma produktion två gånger i summeringen medan
-- "lovat" summeras rätt — en tyst dubbelräkning. Kontroll 2026-09-07 mot prod:
-- 10 rader, inga dubbletter (alla Vida, apr/jun/jul/aug/sep 2026 × två typer).
--
-- Vill man ändra en beställning uppdaterar man volymen (bestallningar-vyn gör
-- det), man lägger inte en till.
ALTER TABLE bestallningar
  ADD CONSTRAINT bestallningar_ar_manad_bolag_typ_unik UNIQUE (ar, manad, bolag, typ);
