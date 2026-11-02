-- Foto på en brist i skyddsronden (2026-11-02). Valfritt: en brist kräver text, bilden visar vad som är fel.
-- am_skyddsrond_svar.foto_url = sökvägen i bucketen am-foton (samma som maskinkollen; uppladdning bara i egen mapp, läsning för
-- admin och skyddsombud). Bilden följer med till åtgärden (am_atgard.foto_url), så den syns i Åtgärder.
-- Bara en brist kan ha ett foto. Additivt.

alter table public.am_skyddsrond_svar add column if not exists foto_url text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'am_skyddsrond_svar_foto_bara_brist') then
    alter table public.am_skyddsrond_svar add constraint am_skyddsrond_svar_foto_bara_brist check (svar = 'brist' or foto_url is null);
  end if;
end $$;

create or replace function public.am_skyddsrond_till_atgard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.svar = 'brist' then
    insert into am_atgard (kalla, skyddsrond_svar_id, maskin_id, beskrivning, deadline, rapporterad_av, stopp, foto_url)
    values ('skyddsrond', new.id, new.maskin_id, new.punkt_text || ' — ' || trim(new.beskrivning),
            (now() at time zone 'Europe/Stockholm')::date + 30, new.besvarad_av, false, new.foto_url)
    on conflict (skyddsrond_svar_id) do update set beskrivning = excluded.beskrivning, foto_url = excluded.foto_url;
  else
    delete from am_atgard where skyddsrond_svar_id = new.id and status = 'oppen';
  end if;
  return new;
end $$;
revoke execute on function public.am_skyddsrond_till_atgard() from public, anon, authenticated;

create or replace trigger am_skyddsrond_atgard after insert or update of svar, beskrivning, foto_url on public.am_skyddsrond_svar
  for each row execute function public.am_skyddsrond_till_atgard();
