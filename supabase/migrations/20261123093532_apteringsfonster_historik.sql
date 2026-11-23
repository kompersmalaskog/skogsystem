-- Historik över apteringsfönstrets ändringar (FONSTER_BYTTE blir en vanlig händelse).
--
-- Bakgrund: importen vägrade skriva ett fönster som skilde sig från det som stod i
-- dim_objekt_sortiment_fonster och larmade i import_fel på varje timfil.
-- Gallring Santhe (11287866 / R64428_865): filerna säger langd_max 315, tabellen 330 —
-- 17 larm på tre dagar, och tabellen stod kvar på ett värde som maskinen slutat använda.
--
-- Ny regel (Martin 2026-11-22): maskinens fil gäller. Ändras ett fönster skriver importen
-- det nya värdet och sparar det gamla här (vad, från, till, fil, tid). Bytet loggas som
-- INFO. Bara om samma fönster hoppar fram och tillbaka larmar importen (felkod
-- FONSTER_FLIPFLOP i import_fel).
--
-- Importen skriver bara det nya fönstret om historikraden gick att skriva först; saknas
-- tabellen (migrationen ej körd) gäller den gamla regeln och bytet larmas som förut.

CREATE TABLE IF NOT EXISTS dim_objekt_sortiment_fonster_historik (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  objekt_id    text        NOT NULL,
  sortiment_id text        NOT NULL,
  falt         text        NOT NULL,
  fran_varde   text,
  till_varde   text,
  filnamn      text,
  tid          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dim_objekt_sortiment_fonster_historik IS
  'Varje ändring av ett apteringsfönster i dim_objekt_sortiment_fonster: vilket fält, gammalt och nytt värde (som text), filen som gav det nya värdet och när. Skrivs av importen innan fönstret byts.';
COMMENT ON COLUMN dim_objekt_sortiment_fonster_historik.fran_varde IS
  'Värdet som stod i tabellen före bytet (NULL = fältet var tomt).';

CREATE INDEX IF NOT EXISTS dim_objekt_sortiment_fonster_historik_nyckel
  ON dim_objekt_sortiment_fonster_historik (objekt_id, sortiment_id, falt, tid DESC);

ALTER TABLE dim_objekt_sortiment_fonster_historik ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dim_objekt_sortiment_fonster_historik_select ON dim_objekt_sortiment_fonster_historik;
CREATE POLICY dim_objekt_sortiment_fonster_historik_select ON dim_objekt_sortiment_fonster_historik
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS dim_objekt_sortiment_fonster_historik_admin_write ON dim_objekt_sortiment_fonster_historik;
CREATE POLICY dim_objekt_sortiment_fonster_historik_admin_write ON dim_objekt_sortiment_fonster_historik
  FOR ALL TO authenticated USING (ar_admin());
REVOKE ALL ON dim_objekt_sortiment_fonster_historik FROM anon;
