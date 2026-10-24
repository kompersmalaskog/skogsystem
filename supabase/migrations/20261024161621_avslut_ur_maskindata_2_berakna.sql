-- AVSLUT UR MASKINDATA, del 2 av 4: räkningen (bara läsning).
--
-- REGEL: ett maskinslag är klart på ett objekt när maskinen har GÅTT VIDARE — den har arbetat på ett ANNAT objekt
-- en senare dag än sin sista dag här. Klar-datumet är maskinens sista dag på objektet. Att filerna bara slutar komma
-- räcker aldrig (helg, service, semester ser likadant ut).
--
--   Skördning: skördarnas produktion (fakt_produktion, volym > 0). Alla skördare på objektet måste ha gått vidare.
--   Skotning:  skotarnas lass (fakt_lass), MOM-tid med arbete (fakt_tid, G15 > 0) och appens lass (skotar_lass, ej
--              strukna). Alla skotare måste ha gått vidare, OCH skotat ≥ 90 % av skördat (per maskin det största av
--              Opti-lassen och appens lass — de mäter samma lass). GROT (inget skördat) räcker med att skotaren gått
--              vidare. Manuella maskiner (810E, datakalla = 'manuell') räknas inte: "ingen fil" betyder där "ingen
--              har rapporterat".
--
-- Ett OBJEKT är en grupp: planeringsobjektets VO-nummer + dess extra nummer (objekt_alt_nummer) + dim_objekt_id
-- (Mölleryd: skördarens 11166477 och skotarens 11271883 är ett objekt). dim-rader utan planeringsobjekt är egna grupper.
-- Facit (prod 2026-10-24): 105 objekt med skördning satt för hand — regeln ger samma dag på 83, inom 3 dagar på 93.

CREATE OR REPLACE FUNCTION public.sv_kort_datum(d date) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT extract(day FROM d)::int || ' ' ||
    (ARRAY['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'])[extract(month FROM d)::int];
$$;

CREATE OR REPLACE FUNCTION public.avslut_ur_maskindata_berakna()
RETURNS TABLE (
  gkey text, ids text[], namn text, alla_exkl boolean, ext_skord boolean, ej_var_skot boolean, grot boolean,
  skordat numeric, skotat numeric,
  skord_klar boolean, skord_datum date, skord_skal text,
  skot_klar boolean, skot_datum date, skot_skal text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH
plan_nr AS (
  SELECT o.id pid, o.vo_nummer nr FROM objekt o WHERE coalesce(o.vo_nummer,'') NOT IN ('','.')
  UNION SELECT o.id, o.dim_objekt_id FROM objekt o WHERE o.dim_objekt_id IS NOT NULL
  UNION SELECT a.objekt_id, a.nummer FROM objekt_alt_nummer a WHERE a.maskin_id IS NULL
  UNION SELECT a.objekt_id, a.maskin_id || '_' || substr(a.nummer, 2) FROM objekt_alt_nummer a
    WHERE a.maskin_id IS NOT NULL AND a.nummer LIKE 'k%'
),
dg AS (
  SELECT d.objekt_id, d.vo_nummer, d.object_name, d.huvudtyp,
    coalesce((SELECT p.pid::text FROM plan_nr p
              WHERE p.nr = d.objekt_id OR (coalesce(d.vo_nummer,'') NOT IN ('','.') AND p.nr = d.vo_nummer)
              ORDER BY p.pid LIMIT 1), 'd:' || d.objekt_id) gkey,
    coalesce(d.exkludera, false) exkl, coalesce(d.extern_skordning, false) ext_skord,
    coalesce(d.egen_skotning, false) OR coalesce(d.ovrigt_info, '') ~ '"extern_skotning"\s*:\s*true' ej_skot
  FROM dim_objekt d
),
grp AS (
  SELECT dg.gkey, array_agg(dg.objekt_id ORDER BY dg.objekt_id) ids,
    array_agg(DISTINCT dg.vo_nummer) FILTER (WHERE coalesce(dg.vo_nummer,'') NOT IN ('','.')) vos,
    bool_and(dg.exkl) alla_exkl, bool_or(dg.ext_skord) ext_skord, bool_or(dg.ej_skot) ej_var_skot,
    bool_or(lower(coalesce(dg.huvudtyp,'')) = 'grot') grot, min(dg.object_name) namn
  FROM dg GROUP BY dg.gkey
),
idmap AS (
  SELECT DISTINCT ON (u.nr) u.nr, u.gkey FROM (
    SELECT unnest(g.ids) nr, g.gkey FROM grp g
    UNION ALL SELECT unnest(g.vos), g.gkey FROM grp g
    UNION ALL SELECT g.gkey, g.gkey FROM grp g WHERE g.gkey NOT LIKE 'd:%'
  ) u ORDER BY u.nr, u.gkey
),
prod_g AS (
  SELECT p.maskin_id, p.datum, coalesce(m.gkey, 'x:' || p.objekt_id) gkey, p.objekt_id, sum(p.volym_m3sub) m3
  FROM fakt_produktion p
  JOIN dim_maskin dm ON dm.maskin_id = p.maskin_id AND dm.maskin_typ = 'Harvester'
  LEFT JOIN idmap m ON m.nr = p.objekt_id
  WHERE coalesce(p.volym_m3sub, 0) > 0
  GROUP BY 1, 2, 3, 4
),
sk AS (SELECT q.gkey, q.maskin_id, max(q.datum) sista, sum(q.m3) m3 FROM prod_g q WHERE q.gkey NOT LIKE 'x:%' GROUP BY 1, 2),
sk_v AS (
  SELECT s.gkey, s.maskin_id, s.sista, s.m3,
    (SELECT p.gkey FROM prod_g p WHERE p.maskin_id = s.maskin_id AND p.gkey <> s.gkey AND p.datum > s.sista
       ORDER BY p.datum, p.gkey LIMIT 1) nasta_g,
    (SELECT min(p.datum) FROM prod_g p WHERE p.maskin_id = s.maskin_id AND p.gkey <> s.gkey AND p.datum > s.sista) nasta_dag
  FROM sk s
),
skord AS (
  SELECT v.gkey, max(v.sista) datum, bool_and(v.nasta_dag IS NOT NULL) klar, sum(v.m3) m3,
    (array_agg(v.maskin_id ORDER BY v.sista DESC, v.maskin_id))[1] maskin,
    (array_agg(v.nasta_g ORDER BY v.sista DESC, v.maskin_id))[1] nasta_g,
    (array_agg(v.nasta_dag ORDER BY v.sista DESC, v.maskin_id))[1] nasta_dag
  FROM sk_v v GROUP BY 1
),
akt AS (
  SELECT l.maskin_id, l.objekt_id, NULL::text vo, NULL::uuid pid, l.datum FROM fakt_lass l
  UNION ALL
  SELECT t.maskin_id, t.objekt_id, NULL, NULL, t.datum FROM fakt_tid t
    JOIN dim_maskin m ON m.maskin_id = t.maskin_id AND m.maskin_typ = 'Forwarder'
    WHERE coalesce(t.processing_sek,0) + coalesce(t.terrain_sek,0) + coalesce(t.other_work_sek,0) > 0
  UNION ALL
  SELECT s.maskin_id, NULL, s.vo_nummer, s.objekt_id, s.datum FROM skotar_lass s WHERE s.status <> 'struket'
),
akt_d AS (
  SELECT DISTINCT coalesce(m1.gkey, m2.gkey, m3.gkey, 'x:' || coalesce(a.objekt_id, a.vo, a.pid::text)) gkey,
    a.maskin_id, a.datum
  FROM akt a
  JOIN dim_maskin dm ON dm.maskin_id = a.maskin_id AND coalesce(dm.datakalla, '') <> 'manuell'
  LEFT JOIN idmap m1 ON m1.nr = a.objekt_id
  LEFT JOIN idmap m2 ON m2.nr = a.pid::text
  LEFT JOIN idmap m3 ON m3.nr = a.vo
  WHERE a.datum IS NOT NULL
),
st AS (SELECT a.gkey, a.maskin_id, max(a.datum) sista FROM akt_d a WHERE a.gkey NOT LIKE 'x:%' GROUP BY 1, 2),
st_v AS (
  SELECT s.gkey, s.maskin_id, s.sista,
    (SELECT a.gkey FROM akt_d a WHERE a.maskin_id = s.maskin_id AND a.gkey <> s.gkey AND a.datum > s.sista
       ORDER BY a.datum, a.gkey LIMIT 1) nasta_g,
    (SELECT min(a.datum) FROM akt_d a WHERE a.maskin_id = s.maskin_id AND a.gkey <> s.gkey AND a.datum > s.sista) nasta_dag
  FROM st s
),
skot AS (
  SELECT v.gkey, max(v.sista) datum, bool_and(v.nasta_dag IS NOT NULL) klar,
    (array_agg(v.maskin_id ORDER BY v.sista DESC, v.maskin_id))[1] maskin,
    (array_agg(v.nasta_g ORDER BY v.sista DESC, v.maskin_id))[1] nasta_g,
    (array_agg(v.nasta_dag ORDER BY v.sista DESC, v.maskin_id))[1] nasta_dag
  FROM st_v v GROUP BY 1
),
skotat AS (
  SELECT z.gkey, sum(z.m3) m3 FROM (
    SELECT g.gkey, x.maskin_id, greatest(coalesce(x.opti, 0), coalesce(x.app, 0)) m3 FROM grp g
    CROSS JOIN LATERAL (
      SELECT y.maskin_id, sum(y.opti) opti, sum(y.app) app FROM (
        SELECT l.maskin_id, l.volym_m3sub opti, 0::numeric app FROM fakt_lass l WHERE l.objekt_id = ANY (g.ids)
        UNION ALL
        SELECT s.maskin_id, 0, ss.m3_forare FROM skotar_lass s JOIN skotar_lass_sortiment ss ON ss.lass_id = s.id
          WHERE s.status <> 'struket'
            AND (s.objekt_id::text = g.gkey OR s.vo_nummer = ANY (g.ids) OR s.vo_nummer = ANY (coalesce(g.vos, '{}')))
      ) y GROUP BY 1
    ) x
  ) z GROUP BY 1
)
SELECT g.gkey, g.ids, g.namn, g.alla_exkl, g.ext_skord, g.ej_var_skot, g.grot,
  round(coalesce(sd.m3, 0), 1), round(coalesce(sa.m3, 0), 1),
  coalesce(sd.klar, false), sd.datum,
  CASE WHEN sd.klar THEN coalesce(m1.visningsnamn, sd.maskin) || ' körde vidare till '
    || coalesce((SELECT min(x.object_name) FROM dg x WHERE x.gkey = sd.nasta_g), 'ett annat objekt')
    || ' ' || sv_kort_datum(sd.nasta_dag) END,
  coalesce(st.klar, false)
    AND (CASE WHEN coalesce(sd.m3, 0) > 0 THEN coalesce(sa.m3, 0) >= 0.9 * sd.m3 ELSE g.grot END),
  st.datum,
  CASE WHEN st.klar THEN coalesce(m2.visningsnamn, st.maskin) || ' körde vidare till '
    || coalesce((SELECT min(x.object_name) FROM dg x WHERE x.gkey = st.nasta_g), 'ett annat objekt')
    || ' ' || sv_kort_datum(st.nasta_dag) END
FROM grp g
LEFT JOIN skord sd ON sd.gkey = g.gkey
LEFT JOIN skot st ON st.gkey = g.gkey
LEFT JOIN skotat sa ON sa.gkey = g.gkey
LEFT JOIN dim_maskin m1 ON m1.maskin_id = sd.maskin
LEFT JOIN dim_maskin m2 ON m2.maskin_id = st.maskin
WHERE sd.gkey IS NOT NULL OR st.gkey IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.avslut_ur_maskindata_berakna() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avslut_ur_maskindata_berakna() TO authenticated, service_role;
