-- SÄKERHET: en förare kan inte längre göra sig själv till admin eller höja sin lön (audit 2026-10-22, punkt 1).
--
-- Före: RLS-policyn `medarbetare_update` släpper in UPDATE på den egna raden, och `authenticated` har UPDATE på ALLA
-- kolumner. `PATCH /rest/v1/medarbetare?user_id=eq.<mitt uid>` med {"roll":"admin"} gjorde vilken förare som helst till
-- admin (all lön, Fortnox, avtal). Ingen trigger skyddade roll, timlon_kr, manadslon_kr, foretagsledare, aktiv, maskin_id,
-- epost eller user_id.
--
-- Efter: en BEFORE UPDATE-trigger tillåter en icke-admin att ändra BARA de fält på listan nedan (egna ofarliga uppgifter
-- och inställningar). Allt annat — nuvarande och framtida kolumner — är admin-only: listan är en tillåtelselista, så en ny
-- kolumn är skyddad tills någon medvetet lägger till den. Spärren sitter i databasen; UI:t är inte inblandat.
--
--  • Admin (public.ar_admin()) ändrar fritt.
--  • Serverrutter med service-nyckeln (auth.role() = 'service_role') och databasens egna körningar (ingen JWT-roll:
--    migrationer, GoTrues koppling konto ↔ medarbetare, cron) går igenom: spärren gäller anrop som 'authenticated'/'anon'.
--  • Inbjudningsflödet (/api/personal/bjud-in) skriver med service-nyckeln och påverkas inte.
--  • DEFINER-funktionerna ledighet_markera_sett och satt_kartlager ändrar bara ledighet_sett_at/kartlager (på listan).
--
-- Kolumngrants (revoke update (roll …) from authenticated) är MEDVETET inte använda: de gäller rollen `authenticated`,
-- alltså också admin som skriver via webbläsaren, och skulle stänga ute admin. Triggern skiljer på admin och förare.
--
-- KÖRS INTE AV KODSESSIONEN — Martin kör via apply_migration före release.

create or replace function public.medarbetare_skydda_kolumner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tillatna constant text[] := array[
    'telefon', 'anhorig_namn', 'anhorig_telefon', 'anhorig_relation',
    'push_aktiv', 'daglig_pamin_aktiv', 'daglig_pamin_tid', 'pamin_obekraftad_min', 'pamin_pagaende_min',
    'ledighet_sett_at', 'kartlager'
  ];
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.ar_admin() then
    return new;
  end if;
  if (to_jsonb(new) - tillatna) is distinct from (to_jsonb(old) - tillatna) then
    raise exception 'Bara admin får ändra roll, lön, aktiv, e-post och liknande på en medarbetare'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- "a_" först: spärren körs före hemadress_andrad och koppla_konto_vid_medarbetare.
create or replace trigger a_medarbetare_skydda_kolumner
  before update on public.medarbetare
  for each row execute function public.medarbetare_skydda_kolumner();
