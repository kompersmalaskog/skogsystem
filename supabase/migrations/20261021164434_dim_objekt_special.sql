-- Special-flagga på objekt (Martin 2026-10-21).
--
-- Vissa objekt är inte jämförbara med vanliga (vindfällor, stormskadat): produktiviteten säger inget om
-- maskinen. Flaggan markerar dem så de kan uteslutas ur FRAMTIDA prestandajämförelser. DEN HÄR MIGRATIONEN OCH
-- PR:EN ÄNDRAR INGEN BERÄKNING — bara lagring, admin-redigering och en badge i maskinvyn.
--
-- Skild från `exkludera` ("Exkludera från statistik"): exkludera döljer ett objekt helt (flyttobjekt, tester,
-- ignorerade), special betyder "objektet är med och syns, men räknas inte som jämförelsematerial".
-- Skild från `atgard = 'Special'` (en åtgärdstyp på ett enskilt objekt): flaggan är ortogonal mot typ och åtgärd —
-- ett vindfälle kan vara slutavverkning.
--
-- Importen skickar aldrig `special`/`special_skal` (skrivpolicyn: bara fält importen äger), så en människas val
-- skrivs aldrig över. Redigering skriver båda fälten till HELA VO-gruppen (skördare + skotare), som övriga
-- gemensamma fält.

ALTER TABLE public.dim_objekt
  ADD COLUMN IF NOT EXISTS special boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_skal text;

-- Ett skäl utan flagga får inte ligga kvar (att slå av flaggan nollar skälet).
DO $$
BEGIN
  ALTER TABLE public.dim_objekt
    ADD CONSTRAINT dim_objekt_special_skal_kraver_special CHECK (special OR special_skal IS NULL);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

COMMENT ON COLUMN public.dim_objekt.special IS
  'Special-objekt (t.ex. vindfällor, stormskadat): visas med en badge i maskinvyn och ska kunna uteslutas ur framtida prestandajämförelser. Påverkar ingen beräkning idag. Skild från exkludera.';
COMMENT ON COLUMN public.dim_objekt.special_skal IS
  'Fritextskäl till special. NULL när special är false (CHECK).';
