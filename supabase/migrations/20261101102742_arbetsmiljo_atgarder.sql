-- Arbetsmiljö: åtgärdslistan (admin och skyddsombud).
-- 1. am_atgarder(): EN läsning för listan, med maskinens och personernas namn. medarbetare är läsbar bara för admin
--    (och raden för en själv), så skyddsombudet skulle annars inte se vem som rapporterade. Bara ar_am_lasare() får rader.
-- 2. Stängning: databasen sätter när och vem (aldrig klienten). En stängd åtgärds stängning skrivs aldrig över;
--    öppnas den igen töms stängningen.
-- Additivt: inget befintligt ändras.

create or replace function public.am_atgarder()
returns table (
  id uuid, kalla text, maskin_id text, maskin_namn text, beskrivning text, foto_url text, deadline date,
  status text, stopp boolean, vad_gjordes text, stangd_tid timestamptz, stangd_av_namn text, skapad timestamptz,
  rapportor_namn text
)
language sql stable security definer set search_path = public as $$
  select a.id, a.kalla, a.maskin_id, coalesce(m.visningsnamn, m.modell, a.maskin_id), a.beskrivning, a.foto_url,
         a.deadline, a.status, a.stopp, a.vad_gjordes, a.stangd_tid, sa.namn, a.skapad, coalesce(r.namn, kr.namn)
    from am_atgard a
    left join dim_maskin m on m.maskin_id = a.maskin_id
    left join medarbetare sa on sa.id = a.stangd_av
    left join medarbetare r on r.id = a.rapporterad_av
    left join am_svar s on s.id = a.svar_id
    left join am_maskinkoll k on k.id = s.maskinkoll_id
    left join medarbetare kr on kr.id = k.medarbetare_id
   where public.ar_am_lasare();
$$;
revoke execute on function public.am_atgarder() from public, anon;
grant execute on function public.am_atgarder() to authenticated;

create or replace function public.am_atgard_stang() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'klar' and new.status = 'klar' then
    -- Redan stängd: stängningen står kvar (ett andra tryck, eller en annans, skriver aldrig över den första).
    new.stangd_tid := old.stangd_tid;
    new.stangd_av := old.stangd_av;
    new.vad_gjordes := old.vad_gjordes;
  elsif new.status = 'klar' then
    new.stangd_tid := now();
    new.stangd_av := coalesce(public.aktuell_medarbetare_id(), new.stangd_av);
  else
    new.stangd_tid := null;
    new.stangd_av := null;
    new.vad_gjordes := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.am_atgard_stang() from public, anon, authenticated;

create or replace trigger a_am_atgard_stang
  before update on public.am_atgard
  for each row execute function public.am_atgard_stang();
