-- Helikoptern räknar BÅDE Optis lass (fakt_lass) och appens lass (skotar_lass) — aldrig dubbelt (Martin 2026-10-27).
--
-- Varför: Elefanten rapporterar sina lass i appen sedan 20 okt och Optis FPR-filer har slutat ge rader (senaste 21 okt; en fil 26 okt
-- importerades OK men gav 0 lass). 810E rapporterar bara i appen. Helikoptern läste bara fakt_lass, så skotat slutavverkning stod still
-- på 4 290 medan 427 m³ låg i appen — och Elefantens dagar räknades som planerat stopp fast den körde.
--
-- Regeln, per maskin + objekt + DAG: finns lass i både Opti och appen räknas den källa som har MEST volym (de beskriver samma lass; den
-- med flest är den fullständigaste), annars den som finns. Aldrig summan. Appens volym är den SKALADE (skotar_lass_sortiment_skalat:
-- förarens m³ × faktorn från Färdigskotad), så när Martin trycker Färdigskotad och appens lass skalas mot skördat hamnar rättningen på
-- de dagar lassen kördes. Ett tillägg ur Färdigskotad (sortiment som skördats men aldrig rapporterats) läggs på avslutsdagen på den
-- maskin som kört flest app-lass på objektet. Bara lass där föraren tryckt Klar (status bekraftat, inte den gamla automatikens 'auto').
--
-- Appens objekt (uuid) kopplas till dim_objekt via VO-numret: exakt objekt_id, annars maskinens eget maskinobjekt med samma VO
-- (A030353_185 för Wisent på P-1024), annars det första med samma VO. Ett lass vars VO inte finns i dim_objekt räknas inte.
--
-- Alla helikopterfunktioner som läste fakt_lass läser nu vyn helikopter_lass (patchas i databasen med replace på definitionen,
-- som opti-tidsmigrationen gjorde — ingen funktionstext skickas). Rör INTE: Maskinvyn, Uppföljning, Besök, Kvar i skotarläget.
-- Additiv; ingen tabell ändras. KÖRS av kodsessionen via apply_migration efter Martins ja; filen döps sedan om till prodens version.

create or replace view helikopter_lass with (security_invoker = true) as
with app_rad as (
  select l.id, l.maskin_id, l.vo_nummer, l.objekt_id as app_objekt,
         (d.lossad_tid at time zone 'Europe/Stockholm')::date as datum,
         sum(r.m3_forare * coalesce((a.faktorer ->> r.sortiment_nyckel)::numeric, 1)) as m3,
         max(coalesce(l.bekraftad_tid, l.andrad, l.skapad)) as skapad_tid
  from skotar_lass l
  join skotar_lass_del d on d.lass_id = l.id
  join skotar_lass_sortiment r on r.lass_id = d.lass_id and r.del_nr = d.del_nr
  left join skotar_trakt_avslut a on a.objekt_id = l.objekt_id
  where l.status = 'bekraftat' and l.bekraftad_av is distinct from 'auto' and d.lossad_tid is not null
  group by l.id, l.maskin_id, l.vo_nummer, l.objekt_id, d.del_nr, d.lossad_tid
),
app_obj as (
  select ar.*,
         (select d.objekt_id from dim_objekt d
           where d.objekt_id = ar.vo_nummer or btrim(d.vo_nummer) = btrim(ar.vo_nummer)
           order by (d.objekt_id = ar.vo_nummer) desc, (d.objekt_id like ar.maskin_id || '\_%') desc, d.objekt_id
           limit 1) as objekt_id
  from app_rad ar
),
app_dag as (
  select maskin_id, objekt_id, datum, sum(m3)::numeric as m3, max(skapad_tid) as skapad_tid
  from app_obj where objekt_id is not null
  group by 1, 2, 3
),
-- Färdigskotad-tillägget: det som skördats men aldrig rapporterats, på avslutsdagen, på maskinen med flest app-lass på objektet.
tillagg as (
  select (select ao.maskin_id from app_obj ao where ao.app_objekt = a.objekt_id group by ao.maskin_id order by count(*) desc, ao.maskin_id limit 1) as maskin_id,
         (select ao.objekt_id from app_obj ao where ao.app_objekt = a.objekt_id and ao.objekt_id is not null limit 1) as objekt_id,
         (a.avslutad_tid at time zone 'Europe/Stockholm')::date as datum,
         (select coalesce(sum(value::numeric), 0) from jsonb_each_text(coalesce(a.tillagg, '{}'::jsonb))) as m3,
         a.avslutad_tid as skapad_tid
  from skotar_trakt_avslut a
),
app_allt as (
  select maskin_id, objekt_id, datum, sum(m3)::numeric as m3, max(skapad_tid) as skapad_tid
  from (select * from app_dag union all select * from tillagg where maskin_id is not null and objekt_id is not null and m3 > 0) x
  group by 1, 2, 3
),
opti_dag as (
  select maskin_id, objekt_id, datum, sum(volym_m3sub)::numeric as m3, max(skapad_tid) as skapad_tid
  from fakt_lass
  group by 1, 2, 3
)
select coalesce(o.datum, a.datum) as datum,
       coalesce(o.maskin_id, a.maskin_id) as maskin_id,
       coalesce(o.objekt_id, a.objekt_id) as objekt_id,
       case when o.m3 is null then a.m3 when a.m3 is null then o.m3 when a.m3 > o.m3 then a.m3 else o.m3 end as volym_m3sub,
       greatest(o.skapad_tid, a.skapad_tid) as skapad_tid,
       case when o.m3 is null then 'app' when a.m3 is null then 'opti' when a.m3 > o.m3 then 'app' else 'opti' end as kalla
from opti_dag o
full join app_allt a on a.maskin_id = o.maskin_id and a.objekt_id = o.objekt_id and a.datum = o.datum;

grant select on helikopter_lass to authenticated;

-- Dagvyn: skotat per dag/typ/bolag ur helikopter_lass i stället för fakt_lass (samma kolumner, samma ordning).
create or replace view helikopter_ny_dag as
select x.datum, x.typ, x.bolag, sum(x.skordat) as skordat, sum(x.skotat) as skotat
from (
  select p.datum,
         coalesce(nullif(lower(btrim(d.huvudtyp)), ''), 'okänd') as typ,
         nullif(btrim(d.bolag), '') as bolag,
         p.volym_m3sub as skordat, 0::numeric as skotat
  from fakt_produktion p join dim_objekt d on d.objekt_id = p.objekt_id
  where coalesce(d.egen_skotning, false) = false
  union all
  select l.datum,
         coalesce(nullif(lower(btrim(d.huvudtyp)), ''), 'okänd'),
         nullif(btrim(d.bolag), ''),
         0::numeric, l.volym_m3sub
  from helikopter_lass l join dim_objekt d on d.objekt_id = l.objekt_id
  where coalesce(d.egen_skotning, false) = false
) x
group by x.datum, x.typ, x.bolag;

-- Funktionerna: byt varje "FROM fakt_lass" mot "FROM helikopter_lass" i de befintliga definitionerna. Antalet kontrolleras per funktion
-- (en definition som inte innehåller exakt det förväntade antalet lämnas orörd och felet kastas — hellre stopp än en halv patch).
do $$
declare
  f record;
  v_def text;
  v_ny text;
  v_antal int;
  v_forvantat jsonb := '{
    "helikopter_auto_avslut_skotning": 1, "helikopter_manadsfacit": 1, "helikopter_ny_klar": 1, "helikopter_ny_maskin": 4,
    "helikopter_ny_maskindag": 1, "helikopter_ny_maskiner": 1, "helikopter_ny_oskotat_objekt": 2, "helikopter_ny_senaste_data": 1,
    "helikopter_ny_spar": 2, "helikopter_ny_takt": 1, "helikopter_ny_utan_typ": 2, "helikopter_ny_veckor": 1 }'::jsonb;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and v_forvantat ? p.proname loop
    v_def := pg_get_functiondef(f.oid);
    v_antal := (length(v_def) - length(replace(v_def, 'FROM fakt_lass', ''))) / length('FROM fakt_lass');
    if v_antal <> (v_forvantat ->> f.proname)::int then
      raise exception 'helikopter_lass: % har % träffar på "FROM fakt_lass", väntade %', f.proname, v_antal, v_forvantat ->> f.proname;
    end if;
    v_ny := replace(v_def, 'FROM fakt_lass', 'FROM helikopter_lass');
    execute v_ny;
  end loop;
end $$;

-- Kvitto: inga helikopterfunktioner läser fakt_lass direkt längre, och vyn ger en rad per maskin/objekt/dag.
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'helikopter%' and pg_get_functiondef(p.oid) like '%FROM fakt_lass%';
