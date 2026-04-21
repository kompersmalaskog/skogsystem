-- fakt_tid.operator_id fanns redan men ingick inte i unique-constraint.
-- Det gjorde att när två förare körde samma maskin/objekt samma dag slogs
-- deras rader ihop vid UPSERT — hela dagens rast/tid hamnade på en förare.
-- Lägger till operator_id i unique-nyckeln så per-operator-rader bevaras.
ALTER TABLE fakt_tid DROP CONSTRAINT IF EXISTS fakt_tid_unique;
ALTER TABLE fakt_tid ADD CONSTRAINT fakt_tid_unique UNIQUE (datum, maskin_id, objekt_id, operator_id);
