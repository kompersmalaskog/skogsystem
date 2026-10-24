-- Efterbildning av fakt_kalibrering_historik så som prod ser ut före migrationen (kolumner + unika nyckeln).
CREATE TABLE fakt_kalibrering_historik (
  id serial PRIMARY KEY,
  datum timestamptz NOT NULL,
  maskin_id text,
  operator_id text,
  tradslag text,
  orsak text,
  beskrivning text,
  langd_justering_mm integer,
  dia_justering_mm integer,
  position_cm integer,
  filnamn text,
  skapad_tid timestamptz DEFAULT now(),
  typ text,
  CONSTRAINT fakt_kalibrering_historik_unik UNIQUE NULLS NOT DISTINCT (datum, maskin_id, tradslag, typ)
);
