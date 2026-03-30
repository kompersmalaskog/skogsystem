CREATE TABLE IF NOT EXISTS utbildningar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  namn text NOT NULL,
  datum_genomford date NOT NULL,
  giltig_till date,
  skapad_av text,
  skapad_datum timestamptz DEFAULT now()
);

ALTER TABLE utbildningar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_utbildningar" ON utbildningar FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_utbildningar_user ON utbildningar(user_id);
