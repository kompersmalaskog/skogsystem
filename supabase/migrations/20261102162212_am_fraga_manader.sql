-- Maskinkollen: frågor som bara gäller vissa månader (arbetsmiljö, 2026-11-02). Första: brandsäsongen. Skogforsks rutin för brand vid
-- skogsarbete kräver vattensläckare, kratta och spade vid varje maskin under brandsäsongen. Vi räknar brandsäsongen som april–september.
--
-- am_fraga.manader: månader (1–12) frågan ställs. NULL = hela året (alla befintliga frågor). Kollens månad = när den STARTADES
-- (svensk tid), så en koll som påbörjas 30 september och avslutas 1 oktober kräver samma frågor hela vägen.
-- Vakten (am_maskinkoll_vakt) räknar bara frågor som gäller kollens månad. Additivt.

alter table public.am_fraga add column if not exists manader smallint[]
  check (manader is null or (cardinality(manader) > 0 and manader <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]));

create or replace function public.am_maskinkoll_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_typ text;
  v_manad smallint;
  v_saknas integer;
  v_utan_foto integer;
begin
  if old.klar is not null then
    raise exception 'Maskinkollen är redan klar och kan inte ändras' using errcode = '42501';
  end if;
  if new.klar is not null then
    select maskin_typ into v_typ from dim_maskin where maskin_id = new.maskin_id;
    v_manad := extract(month from (new.startad at time zone 'Europe/Stockholm'))::smallint;
    select count(*) into v_saknas
      from am_fraga f
     where f.aktiv and (f.maskin_typ is null or f.maskin_typ = v_typ)
       and (f.manader is null or v_manad = any(f.manader))
       and not exists (select 1 from am_svar s where s.maskinkoll_id = new.id and s.fraga_id = f.id);
    if v_saknas > 0 then
      raise exception 'Svara på alla frågor först (% kvar)', v_saknas using errcode = '23514';
    end if;
    select count(*) into v_utan_foto
      from am_fraga f join am_svar s on s.fraga_id = f.id and s.maskinkoll_id = new.id
     where f.aktiv and f.foto_vid_ja and s.foto_url is null;
    if v_utan_foto > 0 then
      raise exception 'Ta bilderna som fattas först (% kvar)', v_utan_foto using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

insert into public.am_fraga (kod, text, hjalptext, maskin_typ, aktiv, ordning, stopp, foto_vid_ja, manader)
values ('N7', 'Finns vattensläckare, kratta och spade i maskinen?', 'Gäller under brandsäsongen, april–september.', null, true, 7, false, false,
        array[4,5,6,7,8,9]::smallint[])
on conflict (kod) do nothing;
