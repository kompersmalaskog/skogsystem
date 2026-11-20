-- Historik: vyerna överskred 8 s statement_timeout för inloggade (vy_hist_objekt_lista 32 s, vy_hist_maskin_ar 24 s).
-- Orsaker (EXPLAIN ANALYZE i prod):
--   1. hist_objekt.dubblett_av saknade index: tvillinguppslagningen (lastcertifikat via dubblett_av) och antal_andra_utskrifter
--      körde Seq Scan på hist_objekt för VARJE rad, i en lateral subquery plus flera scalar subplans.
--   2. vy_hist_objekt_index: förartilldelningen (row_number rn = 1) joinades med Nested Loop + Materialize (14 miljoner bortfiltrerade
--      rader) eftersom planeraren trodde att den hade 2 rader mot 4 667.
-- Bara hist_/vy_hist_. Ingen data ändras; vyernas kolumner, ordning och typer är oförändrade och resultatet är identiskt
-- (md5 över alla rader före och efter är kontrollerat i prod).

-- a) index för tvillinguppslagning och antal utskrifter
CREATE INDEX IF NOT EXISTS hist_objekt_dubblett_av_idx ON public.hist_objekt (dubblett_av) WHERE dubblett_av IS NOT NULL;

-- b) vy_hist_objekt_bas: tvillingen tas fram EN gång per original (DISTINCT ON, samma val som ORDER BY sha256 LIMIT 1) och skiftens lass summeras
--    EN gång per rapport, båda som vanliga LEFT JOIN i stället för lateral subquery och scalar subplans per fält.
CREATE OR REPLACE VIEW public.vy_hist_objekt_bas WITH (security_invoker = true) AS
 WITH skift_lass AS (
         SELECT s.sha256,
            sum(s.antal_lass) AS lass
           FROM hist_skift s
          GROUP BY s.sha256
        ), tvilling AS (
         SELECT DISTINCT ON (d.dubblett_av) d.dubblett_av AS original_sha,
            d.sha256,
            d.volym_m3fub,
            d.volym_enhet,
            d.volym_kvalitet,
            d.antal_lass,
            sl.lass AS skift_lass
           FROM hist_objekt d
             JOIN hist_rapport dr ON dr.sha256 = d.sha256
             LEFT JOIN skift_lass sl ON sl.sha256 = d.sha256
          WHERE d.dubblett_av IS NOT NULL AND dr.format = 'lastcertifikat'::text
          ORDER BY d.dubblett_av, d.sha256
        )
 SELECT o.sha256,
    m.id AS hist_maskin_id,
    m.namn AS maskin,
    m.typ AS maskin_typ,
    EXTRACT(year FROM o.rapportdatum)::integer AS ar,
    o.rapportdatum,
    o.startdatum,
    o.slutdatum,
    o.objekt,
    COALESCE(k.nytt_varde, o.atgard) AS atgard,
        CASE
            WHEN k.nytt_varde IS NULL THEN o.atgard_kalla
            WHEN k.orsak = 'regel: rottne_gallring_bekraftad'::text THEN 'maskinstandard_bekraftad'::text
            WHEN k.orsak ~~ 'regel: arvd_fran_skordare%'::text THEN SUBSTRING(k.orsak FROM 8)
            WHEN k.orsak ~~ 'regel: kopplad_till_skordare_%'::text THEN SUBSTRING(k.orsak FROM 8)
            ELSE 'korrigering'::text
        END AS atgard_kalla,
    o.stammar,
        CASE
            WHEN f.saknas THEN NULL::numeric
            ELSE e.vol
        END::numeric(12,3) AS volym,
    COALESCE(t.volym_enhet, o.volym_enhet) AS volym_enhet,
    o.g15_h,
    o.g0_h,
    o.motortid_h,
    o.bransle_l,
    o.avbrott_reparation_min,
    o.avbrott_service_min,
    o.avbrott_storning_min,
    o.avbrott_registrerade,
        CASE
            WHEN o.stammar > 0 AND NOT f.saknas AND NOT g.osaker THEN e.vol / o.stammar::numeric
            ELSE NULL::numeric
        END AS medelstam,
        CASE
            WHEN o.g15_h > 0::numeric AND NOT f.saknas AND NOT g.osaker THEN e.vol / o.g15_h
            ELSE NULL::numeric
        END AS m3_per_g15,
    f.saknas AS volym_saknas_lass,
    t.sha256 AS tvilling_sha,
    COALESCE(t.skift_lass, t.antal_lass::bigint) AS tvilling_lass,
    t.volym_kvalitet AS tvilling_volym_kvalitet,
    g.osaker AS volym_osaker_lasstorlek,
    e.lass AS lass_eff,
    kh.sha256 IS NOT NULL AS volym_harledd,
        CASE
            WHEN kh.sha256 IS NULL THEN NULL::text
            WHEN kh.orsak ~~ 'regel: gavle_volym_fran_giant%'::text THEN 'giant'::text
            ELSE "substring"(kh.orsak, 'volym_fran_skordare_(.*)$'::text)
        END AS volym_harledd_kalla
   FROM hist_objekt o
     JOIN hist_rapport r ON r.sha256 = o.sha256
     JOIN hist_maskin m ON m.id = r.hist_maskin_id
     LEFT JOIN hist_korrigering k ON k.sha256 = o.sha256 AND k.falt = 'atgard'::text
     LEFT JOIN hist_korrigering kv ON kv.sha256 = o.sha256 AND kv.falt = 'volym_kvalitet'::text
     LEFT JOIN hist_korrigering kh ON kh.sha256 = o.sha256 AND kh.falt = 'volym_harledd'::text
     LEFT JOIN tvilling t ON t.original_sha = o.sha256
     LEFT JOIN skift_lass osl ON osl.sha256 = o.sha256
     CROSS JOIN LATERAL ( SELECT COALESCE(kv.nytt_varde,
                CASE
                    WHEN t.sha256 IS NOT NULL THEN t.volym_kvalitet
                    ELSE o.volym_kvalitet
                END) AS kvalitet,
            COALESCE(osl.lass, t.skift_lass, t.antal_lass::bigint, o.antal_lass::bigint) AS lass,
            COALESCE(kh.nytt_varde::numeric, t.volym_m3fub, o.volym_m3fub) AS vol) e
     CROSS JOIN LATERAL ( SELECT m.namn = 'Ponsse Wisent'::text AND (COALESCE(e.kvalitet, ''::text) = ANY (ARRAY['laster_x_1m3'::text, 'schablon_10m3'::text])) AND kh.sha256 IS NULL AS saknas) f
     CROSS JOIN LATERAL ( SELECT m.namn = 'Ponsse Wisent'::text AND NOT f.saknas AND kh.sha256 IS NULL AND e.vol > 0::numeric AND e.lass > 0 AND ((e.vol / e.lass::numeric) < 6::numeric OR (e.vol / e.lass::numeric) > 18::numeric) AS osaker) g
  WHERE o.raknas AND m.agare = 'egen'::text;

-- c) vy_hist_objekt_index: förartilldelningen med DISTINCT ON (sha256) i stället för row_number + rn = 1, så att den kan hash-joinas.
--    Samma ordning som förut (andel störst först, sedan hist_forare_id), alltså samma förare per rapport.
CREATE OR REPLACE VIEW public.vy_hist_objekt_index WITH (security_invoker = true) AS
 WITH fs AS (
         SELECT s.sha256,
            s.hist_forare_id,
            sum(COALESCE(s.g15_h, 0::numeric)) AS g15,
            sum(EXTRACT(epoch FROM
                CASE
                    WHEN s.ut_tid IS NULL THEN '00:00:00'::interval
                    WHEN s.ut_tid >= s.in_tid THEN s.ut_tid - s.in_tid
                    ELSE s.ut_tid - s.in_tid + '24:00:00'::interval
                END) / 3600.0) AS tid,
            0::numeric AS vol
           FROM hist_skift s
          WHERE s.sha256 IS NOT NULL
          GROUP BY s.sha256, s.hist_forare_id
        ), fo AS (
         SELECT hist_forare_objekt.sha256,
            hist_forare_objekt.hist_forare_id,
            COALESCE(hist_forare_objekt.g15_h, 0::numeric) AS g15,
            0::numeric AS tid,
            COALESCE(hist_forare_objekt.volym, 0::numeric) AS vol
           FROM hist_forare_objekt
        ), f AS (
         SELECT u.sha256,
            u.hist_forare_id,
            sum(u.g15) AS g15,
            sum(u.tid) AS tid,
            sum(u.vol) AS vol
           FROM ( SELECT fs.sha256,
                    fs.hist_forare_id,
                    fs.g15,
                    fs.tid,
                    fs.vol
                   FROM fs
                UNION ALL
                 SELECT fo.sha256,
                    fo.hist_forare_id,
                    fo.g15,
                    fo.tid,
                    fo.vol
                   FROM fo) u
             JOIN hist_forare hf_1 ON hf_1.id = u.hist_forare_id AND NOT hf_1.teknisk
          GROUP BY u.sha256, u.hist_forare_id
        ), t AS (
         SELECT f.sha256,
            sum(f.g15) AS tg,
            sum(f.tid) AS td,
            sum(f.vol) AS tv,
            count(*) AS nf
           FROM f
          GROUP BY f.sha256
        ), a0 AS (
         SELECT f.sha256,
            f.hist_forare_id,
                CASE
                    WHEN t.tg > 0::numeric THEN f.g15 / t.tg
                    WHEN t.td > 0::numeric THEN f.tid / t.td
                    WHEN t.tv > 0::numeric THEN f.vol / t.tv
                    ELSE 1.0 / t.nf::numeric
                END AS andel,
                CASE
                    WHEN t.tg > 0::numeric THEN 'g15'::text
                    WHEN t.td > 0::numeric THEN 'tid'::text
                    WHEN t.tv > 0::numeric THEN 'volym'::text
                    ELSE 'lika'::text
                END AS andel_kalla
           FROM f
             JOIN t ON t.sha256 = f.sha256
        ), topp AS (
         SELECT DISTINCT ON (a0.sha256) a0.sha256,
            a0.hist_forare_id,
            a0.andel,
            a0.andel_kalla
           FROM a0
          ORDER BY a0.sha256, a0.andel DESC, a0.hist_forare_id
        ), k AS (
         SELECT vy_hist_normkurva.atgard,
            vy_hist_normkurva.a,
            vy_hist_normkurva.b
           FROM vy_hist_normkurva
          WHERE vy_hist_normkurva.variant = 'g15-viktad'::text
        )
 SELECT b.sha256,
    b.maskin,
    b.ar,
    b.rapportdatum,
    b.objekt,
    b.atgard,
    b.atgard_kalla,
    hf.namn AS forare,
    tp.andel AS forare_andel,
    tp.andel_kalla,
    b.stammar,
    b.volym AS volym_m3fub,
    b.g15_h,
    b.medelstam,
    b.m3_per_g15,
        CASE
            WHEN k.a IS NOT NULL THEN exp(k.a + k.b * ln(b.medelstam::double precision))
            ELSE NULL::double precision
        END AS forvantad_m3_per_g15,
        CASE
            WHEN k.a IS NOT NULL THEN b.m3_per_g15::double precision / exp(k.a + k.b * ln(b.medelstam::double precision)) * 100::double precision
            ELSE NULL::double precision
        END AS index
   FROM vy_hist_objekt_bas b
     LEFT JOIN topp tp ON tp.sha256 = b.sha256
     LEFT JOIN hist_forare hf ON hf.id = tp.hist_forare_id
     LEFT JOIN k ON k.atgard = b.atgard AND b.g15_h >= 2::numeric AND b.stammar > 0 AND b.volym > 0::numeric
  WHERE b.maskin_typ = 'skördare'::text;

-- d) planeraren ska se verkliga radantal
ANALYZE public.hist_objekt;
ANALYZE public.hist_rapport;
ANALYZE public.hist_skift;
ANALYZE public.hist_korrigering;
