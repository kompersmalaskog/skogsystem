create or replace function skotar_farduskotat(p_objekt uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_vo text;
  b jsonb;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  select vo_nummer into v_vo from objekt where id = p_objekt;
  if not found then raise exception 'Trakten finns inte'; end if;
  b := skotar_avslut_berakna(p_objekt);
  insert into skotar_trakt_avslut (objekt_id, vo_nummer, avslutad_av, skordat, rapporterat, faktorer, tillagg, skillnad_m3)
  values (p_objekt, v_vo, auth.uid(), b -> 'skordat', b -> 'rapporterat', b -> 'faktorer', b -> 'tillagg', (b ->> 'skillnad_m3')::numeric)
  on conflict (objekt_id) do update set
    avslutad_tid = now(), avslutad_av = excluded.avslutad_av, skordat = excluded.skordat, rapporterat = excluded.rapporterat,
    faktorer = excluded.faktorer, tillagg = excluded.tillagg, skillnad_m3 = excluded.skillnad_m3;
  -- SAMMA fält, urval och datum som "Avsluta objekt" (lib/avslutaObjekt.ts): dim_objekt på vo_nummer, UTC-datum, bara där det saknas.
  -- Objektet i övrigt avslutas INTE (objekt.status rörs inte).
  update dim_objekt set skotning_avslutad = (now() at time zone 'utc')::date
   where vo_nummer = v_vo and skotning_avslutad is null;
  return b;
end;
$$;
