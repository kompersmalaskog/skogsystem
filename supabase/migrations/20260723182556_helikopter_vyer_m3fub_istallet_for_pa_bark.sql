-- Helikoptervyerna summerade volym PÅ BARK (m3sob/fpb) men etiketterades m3fub.
-- Beställningar och objekt är i m3fub, så jämförelsen blev ~11% för optimistisk.
-- Byter till volym_m3sub (under bark = m3fub). Övriga vyer använder redan sub.

CREATE OR REPLACE VIEW helikopter_vy AS
 WITH skordare AS (
         SELECT fakt_produktion.objekt_id,
            sum(fakt_produktion.volym_m3sub) AS skordat_m3,
            min(fakt_produktion.datum) AS start_datum,
            max(fakt_produktion.datum) AS slut_datum
           FROM fakt_produktion
          GROUP BY fakt_produktion.objekt_id
        ), skotare AS (
         SELECT fakt_lass.objekt_id,
            sum(fakt_lass.volym_m3sub) AS skotat_m3,
            min(fakt_lass.datum) AS skotare_start
           FROM fakt_lass
          GROUP BY fakt_lass.objekt_id
        )
 SELECT o.objekt_id,
    o.object_name,
    o.vo_nummer,
    o.bolag,
    o.huvudtyp,
    o.inkopare,
    o.skogsagare,
    COALESCE(sk.skordat_m3, 0::numeric) AS skordat_m3,
    COALESCE(st.skotat_m3, 0::numeric) AS skotat_m3,
    COALESCE(sk.skordat_m3, 0::numeric) - COALESCE(st.skotat_m3, 0::numeric) AS oskotat_m3,
    sk.slut_datum AS skordare_klar,
    st.skotare_start,
        CASE
            WHEN st.skotare_start IS NULL AND sk.slut_datum IS NOT NULL THEN CURRENT_DATE - sk.slut_datum
            ELSE NULL::integer
        END AS dagar_vantar
   FROM dim_objekt o
     LEFT JOIN skordare sk ON o.objekt_id = sk.objekt_id
     LEFT JOIN skotare st ON o.objekt_id = st.objekt_id
  WHERE sk.skordat_m3 > 0::numeric;

CREATE OR REPLACE VIEW helikopter_oversikt AS
 SELECT b.bolag,
    b.ar,
    b.manad,
    b.typ,
    b.volym AS bestallning,
    COALESCE(prod.avverkat, 0::double precision) AS avverkat,
    COALESCE(lass.utskotat, 0::double precision) AS utskotat,
    round((COALESCE(prod.avverkat, 0::double precision) / NULLIF(b.volym, 0::double precision) * 100::double precision)::numeric, 1) AS procent_klart
   FROM bestallningar b
     LEFT JOIN ( SELECT d.bolag,
            EXTRACT(year FROM p.datum)::integer AS ar,
            EXTRACT(month FROM p.datum)::integer AS manad,
            sum(p.volym_m3sub)::double precision AS avverkat
           FROM fakt_produktion p
             JOIN dim_objekt d ON p.objekt_id = d.objekt_id
          GROUP BY d.bolag, (EXTRACT(year FROM p.datum)), (EXTRACT(month FROM p.datum))) prod ON b.bolag = prod.bolag AND b.ar = prod.ar AND b.manad = prod.manad
     LEFT JOIN ( SELECT d.bolag,
            EXTRACT(year FROM l.datum)::integer AS ar,
            EXTRACT(month FROM l.datum)::integer AS manad,
            sum(l.volym_m3sub)::double precision AS utskotat
           FROM fakt_lass l
             JOIN dim_objekt d ON l.objekt_id = d.objekt_id
          GROUP BY d.bolag, (EXTRACT(year FROM l.datum)), (EXTRACT(month FROM l.datum))) lass ON b.bolag = lass.bolag AND b.ar = lass.ar AND b.manad = lass.manad;
