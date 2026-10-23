\set ON_ERROR_STOP on
\i stub.sql
INSERT INTO fakt_kalibrering_historik (datum, maskin_id, tradslag, orsak, dia_justering_mm, position_cm, typ, filnamn) VALUES
 ('2026-08-03', 'R64428', 'Gran', 'Repair of measurement system', 56, 50, 'diameter', 'a.hqc'),
 ('2026-08-04', 'R64428', 'Gran', 'Change in weather conditions', 1, 50, 'diameter', 'a.hqc'),
 ('2026-08-05', 'R64428', 'Tall', NULL, 0, 50, 'diameter', 'a.hqc');
INSERT INTO fakt_kalibrering_historik (datum, maskin_id, tradslag, orsak, beskrivning, langd_justering_mm, position_cm, typ, filnamn) VALUES
 ('2026-08-03', 'R64428', 'Gran', 'Repair of measurement system', 'ny slang', -4, 550, 'langd', 'a.hqc');

\i ../../migrations/20261023090000_kalibrering_historik_rot_och_omkalibrering.sql
-- Körs om utan fel (IF NOT EXISTS)
\i ../../migrations/20261023090000_kalibrering_historik_rot_och_omkalibrering.sql

DO $$
DECLARE n int; r record;
BEGIN
  -- befintliga rader märks direkt, och bara de med exakt den orsaken
  SELECT count(*) INTO n FROM fakt_kalibrering_historik WHERE omkalibrering;
  IF n <> 2 THEN RAISE EXCEPTION 'väntade 2 omkalibreringar, fick %', n; END IF;
  SELECT count(*) INTO n FROM fakt_kalibrering_historik WHERE NOT omkalibrering;
  IF n <> 2 THEN RAISE EXCEPTION 'väntade 2 vanliga, fick %', n; END IF;
  -- orsak NULL är en vanlig rad, aldrig NULL i märket
  SELECT count(*) INTO n FROM fakt_kalibrering_historik WHERE omkalibrering IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'märket är NULL på % rader', n; END IF;
  -- värdena rörs inte
  SELECT dia_justering_mm INTO n FROM fakt_kalibrering_historik WHERE maskin_id='R64428' AND typ='diameter' AND omkalibrering;
  IF n <> 56 THEN RAISE EXCEPTION '56 ändrades till %', n; END IF;
  -- rotkolumnen är NULL tills någon fyller i den (aldrig 0)
  SELECT count(*) INTO n FROM fakt_kalibrering_historik WHERE langd_justering_rot_mm IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'rotkolumnen ska börja NULL'; END IF;
END $$;

-- Importens upsert (merge-duplicates på unika nyckeln) skriver rot och beskrivning, och omkalibrering följer orsaken
INSERT INTO fakt_kalibrering_historik (datum, maskin_id, tradslag, typ, orsak, beskrivning, langd_justering_mm, langd_justering_rot_mm, position_cm, filnamn)
VALUES ('2026-08-03', 'R64428', 'Gran', 'langd', 'Repair of measurement system', 'ny slang', -4, -2, 550, 'b.hqc')
ON CONFLICT (datum, maskin_id, tradslag, typ) DO UPDATE SET
  orsak = EXCLUDED.orsak, beskrivning = EXCLUDED.beskrivning, langd_justering_mm = EXCLUDED.langd_justering_mm,
  langd_justering_rot_mm = EXCLUDED.langd_justering_rot_mm, position_cm = EXCLUDED.position_cm, filnamn = EXCLUDED.filnamn;
INSERT INTO fakt_kalibrering_historik (datum, maskin_id, tradslag, typ, orsak, beskrivning, dia_justering_mm, position_cm, filnamn)
VALUES ('2026-08-04', 'R64428', 'Gran', 'diameter', 'Routine check', 'mätte om', 1, 50, 'b.hqc')
ON CONFLICT (datum, maskin_id, tradslag, typ) DO UPDATE SET
  orsak = EXCLUDED.orsak, beskrivning = EXCLUDED.beskrivning, dia_justering_mm = EXCLUDED.dia_justering_mm;

DO $$
DECLARE n int; t text;
BEGIN
  SELECT langd_justering_rot_mm INTO n FROM fakt_kalibrering_historik WHERE typ='langd';
  IF n IS DISTINCT FROM -2 THEN RAISE EXCEPTION 'rot sparades inte: %', n; END IF;
  SELECT beskrivning INTO t FROM fakt_kalibrering_historik WHERE typ='diameter' AND datum='2026-08-04';
  IF t IS DISTINCT FROM 'mätte om' THEN RAISE EXCEPTION 'diameterbeskrivning sparades inte: %', t; END IF;
  -- orsaken ändrad via upsert → märket följer med (en generated column kan inte glida isär)
  SELECT count(*) INTO n FROM fakt_kalibrering_historik WHERE omkalibrering;
  IF n <> 2 THEN RAISE EXCEPTION 'märket följde inte orsaken: %', n; END IF;
END $$;

-- Importen får aldrig skriva märket: en INSERT med kolumnen avvisas
DO $$
BEGIN
  BEGIN
    INSERT INTO fakt_kalibrering_historik (datum, maskin_id, tradslag, typ, omkalibrering) VALUES ('2026-09-01','X','Y','langd', true);
    RAISE EXCEPTION 'märket gick att skriva';
  EXCEPTION WHEN generated_always THEN NULL;
  END;
END $$;
\echo ok: kalibrering_historik
