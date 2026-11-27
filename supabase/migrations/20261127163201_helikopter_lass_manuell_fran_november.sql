-- Helikopterns skotat följer den manuella totalvolymen per trakt (skotare_objekt_manuell) från och med 2026-11-01, som maskinvyn.
-- Före 1 nov är allt som förut (ingen historik skrivs om). Trakter som började i oktober: oktoberdelen står kvar, resten av totalen läggs på november.
-- Bakåt: skapa om helikopter_lass som SELECT * FROM helikopter_lass_bas (rollback i migrationens kommentar nedan).
-- 1) Den gamla definitionen sparas oförändrad under nytt namn.
CREATE OR REPLACE VIEW public.helikopter_lass_bas AS
 WITH app_rad AS (
         SELECT l.id, l.maskin_id, l.vo_nummer, l.objekt_id AS app_objekt,
            ((d.lossad_tid AT TIME ZONE 'Europe/Stockholm'::text))::date AS datum,
            sum((r.m3_forare * COALESCE(((a_1.faktorer ->> r.sortiment_nyckel))::numeric, (1)::numeric))) AS m3,
            max(COALESCE(l.bekraftad_tid, l.andrad, l.skapad)) AS skapad_tid
           FROM (((skotar_lass l
             JOIN skotar_lass_del d ON ((d.lass_id = l.id)))
             JOIN skotar_lass_sortiment r ON (((r.lass_id = d.lass_id) AND (r.del_nr = d.del_nr))))
             LEFT JOIN skotar_trakt_avslut a_1 ON ((a_1.objekt_id = l.objekt_id)))
          WHERE ((l.status = 'bekraftat'::text) AND (l.bekraftad_av IS DISTINCT FROM 'auto'::text) AND (d.lossad_tid IS NOT NULL))
          GROUP BY l.id, l.maskin_id, l.vo_nummer, l.objekt_id, d.del_nr, d.lossad_tid
        ), app_obj AS (
         SELECT ar.id, ar.maskin_id, ar.vo_nummer, ar.app_objekt, ar.datum, ar.m3, ar.skapad_tid,
            ( SELECT d.objekt_id FROM dim_objekt d
                  WHERE ((d.objekt_id = ar.vo_nummer) OR (btrim(d.vo_nummer) = btrim(ar.vo_nummer)))
                  ORDER BY (d.objekt_id = ar.vo_nummer) DESC, (d.objekt_id ~~ (ar.maskin_id || '\_%'::text)) DESC, d.objekt_id
                 LIMIT 1) AS objekt_id
           FROM app_rad ar
        ), app_dag AS (
         SELECT app_obj.maskin_id, app_obj.objekt_id, app_obj.datum, sum(app_obj.m3) AS m3, max(app_obj.skapad_tid) AS skapad_tid
           FROM app_obj WHERE (app_obj.objekt_id IS NOT NULL)
          GROUP BY app_obj.maskin_id, app_obj.objekt_id, app_obj.datum
        ), tillagg AS (
         SELECT ( SELECT ao.maskin_id FROM app_obj ao WHERE (ao.app_objekt = a_1.objekt_id)
                  GROUP BY ao.maskin_id ORDER BY (count(*)) DESC, ao.maskin_id LIMIT 1) AS maskin_id,
            ( SELECT ao.objekt_id FROM app_obj ao WHERE ((ao.app_objekt = a_1.objekt_id) AND (ao.objekt_id IS NOT NULL)) LIMIT 1) AS objekt_id,
            ((a_1.avslutad_tid AT TIME ZONE 'Europe/Stockholm'::text))::date AS datum,
            ( SELECT COALESCE(sum((jsonb_each_text.value)::numeric), (0)::numeric) AS "coalesce"
                   FROM jsonb_each_text(COALESCE(a_1.tillagg, '{}'::jsonb)) jsonb_each_text(key, value)) AS m3,
            a_1.avslutad_tid AS skapad_tid
           FROM skotar_trakt_avslut a_1
        ), app_allt AS (
         SELECT x.maskin_id, x.objekt_id, x.datum, sum(x.m3) AS m3, max(x.skapad_tid) AS skapad_tid
           FROM ( SELECT app_dag.maskin_id, app_dag.objekt_id, app_dag.datum, app_dag.m3, app_dag.skapad_tid FROM app_dag
                UNION ALL
                 SELECT tillagg.maskin_id, tillagg.objekt_id, tillagg.datum, tillagg.m3, tillagg.skapad_tid FROM tillagg
                  WHERE ((tillagg.maskin_id IS NOT NULL) AND (tillagg.objekt_id IS NOT NULL) AND (tillagg.m3 > (0)::numeric))) x
          GROUP BY x.maskin_id, x.objekt_id, x.datum
        ), opti_dag AS (
         SELECT fakt_lass.maskin_id, fakt_lass.objekt_id, fakt_lass.datum, sum(fakt_lass.volym_m3sub) AS m3, max(fakt_lass.skapad_tid) AS skapad_tid
           FROM fakt_lass GROUP BY fakt_lass.maskin_id, fakt_lass.objekt_id, fakt_lass.datum
        )
 SELECT COALESCE(o.datum, a.datum) AS datum,
    COALESCE(o.maskin_id, a.maskin_id) AS maskin_id,
    COALESCE(o.objekt_id, a.objekt_id) AS objekt_id,
        CASE WHEN (o.m3 IS NULL) THEN a.m3 WHEN (a.m3 IS NULL) THEN o.m3 WHEN (a.m3 > o.m3) THEN a.m3 ELSE o.m3 END AS volym_m3sub,
    GREATEST(o.skapad_tid, a.skapad_tid) AS skapad_tid,
        CASE WHEN (o.m3 IS NULL) THEN 'app'::text WHEN (a.m3 IS NULL) THEN 'opti'::text WHEN (a.m3 > o.m3) THEN 'app'::text ELSE 'opti'::text END AS kalla
   FROM (opti_dag o FULL JOIN app_allt a ON (((a.maskin_id = o.maskin_id) AND (a.objekt_id = o.objekt_id) AND (a.datum = o.datum))));

-- 2) helikopter_lass = bas + manuell total från 2026-11-01.
CREATE OR REPLACE VIEW public.helikopter_lass AS
 WITH bas AS (SELECT * FROM helikopter_lass_bas),
 fran AS (SELECT date '2026-11-01' AS d),
 man AS (SELECT objekt_id, maskin_id, sum(volym_m3) AS volym FROM skotare_objekt_manuell WHERE volym_m3 > 0 GROUP BY 1, 2),
 spec AS (SELECT objekt_id, maskin_id, volym FROM man WHERE maskin_id IS NOT NULL),
 objn AS (SELECT m.objekt_id, NULL::text AS maskin_id, m.volym FROM man m
          WHERE m.maskin_id IS NULL AND NOT EXISTS (SELECT 1 FROM man s WHERE s.objekt_id = m.objekt_id AND s.maskin_id IS NOT NULL)),
 grp AS (SELECT * FROM spec UNION ALL SELECT * FROM objn),
 skot AS (SELECT maskin_id FROM dim_maskin WHERE maskin_typ = 'Forwarder'),
 tidr AS (SELECT t.maskin_id, t.objekt_id, t.datum,
            sum(COALESCE(t.processing_sek,0) + COALESCE(t.terrain_sek,0) + COALESCE(t.other_work_sek,0)) AS sek
          FROM fakt_tid t WHERE t.objekt_id IS NOT NULL AND t.maskin_id IN (SELECT maskin_id FROM skot) GROUP BY 1, 2, 3),
 dl AS (SELECT g.objekt_id, COALESCE(g.maskin_id,'*') AS gm, b.maskin_id, b.datum, b.volym_m3sub AS v
        FROM grp g JOIN bas b ON b.objekt_id = g.objekt_id AND (g.maskin_id IS NULL OR b.maskin_id = g.maskin_id)),
 dt AS (SELECT g.objekt_id, COALESCE(g.maskin_id,'*') AS gm, t.maskin_id, t.datum, t.sek
        FROM grp g JOIN tidr t ON t.objekt_id = g.objekt_id AND (g.maskin_id IS NULL OR t.maskin_id = g.maskin_id) WHERE t.sek > 0),
 omf AS (SELECT g.objekt_id, COALESCE(g.maskin_id,'*') AS gm, g.volym,
           COALESCE((SELECT sum(x.v) FROM dl x WHERE x.objekt_id = g.objekt_id AND x.gm = COALESCE(g.maskin_id,'*') AND x.datum < (SELECT d FROM fran)), 0) AS fore
         FROM grp g
         WHERE EXISTS (SELECT 1 FROM dl x WHERE x.objekt_id = g.objekt_id AND x.gm = COALESCE(g.maskin_id,'*') AND x.datum >= (SELECT d FROM fran))
            OR EXISTS (SELECT 1 FROM dt x WHERE x.objekt_id = g.objekt_id AND x.gm = COALESCE(g.maskin_id,'*') AND x.datum >= (SELECT d FROM fran))),
 rest AS (SELECT *, volym - fore AS kvar FROM omf WHERE volym - fore > 0),
 vikt AS (
   SELECT r.objekt_id, r.gm, r.kvar, t.maskin_id, t.datum, t.sek::numeric AS w
     FROM rest r JOIN dt t ON t.objekt_id = r.objekt_id AND t.gm = r.gm AND t.datum >= (SELECT d FROM fran)
   UNION ALL
   SELECT r.objekt_id, r.gm, r.kvar, l.maskin_id, l.datum, l.v
     FROM rest r JOIN dl l ON l.objekt_id = r.objekt_id AND l.gm = r.gm AND l.datum >= (SELECT d FROM fran) AND l.v > 0
    WHERE NOT EXISTS (SELECT 1 FROM dt t WHERE t.objekt_id = r.objekt_id AND t.gm = r.gm AND t.datum >= (SELECT d FROM fran))),
 ny AS (SELECT maskin_id, objekt_id, datum, sum(kvar * w / tot) AS v
        FROM (SELECT *, sum(w) OVER (PARTITION BY objekt_id, gm) AS tot FROM vikt) q GROUP BY 1, 2, 3)
 SELECT b.datum, b.maskin_id, b.objekt_id, b.volym_m3sub, b.skapad_tid, b.kalla
   FROM bas b
  WHERE NOT (b.datum >= (SELECT d FROM fran) AND EXISTS (SELECT 1 FROM rest r WHERE r.objekt_id = b.objekt_id AND (r.gm = '*' OR r.gm = b.maskin_id)))
 UNION ALL
 SELECT n.datum, n.maskin_id, n.objekt_id, n.v AS volym_m3sub,
        COALESCE((SELECT max(b2.skapad_tid) FROM bas b2 WHERE b2.objekt_id = n.objekt_id), now()) AS skapad_tid,
        'manuell'::text AS kalla
   FROM ny n;

-- ROLLBACK: CREATE OR REPLACE VIEW public.helikopter_lass AS SELECT * FROM public.helikopter_lass_bas;
