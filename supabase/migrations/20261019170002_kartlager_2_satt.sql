create or replace function satt_kartlager(p_lager text) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  if p_lager is null or p_lager not in ('satellite', 'lantmateriet', 'terrain', 'osm') then
    raise exception 'Okänt kartlager: %', p_lager;
  end if;
  update medarbetare set kartlager = p_lager where user_id = auth.uid();
  return found;
end;
$$;
