-- Föraren från Opti, del 3: omräkningen när Opti-filen kommer (eller när en profil kopplas) + skydd för kvittenstiderna.
--
-- `forare_rakna_om(maskin, från, till)` rör om i allt som hör till maskinen under fönstret, och TRIGGRARNA (del 4) räknar fram
-- svaret — här skrivs ingen regel en andra gång. Strukna lass hoppas över (de rörs inte), och besök i testläge likaså.
--
-- Kvittenstiderna sätts av servern vid VARJE UPDATE (korvy_kvittens_forare_satt_tid / kommentar_sett_forare_satt_tid: `now()`).
-- En omräkning är en UPDATE — utan skyddet skulle den skriva om beviset på NÄR föraren tryckte Sett. Omräkningen sätter därför
-- en transaktionslokal flagga (`app.forare_omrakning`) och tidsutlösarna lämnar tiden orörd när den står på. En vanlig upsert
-- från enheten är opåverkad (flaggan är av).

create or replace function public.korvy_kvittens_forare_satt_tid()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.forare_omrakning', true), '') = 'on' then
    new.kvitterad_at := old.kvitterad_at;
    return new;
  end if;
  new.kvitterad_at := now();
  return new;
end
$$;

create or replace function public.kommentar_sett_forare_satt_tid()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.forare_omrakning', true), '') = 'on' then
    new.sett_at := old.sett_at;
    return new;
  end if;
  new.sett_at := now();
  return new;
end
$$;

create or replace function public.forare_rakna_om(p_maskin text, p_fran timestamptz, p_till timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  d1 date := (p_fran at time zone 'Europe/Stockholm')::date - 1;
  d2 date := (p_till at time zone 'Europe/Stockholm')::date + 1;
begin
  if p_maskin is null or p_fran is null or p_till is null then return; end if;
  perform set_config('app.forare_omrakning', 'on', true);
  update skotar_lass set forare_kalla = forare_kalla
    where maskin_id = p_maskin and status <> 'struket' and datum between d1 and d2
      and coalesce(bekraftad_tid, skapad) between p_fran and p_till;
  update objekt_besok_kvittens set forare_kalla = forare_kalla
    where maskin_id = p_maskin and not coalesce(testlage, false) and kvitterad_at between p_fran and p_till;
  -- Kvittenserna saknar maskin (enheten skickar den inte): maskinen är skribentens egen maskin, och bara en förare räknas.
  update korvy_kvittens_forare k set utford_kalla = k.utford_kalla
    from medarbetare m
    where m.id = k.forare_id and m.roll = 'forare' and m.maskin_id = p_maskin and k.kvitterad_at between p_fran and p_till;
  update kommentar_sett_forare k set utford_kalla = k.utford_kalla
    from medarbetare m
    where m.id = k.forare_id and m.roll = 'forare' and m.maskin_id = p_maskin and k.sett_at between p_fran and p_till;
  perform set_config('app.forare_omrakning', 'off', true);
end $$;

revoke all on function public.forare_rakna_om(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.forare_rakna_om(text, timestamptz, timestamptz) to service_role;
