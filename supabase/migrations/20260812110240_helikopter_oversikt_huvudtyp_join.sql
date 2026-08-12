-- helikopter_oversikt kopplade avverkat/skotat per bolag+ar+manad men INTE per typ,
-- så samma klumpsumma hängdes på både gallring- och slutavverkningsraden.
-- Fix: gruppera subqueryerna på lower(huvudtyp) och joina mot lower(b.typ).
-- Skiftläge skiljer (bestallningar.typ gemener, dim_objekt.huvudtyp versal) -> lower() på båda.
-- Grot/null i huvudtyp matchar ingen beställningstyp -> faller bort som förr.
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
            lower(d.huvudtyp) AS typ_key,
            EXTRACT(year FROM p.datum)::integer AS ar,
            EXTRACT(month FROM p.datum)::integer AS manad,
            sum(p.volym_m3sub)::double precision AS avverkat
           FROM fakt_produktion p
             JOIN dim_objekt d ON p.objekt_id = d.objekt_id
          GROUP BY d.bolag, lower(d.huvudtyp), (EXTRACT(year FROM p.datum)), (EXTRACT(month FROM p.datum))) prod
       ON b.bolag = prod.bolag AND b.ar = prod.ar AND b.manad = prod.manad AND prod.typ_key = lower(b.typ)
     LEFT JOIN ( SELECT d.bolag,
            lower(d.huvudtyp) AS typ_key,
            EXTRACT(year FROM l.datum)::integer AS ar,
            EXTRACT(month FROM l.datum)::integer AS manad,
            sum(l.volym_m3sub)::double precision AS utskotat
           FROM fakt_lass l
             JOIN dim_objekt d ON l.objekt_id = d.objekt_id
          GROUP BY d.bolag, lower(d.huvudtyp), (EXTRACT(year FROM l.datum)), (EXTRACT(month FROM l.datum))) lass
       ON b.bolag = lass.bolag AND b.ar = lass.ar AND b.manad = lass.manad AND lass.typ_key = lower(b.typ);
