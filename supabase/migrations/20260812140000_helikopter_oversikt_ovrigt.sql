-- Övrigt-feeder för helikopter-v2:s Beställning-flik: kalenderbaserad produktion/
-- skotning per (bolag, typ, månad) som SAKNAR matchande beställning den månaden.
-- helikopter_oversikt är beställningsdriven (FROM bestallningar) och kan därför inte
-- visa obeställd produktion — utan denna vy skulle den försvinna tyst ur fliken.
-- Bolag matchas rakt (dim_objekt.bolag är kanoniserat mot bestallningar.bolag,
-- migration 20260812130000); typ skiftokänsligt (bestallningar.typ gemener).
-- Bara slutavverkning/gallring — GROT/okänd huvudtyp har inget spår i fliken.
CREATE OR REPLACE VIEW helikopter_oversikt_ovrigt AS
 WITH prod AS (
         SELECT d.bolag,
            lower(d.huvudtyp) AS typ,
            EXTRACT(year FROM p.datum)::integer AS ar,
            EXTRACT(month FROM p.datum)::integer AS manad,
            sum(p.volym_m3sub)::double precision AS avverkat
           FROM fakt_produktion p
             JOIN dim_objekt d ON p.objekt_id = d.objekt_id
          WHERE lower(d.huvudtyp) = ANY (ARRAY['slutavverkning'::text, 'gallring'::text])
          GROUP BY d.bolag, lower(d.huvudtyp), (EXTRACT(year FROM p.datum)), (EXTRACT(month FROM p.datum))
        ), lass AS (
         SELECT d.bolag,
            lower(d.huvudtyp) AS typ,
            EXTRACT(year FROM l.datum)::integer AS ar,
            EXTRACT(month FROM l.datum)::integer AS manad,
            sum(l.volym_m3sub)::double precision AS utskotat
           FROM fakt_lass l
             JOIN dim_objekt d ON l.objekt_id = d.objekt_id
          WHERE lower(d.huvudtyp) = ANY (ARRAY['slutavverkning'::text, 'gallring'::text])
          GROUP BY d.bolag, lower(d.huvudtyp), (EXTRACT(year FROM l.datum)), (EXTRACT(month FROM l.datum))
        ), rader AS (
         SELECT prod.bolag, prod.typ, prod.ar, prod.manad FROM prod
      UNION
         SELECT lass.bolag, lass.typ, lass.ar, lass.manad FROM lass
        )
 SELECT r.bolag,
    r.typ,
    r.ar,
    r.manad,
    COALESCE(p.avverkat, 0::double precision) AS avverkat,
    COALESCE(l.utskotat, 0::double precision) AS utskotat
   FROM rader r
     LEFT JOIN prod p ON p.bolag IS NOT DISTINCT FROM r.bolag AND p.typ = r.typ AND p.ar = r.ar AND p.manad = r.manad
     LEFT JOIN lass l ON l.bolag IS NOT DISTINCT FROM r.bolag AND l.typ = r.typ AND l.ar = r.ar AND l.manad = r.manad
  WHERE NOT (EXISTS ( SELECT 1
           FROM bestallningar b
          WHERE b.ar = r.ar AND b.manad = r.manad AND b.bolag = r.bolag AND lower(b.typ) = r.typ));
