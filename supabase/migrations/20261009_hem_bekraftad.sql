-- KÖRS MOT PROD FÖRE KODEN (appen väljer och skriver kolumnen). Idempotent.
--
-- HEMPUNKTEN BEKRÄFTAS PÅ KARTAN. En geokodad punkt kan vara byns mittpunkt (Kompersmåla Gård 362 96 gav
-- 56.38333, 14.78333: ca 1 km från gården, mitt i skogen, sparad som 'klar'). Admin ser nu punkten på en karta och trycker
-- "Stämmer" eller flyttar den. hem_bekraftad_tid är stämpeln på "Stämmer"; en punkt med hem_koord_kalla = 'geokod' och
-- ingen stämpel är OBEKRÄFTAD och visas i Admin → Översikt. En punkt som en människa satt (manuell, gps) är redan vald och
-- behöver ingen stämpel. Befintliga rader (alla 'manuell') berörs inte.
--
-- Triggern hemadress_andrad nollar stämpeln när den nollar den geokodade punkten (adressen ändrades: den bekräftade
-- punkten hörde till den gamla adressen). Funktionen är i övrigt identisk med den som ligger i prod.

ALTER TABLE public.medarbetare ADD COLUMN IF NOT EXISTS hem_bekraftad_tid timestamptz;

COMMENT ON COLUMN public.medarbetare.hem_bekraftad_tid IS
  'När admin tryckte Stämmer på hempunktskartan. NULL + hem_koord_kalla = geokod = obekräftad punkt. '
  'manuell/gps behöver ingen stämpel: en människa har redan valt punkten.';

CREATE OR REPLACE FUNCTION public.hemadress_andrad()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR new.hemadress IS DISTINCT FROM old.hemadress THEN
    new.hem_geokod_etikett := NULL;
    new.hem_geokod_precision := NULL;
    new.hem_geokod_lat := NULL;
    new.hem_geokod_lng := NULL;
    new.hem_geokod_tid := NULL;
    IF coalesce(trim(new.hemadress), '') = '' THEN
      new.hem_geokod_status := NULL;
    ELSE
      new.hem_geokod_status := 'vantar';
    END IF;
    IF new.hem_koord_kalla = 'geokod' THEN
      new.hem_lat := NULL;
      new.hem_lng := NULL;
      new.hem_koord_kalla := NULL;
      new.hem_bekraftad_tid := NULL;
    END IF;
  END IF;
  RETURN new;
END
$function$;

-- Verifiering:
-- SELECT namn, hem_koord_kalla, hem_bekraftad_tid FROM medarbetare ORDER BY namn;
-- Förväntat: alla sju 'manuell', stämpel NULL (manuell behöver ingen).
