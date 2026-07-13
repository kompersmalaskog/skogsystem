-- Maskinspecifika kravprofiler (VIDA / BIOMETRIA) — ersätter global ±4mm/±2cm-bedömning.
--
-- Statuslogiken (app/kalibrering + app/api/kalibrering/bedomning) bedömer en maskins
-- mätnoggrannhet mot DENNA tabell över ett rullande 90-DAGARSFÖNSTER, i stället för
-- en global snittavvikelse. Bedöms på: träffprocent, systematisk avvikelse,
-- standardavvikelse och (BIOMETRIA) andel grova avvikelser — sämsta metriken styr.
--
-- Tall/normaliserat: en rad per (profil, variabel, metrik). VIDA:s mål/golv-trappa
-- och BIOMETRIAs enkeltröskel ryms i samma mal/golv-par (BIOMETRIA: mal = golv →
-- binär grå/röd, ingen orange).
--
-- VIKTIGT: kolumnen `tolerans` betyder TVÅ saker beroende på metrik —
--   metrik='traffprocent'   → toleransfönster (andel INOM ±tolerans)
--   metrik='grov_avvikelse' → avvikelsegräns  (andel ÖVER tolerans)
-- Läs alltid `metrik` först.
--
-- KÖRD MOT PROD 2026-07-13.

create table if not exists kravprofil (
  id        bigserial primary key,
  profil    text    not null,               -- 'VIDA' | 'BIOMETRIA'
  variabel  text    not null,               -- 'diameter' | 'langd'
  metrik    text    not null,               -- 'traffprocent'|'systematisk'|'standardavv'|'grov_avvikelse'
  riktning  text    not null,               -- 'hog_bra' (träff↑) | 'lag_bra' (avvikelse↓)
  tolerans  numeric,                         -- ±fönster (träff=mm/cm, grov=mm/cm); NULL för sys/std
  mal       numeric not null,               -- grå-gräns (mål uppnått)
  golv      numeric not null,               -- röd-gräns (under golvet). mal==golv ⇒ binär
  enhet     text    not null,               -- 'mm' | 'cm' | '%'
  larm_min_matt integer,                    -- minsta underlag i perioden för att larma (bara traffprocent-raden)
  unique (profil, variabel, metrik)
);

-- === VIDA (PONSSE Scorpion) — kundavtal ===
insert into kravprofil (profil,variabel,metrik,riktning,tolerans,mal,golv,enhet,larm_min_matt) values
 ('VIDA','diameter','traffprocent','hog_bra', 4,  85, 75,'%',  150),
 ('VIDA','diameter','systematisk', 'lag_bra', null,1.0,1.5,'mm', null),
 ('VIDA','diameter','standardavv', 'lag_bra', null,3.5,4.5,'mm', null),
 ('VIDA','langd',   'traffprocent','hog_bra', 1.5,100, 95,'%',  40)
on conflict (profil,variabel,metrik) do nothing;

-- === BIOMETRIA (R64428) — Kvalitetssäkrad mätning skördare 2021-08-01, tab 2, revisors granskning M1–M2 ===
insert into kravprofil (profil,variabel,metrik,riktning,tolerans,mal,golv,enhet,larm_min_matt) values
 ('BIOMETRIA','diameter','traffprocent', 'hog_bra', 4,  55, 55,'%', 150),
 ('BIOMETRIA','diameter','systematisk',  'lag_bra', null,3.0,3.0,'mm', null),
 ('BIOMETRIA','diameter','standardavv',  'lag_bra', null,6.5,6.5,'mm', null),
 ('BIOMETRIA','diameter','grov_avvikelse','lag_bra', 20, 5,  5, '%', null),  -- andel >20mm < 5%
 ('BIOMETRIA','langd',   'traffprocent', 'hog_bra', 2,  70, 70,'%',  40),
 ('BIOMETRIA','langd',   'systematisk',  'lag_bra', null,2.0,2.0,'cm', null),
 ('BIOMETRIA','langd',   'standardavv',  'lag_bra', null,3.0,3.0,'cm', null),
 ('BIOMETRIA','langd',   'grov_avvikelse','lag_bra', 10, 5,  5, '%', null)   -- andel >10cm < 5%
on conflict (profil,variabel,metrik) do nothing;

-- === Maskin → profil ===
alter table dim_maskin add column if not exists kravprofil text;
update dim_maskin set kravprofil = 'VIDA'      where maskin_id = 'PONS20SDJAA270231';
update dim_maskin set kravprofil = 'BIOMETRIA' where maskin_id = 'R64428';
-- R64101 lämnas NULL (såld — döljs via aktiv_till='2026-03-11', historik kvar).
