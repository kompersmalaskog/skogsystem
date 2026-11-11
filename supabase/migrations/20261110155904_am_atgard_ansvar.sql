-- Vem som ska göra en åtgärd (AFS 2023:1: det ska framgå vem som ska göra vad och när).
-- Kolumnen am_atgard.ansvarig_id finns sedan arbetsmiljöns första migration men har aldrig använts.
-- Admin skriver den (policyn am_atgard_update). Läsningen är en egen funktion, ett TILLÄGG bredvid am_atgarder():
-- skyddsombudet får inte läsa medarbetare själv, och am_atgarder() kan inte få en ny kolumn utan att tas bort.
create or replace function public.am_atgard_ansvar()
returns table(id uuid, ansvarig_id uuid, ansvarig_namn text)
language sql stable security definer set search_path to 'public'
as $$
  select a.id, a.ansvarig_id, m.namn
    from am_atgard a
    join medarbetare m on m.id = a.ansvarig_id
   where public.ar_am_lasare();
$$;
revoke all on function public.am_atgard_ansvar() from public, anon;
grant execute on function public.am_atgard_ansvar() to authenticated;
