-- Steg 5: namnkälla för Schema-vyn (delad lagöversikt).
-- medarbetare-RLS:en låter bara admin läsa andras rader — Schema behöver
-- allas FÖRNAMN, inget mer. Vyn körs med ägarens rättigheter (security
-- definer-semantik, medvetet) och exponerar BARA id + förnamn för aktiva
-- medarbetare. Inget efternamn, ingen epost, inga lönefält.
CREATE VIEW medarbetare_namn AS
SELECT id, split_part(namn, ' ', 1) AS fornamn
FROM medarbetare
WHERE aktiv;

COMMENT ON VIEW medarbetare_namn IS
  'Förnamn för aktiva medarbetare — den enda medarbetardata alla inloggade får läsa (Schema-vyn).';

REVOKE ALL ON medarbetare_namn FROM PUBLIC, anon, authenticated;
GRANT SELECT ON medarbetare_namn TO authenticated;
