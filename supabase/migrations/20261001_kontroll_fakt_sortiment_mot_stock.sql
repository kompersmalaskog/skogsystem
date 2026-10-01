-- Kontroll: fakt_sortiment och detalj_stock ska säga samma sak om ett objekt.
--
-- fakt_sortiment HÄRLEDS ur detalj_stock sedan #444 (rebuild_fakt_sortiment
-- per objekt vid import). Går de isär har något hoppats över: objekt utan
-- joinbara stockar (parsern före 2026-04-21, nyckellösa rader 21 april–
-- 7 maj), objekt utan tidpunkt (ombyggnaden kräver datum), eller en
-- ombyggnad som aldrig kördes. Jörgen Olsson Björkebråten stod 2026-10-01
-- med 1 168,7 m³ i fakt_sortiment och 507,5 i stockarna — den gamla
-- per-fil-importens dubbelräkning, kvarlämnad och fullt rimlig att se på.
-- Samma klass av fel som stammar utan stockar: tyst, och det ser rätt ut.
--
-- Jämför summan av volym_m3sub per objekt. Joinbara stockar = stem_key och
-- log_key satta; nyckellösa rader räknas inte (de syns inte i någon vy och
-- ingår inte i ombyggnaden). Larmar när skillnaden överstiger p_tolerans
-- (andel av den större summan) och den större summan är minst 1 m³ —
-- ett objekt som helt saknar den ena sidan avviker därmed med 100 %.
--
-- Läses av gap_check.py (statusrad 'fakt_sortiment_mot_stock').
CREATE OR REPLACE FUNCTION kontroll_fakt_sortiment_mot_stock(p_tolerans numeric DEFAULT 0.01)
RETURNS TABLE (
  objekt_id text, namn text, huvudtyp text,
  fakt_sortiment_m3 numeric, stock_m3 numeric, skillnad_m3 numeric, skillnad_pct numeric,
  fakt_sortiment_rader bigint, stockar bigint, stockar_utan_nyckel bigint, stammar_utan_tidpunkt bigint
) LANGUAGE sql STABLE AS $f$
  WITH fs AS (
    SELECT objekt_id, sum(volym_m3sub) AS m3, count(*) AS rader
    FROM fakt_sortiment WHERE objekt_id IS NOT NULL GROUP BY 1),
  st AS (
    SELECT objekt_id,
           coalesce(sum(volym_m3sub) FILTER (WHERE stem_key IS NOT NULL AND log_key IS NOT NULL), 0) AS m3,
           count(*) FILTER (WHERE stem_key IS NOT NULL AND log_key IS NOT NULL) AS n,
           count(*) FILTER (WHERE stem_key IS NULL OR log_key IS NULL) AS utan_nyckel
    FROM detalj_stock WHERE objekt_id IS NOT NULL GROUP BY 1),
  alla AS (
    SELECT coalesce(fs.objekt_id, st.objekt_id) AS objekt_id,
           coalesce(fs.m3, 0) AS fs_m3, coalesce(st.m3, 0) AS st_m3,
           coalesce(fs.rader, 0) AS fs_rader, coalesce(st.n, 0) AS stockar, coalesce(st.utan_nyckel, 0) AS utan_nyckel
    FROM fs FULL JOIN st ON st.objekt_id = fs.objekt_id)
  SELECT a.objekt_id, o.object_name, o.huvudtyp,
         round(a.fs_m3, 1), round(a.st_m3, 1), round(a.fs_m3 - a.st_m3, 1),
         round(100 * abs(a.fs_m3 - a.st_m3) / greatest(a.fs_m3, a.st_m3), 1),
         a.fs_rader, a.stockar, a.utan_nyckel,
         (SELECT count(*) FROM detalj_stam s WHERE s.objekt_id = a.objekt_id AND s.tidpunkt IS NULL)
  FROM alla a LEFT JOIN dim_objekt o ON o.objekt_id = a.objekt_id
  WHERE greatest(a.fs_m3, a.st_m3) >= 1
    AND abs(a.fs_m3 - a.st_m3) > p_tolerans * greatest(a.fs_m3, a.st_m3)
  ORDER BY abs(a.fs_m3 - a.st_m3) DESC;
$f$;

COMMENT ON FUNCTION kontroll_fakt_sortiment_mot_stock(numeric) IS
  'Objekt där summan volym_m3sub i fakt_sortiment och i joinbara detalj_stock skiljer sig mer än p_tolerans (andel) och den större summan är minst 1 m³. fakt_sortiment härleds ur stockarna — en skillnad är en ombyggnad som hoppats över eller stockar som saknas. Läses av gap_check.py.';

REVOKE ALL ON FUNCTION kontroll_fakt_sortiment_mot_stock(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kontroll_fakt_sortiment_mot_stock(numeric) TO authenticated, service_role;
