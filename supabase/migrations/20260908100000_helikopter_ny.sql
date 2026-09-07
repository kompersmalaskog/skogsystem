-- ============================================================================
-- /helikopter (ny vy) — beräkningsunderlag i SQL. Rör INGA befintliga vyer.
--
-- Enhet: m³fub överallt. Källkolumnen är volym_m3sub (StanForD "solid under
-- bark") = m³fub, så INGEN omräkningsfaktor behövs. Se HELIKOPTER_M3FUB_FAKTOR
-- längst ned — den finns bara som dokumenterad konstant (1.0) ifall källan
-- någon gång byts till på-bark-volym.
--
-- Alla funktioner är SECURITY INVOKER (default): de läser som den inloggade
-- och lyder RLS på bestallningar/objekt/dim_objekt/fakt_*. Ingen körs som ägare.
-- ============================================================================

DROP FUNCTION IF EXISTS helikopter_ny_spar(int, int, date);
DROP FUNCTION IF EXISTS helikopter_ny_bolag(int, int);
DROP FUNCTION IF EXISTS helikopter_ny_bolag(int, int, date);
DROP FUNCTION IF EXISTS helikopter_ny_maskin(text, date);
DROP FUNCTION IF EXISTS helikopter_ny_planering(int, int);
DROP FUNCTION IF EXISTS helikopter_ny_arbetsdagar(int, int, date);

-- ---------------------------------------------------------------------------
-- 1. Kalender: påsk, röda dagar + arbetsfria aftnar, arbetsdag
--    Speglar app/ledighet/_components/datum.ts (rodaDagar + arbetsfriaAftnar).
--    Facit: juni 2026 = 21 arbetsdagar, juli = 23, september = 22, december = 20.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_ny_paskdagen(p_ar int) RETURNS date
LANGUAGE sql IMMUTABLE STRICT AS $$
  -- Anonym gregoriansk algoritm (Meeus/Jones/Butcher), heltalsdivision.
  WITH s1 AS (SELECT p_ar % 19 AS a, p_ar / 100 AS b, p_ar % 100 AS c),
       s2 AS (SELECT a, b, c, b / 4 AS d, b % 4 AS e, (b + 8) / 25 AS f FROM s1),
       s3 AS (SELECT *, (b - f + 1) / 3 AS g FROM s2),
       s4 AS (SELECT *, (19 * a + b - d - g + 15) % 30 AS h, c / 4 AS i, c % 4 AS k FROM s3),
       s5 AS (SELECT *, (32 + 2 * e + 2 * i - h - k) % 7 AS l FROM s4),
       s6 AS (SELECT *, (a + 11 * h + 22 * l) / 451 AS m FROM s5)
  SELECT make_date(p_ar, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1) FROM s6;
$$;

CREATE OR REPLACE FUNCTION helikopter_ny_lediga_dagar(p_ar int) RETURNS SETOF date
LANGUAGE sql IMMUTABLE STRICT AS $$
  WITH p AS (SELECT helikopter_ny_paskdagen(p_ar) AS pask),
  midsommardag AS (
    SELECT d::date AS d FROM generate_series(make_date(p_ar, 6, 20), make_date(p_ar, 6, 26), interval '1 day') d
    WHERE extract(isodow FROM d) = 6),
  allhelgon AS (
    SELECT d::date AS d FROM generate_series(make_date(p_ar, 10, 31), make_date(p_ar, 11, 6), interval '1 day') d
    WHERE extract(isodow FROM d) = 6)
  SELECT make_date(p_ar, 1, 1)                 -- nyårsdagen
  UNION SELECT make_date(p_ar, 1, 6)           -- trettondedag jul
  UNION SELECT pask - 2 FROM p                 -- långfredagen
  UNION SELECT pask FROM p                     -- påskdagen
  UNION SELECT pask + 1 FROM p                 -- annandag påsk
  UNION SELECT make_date(p_ar, 5, 1)           -- första maj
  UNION SELECT pask + 39 FROM p                -- Kristi himmelsfärdsdag
  UNION SELECT pask + 49 FROM p                -- pingstdagen
  UNION SELECT make_date(p_ar, 6, 6)           -- nationaldagen
  UNION SELECT d - 1 FROM midsommardag         -- midsommarafton (arbetsfri)
  UNION SELECT d FROM midsommardag             -- midsommardagen
  UNION SELECT d FROM allhelgon                -- alla helgons dag
  UNION SELECT make_date(p_ar, 12, 24)         -- julafton (arbetsfri)
  UNION SELECT make_date(p_ar, 12, 25)         -- juldagen
  UNION SELECT make_date(p_ar, 12, 26)         -- annandag jul
  UNION SELECT make_date(p_ar, 12, 31);        -- nyårsafton (arbetsfri)
$$;

CREATE OR REPLACE FUNCTION helikopter_ny_ar_arbetsdag(p_datum date) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT extract(isodow FROM p_datum) < 6
     AND p_datum <> ALL (ARRAY(SELECT helikopter_ny_lediga_dagar(extract(year FROM p_datum)::int)));
$$;

-- ---------------------------------------------------------------------------
-- 2. Arbetsdagar i månaden — EN källa för "dagar kvar", globalt och per maskin.
--    gangna = arbetsdagar före idag, kvar = idag och framåt (totalt = gangna + kvar).
--    Per maskin dras maskinens stopp (stopp + stopp_maskin) bort. Globalt dras en
--    dag bort bara när ALLA kapacitetsmaskiner står (företagsgemensamt stopp).
--    Kapacitetsmaskin = Harvester/Forwarder, inte extramaskin, inte såld före månadens slut.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_ny_arbetsdagar(p_ar int, p_manad int, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (maskin_id text, totalt int, gangna int, kvar int, gangna_datum date[], kvar_datum date[])
LANGUAGE sql STABLE AS $$
  WITH man AS (
    SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month - 1 day')::date AS till),
  dagar AS (
    SELECT d::date AS datum FROM man, generate_series(man.fran, man.till, interval '1 day') d
    WHERE helikopter_ny_ar_arbetsdag(d::date)),
  maskiner AS (
    SELECT m.maskin_id FROM dim_maskin m, man
    WHERE m.maskin_typ IN ('Harvester', 'Forwarder')
      AND COALESCE(m.extramaskin, false) = false
      AND (m.aktiv_till IS NULL OR m.aktiv_till >= man.till)),
  stoppade AS (
    SELECT sm.maskin_id, d.datum
    FROM stopp s JOIN stopp_maskin sm ON sm.stopp_id = s.id
    JOIN dagar d ON d.datum BETWEEN s.fran_datum AND s.till_datum),
  per_maskin AS (
    SELECT mk.maskin_id, d.datum FROM maskiner mk CROSS JOIN dagar d
    WHERE NOT EXISTS (SELECT 1 FROM stoppade st WHERE st.maskin_id = mk.maskin_id AND st.datum = d.datum)),
  globalt AS (
    SELECT d.datum FROM dagar d
    WHERE NOT EXISTS (SELECT 1 FROM maskiner)
       OR EXISTS (SELECT 1 FROM per_maskin pm WHERE pm.datum = d.datum)),
  alla AS (
    SELECT NULL::text AS maskin_id, datum FROM globalt
    UNION ALL
    SELECT maskin_id, datum FROM per_maskin)
  SELECT a.maskin_id,
         count(*)::int AS totalt,
         count(*) FILTER (WHERE a.datum < p_idag)::int AS gangna,
         count(*) FILTER (WHERE a.datum >= p_idag)::int AS kvar,
         COALESCE(array_agg(a.datum ORDER BY a.datum) FILTER (WHERE a.datum < p_idag), '{}') AS gangna_datum,
         COALESCE(array_agg(a.datum ORDER BY a.datum) FILTER (WHERE a.datum >= p_idag), '{}') AS kvar_datum
  FROM alla a
  GROUP BY a.maskin_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Daglig produktion och skotning per typ och bolag (kalenderbas, m³fub).
--    typ = lower(dim_objekt.huvudtyp); saknad huvudtyp → 'okänd' (döljs inte).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW helikopter_ny_dag WITH (security_invoker = true) AS
  SELECT datum, typ, bolag, sum(skordat) AS skordat, sum(skotat) AS skotat
  FROM (
    SELECT p.datum, COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd') AS typ, NULLIF(btrim(d.bolag), '') AS bolag,
           p.volym_m3sub AS skordat, 0::numeric AS skotat
    FROM fakt_produktion p JOIN dim_objekt d ON d.objekt_id = p.objekt_id
    UNION ALL
    SELECT l.datum, COALESCE(NULLIF(lower(btrim(d.huvudtyp)), ''), 'okänd'), NULLIF(btrim(d.bolag), ''),
           0::numeric, l.volym_m3sub
    FROM fakt_lass l JOIN dim_objekt d ON d.objekt_id = l.objekt_id
  ) x
  GROUP BY datum, typ, bolag;

-- ---------------------------------------------------------------------------
-- 4. Spår per månad: beställt, skördat, skotat, takt (senaste 5 arbetsdagarna).
--    bas = 'bestallt' räknar bara bolag som HAR beställning för typ+månad;
--    bas = 'totalt' räknar alla bolag. Vyn väljer bestallt när beställning finns.
--    takt = summa över de senaste (upp till 5) GÅNGNA arbetsdagarna i månaden,
--    delat med antalet sådana dagar (takt_dagar). Dagar utan produktion räknas
--    som 0 — det är den ärliga dagstakten. Prognos visas först från arbetsdag 4
--    (takt_dagar >= 3) — den grinden sitter i _lib/berakningar.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_ny_spar(p_ar int, p_manad int, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  typ text, bas text, bestallt numeric, bolag text[],
  skordat numeric, skotat numeric,
  takt_skordat numeric, takt_skotat numeric, takt_dagar int, takt_fonster date[],
  oskotat_forandring_per_dag numeric)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  gangna AS (SELECT unnest(gangna_datum) AS d FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag) WHERE maskin_id IS NULL),
  fonster AS (SELECT d FROM gangna ORDER BY d DESC LIMIT 5),
  best AS (
    SELECT lower(btrim(b.typ)) AS typ, btrim(b.bolag) AS bolag, sum(b.volym) AS volym
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad
    GROUP BY 1, 2),
  typer AS (SELECT unnest(ARRAY['slutavverkning', 'gallring']) AS typ),
  baser AS (SELECT unnest(ARRAY['bestallt', 'totalt']) AS bas),
  dag AS (
    SELECT hd.* FROM helikopter_ny_dag hd, man WHERE hd.datum >= man.fran AND hd.datum < man.till_excl),
  rader AS (
    SELECT t.typ, bs.bas, d.datum, d.skordat, d.skotat
    FROM typer t CROSS JOIN baser bs
    JOIN dag d ON d.typ = t.typ
    WHERE bs.bas = 'totalt'
       OR EXISTS (SELECT 1 FROM best b WHERE b.typ = t.typ AND lower(b.bolag) = lower(d.bolag))),
  agg AS (
    SELECT t.typ, bs.bas,
           COALESCE(sum(r.skordat), 0) AS skordat,
           COALESCE(sum(r.skotat), 0) AS skotat,
           COALESCE(sum(r.skordat) FILTER (WHERE r.datum IN (SELECT d FROM fonster)), 0) AS f_skordat,
           COALESCE(sum(r.skotat)  FILTER (WHERE r.datum IN (SELECT d FROM fonster)), 0) AS f_skotat
    FROM typer t CROSS JOIN baser bs
    LEFT JOIN rader r ON r.typ = t.typ AND r.bas = bs.bas
    GROUP BY t.typ, bs.bas)
  SELECT a.typ, a.bas,
         COALESCE((SELECT sum(volym) FROM best b WHERE b.typ = a.typ), 0) AS bestallt,
         COALESCE((SELECT array_agg(b.bolag ORDER BY b.volym DESC, b.bolag) FROM best b WHERE b.typ = a.typ), '{}') AS bolag,
         a.skordat, a.skotat,
         CASE WHEN f.n > 0 THEN round(a.f_skordat / f.n, 1) END AS takt_skordat,
         CASE WHEN f.n > 0 THEN round(a.f_skotat  / f.n, 1) END AS takt_skotat,
         f.n::int AS takt_dagar,
         f.dagar AS takt_fonster,
         CASE WHEN f.n > 0 THEN round((a.f_skordat - a.f_skotat) / f.n, 1) END AS oskotat_forandring_per_dag
  FROM agg a
  CROSS JOIN (SELECT count(*) AS n, COALESCE(array_agg(d ORDER BY d), '{}') AS dagar FROM fonster) f
  ORDER BY a.typ, a.bas;
$$;

-- ---------------------------------------------------------------------------
-- 5. Bolag per månad och typ: lovat (beställt), skördat, skotat. Bolag med
--    produktion men utan beställning kommer med (lovat = 0) — "Övrigt".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_ny_bolag(p_ar int, p_manad int, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (typ text, bolag text, lovat numeric, skordat numeric, skotat numeric,
               takt_skordat numeric, takt_skotat numeric, takt_dagar int)
LANGUAGE sql STABLE AS $$
  WITH man AS (SELECT make_date(p_ar, p_manad, 1) AS fran, (make_date(p_ar, p_manad, 1) + interval '1 month')::date AS till_excl),
  gangna AS (SELECT unnest(gangna_datum) AS d FROM helikopter_ny_arbetsdagar(p_ar, p_manad, p_idag) WHERE maskin_id IS NULL),
  fonster AS (SELECT d FROM gangna ORDER BY d DESC LIMIT 5),
  n AS (SELECT count(*) AS n FROM fonster),
  best AS (
    SELECT lower(btrim(b.typ)) AS typ, btrim(b.bolag) AS bolag, sum(b.volym) AS lovat
    FROM bestallningar b WHERE b.ar = p_ar AND b.manad = p_manad GROUP BY 1, 2),
  prod AS (
    SELECT hd.typ, hd.bolag, sum(hd.skordat) AS skordat, sum(hd.skotat) AS skotat,
           sum(hd.skordat) FILTER (WHERE hd.datum IN (SELECT d FROM fonster)) AS f_skordat,
           sum(hd.skotat)  FILTER (WHERE hd.datum IN (SELECT d FROM fonster)) AS f_skotat
    FROM helikopter_ny_dag hd, man
    WHERE hd.datum >= man.fran AND hd.datum < man.till_excl AND hd.typ IN ('slutavverkning', 'gallring')
    GROUP BY 1, 2)
  SELECT COALESCE(b.typ, p.typ) AS typ,
         COALESCE(b.bolag, p.bolag) AS bolag,
         COALESCE(b.lovat, 0) AS lovat,
         COALESCE(p.skordat, 0) AS skordat,
         COALESCE(p.skotat, 0) AS skotat,
         CASE WHEN n.n > 0 THEN round(COALESCE(p.f_skordat, 0) / n.n, 1) END AS takt_skordat,
         CASE WHEN n.n > 0 THEN round(COALESCE(p.f_skotat, 0) / n.n, 1) END AS takt_skotat,
         n.n::int AS takt_dagar
  FROM best b
  FULL OUTER JOIN prod p ON p.typ = b.typ AND lower(p.bolag) = lower(b.bolag)
  CROSS JOIN n
  ORDER BY 1, 3 DESC, 4 DESC;
$$;

-- ---------------------------------------------------------------------------
-- 6. Historisk avvikelse per bolag+typ: verklig skördad volym / planerad
--    (objekt.volym) för avslutade objekt. Verkligt ur vy_objekt_utfall
--    (skördarraden). objekt ↔ dim_objekt via dim_objekt_id, annars vo_nummer;
--    flera dim_objekt-rader per vo summeras. Kräver planerad volym > 0 och bolag.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW helikopter_ny_bolag_avvikelse WITH (security_invoker = true) AS
  WITH koppling AS (
    SELECT o.id AS objekt_uuid, btrim(o.bolag) AS bolag, lower(btrim(o.typ)) AS typ, o.volym::numeric AS planerat, d.objekt_id
    FROM objekt o
    JOIN dim_objekt d
      ON (o.dim_objekt_id IS NOT NULL AND d.objekt_id = o.dim_objekt_id)
      OR (o.dim_objekt_id IS NULL AND NULLIF(btrim(o.vo_nummer), '') IS NOT NULL AND btrim(d.vo_nummer) = btrim(o.vo_nummer))
    WHERE o.volym IS NOT NULL AND o.volym > 0 AND NULLIF(btrim(o.bolag), '') IS NOT NULL
      AND d.skordning_avslutad IS NOT NULL),
  per_objekt AS (
    SELECT k.objekt_uuid, k.bolag, k.typ, k.planerat, sum(u.vol_m3sub) AS verkligt
    FROM koppling k
    JOIN vy_objekt_utfall u ON u.objekt_id = k.objekt_id AND u.roll = 'skordare'
    GROUP BY k.objekt_uuid, k.bolag, k.typ, k.planerat
    HAVING sum(u.vol_m3sub) > 0)
  SELECT bolag, typ,
         count(*)::int AS antal,
         round(avg(verkligt / planerat), 3) AS medel_kvot,
         round(stddev_samp(verkligt / planerat), 3) AS std_kvot
  FROM per_objekt
  GROUP BY bolag, typ;

-- ---------------------------------------------------------------------------
-- 7. Planering: månadens objekt med tolkad prognos och avslutstatus per roll.
--    manuell_prognos är STRÄNGAR ('50', ofta '') — tomt/ogiltigt → NULL, aldrig 0.
--    klar_* ur dim_objekt (vo-match) eller objekt.status = 'avslutat'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_ny_planering(p_ar int, p_manad int)
RETURNS TABLE (
  objekt_id uuid, namn text, vo_nummer text, typ text, bolag text, volym numeric, status text,
  skordare_maskin_id text, skotare_maskin_id text, skordare_utforare text, skotare_utforare text,
  prognos_skordare_h numeric, prognos_skotare_h numeric,
  klar_skordare boolean, klar_skotare boolean)
LANGUAGE sql STABLE AS $$
  WITH avslut AS (
    SELECT btrim(d.vo_nummer) AS vo,
           bool_or(d.skordning_avslutad IS NOT NULL OR d.skordning_avslutad_auto IS TRUE) AS skord,
           bool_or(d.skotning_avslutad IS NOT NULL OR d.skotning_avslutad_auto IS TRUE) AS skot
    FROM dim_objekt d WHERE NULLIF(btrim(d.vo_nummer), '') IS NOT NULL GROUP BY 1),
  tal AS (
    SELECT o.*,
      NULLIF(regexp_replace(COALESCE(o.manuell_prognos ->> 'skordare', ''), ',', '.', 'g'), '') AS ps,
      NULLIF(regexp_replace(COALESCE(o.manuell_prognos ->> 'skotare',  ''), ',', '.', 'g'), '') AS pt
    FROM objekt o WHERE o.ar = p_ar AND o.manad = p_manad)
  SELECT t.id, t.namn, t.vo_nummer, lower(btrim(t.typ)), NULLIF(btrim(t.bolag), ''), t.volym::numeric, t.status,
         t.skordare_maskin_id, t.skotare_maskin_id, t.skordare_utforare, t.skotare_utforare,
         CASE WHEN t.ps ~ '^[0-9]+(\.[0-9]+)?$' AND t.ps::numeric > 0 THEN t.ps::numeric END,
         CASE WHEN t.pt ~ '^[0-9]+(\.[0-9]+)?$' AND t.pt::numeric > 0 THEN t.pt::numeric END,
         t.status = 'avslutat' OR COALESCE(a.skord, false),
         t.status = 'avslutat' OR COALESCE(a.skot, false)
  FROM tal t LEFT JOIN avslut a ON a.vo = btrim(t.vo_nummer)
  ORDER BY t.typ, t.ordning NULLS LAST, t.namn;
$$;

-- ---------------------------------------------------------------------------
-- 8. Din maskin: pågående objekt för en maskin, gjort/kvar och maskinens egen
--    dagstakt (senaste 5 gångna arbetsdagarna, maskinens kalender). Skördare:
--    kvar = planerad volym − skördat. Skotare: kvar = skördat − skotat (oskotat).
--    Objektets volymer via dim_objekt (vo-match). Nästa = första planerade
--    objektet för maskinen (år, månad, ordning).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_ny_maskin(p_maskin_id text, p_idag date DEFAULT CURRENT_DATE)
RETURNS TABLE (roll text, objekt_id uuid, namn text, volym numeric, gjort numeric, kvar numeric,
               takt_per_dag numeric, takt_dagar int, nasta_namn text)
LANGUAGE sql STABLE AS $$
  WITH m AS (
    SELECT CASE WHEN maskin_typ = 'Harvester' THEN 'skordare' WHEN maskin_typ = 'Forwarder' THEN 'skotare' END AS roll
    FROM dim_maskin WHERE maskin_id = p_maskin_id),
  akt AS (
    SELECT o.id, o.namn, o.volym::numeric AS volym, btrim(o.vo_nummer) AS vo
    FROM objekt o, m
    WHERE o.status = 'pagaende'
      AND ((m.roll = 'skordare' AND o.skordare_maskin_id = p_maskin_id) OR (m.roll = 'skotare' AND o.skotare_maskin_id = p_maskin_id))
    ORDER BY o.ar NULLS LAST, o.manad NULLS LAST, o.ordning NULLS LAST, o.namn
    LIMIT 1),
  dims AS (SELECT d.objekt_id FROM dim_objekt d, akt WHERE btrim(d.vo_nummer) = akt.vo),
  vol AS (
    SELECT COALESCE((SELECT sum(volym_m3sub) FROM fakt_produktion WHERE objekt_id IN (SELECT objekt_id FROM dims)), 0) AS skordat,
           COALESCE((SELECT sum(volym_m3sub) FROM fakt_lass       WHERE objekt_id IN (SELECT objekt_id FROM dims)), 0) AS skotat),
  -- Maskinens egen kalender (efter stopp); extramaskin/såld maskin saknar egen rad → globala.
  kal AS (
    SELECT unnest(gangna_datum) AS d FROM (
      SELECT gangna_datum
      FROM helikopter_ny_arbetsdagar(extract(year FROM p_idag)::int, extract(month FROM p_idag)::int, p_idag)
      WHERE maskin_id = p_maskin_id OR maskin_id IS NULL
      ORDER BY maskin_id NULLS LAST LIMIT 1) k),
  fonster AS (SELECT d FROM kal ORDER BY d DESC LIMIT 5),
  takt AS (
    SELECT count(*) AS n,
           CASE WHEN (SELECT roll FROM m) = 'skordare'
                THEN COALESCE((SELECT sum(volym_m3sub) FROM fakt_produktion WHERE maskin_id = p_maskin_id AND datum IN (SELECT d FROM fonster)), 0)
                ELSE COALESCE((SELECT sum(volym_m3sub) FROM fakt_lass       WHERE maskin_id = p_maskin_id AND datum IN (SELECT d FROM fonster)), 0)
           END AS vol
    FROM fonster),
  nasta AS (
    SELECT o.namn FROM objekt o, m
    WHERE o.status = 'planerad'
      AND ((m.roll = 'skordare' AND o.skordare_maskin_id = p_maskin_id) OR (m.roll = 'skotare' AND o.skotare_maskin_id = p_maskin_id))
    ORDER BY o.ar NULLS LAST, o.manad NULLS LAST, o.ordning NULLS LAST, o.namn
    LIMIT 1)
  SELECT m.roll, akt.id, akt.namn, akt.volym,
         CASE WHEN m.roll = 'skordare' THEN vol.skordat ELSE vol.skotat END AS gjort,
         CASE WHEN m.roll = 'skordare' THEN GREATEST(COALESCE(akt.volym, 0) - vol.skordat, 0) ELSE GREATEST(vol.skordat - vol.skotat, 0) END AS kvar,
         CASE WHEN takt.n > 0 THEN round(takt.vol / takt.n, 1) END AS takt_per_dag,
         takt.n::int AS takt_dagar,
         (SELECT namn FROM nasta) AS nasta_namn
  FROM m JOIN akt ON true CROSS JOIN vol CROSS JOIN takt;
$$;

-- ---------------------------------------------------------------------------
-- 9. Senaste data: när fakta senast KOM IN (importtid, äkta UTC). Maskinernas
--    egna tidsstämplar (monitoring_start, lossnings_tid) ligger ~2 h EFTER
--    importtiden i databasen — de ser ut att vara lokal tid lagrad som UTC —
--    så de används inte här.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION helikopter_ny_senaste_data() RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT GREATEST((SELECT max(skapad_tid) FROM fakt_produktion), (SELECT max(skapad_tid) FROM fakt_lass));
$$;

-- ---------------------------------------------------------------------------
-- Rättigheter: inloggade får läsa/köra, anon inte.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION helikopter_ny_paskdagen(int), helikopter_ny_lediga_dagar(int), helikopter_ny_ar_arbetsdag(date),
  helikopter_ny_arbetsdagar(int, int, date), helikopter_ny_spar(int, int, date), helikopter_ny_bolag(int, int, date),
  helikopter_ny_planering(int, int), helikopter_ny_maskin(text, date), helikopter_ny_senaste_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION helikopter_ny_paskdagen(int), helikopter_ny_lediga_dagar(int), helikopter_ny_ar_arbetsdag(date),
  helikopter_ny_arbetsdagar(int, int, date), helikopter_ny_spar(int, int, date), helikopter_ny_bolag(int, int, date),
  helikopter_ny_planering(int, int), helikopter_ny_maskin(text, date), helikopter_ny_senaste_data() TO authenticated;
REVOKE ALL ON helikopter_ny_dag, helikopter_ny_bolag_avvikelse FROM PUBLIC, anon;
GRANT SELECT ON helikopter_ny_dag, helikopter_ny_bolag_avvikelse TO authenticated;

-- HELIKOPTER_M3FUB_FAKTOR = 1.0 — volym_m3sub ÄR m³fub. Behövs en omräkning
-- (t.ex. om källan blir volym_m3sob) sätts den i helikopter_ny_dag, ingen annanstans.
