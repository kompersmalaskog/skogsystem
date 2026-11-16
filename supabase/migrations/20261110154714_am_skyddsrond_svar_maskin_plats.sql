-- Var på maskinen en brist i skyddsronden sitter (Martin 2026-11-10: brister pekas ut på maskinbilden, inte skrivs som text).
-- Samma fält som am_atgard (maskin_del, maskin_x, maskin_y 0..1 av teckningen, maskin_sida vanster|hoger; lib/arbetsmiljo/maskinBild.ts).
-- Platsen är valfri och bara en brist kan ha en. Triggern lägger den på åtgärden, så Åtgärder ritar pricken. Bara tillägg.

alter table public.am_skyddsrond_svar add column if not exists maskin_del text;
alter table public.am_skyddsrond_svar add column if not exists maskin_x real;
alter table public.am_skyddsrond_svar add column if not exists maskin_y real;
alter table public.am_skyddsrond_svar add column if not exists maskin_sida text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'am_skyddsrond_svar_maskin_plats_ok') then
    alter table public.am_skyddsrond_svar add constraint am_skyddsrond_svar_maskin_plats_ok check (
      (maskin_del is null and maskin_x is null and maskin_y is null and maskin_sida is null)
      or (svar = 'brist' and maskin_id is not null
          and length(maskin_del) between 1 and 40
          and maskin_x between 0 and 1 and maskin_y between 0 and 1
          and (maskin_sida is null or maskin_sida in ('vanster', 'hoger')))
    );
  end if;
end $$;

create or replace function public.am_skyddsrond_till_atgard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.svar = 'brist' then
    insert into am_atgard (kalla, skyddsrond_svar_id, maskin_id, beskrivning, deadline, rapporterad_av, stopp, foto_url,
                           maskin_del, maskin_x, maskin_y, maskin_sida)
    values ('skyddsrond', new.id, new.maskin_id, new.punkt_text || ' — ' || trim(new.beskrivning),
            (now() at time zone 'Europe/Stockholm')::date + 30, new.besvarad_av, false, new.foto_url,
            new.maskin_del, new.maskin_x, new.maskin_y, new.maskin_sida)
    on conflict (skyddsrond_svar_id) do update set beskrivning = excluded.beskrivning, foto_url = excluded.foto_url,
      maskin_id = excluded.maskin_id, maskin_del = excluded.maskin_del, maskin_x = excluded.maskin_x,
      maskin_y = excluded.maskin_y, maskin_sida = excluded.maskin_sida;
  else
    delete from am_atgard where skyddsrond_svar_id = new.id and status = 'oppen';
  end if;
  return new;
end $$;
revoke execute on function public.am_skyddsrond_till_atgard() from public, anon, authenticated;

create or replace trigger am_skyddsrond_atgard
  after insert or update of svar, beskrivning, foto_url, maskin_id, maskin_del, maskin_x, maskin_y, maskin_sida
  on public.am_skyddsrond_svar
  for each row execute function public.am_skyddsrond_till_atgard();
