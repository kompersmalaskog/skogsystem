-- UTFALL PER AVSLUTAT OBJEKT för G15-förslaget i "Klar med trakten?" (lib/g15Forslag.ts).
-- Körd i prod 2026-10-17 (version 20261017095842) och verifierad: 33 av 30 slutavverkning, 17 av 14 gallring. Idempotent (create or replace). Rör ingen data; läser bara.
--
-- En rad per avslutat objekt som har skördardata: skördad volym (m³sub = m³fub) och antal stammar (så medelstam = volym / stammar), G15-timmar för skördare
-- resp. skotare (G15 = (processing + terräng + övrigt arbete) / 3600, samma definition som lib/g15.ts), plus objektets egen volym (för fullständighetskontrollen).
--
-- JOIN-REGELN (CLAUDE.md): fakt_produktion och fakt_tid joinas ALDRIG direkt mot varandra — de aggregeras var för sig per objekt_id (CTE t och p) och sammanfogas
-- först på den aggregerade nivån. Ett objekt kan ha flera dim_objekt-rader (samma vo_nummer, olika maskinfiler: 5 av 164 idag); deras summor läggs ihop.
-- Maskintyp ur dim_maskin.maskin_typ (Harvester → skördare, Forwarder → skotare), inga hårdkodade maskin-id.
-- Verifierat mot prod 2026-10-17 (SELECT-kroppen körd): 33 slutavverkningar (30 med skördar-G15 ≥ 8 tim) och 17 gallringar (14) — samma underlag som utredningen.

create or replace function public.prognos_utfall()
returns table (
  objekt_id      uuid,
  typ            text,
  volym_objekt   numeric,
  skordad_m3     numeric,
  stammar        bigint,
  skordare_g15   numeric,
  skotare_g15    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select ft.objekt_id as fid,
           sum(coalesce(ft.processing_sek, 0) + coalesce(ft.terrain_sek, 0) + coalesce(ft.other_work_sek, 0)) filter (where dm.maskin_typ = 'Harvester') / 3600.0 as sk,
           sum(coalesce(ft.processing_sek, 0) + coalesce(ft.terrain_sek, 0) + coalesce(ft.other_work_sek, 0)) filter (where dm.maskin_typ = 'Forwarder') / 3600.0 as so
    from fakt_tid ft
    join dim_maskin dm on dm.maskin_id = ft.maskin_id
    where ft.objekt_id is not null
    group by ft.objekt_id
  ),
  p as (
    select fp.objekt_id as fid, sum(fp.volym_m3sub) as vol, sum(fp.stammar) as st
    from fakt_produktion fp
    join dim_maskin dm on dm.maskin_id = fp.maskin_id
    where dm.maskin_typ = 'Harvester' and fp.objekt_id is not null
    group by fp.objekt_id
  )
  select o.id, o.typ, o.volym::numeric, sum(p.vol), sum(p.st)::bigint, sum(t.sk), sum(t.so)
  from objekt o
  join dim_objekt d on d.vo_nummer = o.vo_nummer
  left join t on t.fid = d.objekt_id
  left join p on p.fid = d.objekt_id
  where o.status = 'avslutat'
  group by o.id, o.typ, o.volym
  having sum(p.vol) > 0
$$;

grant execute on function public.prognos_utfall() to authenticated;

-- Kvitto (kör efter migrationen):
--   select typ, count(*), count(*) filter (where skordare_g15 >= 8) from public.prognos_utfall() group by typ;   -- slutavverkning ≈ 33 / 30, gallring ≈ 17 / 14
