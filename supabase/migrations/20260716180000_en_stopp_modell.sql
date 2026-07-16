-- Steg 2: EN stopp-modell.
-- Idag finns stopp på tre ställen: leave-typerna skordarstopp/skotarstopp i
-- ledighet_ansokningar (0 rader), tabellen maskinstopp (2 rader), och en död
-- formulärväg i UI:t. Ett stopp inlagt via formuläret syns aldrig i kalendern.
-- Ny modell: stopp (1 rad per logiskt stopp) + stopp_maskin (N maskiner per
-- stopp). "Alla maskiner" expanderas vid sparning i UI:t till explicita rader
-- så historiska stopp fryser rätt maskinuppsättning.

-- 1) Nya tabeller
CREATE TABLE stopp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fran_datum date NOT NULL,
  till_datum date NOT NULL,
  orsak text NOT NULL CHECK (orsak IN ('semesterstopp', 'produktionsbegransning')),
  kommentar text,
  skapad_av_medarbetare uuid REFERENCES medarbetare(id),
  skapad_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stopp_datum_ordning CHECK (till_datum >= fran_datum)
);

CREATE TABLE stopp_maskin (
  stopp_id uuid NOT NULL REFERENCES stopp(id) ON DELETE CASCADE,
  maskin_id text NOT NULL REFERENCES dim_maskin(maskin_id),
  PRIMARY KEY (stopp_id, maskin_id)
);

CREATE INDEX stopp_datum_idx ON stopp (fran_datum, till_datum);

-- 2) Spärr: om stopp-typer dykt upp i ledighet_ansokningar sedan förkontrollen
-- (0 rader 2026-07-16) ska migreringen avbrytas, inte tappa dem tyst.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM ledighet_ansokningar WHERE typ IN ('skordarstopp', 'skotarstopp');
  IF n > 0 THEN
    RAISE EXCEPTION 'Avbrutet: % stopp-rader i ledighet_ansokningar — migrera dem manuellt först', n;
  END IF;
END $$;

-- 3) Migrera maskinstopp → stopp + stopp_maskin.
-- Gamla id:n återanvänds som stopp.id (spårbarhet 1:1).
-- Orsaksmappning: 'semester' → 'semesterstopp'; allt annat
-- ('service'/'reparation'/'annat') → 'produktionsbegransning'.
-- Upphov: skapad_av (e-post) → medarbetare via epost-match.
INSERT INTO stopp (id, fran_datum, till_datum, orsak, kommentar, skapad_av_medarbetare, skapad_at)
SELECT ms.id, ms.fran_datum, ms.till_datum,
       CASE WHEN ms.orsak = 'semester' THEN 'semesterstopp' ELSE 'produktionsbegransning' END,
       ms.kommentar, m.id, ms.skapad_at
FROM maskinstopp ms
LEFT JOIN medarbetare m ON lower(m.epost) = lower(ms.skapad_av);

INSERT INTO stopp_maskin (stopp_id, maskin_id)
SELECT id, maskin_id FROM maskinstopp;

-- 4) Verifiera: antal migrerade = antal källrader, annars avbrott (ingen drop).
DO $$
DECLARE killor int; s int; sm int;
BEGIN
  SELECT count(*) INTO killor FROM maskinstopp;
  SELECT count(*) INTO s FROM stopp;
  SELECT count(*) INTO sm FROM stopp_maskin;
  IF s <> killor OR sm <> killor THEN
    RAISE EXCEPTION 'Migrering stämmer inte: maskinstopp=%, stopp=%, stopp_maskin=%', killor, s, sm;
  END IF;
END $$;

-- 5) RLS: alla läser (delad kalender), bara godkännare (chef/admin) skriver.
ALTER TABLE stopp ENABLE ROW LEVEL SECURITY;
ALTER TABLE stopp_maskin ENABLE ROW LEVEL SECURITY;

CREATE POLICY stopp_select_alla ON stopp
  FOR SELECT TO authenticated USING (true);
CREATE POLICY stopp_skriv_godkannare ON stopp
  FOR ALL TO authenticated USING (ar_godkannare()) WITH CHECK (ar_godkannare());

CREATE POLICY stopp_maskin_select_alla ON stopp_maskin
  FOR SELECT TO authenticated USING (true);
CREATE POLICY stopp_maskin_skriv_godkannare ON stopp_maskin
  FOR ALL TO authenticated USING (ar_godkannare()) WITH CHECK (ar_godkannare());

-- 6) Retirera gamla typvärden på datanivå: ledighet_ansokningar är hädanefter
-- BARA personledighet. (Prod saknar CHECK helt idag; repofilens gamla CHECK
-- med 'stillestand' matchade aldrig verkligheten.)
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_typ_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_typ_check CHECK (typ IN ('semester', 'atk'));

ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_status_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_status_check CHECK (status IN ('väntar', 'godkänd', 'nekad'));

-- 7) DESTRUKTIVT: droppa gamla maskinstopp-tabellen.
-- Två stopp-källor är hela buggen — den gamla får inte leva kvar.
-- Data är vid det här laget verifierat flyttad (steg 4 ovan avbryter annars).
DROP TABLE maskinstopp;
