-- Steg 3: Saldon — rullande, per medarbetare, LAGRAT och visat.
-- Princip: appen beräknar ALDRIG saldot ur ledighet_ansokningar (skulle ge
-- dubbelräkning när Fortnox kopplas som sanningskälla). Saldot är
-- auktoritativt: sätts manuellt av admin nu, av Fortnox-synk senare.
-- Ingen decrement-logik vid godkännande — arbetsdagsräkning i vyn gäller
-- bara hur en ansöknings LÄNGD visas, inte saldomatte.

CREATE TABLE medarbetare_saldo (
  medarbetare_id uuid PRIMARY KEY REFERENCES medarbetare(id),
  semester_dagar_kvar numeric,          -- rullande, i dagar (NULL = okänt)
  atk_timmar_kvar numeric,              -- rullande, i TIMMAR (NULL = "Kopplas via Fortnox")
  kalla text NOT NULL DEFAULT 'manuell' CHECK (kalla IN ('manuell', 'fortnox')),
  uppdaterad_at timestamptz NOT NULL DEFAULT now(),
  uppdaterad_av uuid REFERENCES medarbetare(id)
);

-- uppdaterad_at ska spegla senaste ändring utan att varje skrivväg måste
-- komma ihåg att sätta den (admin-UI nu, Fortnox-synk senare).
CREATE OR REPLACE FUNCTION public.medarbetare_saldo_stampla()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.uppdaterad_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER medarbetare_saldo_uppdaterad
  BEFORE UPDATE ON medarbetare_saldo
  FOR EACH ROW EXECUTE FUNCTION medarbetare_saldo_stampla();

-- Seeda en rad per AKTIV medarbetare med NULL i båda saldofälten —
-- okänt tills admin fyller i / Fortnox synkar. INGA påhittade startvärden.
INSERT INTO medarbetare_saldo (medarbetare_id)
SELECT id FROM medarbetare WHERE aktiv;

-- Spärr: seedningen ska träffa exakt alla aktiva (6 st 2026-07-16).
DO $$
DECLARE seedade int; aktiva int;
BEGIN
  SELECT count(*) INTO seedade FROM medarbetare_saldo;
  SELECT count(*) INTO aktiva FROM medarbetare WHERE aktiv;
  IF seedade <> aktiva THEN
    RAISE EXCEPTION 'Seedning stämmer inte: % saldo-rader, % aktiva medarbetare', seedade, aktiva;
  END IF;
END $$;

-- RLS: saldot är privat. Egen rad eller godkännare läser; bara godkännare
-- skriver (admin manuellt nu, service-role för Fortnox senare — service-role
-- går förbi RLS och behöver ingen egen policy).
ALTER TABLE medarbetare_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY saldo_select_egen_eller_godkannare ON medarbetare_saldo
  FOR SELECT TO authenticated
  USING (medarbetare_id = aktuell_medarbetare_id() OR ar_godkannare());

CREATE POLICY saldo_skriv_godkannare ON medarbetare_saldo
  FOR ALL TO authenticated
  USING (ar_godkannare()) WITH CHECK (ar_godkannare());
