-- ── 6. Vyer ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- tidpunkt behåller sitt namn och sin typ (det lagrade värdet); tid_ar_utc och tidpunkt_lokal läggs sist så att CREATE OR REPLACE
-- räcker. Läsare som vill ha dag/månad använder tidpunkt_lokal — den är svensk väggklocka oavsett radens konvention.
CREATE OR REPLACE VIEW vy_skordarmatt_stock WITH (security_invoker = true) AS
 SELECT st.id AS stock_id,
    st.maskin_id,
    st.objekt_id,
    st.stem_key,
    st.log_key,
    st.sortiment_id,
    st.volym_m3sub,
    st.toppdia_ub_mm,
    sm.tidpunkt,
    st.langd_cm,
    sm.tradslag_id,
    sm.tid_ar_utc,
    opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc) AS tidpunkt_lokal
   FROM (detalj_stock st
     JOIN detalj_stam sm ON (((sm.maskin_id = st.maskin_id) AND (sm.stam_key = st.stem_key) AND (sm.objekt_id = st.objekt_id))))
  WHERE ((st.stem_key IS NOT NULL) AND (st.log_key IS NOT NULL));

CREATE OR REPLACE VIEW vy_virke_karta AS
 SELECT s.id,
    s.latitude,
    s.longitude,
    st.sortiment_namn,
    st.volym_m3sub,
    o.vo_nummer,
    o.object_name AS trakt,
    (opti_tid_lokal(s.tidpunkt, s.tid_ar_utc))::date AS datum
   FROM ((detalj_stam s
     JOIN detalj_stock st ON ((s.id = st.stam_id)))
     JOIN dim_objekt o ON ((s.objekt_id = o.objekt_id)))
  WHERE (s.latitude IS NOT NULL);
