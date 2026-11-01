-- Maskinkollen, omtag efter Martins test 2026-10-31.
--
-- 1. Sex frågor där föraren GÖR något (nödutgång, nödstopp, dörrbrytare, brandsläckare, förbandslåda, steg och handtag).
--    De gamla sexton stängs av — raderas aldrig (gamla svar har fraga_text som snapshot).
-- 2. STOPPFRÅGA (am_fraga.stopp): Nej betyder att maskinen inte ska köras. Åtgärden märks stopp och får deadline idag.
-- 3. FOTO VID JA (am_fraga.foto_vid_ja): mätaren/lådan ska fotas också när svaret är Ja.
-- 4. Kontrollfotot krävs inte längre för att avsluta (frågorna kräver handling och foto; ett extra foto sist var dubbelt).
-- 5. "Något är fel": föraren kan rapportera ett fel när som helst (am_atgard.kalla = 'forare'), utan en koll runt omkring.

alter table public.am_fraga
  add column if not exists stopp boolean not null default false,
  add column if not exists foto_vid_ja boolean not null default false;

alter table public.am_atgard
  add column if not exists stopp boolean not null default false,
  add column if not exists rapporterad_av uuid references public.medarbetare(id);

alter table public.am_atgard drop constraint if exists am_atgard_kalla_check;
alter table public.am_atgard add constraint am_atgard_kalla_check check (kalla in ('svar', 'manuell', 'forare'));

-- Nej → åtgärd. Stoppfråga → stopp + deadline idag; annars sju dagar som förut.
create or replace function public.am_svar_till_atgard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_maskin text;
  v_stopp boolean;
begin
  select maskin_id into v_maskin from am_maskinkoll where id = new.maskinkoll_id;
  select coalesce(stopp, false) into v_stopp from am_fraga where id = new.fraga_id;
  v_stopp := coalesce(v_stopp, false);
  if not new.ok then
    insert into am_atgard (kalla, svar_id, maskin_id, beskrivning, foto_url, deadline, stopp)
    values ('svar', new.id, v_maskin,
            new.fraga_text || coalesce(' — ' || nullif(trim(new.kommentar), ''), ''),
            new.foto_url,
            (now() at time zone 'Europe/Stockholm')::date + case when v_stopp then 0 else 7 end,
            v_stopp)
    on conflict (svar_id) do update
      set beskrivning = excluded.beskrivning, foto_url = excluded.foto_url, stopp = excluded.stopp, deadline = excluded.deadline;
  else
    delete from am_atgard where svar_id = new.id and status = 'oppen';
  end if;
  return new;
end;
$$;

-- Klar när alla aktiva frågor är besvarade och varje foto_vid_ja-fråga har ett foto. Kontrollfotot krävs inte längre.
create or replace function public.am_maskinkoll_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_typ text;
  v_saknas integer;
  v_utan_foto integer;
begin
  if old.klar is not null then
    raise exception 'Maskinkollen är redan klar och kan inte ändras' using errcode = '42501';
  end if;
  if new.klar is not null then
    select maskin_typ into v_typ from dim_maskin where maskin_id = new.maskin_id;
    select count(*) into v_saknas
      from am_fraga f
     where f.aktiv and (f.maskin_typ is null or f.maskin_typ = v_typ)
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
revoke execute on function public.am_svar_till_atgard() from public, anon, authenticated;
revoke execute on function public.am_maskinkoll_vakt() from public, anon, authenticated;

-- Föraren rapporterar själv: bara som sig själv, bara öppen, aldrig kopplad till ett svar.
drop policy if exists am_atgard_insert_forare on public.am_atgard;
create policy am_atgard_insert_forare on public.am_atgard for insert to authenticated
  with check (kalla = 'forare' and rapporterad_av = public.aktuell_medarbetare_id()
              and status = 'oppen' and svar_id is null and ansvarig_id is null);

-- Föraren ser också det han själv rapporterat.
drop policy if exists am_atgard_select on public.am_atgard;
create policy am_atgard_select on public.am_atgard for select to authenticated
  using (public.ar_am_lasare()
         or rapporterad_av = public.aktuell_medarbetare_id()
         or exists (select 1 from public.am_svar s join public.am_maskinkoll k on k.id = s.maskinkoll_id
                     where s.id = svar_id and k.medarbetare_id = public.aktuell_medarbetare_id()));

-- Frågorna.
update public.am_fraga set aktiv = false where aktiv and kod not in ('N1', 'N2', 'N3', 'N4', 'N5', 'N6');

insert into public.am_fraga (kod, text, hjalptext, maskin_typ, ordning, aktiv, stopp, foto_vid_ja) values
  ('N1', 'Öppna nödutgången. Gick den upp lätt?', 'Stäng den igen efteråt.', null, 1, true, true, false),
  ('N2', 'Tryck på nödstoppet med motorn igång. Stannade motorn?', 'Ingen får stå nära maskinen när du testar.', null, 2, true, true, false),
  ('N3', 'Öppna hyttdörren och försök köra. Står allt still?', 'Testa när du sitter i hytten. Ingen får stå nära maskinen.', null, 3, true, true, false),
  ('N4', 'Står visaren på grönt på alla brandsläckare?', 'Ta en bild på mätarna.', null, 4, true, false, true),
  ('N5', 'Öppna förbandslådan. Finns allt, och är ögonspolningen oöppnad och inom datum?', 'Ta en bild på lådan öppen.', null, 5, true, false, true),
  ('N6', 'Ta i varje steg och handtag. Sitter allt fast?', null, null, 6, true, false, false)
on conflict (kod) do update
  set text = excluded.text, hjalptext = excluded.hjalptext, maskin_typ = excluded.maskin_typ,
      ordning = excluded.ordning, aktiv = true, stopp = excluded.stopp, foto_vid_ja = excluded.foto_vid_ja;
