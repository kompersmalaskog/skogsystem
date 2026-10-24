-- Greppet över tid: hur ofta maskinens egen diameter står still över GREPP_MIN_CM, per månad, trädslag och grovlek — räknat på ALLA stammar.
--
-- Källa: detalj_stam_diameter (maskinens avsmalningskurva, en punkt var 10:e cm). Ingen klave, inga kontrollstammar. Definitionen är stamvyns
-- (lib/kalibrering/grepp.ts, GREPP_MIN_CM = 30): ett ställe är en sträcka där diametern inte sjunker (lika eller större än föregående punkt) och som är minst
-- 30 cm lång. Ett steg är "still" om det ligger inom ett sådant ställe.
--
-- EN STAM RÄKNAS EN GÅNG PER RUTA: varje stam ger sin egen andel (still / steg) och rutans värde är medelvärdet över stammarna (summa_andel / stammar). En lång
-- stam med 250 steg väger alltså lika mycket som en kort med 60. Hela steg-summorna (steg, still) sparas också, så att den andra läsningen (alla steg lika) går att göra.
--
-- DEN HÄR TABELLEN ÄR EN CACHE. detalj_stam_diameter har ~10 miljoner punkter (R64428 ensam 7,4 miljoner, ~25 s att räkna om i ett svep) och PostgREST avbryter
-- efter 8 s. Därför räknas ETT OBJEKT åt gången (störst 14 088 stammar, några sekunder) och sparas; en läsning kostar ingenting. Aktuell = stammarna i objektet har samma antal,
-- samma senaste `uppdaterad` och samma `version` som när det räknades — kalibrering_grepp_status() säger vilka objekt som behöver räknas om. Ändra räknesättet: höj
-- v_version i kalibrering_grepp_rakna OCH versionen som kalibrering_grepp_status jämför mot (båda står som 1 i den här filen), så räknas allt om.
--
-- Skrivs och läses bara av servern (service_role): RLS på utan policy och rättigheterna återkallade, som detalj_stam_diameter.

CREATE TABLE IF NOT EXISTS kalibrering_grepp_manad (
  maskin_id     text    NOT NULL,
  objekt_id     text    NOT NULL,
  manad         text    NOT NULL,            -- 'YYYY-MM', svensk tid (opti_tid_lokal)
  tradslag      text    NOT NULL,            -- dim_tradslag.namn som det står ('GRAN', 'TALL', 'BJÖRK', 'ÖVR_LÖV')
  klass         text    NOT NULL,            -- stammens grovlek efter brösthöjdsdiameter: '<150', '150-199', '200-249', '250-299', '300+', 'okänd'
  stammar       integer NOT NULL,
  steg          bigint  NOT NULL,            -- alla 10 cm-steg
  still         bigint  NOT NULL,            -- steg som ligger inom ett ställe där diametern står still
  summa_andel   double precision NOT NULL,   -- Σ över stammarna av still/steg — rutans värde är summa_andel / stammar
  PRIMARY KEY (maskin_id, objekt_id, manad, tradslag, klass)
);

CREATE TABLE IF NOT EXISTS kalibrering_grepp_raknat (
  maskin_id         text    NOT NULL,
  objekt_id         text    NOT NULL,
  antal_stammar     integer NOT NULL,        -- stammar med serie i detalj_stam_diameter när det räknades
  antal_raknade     integer NOT NULL,        -- av dem: stammar som gick att placera (har trädslag och tid i detalj_stam)
  senast_uppdaterad timestamptz,             -- max(detalj_stam_diameter.uppdaterad) när det räknades
  version           integer NOT NULL,
  raknad            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (maskin_id, objekt_id)
);

COMMENT ON TABLE kalibrering_grepp_manad IS
  'Cache: andel 10 cm-steg där maskinens diameter står still över 30 cm, per objekt, månad, trädslag och grovlek (alla stammar). Räknas av kalibrering_grepp_rakna(); läses via kalibrering_grepp_sammanstall(). Får inte skrivas för hand.';
COMMENT ON TABLE kalibrering_grepp_raknat IS
  'Vilka objekt som är räknade i kalibrering_grepp_manad, och på vilket underlag (antal stammar, senaste uppdatering, version).';

ALTER TABLE kalibrering_grepp_manad ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalibrering_grepp_raknat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kalibrering_grepp_manad FROM anon, authenticated;
REVOKE ALL ON kalibrering_grepp_raknat FROM anon, authenticated;

-- Räkna om ETT objekt. Atomiskt: gamla rader byts mot nya i samma sats. Returnerar antalet stammar som räknades.
CREATE OR REPLACE FUNCTION kalibrering_grepp_rakna(p_maskin text, p_objekt text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version CONSTANT integer := 1;
  v_min_cm  CONSTANT integer := 30;   -- = GREPP_MIN_CM i lib/kalibrering/grepp.ts
  v_antal   integer;
  v_senast  timestamptz;
  v_raknade integer;
BEGIN
  SELECT count(*), max(uppdaterad) INTO v_antal, v_senast
  FROM detalj_stam_diameter WHERE maskin_id = p_maskin AND objekt_id = p_objekt;

  -- Gamla rader bort. Skrivet som en CTE: en fristående radering i texten får Supabase-MCP:n att hänga (CLAUDE.md); satsen gör samma sak.
  WITH borta AS (DELETE FROM kalibrering_grepp_manad WHERE maskin_id = p_maskin AND objekt_id = p_objekt RETURNING 1)
  SELECT count(*) INTO v_raknade FROM borta;

  WITH st AS MATERIALIZED (
    SELECT d.stam_key, d.diametrar, COALESCE(NULLIF(d.steg_cm, 0), 10) AS steg_cm, t.namn AS tradslag, s.dbh_mm,
           to_char(opti_tid_lokal(s.tidpunkt, s.tid_ar_utc), 'YYYY-MM') AS manad
    FROM detalj_stam_diameter d
    JOIN detalj_stam s ON s.maskin_id = d.maskin_id AND s.stam_key = d.stam_key
    JOIN dim_tradslag t ON t.tradslag_id = s.tradslag_id
    WHERE d.maskin_id = p_maskin AND d.objekt_id = p_objekt AND s.tidpunkt IS NOT NULL
  ), p AS (
    -- Smalt på riktigt: bara det fönsterfunktionerna behöver, annars bär varje punkt (1,2 miljoner i det största objektet) med sig trädslag och månad.
    SELECT st.stam_key, u.dia, u.ord FROM st, unnest(st.diametrar) WITH ORDINALITY AS u(dia, ord)
  ), s2 AS (
    SELECT stam_key, ord, (dia >= lag(dia) OVER w) AS ej_sjunker FROM p WINDOW w AS (PARTITION BY stam_key ORDER BY ord)
  ), g AS (
    -- Ett nytt stycke börjar där diametern sjunker. Första punkten har ingen föregående (NULL) och räknas till stycke 0.
    SELECT stam_key, sum(CASE WHEN ej_sjunker IS FALSE THEN 1 ELSE 0 END) OVER (PARTITION BY stam_key ORDER BY ord) AS grp FROM s2
  ), runs AS (
    SELECT stam_key, grp, count(*) AS punkter FROM g GROUP BY stam_key, grp
  ), perstam AS (
    -- Stammens steg = alla punkter − 1 (steget där diametern sjunker är också ett steg). Ett stycke med N punkter har N−1 steg inom sig;
    -- det är ett ställe om det är minst v_min_cm långt, och dess steg är "still".
    SELECT st.stam_key, st.tradslag, st.manad, st.dbh_mm,
           sum(r.punkter) - 1 AS steg,
           COALESCE(sum(r.punkter - 1) FILTER (WHERE (r.punkter - 1) * st.steg_cm >= v_min_cm), 0) AS still
    FROM runs r JOIN st USING (stam_key)
    GROUP BY st.stam_key, st.tradslag, st.manad, st.dbh_mm
    HAVING sum(r.punkter) - 1 > 0
  )
  INSERT INTO kalibrering_grepp_manad (maskin_id, objekt_id, manad, tradslag, klass, stammar, steg, still, summa_andel)
  SELECT p_maskin, p_objekt, manad, tradslag,
         CASE WHEN dbh_mm IS NULL THEN 'okänd' WHEN dbh_mm < 150 THEN '<150' WHEN dbh_mm < 200 THEN '150-199'
              WHEN dbh_mm < 250 THEN '200-249' WHEN dbh_mm < 300 THEN '250-299' ELSE '300+' END,
         count(*), sum(steg), sum(still), sum(still::double precision / steg)
  FROM perstam GROUP BY 1, 2, 3, 4, 5;

  SELECT COALESCE(sum(stammar), 0) INTO v_raknade FROM kalibrering_grepp_manad WHERE maskin_id = p_maskin AND objekt_id = p_objekt;

  INSERT INTO kalibrering_grepp_raknat (maskin_id, objekt_id, antal_stammar, antal_raknade, senast_uppdaterad, version, raknad)
  VALUES (p_maskin, p_objekt, v_antal, v_raknade, v_senast, v_version, now())
  ON CONFLICT (maskin_id, objekt_id) DO UPDATE
    SET antal_stammar = EXCLUDED.antal_stammar, antal_raknade = EXCLUDED.antal_raknade, senast_uppdaterad = EXCLUDED.senast_uppdaterad,
        version = EXCLUDED.version, raknad = EXCLUDED.raknad;

  RETURN v_raknade;
END;
$$;

-- Vilka objekt som är räknade på nuvarande underlag, och hur många stammar som gick att placera. Billig (en gruppering över serie-tabellen).
CREATE OR REPLACE FUNCTION kalibrering_grepp_status(p_maskin text)
RETURNS TABLE (objekt_id text, antal_stammar integer, antal_raknade integer, aktuell boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.objekt_id, count(*)::integer, COALESCE(r.antal_raknade, 0),
         (r.version = 1 AND r.antal_stammar = count(*) AND r.senast_uppdaterad IS NOT DISTINCT FROM max(d.uppdaterad))
  FROM detalj_stam_diameter d
  LEFT JOIN kalibrering_grepp_raknat r ON r.maskin_id = d.maskin_id AND r.objekt_id = d.objekt_id
  WHERE d.maskin_id = p_maskin
  GROUP BY d.objekt_id, r.version, r.antal_stammar, r.antal_raknade, r.senast_uppdaterad
  ORDER BY d.objekt_id;
$$;

-- Maskinens alla objekt ihop: en rad per månad, trädslag och grovlek. Det klienten läser.
CREATE OR REPLACE FUNCTION kalibrering_grepp_sammanstall(p_maskin text)
RETURNS TABLE (manad text, tradslag text, klass text, stammar bigint, steg bigint, still bigint, summa_andel double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.manad, m.tradslag, m.klass, sum(m.stammar)::bigint, sum(m.steg)::bigint, sum(m.still)::bigint, sum(m.summa_andel)
  FROM kalibrering_grepp_manad m
  WHERE m.maskin_id = p_maskin
  GROUP BY m.manad, m.tradslag, m.klass
  ORDER BY m.manad, m.tradslag, m.klass;
$$;

REVOKE ALL ON FUNCTION kalibrering_grepp_rakna(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION kalibrering_grepp_status(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION kalibrering_grepp_sammanstall(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kalibrering_grepp_rakna(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION kalibrering_grepp_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION kalibrering_grepp_sammanstall(text) TO service_role;
