-- Mätvyn: döp om objekt_id → objekt_uuid, och lägg vyerna för sammanfattningen.
--
-- ── VARFÖR OMDÖPNINGEN ────────────────────────────────────────────────────
-- matning.objekt_id innehåller objekt.id (uuid) — raden i objekt-tabellen,
-- samma nyckel som punktlottningen och planering_markeringar använder.
--
-- Men "objekt_id" betyder något ANNAT i resten av appen: i dim_objekt,
-- fakt_produktion, fakt_sortiment och detalj_stam är objekt_id en textnyckel
-- av typen '11219961'. Två kolumner med samma namn och olika innehåll är en
-- joinbugg som väntar: någon skriver
--
--   join dim_objekt d on d.objekt_id = m.objekt_id
--
-- och får noll rader. Noll rader ser ut som "ingen mätning gjord", inte som
-- ett fel. En kommentar i koden hjälper inte den som skriver frågan i
-- SQL-editorn.
--
-- Tabellen är tom, så omdöpningen kostar ingenting.

-- Omdöpningen och constrainten nedan är inte idempotenta i sig. Migrationen
-- körs för hand i SQL-editorn, och en migration som får ett fel halvvägs
-- lämnar halva jobbet gjort — därför är de gardade så att hela filen tål att
-- köras om.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'matning' and column_name = 'objekt_id'
  ) then
    alter table matning rename column objekt_id to objekt_uuid;
  end if;
end $$;

comment on column matning.objekt_uuid is
  'objekt.id (uuid) — INTE dim_objekt.objekt_id. Joina mot objekt(id); '
  'därifrån når du vo_nummer om mätningen ska jämföras med uttaget.';

-- ── EN PUNKT PER NUMMER I EN MÄTNING ───────────────────────────────────────────
-- Synken skriver punkterna en i taget och gör om från där den bröts när
-- täckningen försvann. Skulle ett omförsök skriva punkt 4 en gång till skulle
-- den räknas två gånger i medlet — och en dubblerad punkt syns inte på
-- siffran, den bara förskjuter den. Klienten skyddar mot det, men klienten är
-- inte platsen där datat lever.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matning_punkt_unik_i_matning'
  ) then
    alter table matning_punkt
      add constraint matning_punkt_unik_i_matning unique (matning_id, punkt_nummer);
  end if;
end $$;

-- ── VYER FÖR SAMMANFATTNINGEN ─────────────────────────────────────────────
-- Räknas i SQL, inte i frontend. Spridningen är kvalitetsmåttet och två vyer
-- får aldrig komma fram till olika svar om samma mätning.
--
-- security_invoker = true: utan den kör vyn som sin ägare och kringgår RLS på
-- de underliggande tabellerna. En vy ska inte vara en bakdörr.

-- Grundytan per punkt. Relaskopets hela poäng: antalet träd som fyllde
-- siktet ÄR grundytan i m²/ha, gånger faktorn.
create or replace view matning_punkt_grundyta
with (security_invoker = true) as
select
  p.id                                as punkt_id,
  p.matning_id,
  p.punkt_nummer,
  p.varv_grader,
  -- Under 330 grader är varvet inte slutet och grundytan en underskattning.
  (p.varv_grader is not null and abs(p.varv_grader) >= 330) as varv_slutet,
  count(t.id)                         as antal_trad,
  count(t.id) * m.relaskop_faktor     as grundyta_m2_per_ha
from matning_punkt p
join matning m on m.id = p.matning_id
left join matning_trad t on t.punkt_id = p.id
group by p.id, p.matning_id, p.punkt_nummer, p.varv_grader, m.relaskop_faktor;

-- Sammanfattningen per mätning: medel och SPRIDNING mellan punkter.
--
-- stddev_samp, inte stddev_pop: punkterna är ett stickprov ur beståndet, inte
-- hela beståndet. Med en enda punkt är spridningen odefinierad och blir null —
-- vilket är sant och ska visas som "för få punkter", inte som noll.
--
-- Ofullständiga varv räknas INTE in i medel och spridning. En punkt där varvet
-- inte gick runt är en underskattning, och att blanda in den drar ned medlet
-- och blåser upp spridningen på ett sätt som ser ut som variation i beståndet.
-- De räknas separat så de syns.
create or replace view matning_sammanfattning
with (security_invoker = true) as
select
  m.id                                        as matning_id,
  m.objekt_uuid,
  m.datum,
  m.utforare,
  m.relaskop_faktor,
  m.synfalt_grader,
  count(g.punkt_id)                           as punkter_totalt,
  count(*) filter (where g.varv_slutet)       as punkter_slutna,
  count(*) filter (where not g.varv_slutet)   as punkter_ofullstandiga,
  round(avg(g.grundyta_m2_per_ha) filter (where g.varv_slutet), 1)        as medel_grundyta,
  round(stddev_samp(g.grundyta_m2_per_ha) filter (where g.varv_slutet), 1) as spridning,
  min(g.grundyta_m2_per_ha) filter (where g.varv_slutet)                  as lagsta,
  max(g.grundyta_m2_per_ha) filter (where g.varv_slutet)                  as hogsta
from matning m
left join matning_punkt_grundyta g on g.matning_id = m.id
group by m.id, m.objekt_uuid, m.datum, m.utforare, m.relaskop_faktor, m.synfalt_grader;

-- Fördelningen per trädslag. Andelen räknas på ANTALET stammar, eftersom det
-- är det relaskopet mäter — varje räknat träd bidrar lika mycket till
-- grundytan oavsett hur grovt det är. Det är hela idén med metoden.
create or replace view matning_tradslag
with (security_invoker = true) as
select
  p.matning_id,
  t.tradslag,
  count(*)                                    as antal_trad,
  count(*) * m.relaskop_faktor                as grundyta_m2_per_ha,
  round(100.0 * count(*) / nullif(sum(count(*)) over (partition by p.matning_id), 0), 1) as andel_pct
from matning_trad t
join matning_punkt p on p.id = t.punkt_id
join matning m on m.id = p.matning_id
group by p.matning_id, t.tradslag, m.relaskop_faktor;
