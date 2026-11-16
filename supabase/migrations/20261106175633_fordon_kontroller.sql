-- Fordon (/kontroller): försäkring som kontroll, och händelser för alla fordonskontroller.
-- Martin 2026-11-06: "service behöver vi inte här — det är mera om fordonen, släp, maskiner, bilar, tankar".
--
-- 1. kontroll.typ får 'forsakring'.
-- 2. handelse.typ får 'forsakring', 'brandskydd' och 'cisternkontroll' (förut kunde bara besiktning
--    och service registreras, så brandskydd och cisternkontroll fick aldrig något datum).
-- 3. Varje aktivt fordon (bil, lastbil, släp, maskin) som saknar en försäkringskontroll får en,
--    med 12 månaders intervall och inget datum — den står som "Datum saknas" tills någon registrerar.
-- 4. Brandskydd utan intervall får 12 månader (brandskyddskontroll en gång om året, SBF 127).
--
-- Additiv. Inga rader tas bort; service-raderna ligger kvar men visas inte i appen.

alter table public.kontroll drop constraint if exists kontroll_typ_check;
alter table public.kontroll add constraint kontroll_typ_check
  check (typ = any (array['besiktning', 'service', 'cisternkontroll', 'brandskydd', 'forsakring']));

alter table public.handelse drop constraint if exists handelse_typ_check;
alter table public.handelse add constraint handelse_typ_check
  check (typ = any (array['besiktning', 'forsakring', 'brandskydd', 'cisternkontroll', 'service', 'reparation', 'byte', 'ovrigt']));

insert into public.kontroll (resurs_id, typ, intervall_manader)
select r.id, 'forsakring', 12
from public.resurs r
where r.aktiv = true
  and r.typ in ('bil', 'lastbil', 'slap', 'maskin')
  and not exists (select 1 from public.kontroll k where k.resurs_id = r.id and k.typ = 'forsakring');

update public.kontroll
set intervall_manader = 12
where typ = 'brandskydd' and intervall_manader is null and intervall_timmar is null and intervall_km is null;

-- Kvitto: en rad per typ med antal.
select typ, count(*) from public.kontroll group by typ order by typ;
