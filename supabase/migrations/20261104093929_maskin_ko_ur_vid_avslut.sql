-- Ett avslutat objekt ligger aldrig i en maskinkö, oavsett VEM som avslutar det
-- (Avsluta-knappen, importens auto-avslut, redigeringen, SQL, något vi bygger senare).
-- 2026-11-04 låg 15 av 19 kö-rader på avslutade objekt: bara knappen och importen tog bort dem.
create or replace function public.maskin_ko_ur_vid_avslut()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'avslutat' and old.status is distinct from 'avslutat' then
    delete from public.maskin_ko where objekt_id = new.id;
  end if;
  return new;
end
$$;

drop trigger if exists maskin_ko_ur_vid_avslut on public.objekt;
create trigger maskin_ko_ur_vid_avslut
  after update of status on public.objekt
  for each row execute function public.maskin_ko_ur_vid_avslut();

-- Engångsrensning: rader som redan ligger på avslutade objekt.
delete from public.maskin_ko k
using public.objekt o
where o.id = k.objekt_id and o.status = 'avslutat';
