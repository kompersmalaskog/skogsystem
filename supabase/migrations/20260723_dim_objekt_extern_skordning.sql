-- Extern skördare — annans maskin avverkar, vi skotar bara. Spegelbild av
-- extern skotning. Boolean-kolumn (symmetri med egen_skotning i schemat),
-- inte JSON. Sätts i redigeringssheeten per objekt; inget objekt flaggas
-- av migrationen. Läses defensivt i koden (extern_skordning === true) så
-- appen tål en DB utan kolumnen.
--
-- Effekt i redigeringsvyn: skördare -> "förväntas ej" (grå, ej gul) i
-- filstatus/prickar, skördningsavslut krävs inte för att objektet ska
-- räknas som klart, och Pågående-villkoret tittar bara på skotningen.

ALTER TABLE dim_objekt
  ADD COLUMN IF NOT EXISTS extern_skordning boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN dim_objekt.extern_skordning IS
  'true = annans maskin avverkar, vi skotar bara (spegelbild av extern skotning). Sätts i redigeringssheeten. Skördare förväntas ej i filstatus, skördningsavslut krävs ej för "klar", Pågående tittar bara på skotningen.';
