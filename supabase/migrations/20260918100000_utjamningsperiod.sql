-- ─────────────────────────────────────────────────────────────
-- UTJÄMNINGSPERIOD — en markerad beräkningsperiod enligt Skogsavtalet §5 mom 2.
--
-- Avtalet: ordinarie arbetstid är 40 tim/vecka "sett som ett genomsnitt för
-- en sammanhängande beräkningsperiod av högst 16 veckor" (docs/lonesystem/
-- skogsavtalet-arbetstid.md). Gävle våren 2026 var exakt det: 72–80 timmar
-- varannan vecka, tom vecka emellan, lön enligt schema — ordinarie tid utlagd
-- ojämnt, INTE kompensationsledighet (Martin 2026-09-17: "dom hade betalt för
-- 80 och det täckte den veckan man var hemma").
--
-- Utan en markerad period måste årsövertiden gissa var perioderna går
-- (fasta 16-veckorsblock från v1), och gissningen kapade Gävle mitt itu.
-- Med perioden markerad är den ett FAKTUM som lib/lonesystem/arsovertid och
-- granskningsvyn läser. Ingen saldoräkning, inga timmar lagras — Fortnox äger
-- bokföringen. Bara: start, slut, vem, och en anteckning om vad som gjordes.
--
-- Hela ISO-veckor (måndag–söndag): avtalet räknar i arbetsveckor, och Daniel
-- fick 0 med hela veckor men 25,9 tim med exakta datum — gränsen får inte
-- vara en tolkningsfråga.
--
-- Kör i prod av Martin. Läsare: app/api/lon/arsovertid (kortet i Lön-fliken)
-- och lib/lonesystem/loneunderlag (upplysningsrad i granskningen). Båda tål
-- att tabellen saknas (tom lista + varning) så ordningen merge/migration
-- spelar ingen roll.
-- ─────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS utjamningsperiod (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startdatum     date NOT NULL,
  slutdatum      date NOT NULL,
  -- NULL = gäller alla medarbetare (Gävle gällde alla som var där)
  medarbetare_id uuid REFERENCES medarbetare(id) ON DELETE CASCADE,
  anteckning     text NOT NULL,
  skapad_av      text,
  skapad_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utjamningsperiod_ordning CHECK (slutdatum >= startdatum),
  -- Hela ISO-veckor: start på måndag, slut på söndag
  CONSTRAINT utjamningsperiod_hel_vecka CHECK (
    extract(isodow from startdatum) = 1 AND extract(isodow from slutdatum) = 7
  )
);

CREATE INDEX IF NOT EXISTS idx_utjamningsperiod_datum ON utjamningsperiod (startdatum, slutdatum);

COMMENT ON TABLE utjamningsperiod IS
  'Beräkningsperiod enligt Skogsavtalet §5 mom 2 där ordinarie tid (40 tim/vecka i genomsnitt) lades ut ojämnt över veckorna. Hela ISO-veckor. medarbetare_id NULL = alla. Ingen saldoräkning — bara en upplysning som årsövertiden och granskningsvyn läser. FÖRBEHÅLL: en tom vecka räknas i genomsnittets bas bara om den är utjämnad ordinarie tid. Var den semester (eller annan frånvaro) ska den inte vara med i basen, och då stiger övertiden. Inom en markerad period vet appen vad en tom vecka betyder — utanför vet den det inte. Avtalet förutsätter att utjämning över mer än en vecka är ÖVERENSKOMMEN; en rad här är en anteckning om vad som gjordes, inte ett bevis på att det var avtalat. Längre än 16 veckor kräver lokal överenskommelse (§5 mom 2 anm).';
COMMENT ON COLUMN utjamningsperiod.medarbetare_id IS 'NULL = gäller alla medarbetare.';
COMMENT ON COLUMN utjamningsperiod.anteckning IS 'Vad som gjordes, i klartext — t.ex. "ordinarie tid utlagd ojämnt, 72–80 tim varannan vecka, lön enligt schema".';

ALTER TABLE utjamningsperiod ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS utjamningsperiod_select_alla ON utjamningsperiod;
CREATE POLICY utjamningsperiod_select_alla ON utjamningsperiod
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS utjamningsperiod_admin_skriv ON utjamningsperiod;
CREATE POLICY utjamningsperiod_admin_skriv ON utjamningsperiod
  FOR ALL TO authenticated USING (ar_admin()) WITH CHECK (ar_admin());

-- Första raden: Gävle 2026, ISO-vecka 17–27, alla medarbetare.
INSERT INTO utjamningsperiod (startdatum, slutdatum, medarbetare_id, anteckning, skapad_av)
SELECT '2026-04-20', '2026-07-05', NULL,
       'Gävle/Hedemora–Sandviken 22 apr–29 jun 2026 (sex objekt, 100 arbetsdagar). Ordinarie tid utlagd ojämnt: 72–80 timmar varannan vecka, tom vecka emellan, lön enligt schema. Genomsnittsberäkning enligt §5 mom 2 — inte kompensationsledighet.',
       'migration 20260918100000'
WHERE NOT EXISTS (
  SELECT 1 FROM utjamningsperiod WHERE startdatum = '2026-04-20' AND slutdatum = '2026-07-05' AND medarbetare_id IS NULL
);

COMMIT;

-- EFTER:
--   select startdatum, slutdatum, medarbetare_id, skapad_av,
--          extract(isodow from startdatum) as start_dow, extract(isodow from slutdatum) as slut_dow
--     from utjamningsperiod;
--     → 2026-04-20 | 2026-07-05 | NULL | migration 20260918100000 | 1 | 7
--   select conname from pg_constraint where conrelid = 'public.utjamningsperiod'::regclass and contype = 'c' order by 1;
--     → utjamningsperiod_hel_vecka, utjamningsperiod_ordning
--   select polname from pg_policy where polrelid = 'public.utjamningsperiod'::regclass order by 1;
--     → utjamningsperiod_admin_skriv, utjamningsperiod_select_alla
--   select relrowsecurity from pg_class where oid = 'public.utjamningsperiod'::regclass;
--     → true
--   Negativtest (ska FELA på utjamningsperiod_hel_vecka — 2026-04-22 är en onsdag):
--     insert into utjamningsperiod (startdatum, slutdatum, anteckning) values ('2026-04-22', '2026-07-05', 'test');
