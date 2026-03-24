-- Skotning uttag: registrerade volymer/högar vid skotning
CREATE TABLE IF NOT EXISTS skotning_uttag (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objekt_id       UUID NOT NULL REFERENCES objekt(id),
    lat             FLOAT NOT NULL,
    lng             FLOAT NOT NULL,
    tradslag        TEXT NOT NULL,
    volym           FLOAT NOT NULL,
    registrerad_av  TEXT,
    registrerad_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
