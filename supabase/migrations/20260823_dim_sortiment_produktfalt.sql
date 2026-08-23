-- Fyra fält ur ProductDefinition som importen hittills kastat.
--
-- Verifierat mot Ulfsnäs AU 2026 (PONS20SDJAA270231, Opti5G 3.1.12,
-- StanForD 3.6):
--   <ProductGroupName>Kubb</ProductGroupName>
--   <ProductInfo modificationRestricted="false">262-VAL</ProductInfo>
--   <ProductDestination>
--     <BusinessName>Vida Alvesta</BusinessName>
--     <BusinessID>89303</BusinessID>
--   </ProductDestination>
--
-- Idag konkateneras ProductGroupName in i dim_sortiment.namn ("Kubb:
-- Alvesta305_V3") och grupp/destination härleds sedan med ilike-matchning på
-- den strängen. Båda tystnar utan varning när Vida byter namnsättning i
-- prislistan. ProductInfo är Vidas egen produktkod — den känner deras system
-- igen, våra namn gör de inte.
--
-- Massa-sortimenten saknar ProductDestination i filen. Det är förväntat —
-- Vida styr massavedens destination per leverans. NULL, aldrig gissning.

ALTER TABLE dim_sortiment
  ADD COLUMN IF NOT EXISTS produktgrupp     text,
  ADD COLUMN IF NOT EXISTS destination_namn text,
  ADD COLUMN IF NOT EXISTS destination_id   text,
  ADD COLUMN IF NOT EXISTS kundkod          text;

COMMENT ON COLUMN dim_sortiment.produktgrupp     IS 'ProductGroupName rakt ur filen. Förstahandskälla för grupp — dim_sortiment_grupp och namnhärledning är fallback för historiska rader.';
COMMENT ON COLUMN dim_sortiment.destination_namn IS 'ProductDestination/BusinessName. NULL = filen angav ingen (normalt för massaved).';
COMMENT ON COLUMN dim_sortiment.destination_id   IS 'ProductDestination/BusinessID, mottagarens id hos Vida.';
COMMENT ON COLUMN dim_sortiment.kundkod          IS 'ProductInfo — köparens egen produktkod (t.ex. "262-VAL"). Det är den koden deras system känner igen, inte våra namn.';

-- ── Normalisering av filens värden ───────────────────────────────────────
-- Kolumnerna lagrar filens RÅA värde — det är källsanningen och kundkod/
-- destination_id är exakta. Men rå-värdena är inte appens vokabulär.
--
-- Uppmätt över 12 HPR-filer, tre maskiner:
--   ProductGroupName: Massa 54, Energi 26, Kubb 14, Timmer 14,
--                     Unclassified 11, "Tall Timmer" 10
--   BusinessName:     Vida Urshult 17, Vida Alvesta 14, Vida 8,
--                     Vislanda 4, "Vida Vislanda" 3, Skogsvägen 1
--
-- Rakt av skulle "Tall Timmer" bli en egen grupp och falla ur sågbart
-- (som filtrerar på 'Timmer','Kubb'), "Unclassified" bli en grupp köparen
-- ser, och Vislanda splittas på två stavningar. Därför normaliseras värdet
-- vid LÄSNING, inte vid skrivning — filen förblir oförvanskad i kolumnen.
--
-- Okänt värde ger NULL, inte en gissning. Då faller kedjan vidare till nästa
-- led precis som för ett sortiment som aldrig importerats om.
CREATE OR REPLACE FUNCTION normalisera_produktgrupp(p_varde text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_varde IS NULL THEN NULL
    -- Ordningen speglar harled_produktgrupp: kubb före timmer, eftersom
    -- "Klentimmer" innehåller "timmer".
    WHEN lower(p_varde) LIKE '%kubb%'   THEN 'Kubb'
    WHEN lower(p_varde) LIKE '%timmer%' THEN 'Timmer'
    WHEN lower(p_varde) LIKE '%massa%'  THEN 'Massa'
    WHEN lower(p_varde) LIKE '%energi%' THEN 'Energi'
    -- 'Unclassified' m.fl. är inte en grupp. NULL → nästa led i kedjan.
  END;
$$;

CREATE OR REPLACE FUNCTION normalisera_destination(p_varde text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_varde IS NULL THEN NULL
    WHEN lower(p_varde) LIKE '%vislanda%' THEN 'Vislanda'
    WHEN lower(p_varde) LIKE '%urshult%'  THEN 'Urshult'
    WHEN lower(p_varde) LIKE '%alvesta%'  THEN 'Alvesta'
    WHEN lower(p_varde) LIKE '%hästveda%'
      OR lower(p_varde) LIKE '%hastveda%' THEN 'Hästveda'
    -- Bara "Vida" är bolaget, inte ett bruk. "Skogsvägen" är ett avlägg.
    -- Båda ger NULL → destinationen är okänd och ska visas som sådan.
  END;
$$;

COMMENT ON FUNCTION normalisera_produktgrupp(text) IS
  'Filens ProductGroupName till appens grupper. "Tall Timmer"→Timmer, "Unclassified"→NULL. NULL betyder "kunde inte tolkas" och släpper vidare till nästa led i kedjan.';
COMMENT ON FUNCTION normalisera_destination(text) IS
  'Filens BusinessName till bruksnamn. "Vida Vislanda" och "Vislanda" blir samma. Enbart "Vida" är bolaget, inte ett bruk → NULL.';

-- ── Namnhärledning som EGEN funktion ─────────────────────────────────────
-- Fanns bara som engångs-SQL i 20260822_sortiment_grupp_harledning.sql.
-- Nu behövs den som levande sista fallback: historiska sortiment får NULL i
-- produktgrupp tills de importeras om, och ska inte tappa sin grupp under
-- tiden. Ordningen kubb-före-timmer är signifikant ("Klentimmer" innehåller
-- "timmer"; kubb-regeln måste testas först för namn som bär båda).
CREATE OR REPLACE FUNCTION harled_produktgrupp(p_namn text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(p_namn) LIKE '%kubb%'   THEN 'Kubb'
    WHEN lower(p_namn) LIKE '%timmer%' THEN 'Timmer'
    WHEN lower(p_namn) LIKE 'massa%'   THEN 'Massa'
    WHEN lower(p_namn) LIKE 'energi%'  THEN 'Energi'
  END;
$$;

COMMENT ON FUNCTION harled_produktgrupp(text) IS
  'Sista fallback för sortimentgrupp när dim_sortiment.produktgrupp och dim_sortiment_grupp.grupp båda saknas. Speglar 20260822_sortiment_grupp_harledning.sql. NULL = kunde inte härledas, ska visas som "Ej klassad" — aldrig gissas.';

-- ── Läsordning, EN definition ────────────────────────────────────────────
-- Vyer ska aldrig upprepa COALESCE-kedjan. Den bor här:
--   grupp:       produktgrupp -> dim_sortiment_grupp.grupp -> namnhärledning
--   destination: destination_namn -> harled_industri(namn)
--
-- Inget led borttaget. Historisk data blir aldrig sämre än idag — bara
-- bättre för det som importeras framåt.
--
-- Vy, inte scalar-funktion: en funktion per sortiment_id hade blivit ett
-- korrelerat anrop per stockrad (miljontals). Vyn är ~264 rader och joinas
-- en gång.
CREATE OR REPLACE VIEW vy_sortiment_klass
WITH (security_invoker = true) AS
SELECT ds.sortiment_id,
       ds.namn,
       ds.kundkod,
       ds.destination_id,
       COALESCE(normalisera_produktgrupp(ds.produktgrupp), sg.grupp,
                harled_produktgrupp(ds.namn))                            AS grupp,
       COALESCE(normalisera_destination(ds.destination_namn),
                harled_industri(ds.namn))                                AS destination,
       -- Filens råa värden, oförvanskade. Den som ska prata med Vidas system
       -- använder dessa, inte våra normaliserade etiketter.
       ds.produktgrupp     AS produktgrupp_ra,
       ds.destination_namn AS destination_ra,
       -- Vilket led som svarade. Gör det mätbart hur mycket som fortfarande
       -- hänger på namnsträngen, utan att någon behöver gissa.
       CASE WHEN normalisera_produktgrupp(ds.produktgrupp) IS NOT NULL THEN 'fil'
            WHEN sg.grupp IS NOT NULL        THEN 'dim_sortiment_grupp'
            WHEN harled_produktgrupp(ds.namn) IS NOT NULL THEN 'namn'
       END AS grupp_kalla,
       CASE WHEN normalisera_destination(ds.destination_namn) IS NOT NULL THEN 'fil'
            WHEN harled_industri(ds.namn) IS NOT NULL THEN 'namn'
       END AS destination_kalla
FROM dim_sortiment ds
LEFT JOIN dim_sortiment_grupp sg ON sg.sortiment_id = ds.sortiment_id;

COMMENT ON VIEW vy_sortiment_klass IS
  'Sortimentets grupp och mottagande industri med full fallback-kedja. Läs HÄRIFRÅN — upprepa aldrig COALESCE-kedjan i en vy. grupp_kalla/destination_kalla säger vilket led som svarade.';
