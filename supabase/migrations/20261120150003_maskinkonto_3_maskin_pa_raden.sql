-- Maskinen som maskin, del 3: det som skrivs av ett maskinkonto får MASKINEN satt på raden — av databasen, inte av klienten.
--
-- Kvittenserna (korvy_kvittens_forare, kommentar_sett_forare) hade ingen maskin alls (avvikelsen i #1215: maskinen togs ur skribentens
-- medarbetarrad). Nu: kolumnen maskin_id, och för ett maskinkonto sätts den alltid till kontots egen maskin (klientens värde ignoreras).
-- Samma trigger på skotar_lass och hyttspar, så ett maskinkonto aldrig kan skriva lass eller spår åt en annan maskin.
-- Alla andra skribenter (förare i telefon, admin) rörs inte: ar_maskinkonto() är falskt, maskin_id lämnas som det skrevs.
--
-- Triggern heter a_maskinkonto_maskin så den körs FÖRE övriga BEFORE-triggrar (bokstavsordning): skotar_lass_satt_forare (#1215) läser
-- new.maskin_id och ska se den rätta.

alter table public.korvy_kvittens_forare add column if not exists maskin_id text;
alter table public.kommentar_sett_forare add column if not exists maskin_id text;

create or replace function public.maskinkonto_satt_maskin()
returns trigger language plpgsql security definer set search_path = public as $$
declare m text;
begin
  if (select public.ar_maskinkonto()) then
    select maskin_id into m from medarbetare where user_id = auth.uid() and roll = 'maskin' limit 1;
    if m is not null then new.maskin_id := m; end if;
  end if;
  return new;
end $$;

create or replace trigger a_maskinkonto_maskin before insert or update on public.skotar_lass for each row execute function public.maskinkonto_satt_maskin();
create or replace trigger a_maskinkonto_maskin before insert or update on public.hyttspar for each row execute function public.maskinkonto_satt_maskin();
create or replace trigger a_maskinkonto_maskin before insert or update on public.korvy_kvittens_forare for each row execute function public.maskinkonto_satt_maskin();
create or replace trigger a_maskinkonto_maskin before insert or update on public.kommentar_sett_forare for each row execute function public.maskinkonto_satt_maskin();

-- #1215:s kvittenstrigger: föraren från Opti på skribentens maskin. Ett maskinkonto ÄR maskinen — dess egen maskin gäller (och kvittensen får
-- maskin_id). Förare i telefon: som förut (deras egen medarbetarrad). Allt annat i funktionen är oförändrat.
create or replace function public.kvittens_satt_utford()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  w record;
  v uuid;
  t timestamptz;
begin
  new.utford_av := new.forare_id;
  new.utford_kalla := 'inloggad';
  begin
    t := coalesce((to_jsonb(new) ->> 'kvitterad_at'), (to_jsonb(new) ->> 'sett_at'))::timestamptz;
    select m.roll, m.maskin_id into w from medarbetare m where m.id = new.forare_id;
    if w.roll in ('forare', 'maskin') and w.maskin_id is not null and t is not null then
      v := opti_forare(w.maskin_id, t);
      if v is not null then new.utford_av := v; new.utford_kalla := 'opti'; end if;
    end if;
  exception when others then
    raise warning 'kvittens_satt_utford: %', sqlerrm;
  end;
  return new;
end $$;
