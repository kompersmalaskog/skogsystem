-- Steg 20 (2026-10-14): anpassningsområde för slutavverkningens normkurva + flaggan utanfor_normalomrade.
--
-- Varför: kurvan är G15-viktad, och ett enda objekt med många timmar och mycket liten medelstam drar i lutningen (b). Hästhagen
-- (Rottne H8E Logmax 2025, medelstam 0,075, 144 G15 h) var det enda slutavverkningsobjektet under 0,111 och hade Cook's distance 7,3
-- (alla andra högst 0,04); utan det går b från 0,739 till 0,676. Gallringen är stabil (högst 0,0045 per objekt) och får inget område.
--
-- Vad som ändras (bara vyer, inga data):
--   1. vy_hist_normkurva: slutavverkning anpassas bara på objekt med medelstam 0,10-1,5 m3. Gallring oförändrad. Kolumner oförändrade.
--   2. vy_hist_objekt_index: ny sista kolumn utanfor_normalomrade = slutavverkning med index och medelstam utanför 0,10-1,5.
--      Indexet räknas fortfarande för ALLA objekt (mot den nya kurvan); flaggan märker bara de som ligger utanför det kurvan är anpassad på.
--   3. vy_hist_objekt_lista: samma kolumn sist, så att objektlistan kan märka raden.
-- Gränserna 0.10 och 1.5 står på två ställen (kurvan och flaggan); lib/historik/normalomrade.test.ts larmar om de glider isär.
-- Beroende vyer (vy_hist_maskin_ar, _index_ar, _forare_maskin, _forare_maskin_jamfor) läser vyerna ovan och följer med utan ändring.

-- 1. normkurva
create or replace view public.vy_hist_normkurva with (security_invoker = true) as
with d as (
  select
    atgard,
    ln(medelstam::float8) as x,
    ln(m3_per_g15::float8) as y,
    g15_h::float8 as w
  from vy_hist_objekt_bas
  where maskin_typ = 'skördare'
    and atgard in ('gallring', 'slutavverkning')
    and coalesce(atgard_kalla, '') <> 'maskinstandard'
    and volym_enhet = 'fub'
    and g15_h >= 2
    and stammar > 0
    and volym > 0
    -- Anpassningsområde (steg 20): slutavverkning anpassas bara på medelstam 0,10-1,5 m3. Gallring har inget område.
    and (atgard <> 'slutavverkning' or (medelstam >= 0.10 and medelstam <= 1.5))
),
oviktad as (
  select atgard, 'oviktad'::text as variant,
         regr_intercept(y, x) as a, regr_slope(y, x) as b, count(*)::int as n, regr_r2(y, x) as r2
  from d
  group by atgard
),
s as (
  select atgard, count(*)::int as n, sum(w) as sw, sum(w * x) as swx, sum(w * y) as swy, sum(w * x * x) as swxx, sum(w * x * y) as swxy
  from d
  group by atgard
),
vb as (
  select atgard, n, sw, swy / sw as ybar,
         (swxy - swx * swy / sw) / (swxx - swx * swx / sw) as b,
         (swy - ((swxy - swx * swy / sw) / (swxx - swx * swx / sw)) * swx) / sw as a
  from s
),
viktad as (
  select vb.atgard, 'g15-viktad'::text as variant, vb.a, vb.b, vb.n,
         1 - sum(d.w * power(d.y - vb.a - vb.b * d.x, 2)) / sum(d.w * power(d.y - vb.ybar, 2)) as r2
  from vb
  join d on d.atgard = vb.atgard
  group by vb.atgard, vb.a, vb.b, vb.n
)
select atgard, variant, a, b, n, r2 from oviktad
union all
select atgard, variant, a, b, n, r2 from viktad;

-- 2. objekt med index + flagga
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
        END AS index,
        k.a IS NOT NULL AND b.atgard = 'slutavverkning'::text AND b.medelstam IS NOT NULL AND (b.medelstam < 0.10 OR b.medelstam > 1.5) AS utanfor_normalomrade
   FROM vy_hist_objekt_bas b
     LEFT JOIN topp tp ON tp.sha256 = b.sha256
     LEFT JOIN hist_forare hf ON hf.id = tp.hist_forare_id
     LEFT JOIN k ON k.atgard = b.atgard AND b.g15_h >= 2::numeric AND b.stammar > 0 AND b.volym > 0::numeric
  WHERE b.maskin_typ = 'skördare'::text;

-- 3. objektlistan
CREATE OR REPLACE VIEW public.vy_hist_objekt_lista WITH (security_invoker = true) AS
 SELECT b.sha256,
    b.maskin,
    b.maskin_typ AS typ,
    b.ar,
    b.atgard,
    b.atgard_kalla,
        CASE
            WHEN COALESCE(b.atgard_kalla, ''::text) <> 'maskinstandard'::text THEN 'namn'::text
            ELSE 'standard'::text
        END AS urval,
    b.objekt,
    b.startdatum,
    b.slutdatum,
    b.rapportdatum,
    b.stammar,
    b.volym AS volym_m3fub,
    b.g15_h,
    b.medelstam,
    b.m3_per_g15,
    i.forvantad_m3_per_g15,
    i.index,
    i.forare,
    i.forare_andel,
    i.andel_kalla AS forare_andel_kalla,
    b.avbrott_registrerade,
        CASE
            WHEN b.volym_harledd THEN 'fran_skordare_'::text || b.volym_harledd_kalla
            WHEN b.volym_saknas_lass THEN 'lass_utan_storlek'::text
            WHEN b.volym_osaker_lasstorlek THEN 'osaker_lasstorlek'::text
            WHEN b.tvilling_sha IS NOT NULL THEN b.tvilling_volym_kvalitet
            ELSE ho.volym_kvalitet
        END AS volym_kvalitet,
    r.storage_path,
    r.filtyp,
    r.format,
    r.filnamn,
    r.mejldatum,
    (( SELECT count(*) AS count
           FROM hist_objekt d
          WHERE d.dubblett_av = b.sha256))::integer AS antal_andra_utskrifter,
    i.utanfor_normalomrade
   FROM vy_hist_objekt_bas b
     JOIN hist_rapport r ON r.sha256 = b.sha256
     JOIN hist_objekt ho ON ho.sha256 = b.sha256
     LEFT JOIN vy_hist_objekt_index i ON i.sha256 = b.sha256;
