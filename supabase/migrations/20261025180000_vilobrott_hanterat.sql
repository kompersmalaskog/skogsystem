-- Vilobrott: admins egen "hanterat"-markering (Martin 2026-10-25).
--
-- Föraren svarar på VARFÖR vilan bröts (besvarat_av_forare, orsak) — det gör aldrig admin åt föraren. Admin markerar i stället att
-- brottet är HANTERAT och skriver vad som gjordes ("kompensationsledighet 3 h 14 okt"). Kolumnerna kvitterad_av_chef och kvitterad_tid
-- fanns redan (20260520135311, förberedda för det här, aldrig använda); här tillkommer anteckningen och en spärr.
--
--  • Bara admin (public.ar_admin()) får sätta, ändra eller ta bort kvitteringen när anropet kommer som 'authenticated'/'anon'.
--    RLS släpper in en förare på sin egen rad (vilobrott_update), så utan spärren kunde föraren kvittera sitt eget brott.
--  • Vem och när sätts av databasen: kvitterad_tid = now(), kvitterad_av_chef = aktuell_medarbetare_id(). Det klienten skickar ignoreras.
--  • Tas kvitteringen bort (kvitterad_tid = null) töms också vem och anteckningen.
--  • Service-nyckeln och databasens egna körningar går igenom orörda (som medarbetare_skydda_kolumner).
--  • Förarens svar och re-analysens siffror (vila_h, krav_h, beskrivning) rörs aldrig av spärren.
--
-- Inget DROP (Supabase-MCP:n hänger på det): CREATE OR REPLACE TRIGGER.

alter table public.vilobrott add column if not exists kvitterad_anteckning text;

create or replace function public.vilobrott_kvittering()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  andrad boolean;
begin
  if tg_op = 'INSERT' then
    andrad := new.kvitterad_tid is not null or new.kvitterad_av_chef is not null or new.kvitterad_anteckning is not null;
  else
    andrad := new.kvitterad_tid is distinct from old.kvitterad_tid
           or new.kvitterad_av_chef is distinct from old.kvitterad_av_chef
           or new.kvitterad_anteckning is distinct from old.kvitterad_anteckning;
  end if;
  if not andrad then
    return new;
  end if;
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if not public.ar_admin() then
    raise exception 'Bara admin kan markera ett vilobrott som hanterat' using errcode = '42501';
  end if;
  if new.kvitterad_tid is null then
    new.kvitterad_av_chef := null;
    new.kvitterad_anteckning := null;
  else
    new.kvitterad_tid := now();
    new.kvitterad_av_chef := public.aktuell_medarbetare_id();
    new.kvitterad_anteckning := nullif(btrim(new.kvitterad_anteckning), '');
  end if;
  return new;
end;
$$;

create or replace trigger a_vilobrott_kvittering
  before insert or update on public.vilobrott
  for each row execute function public.vilobrott_kvittering();

comment on column public.vilobrott.kvitterad_anteckning is
  'Admins anteckning när brottet markerats hanterat (t.ex. kompensationsledighet). Vem/när i kvitterad_av_chef/kvitterad_tid, satta av databasen.';

-- Kvitto: kolumnen och triggern finns.
select
  (select count(*) from information_schema.columns where table_name = 'vilobrott' and column_name = 'kvitterad_anteckning') as kolumn,
  (select count(*) from pg_trigger where tgname = 'a_vilobrott_kvittering') as trigger;
