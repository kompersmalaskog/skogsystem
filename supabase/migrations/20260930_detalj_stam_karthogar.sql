-- Kartans produktionshögar ska läsa detalj_stam i stället för hpr_stammar.
--
-- BAKGRUND: hpr_stammar/hpr_filer kapas per fil (Ponsse Scorpion delar HPR-exporten
-- i en huvudfil på max 4000 stammar + en _1-fil med resten). Kartan läser bara EN
-- hpr_filer-rad → slutavverkningar över 4000 stammar visas ofullständigt. Exempel
-- Hålabäck au 2025: kartan visar 4000 stammar / 1190,7 m³, men objektet producerade
-- 4246 stammar / 1343,8 m³ (= fakt_produktion). detalj_stam är okapad (UPSERT över
-- alla filer + MOM) och har tidpunkt per stam, men saknar volym/sortiment/GROT-flagga.
--
-- Denna migration lägger till de tre fälten på detalj_stam och backfillar historiken.
-- Importen (skogsmaskin_import_version_6.py) skriver dem framåt (parsern räknar redan
-- alla tre per stam) så nya filer + omimport blir kompletta.

ALTER TABLE detalj_stam ADD COLUMN IF NOT EXISTS total_volym numeric;
ALTER TABLE detalj_stam ADD COLUMN IF NOT EXISTS sortiment text;
ALTER TABLE detalj_stam ADD COLUMN IF NOT EXISTS bio_energy_adaption text;

COMMENT ON COLUMN detalj_stam.total_volym IS 'm³sub per stam (summa av stammens stockar). Backfillad ur detalj_stock, skrivs av importen.';
COMMENT ON COLUMN detalj_stam.sortiment IS 'Dominant sortiment per stam (t.ex. "Gran Timmer: Vislanda_195"). Backfillad ur hpr_stammar, skrivs av importen.';
COMMENT ON COLUMN detalj_stam.bio_energy_adaption IS 'StanForD BioEnergyAdaption per stam (ej null = GROT-anpassad). Backfillad ur hpr_stammar, skrivs av importen.';

-- === Backfill 1: total_volym ur detalj_stock ===
-- Riktig nyckel (maskin_id, stem_key) — ingen kollision, ingen dubbelräkning
-- (detalj_stock UPSERT:ar på (maskin_id, stem_key, log_key) sedan 20260507).
-- NULL-stem_key-dubbletter (gammal Vida/Karl Hedin-massa) matchar aldrig → exkluderas.
UPDATE detalj_stam ds
SET total_volym = sub.v
FROM (
  SELECT maskin_id, stem_key, SUM(volym_m3sub) AS v
  FROM detalj_stock
  WHERE stem_key IS NOT NULL
  GROUP BY maskin_id, stem_key
) sub
WHERE ds.maskin_id = sub.maskin_id
  AND ds.stem_key = sub.stem_key
  AND ds.total_volym IS NULL;

-- === Backfill 2: bio_energy_adaption + sortiment ur hpr_stammar ===
-- hpr_stammar har ingen gemensam nyckel med detalj_stam (bara stam_nummer, ej stem_key).
-- Bron är POSITIONEN: bägge kommer ur samma <StemCoordinates>. Vi skopar joinen per
-- MASKIN (detalj_stam.maskin_id = hpr_filer.objekt_nyckel före ':') — filnamn duger EJ
-- som nyckel (detalj_stam lagrar ofta "MASKIN_tidsstämpel.hpr" medan hpr_filer har den
-- objektnamn-prefixade formen → matchar inte). En maskin fäller aldrig två stammar på
-- samma koordinat (7 decimaler ≈ 1 cm) i skilda objekt, så maskin+position är entydig.
-- Verifierat mot Hålabäck au 2025: 251 positionsgrupper med >1 stam, 0 där bio_energy
-- skiljer sig. DISTINCT ON (…, h.id) gör valet deterministiskt vid ev. kollision.
-- Kapade extra-stammar (finns ej i hpr_stammar, t.ex. Hålabäcks 246 sista) förblir NULL
-- tills objektet omimporteras med den uppdaterade parsern.
UPDATE detalj_stam ds
SET bio_energy_adaption = pick.bio_energy_adaption,
    sortiment = pick.sortiment
FROM (
  SELECT DISTINCT ON (split_part(hf.objekt_nyckel, ':', 1), round(h.lat::numeric, 7), round(h.lng::numeric, 7))
         split_part(hf.objekt_nyckel, ':', 1) AS maskin_id,
         round(h.lat::numeric, 7) AS rlat,
         round(h.lng::numeric, 7) AS rlng,
         h.bio_energy_adaption,
         h.sortiment
  FROM hpr_stammar h
  JOIN hpr_filer hf ON hf.id = h.hpr_fil_id
  WHERE h.lat IS NOT NULL AND h.lng IS NOT NULL
    AND hf.objekt_nyckel IS NOT NULL
  ORDER BY split_part(hf.objekt_nyckel, ':', 1), round(h.lat::numeric, 7), round(h.lng::numeric, 7), h.id
) pick
WHERE ds.maskin_id = pick.maskin_id
  AND round(ds.latitude::numeric, 7) = pick.rlat
  AND round(ds.longitude::numeric, 7) = pick.rlng
  AND ds.bio_energy_adaption IS NULL;
