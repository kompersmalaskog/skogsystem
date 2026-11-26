-- Föraren från Opti, del 4: triggrarna. Ingen klient ändras — appen skriver som förut och databasen sätter föraren.
--
-- * skotar_lass (BEFORE INSERT OR UPDATE): medarbetare_id := forare_for_maskin(maskin, bekräftad tid — annars skapad, inloggad).
--   Tiden är den då lasset BEKRÄFTADES (Martin): ett lass som bekräftas i en förarväxling hamnar på den som körde då.
--   Namnet ligger efter skotar_lass_ingen_auto i bokstavsordning, så bekraftad_tid är redan slutgiltig när den läses.
--   Strukna lass rörs inte (varken nu eller senare).
-- * objekt_besok_kvittens (BEFORE INSERT OR UPDATE): forare_id := samma regel. Skrivs bara av servern. Testläget rörs inte.
-- * korvy_kvittens_forare / kommentar_sett_forare (BEFORE INSERT OR UPDATE): utford_av := Opti-föraren på SKRIBENTENS maskin,
--   annars skribenten. Bara för medarbetare med roll förare: en admin som kvitterar vid skrivbordet har ingen maskin att slå upp.
--   forare_id rörs aldrig (se del 1).
-- * fakt_skift (AFTER INSERT OR UPDATE): filen har kommit → räkna om passets fönster.
-- * operator_medarbetare (AFTER INSERT OR UPDATE): en profil kopplas → räkna om dess pass. Det är så en okopplad profil rättas
--   i efterhand utan att någon rör lassen.
--
-- Triggrarna är SECURITY DEFINER och ändrar bara NEW (utom omräkningen). Ett fel får inte välta en sparning av ett lass eller en
-- kvittens: lookupen kapslas i ett eget block och faller tillbaka på det som skrevs.

create or replace function public.skotar_lass_satt_forare()
returns trigger language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if tg_op = 'INSERT' and new.registrerad_av is null then new.registrerad_av := new.medarbetare_id; end if;
  if new.status = 'struket' then return new; end if;
  begin
    select * into f from forare_for_maskin(new.maskin_id, coalesce(new.bekraftad_tid, new.skapad), coalesce(new.registrerad_av, new.medarbetare_id));
    if f.forare_id is not null then
      new.medarbetare_id := f.forare_id;
      new.forare_kalla := f.kalla;
    end if;
  exception when others then
    raise warning 'skotar_lass_satt_forare: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function public.besok_kvittens_satt_forare()
returns trigger language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if tg_op = 'INSERT' and new.registrerad_av is null then new.registrerad_av := new.forare_id; end if;
  if coalesce(new.testlage, false) then return new; end if;
  begin
    select * into f from forare_for_maskin(new.maskin_id, new.kvitterad_at, coalesce(new.registrerad_av, new.forare_id));
    if f.forare_id is not null then
      new.forare_id := f.forare_id;
      new.forare_kalla := f.kalla;
    end if;
  exception when others then
    raise warning 'besok_kvittens_satt_forare: %', sqlerrm;
  end;
  return new;
end $$;

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
    if w.roll = 'forare' and w.maskin_id is not null and t is not null then
      v := opti_forare(w.maskin_id, t);
      if v is not null then new.utford_av := v; new.utford_kalla := 'opti'; end if;
    end if;
  exception when others then
    raise warning 'kvittens_satt_utford: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function public.fakt_skift_rakna_om_forare()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n_in timestamptz := opti_tid_utc(new.inloggning_tid, new.tid_ar_utc);
  n_ut timestamptz := coalesce(opti_tid_utc(new.utloggning_tid, new.tid_ar_utc), opti_tid_utc(new.inloggning_tid, new.tid_ar_utc) + interval '16 hours');
  o_in timestamptz;
  o_ut timestamptz;
begin
  begin
    if tg_op = 'UPDATE' then
      o_in := opti_tid_utc(old.inloggning_tid, old.tid_ar_utc);
      o_ut := coalesce(opti_tid_utc(old.utloggning_tid, old.tid_ar_utc), opti_tid_utc(old.inloggning_tid, old.tid_ar_utc) + interval '16 hours');
    end if;
    perform forare_rakna_om(new.maskin_id, least(n_in, coalesce(o_in, n_in)), greatest(n_ut, coalesce(o_ut, n_ut)));
  exception when others then
    raise warning 'fakt_skift_rakna_om_forare: %', sqlerrm;
  end;
  return null;
end $$;

create or replace function public.operator_medarbetare_rakna_om_forare()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  begin
    for s in select maskin_id,
                    opti_tid_utc(inloggning_tid, tid_ar_utc) as fran,
                    coalesce(opti_tid_utc(utloggning_tid, tid_ar_utc), opti_tid_utc(inloggning_tid, tid_ar_utc) + interval '16 hours') as till
               from fakt_skift where operator_id = new.operator_id and inloggning_tid is not null
    loop
      perform forare_rakna_om(s.maskin_id, s.fran, s.till);
    end loop;
  exception when others then
    raise warning 'operator_medarbetare_rakna_om_forare: %', sqlerrm;
  end;
  return null;
end $$;

-- CREATE OR REPLACE TRIGGER, aldrig DROP (Supabase-MCP hänger på DROP TRIGGER).
create or replace trigger skotar_lass_sattforare
  before insert or update on public.skotar_lass for each row execute function public.skotar_lass_satt_forare();
create or replace trigger besok_kvittens_u_forare
  before insert or update on public.objekt_besok_kvittens for each row execute function public.besok_kvittens_satt_forare();
create or replace trigger korvy_kvittens_utford
  before insert or update on public.korvy_kvittens_forare for each row execute function public.kvittens_satt_utford();
create or replace trigger kommentar_sett_utford
  before insert or update on public.kommentar_sett_forare for each row execute function public.kvittens_satt_utford();
create or replace trigger fakt_skift_rakna_om_forare_ins
  after insert on public.fakt_skift for each row execute function public.fakt_skift_rakna_om_forare();
-- En omimport skriver samma pass igen: bara när något som avgör föraren eller fönstret ändrats.
create or replace trigger fakt_skift_rakna_om_forare_upd
  after update on public.fakt_skift for each row
  when (old.inloggning_tid is distinct from new.inloggning_tid or old.utloggning_tid is distinct from new.utloggning_tid
        or old.operator_id is distinct from new.operator_id or old.maskin_id is distinct from new.maskin_id)
  execute function public.fakt_skift_rakna_om_forare();
create or replace trigger operator_medarbetare_rakna_om_ins
  after insert on public.operator_medarbetare for each row execute function public.operator_medarbetare_rakna_om_forare();
create or replace trigger operator_medarbetare_rakna_om_upd
  after update on public.operator_medarbetare for each row
  when (old.medarbetare_id is distinct from new.medarbetare_id)
  execute function public.operator_medarbetare_rakna_om_forare();
