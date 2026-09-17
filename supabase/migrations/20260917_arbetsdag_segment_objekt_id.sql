-- arbetsdag_segment.objekt_id — debiterbar tid ska kunna hamna på en faktura.
-- Martin kör i Supabase SQL editor. Idempotent.
--
-- VARFÖR: debiterbar tid inom maskinpasset (markägarbesök, brandvakt) var HELA
-- anledningen till att faktureringsvyn påbörjades. Utan objektkoppling kan den
-- aldrig knytas till en trakt, och då är den osynlig för underlaget — vi hade
-- byggt allt utom det vi kom för. Formuläret (PeriodForm, #531) samlar redan
-- in objektet och extra_tid-grenen skriver det; segment-grenen har tappat det
-- tyst eftersom kolumnen inte funnits.
--
-- TEXT, NULLABLE, INGEN FK. Samma form som arbetsdag.objekt_id och
-- extra_tid.objekt_id. Ingen FK mot dim_objekt eftersom den tabellen fylls av
-- synken — en FK hade gjort att föraren inte kan spara ett objekt som importen
-- ännu inte hunnit skapa.
--
-- INGEN CASCADE, ingen koppling till arbetsdag: tabellen är nycklad på
-- (medarbetare_id, datum) just för att överleva MOM-synkens delete+insert av
-- arbetsdag. Den läxan gäller fortfarande.

alter table arbetsdag_segment add column if not exists objekt_id text;

comment on column arbetsdag_segment.objekt_id is
  'Trakten perioden hör till. Text mot dim_objekt.objekt_id, ingen FK — '
  'dim_objekt fylls av synken och föraren måste kunna spara innan importen '
  'hunnit skapa objektet. NULL = objektet var tvetydigt eller okänt; det är '
  'ett ärligt tillstånd och ska ytas i faktureringsvyn, aldrig gissas.';

create index if not exists ix_arbetsdag_segment_objekt
  on arbetsdag_segment (objekt_id) where objekt_id is not null;

-- ── ENGÅNGS-BACKFILL av de rader som redan finns ────────────────────────
-- Regeln är densamma som formuläret ska använda, avgjord PER FÖRARDAG
-- (medarbetare_id, datum) — aldrig per datum, eftersom flera förare kör olika
-- trakter samma dag:
--
--   exakt 1 objekt i arbetsdag_objekt  → fyll i det
--   inga rader i arbetsdag_objekt      → fall tillbaka på arbetsdag.objekt_id
--   fler än 1 objekt                   → LÄMNA NULL (föraren får välja)
--
-- Sista grenen är poängen. "Dominant objekt" gissas ALDRIG: fördelningen kan
-- vara 50/46, och ett gissat objekt på en debiterbar rad blir en felaktig
-- faktura som ser korrekt ut.
--
-- Detta är ett ENGÅNGSUTTRYCK för befintlig data, inte en underhållen regel —
-- den bor i formuläret. Körs migrationen om gör WHERE objekt_id IS NULL att
-- redan satta värden aldrig skrivs över.

update arbetsdag_segment s
set objekt_id = t.nytt
from (
  select s2.id,
         case (select count(distinct ao.objekt_id)
                 from arbetsdag_objekt ao
                 join arbetsdag a on a.id = ao.arbetsdag_id
                where a.medarbetare_id = s2.medarbetare_id
                  and a.datum         = s2.datum
                  and ao.objekt_id is not null)
           when 1 then (select min(ao.objekt_id)
                          from arbetsdag_objekt ao
                          join arbetsdag a on a.id = ao.arbetsdag_id
                         where a.medarbetare_id = s2.medarbetare_id
                           and a.datum         = s2.datum
                           and ao.objekt_id is not null)
           when 0 then (select a.objekt_id
                          from arbetsdag a
                         where a.medarbetare_id = s2.medarbetare_id
                           and a.datum         = s2.datum
                         limit 1)
           else null            -- tvetydigt: föraren väljer, vi gissar inte
         end as nytt
    from arbetsdag_segment s2
   where s2.objekt_id is null
) t
where s.id = t.id and t.nytt is not null;

-- ── Kvitto: vad backfillen faktiskt gjorde ──────────────────────────────
-- Förväntat vid första körningen (verifierat mot prod 2026-09-17, 4 rader):
--   fyllda = 3  ·  kvar_null = 1  ·  debiterbara_utan_objekt = 0
-- Den kvarvarande är 2026-09-03 (Oskar, service) som har TVÅ objekt den dagen
-- — den ska stå kvar som null. Att båda DEBITERBARA raderna blev fyllda är
-- det som betyder något för faktureringen.

select
  count(*)                                              as rader_totalt,
  count(*) filter (where objekt_id is not null)         as fyllda,
  count(*) filter (where objekt_id is null)             as kvar_null,
  count(*) filter (where debiterbar and objekt_id is null) as debiterbara_utan_objekt
from arbetsdag_segment;
