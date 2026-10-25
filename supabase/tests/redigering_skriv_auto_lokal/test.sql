-- Körs efter stub.sql och migrationen. Varje kontroll raisar vid fel; "OK" skrivs sist.
-- psql -v ON_ERROR_STOP=1 -f stub.sql -f ../../migrations/20261024161533_redigering_skriv_auto.sql -f test.sql
\set ON_ERROR_STOP on
do $$
declare n int; r record;
begin
  -- 1. Tomt fält fylls på hela gruppen, med källan i auto_ifyllt.
  n := public.redigering_skriv_auto(array['11166477','11166477b'], 'huvudtyp', 'Slutavverkning', 'namnet, skördarens fil');
  if n <> 2 then raise exception '1: väntade 2 rader, fick %', n; end if;
  select * into r from public.dim_objekt where objekt_id = '11166477';
  if r.huvudtyp <> 'Slutavverkning' or r.risskotning is not false then raise exception '1: typ/risskotning fel'; end if;
  if r.auto_ifyllt->>'huvudtyp' <> 'härlett: namnet, skördarens fil' then raise exception '1: provenans fel: %', r.auto_ifyllt; end if;

  -- 2. Ett ifyllt fält skrivs ALDRIG över (Skälviken står som Gallring och Au).
  n := public.redigering_skriv_auto(array['11271860'], 'huvudtyp', 'Slutavverkning', 'x');
  if n <> 0 then raise exception '2: ifylld typ skrevs över'; end if;
  n := public.redigering_skriv_auto(array['11271860'], 'avtalsform', 'Rp', 'x');
  if n <> 0 then raise exception '2: ifylld avtalsform skrevs över'; end if;
  if (select avtalsform from public.objekt where vo_nummer = '11271860') <> 'Au' then raise exception '2: objekt-raden skrevs över'; end if;

  -- 3. Tom sträng räknas som tomt; avtalsform speglas till objekt-raden via VO.
  n := public.redigering_skriv_auto(array['11166477','11166477b'], 'avtalsform', 'Rp', 'namnet');
  if n <> 2 then raise exception '3: väntade 2, fick %', n; end if;
  if (select avtalsform from public.objekt where vo_nummer = '11166477') is distinct from 'Rp' then raise exception '3: speglades inte till objekt'; end if;

  -- 3b. Planeringens objekt-rad med ett eget värde skrivs inte över, även när dim-raden var tom.
  insert into public.dim_objekt (objekt_id, object_name, vo_nummer) values ('ob1', 'Egen', 'ob1');
  insert into public.objekt (vo_nummer, dim_objekt_id, avtalsform) values ('ob1', 'ob1', 'LRK');
  perform public.redigering_skriv_auto(array['ob1'], 'avtalsform', 'Rp', 'namnet');
  if (select avtalsform from public.objekt where vo_nummer = 'ob1') <> 'LRK' then raise exception '3b: objekt-radens egna värde skrevs över'; end if;

  -- 4. Okända fält och värden avvisas.
  begin perform public.redigering_skriv_auto(array['11166477'], 'skogsagare', 'X', 'x'); raise exception '4a: borde avvisas';
  exception when raise_exception then if sqlerrm like '4a%' then raise; end if; end;
  begin perform public.redigering_skriv_auto(array['11166477b'], 'huvudtyp', 'Röjning', 'x'); raise exception '4b: borde avvisas';
  exception when raise_exception then if sqlerrm like '4b%' then raise; end if; end;
  begin perform public.redigering_skriv_auto(array['11166477b'], 'avtalsform', 'Au ', 'x'); raise exception '4c: borde avvisas';
  exception when raise_exception then if sqlerrm like '4c%' then raise; end if; end;

  -- 5. En människa som ändrar fältet tar bort märkningen (huvudtyp och avtalsform är nya i rensa-triggern).
  update public.dim_objekt set huvudtyp = 'Gallring' where objekt_id = '11166477';
  if (select auto_ifyllt ? 'huvudtyp' from public.dim_objekt where objekt_id = '11166477') then raise exception '5: märkningen blev kvar (huvudtyp)'; end if;
  update public.dim_objekt set avtalsform = 'Au' where objekt_id = '11166477';
  if (select auto_ifyllt ? 'avtalsform' from public.dim_objekt where objekt_id = '11166477') then raise exception '5: märkningen blev kvar (avtalsform)'; end if;
  -- …och de gamla fälten gäller som förut.
  update public.dim_objekt set bolag = 'Vida' where objekt_id = '11166477';
  update public.dim_objekt set grot_anpassad = true where objekt_id = '11166477';
  if (select auto_ifyllt->>'grot_anpassad' from public.dim_objekt where objekt_id = '11166477') <> 'manuell' then raise exception '5: grot_anpassad-regeln bröts'; end if;

  -- 6. Grot synkar risskotning.
  insert into public.dim_objekt (objekt_id, object_name, vo_nummer) values ('g1', 'GROT Husjönäs', 'g1');
  perform public.redigering_skriv_auto(array['g1'], 'huvudtyp', 'Grot', 'namnet, trakten');
  if (select risskotning from public.dim_objekt where objekt_id = 'g1') is not true then raise exception '6: risskotning sattes inte'; end if;

  -- 7. Flaggan släpps efter körningen (annars skulle en senare ändring i samma transaktion behålla märkningen).
  if coalesce(current_setting('app.autofyll', true), '') <> '' then raise exception '7: app.autofyll ligger kvar'; end if;

  -- 8. Bara service_role får köra den.
  if has_function_privilege('authenticated', 'public.redigering_skriv_auto(text[],text,text,text)', 'execute') then raise exception '8: authenticated får köra'; end if;
  if has_function_privilege('anon', 'public.redigering_skriv_auto(text[],text,text,text)', 'execute') then raise exception '8: anon får köra'; end if;
  if not has_function_privilege('service_role', 'public.redigering_skriv_auto(text[],text,text,text)', 'execute') then raise exception '8: service_role får inte köra'; end if;
end $$;

-- 9. Migrationen går att köra igen.
\i supabase/migrations/20261024161533_redigering_skriv_auto.sql
select 'OK' as resultat;
