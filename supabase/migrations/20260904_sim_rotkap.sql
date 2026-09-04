-- Rotkapssimuleringen, förberäknad. En rad per (objekt, kaplängd).
--
-- Skärmen /rotkap läser BARA den här tabellen. Själva simuleringen
-- (berakna_rotkap.py) går mot detalj_stam_diameter — som är stängd för
-- authenticated — och tar minuter. Den körs efter import, aldrig live.
--
-- Raden för 300 cm är referensen: rotbiten som föraren faktiskt kapade
-- (300–314 cm). Övriga rader är SAMMA stammar apterade med rotbiten förlängd
-- till kaplängden. Volymerna är absoluta; skillnaden räknas på skärmen som
-- rad(k) − rad(300). Lagrade differenser hade kunnat motsäga sin referens
-- efter en halv omräkning — absoluta tal kan inte det.
--
-- Två grupper, för rötan går olika långt:
--   grupp 1  en massabit före sågstocken — sågstocken börjar direkt över roten
--   grupp 2  flera massabitar i rad — rötan gick längre; sågstocken börjar
--            där kedjan slutar. Förlängningen flyttas inom massaveden om
--            någon senare bit har slack ner till 300 cm, annars skjuts kedjan.
--
-- Populationen är stammar med rotbit 300–314 cm i massaved som första stock.
-- Stammar utan sågstock och stammar utan kurva räknas men simuleras inte.
CREATE TABLE IF NOT EXISTS sim_rotkap (
  objekt_id          text NOT NULL,
  kaplangd_cm        int  NOT NULL,
  objekt_namn        text,
  maskiner           text[] NOT NULL DEFAULT '{}',
  -- populationen: samma tal på objektets alla rader
  stammar_objekt     int NOT NULL DEFAULT 0,    -- alla stammar på objektet
  stammar            int NOT NULL DEFAULT 0,    -- simulerade = grupp1 + grupp2
  grupp1_stammar     int NOT NULL DEFAULT 0,
  grupp2_stammar     int NOT NULL DEFAULT 0,
  utan_sagstock      int NOT NULL DEFAULT 0,    -- rotbit men ingen sågstock
  utan_kurva         int NOT NULL DEFAULT 0,    -- rotbit och sågstock men ingen serie
  -- utfall vid kaplängden, m³sub, absoluta
  timmer_m3          numeric(9,3) NOT NULL DEFAULT 0,
  kubb_m3            numeric(9,3) NOT NULL DEFAULT 0,
  massa_m3           numeric(9,3) NOT NULL DEFAULT 0,
  rest_m3            numeric(9,3) NOT NULL DEFAULT 0,  -- utan avsättning: toppen ovanför sista stocken
  grupp1_timmer_m3   numeric(9,3) NOT NULL DEFAULT 0,
  grupp2_timmer_m3   numeric(9,3) NOT NULL DEFAULT 0,
  grupp2_kedja_fast  int NOT NULL DEFAULT 0,    -- kedjor där förlängningen ryms i slacken
  -- proveniens
  validering         jsonb,                     -- kurva mot maskinens egna stockar
  anmarkning         text,
  stockar_antal      int NOT NULL DEFAULT 0,    -- inkrementell nyckel: räknas om när
  serier_antal       int NOT NULL DEFAULT 0,    --   någon av dessa ändrats
  beraknad           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (objekt_id, kaplangd_cm)
);

COMMENT ON TABLE sim_rotkap IS
  'Rotkapssimuleringen förberäknad av berakna_rotkap.py — en rad per (objekt, kaplängd 300/320/340/360/380). Raden 300 är referensen (rotbiten som kördes); skillnaden räknas på skärmen som rad(k) − rad(300). Räknat, inte mätt. Skrivs bara av service-rollen efter import.';
COMMENT ON COLUMN sim_rotkap.stammar IS
  'Simulerade stammar = grupp1 + grupp2. Noll betyder att objektet inte går att välja på skärmen.';
COMMENT ON COLUMN sim_rotkap.grupp2_kedja_fast IS
  'Grupp 2-stammar där förlängningen ryms i senare massabitars slack ner till 300 cm — där kostar rotkapet noll timmer. Vid 300 cm är det alla.';
COMMENT ON COLUMN sim_rotkap.validering IS
  '{n, dia_median_mm, dia_p10, dia_p90, vol_median_pct, vol_p10, vol_p90, utanfor}: kurvans toppdiameter och volym mot maskinens egna stockar. Är medianerna långt från noll är resten värdelöst.';

ALTER TABLE sim_rotkap ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sim_rotkap_las ON sim_rotkap;
CREATE POLICY sim_rotkap_las ON sim_rotkap FOR SELECT TO authenticated USING (true);
REVOKE ALL ON sim_rotkap FROM anon;
REVOKE INSERT, UPDATE, DELETE ON sim_rotkap FROM authenticated;
GRANT SELECT ON sim_rotkap TO authenticated;

-- Paren skriptet ska gå igenom: (objekt, maskin) med serie, antal och den
-- fil serien kom ur (prismatrisen läses ur samma fil). PostgREST kan inte
-- göra DISTINCT, och att dra 190 000 rader för att hitta 43 par vore fel.
--
-- Vyn går över detalj_stam_diameter och får därför ALDRIG nås från en skärm:
-- security_invoker gör att den körs som anroparen (authenticated saknar
-- rättighet på tabellen → fel, inte tyst tomt), och rättigheterna är
-- dessutom återkallade. Bara service-rollen läser den.
CREATE OR REPLACE VIEW vy_sim_rotkap_par
WITH (security_invoker = true) AS
SELECT objekt_id, maskin_id,
       count(*)::int AS serier,
       mode() WITHIN GROUP (ORDER BY filnamn) AS filnamn
FROM detalj_stam_diameter
GROUP BY objekt_id, maskin_id;

REVOKE ALL ON vy_sim_rotkap_par FROM anon, authenticated;
COMMENT ON VIEW vy_sim_rotkap_par IS
  'Analysunderlag för berakna_rotkap.py. Går över detalj_stam_diameter och får aldrig läsas av en skärm — security_invoker + återkallade rättigheter.';
