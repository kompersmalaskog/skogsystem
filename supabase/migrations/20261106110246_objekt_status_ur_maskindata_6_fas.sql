-- Del 6: fasen på trakten i ord (Martin 2026-11-06: "jag vet ju inte om det är färdigskördat eller skotat").
-- objekt.fas skrivs av samma timjobb: 'skordas' (skördaren håller på), 'skotas' (skördat klart, skotaren har börjat),
-- 'vantar_skotare' (skördat klart, ingen skotare än), null (inte börjat eller avslutat).
alter table public.objekt add column if not exists fas text;

create or replace function public.objekt_status_ur_maskindata(p_skriv boolean default false)
returns table(trakt text, fran text, till text, varfor text)
language plpgsql security definer set search_path to 'public' as $f$
#variable_conflict use_column
declare
  r record; d record; ny text; ny_skal text; klar boolean; borjat boolean; senast date; slut date; v_fas text;
begin
  perform set_config('app.status_auto', 'on', true);
  for r in
    select o.id oid, o.namn onamn, o.status ostatus, o.status_auto_skal oskal, o.fortsatt_at ofort, o.created_at oskapad, o.fas ofas,
           b.ids bids, b.ej_var_skot bej, b.skordat bskordat, b.skord_datum bskd, b.skot_datum bstd
    from objekt o join avslut_ur_maskindata_berakna() b on b.gkey = o.id::text
    where o.status in ('oplanerad', 'planerad', 'pagaende', 'skotning', 'avslutat') and not b.alla_exkl
  loop
    senast := greatest(r.bskd, r.bstd);

    if r.ofort is not null and senast > r.ofort then
      if p_skriv then
        update dim_objekt x set skordning_ej_klar = false where x.objekt_id = any (r.bids) and x.skordning_ej_klar;
        update dim_objekt x set skotning_ej_klar = false where x.objekt_id = any (r.bids) and x.skotning_ej_klar;
        update objekt set fortsatt_at = null where id = r.oid;
      end if;
      continue;
    end if;

    select bool_or(x.skordning_avslutad is not null) and not bool_or(coalesce(x.skordning_ej_klar, false)) sk,
           bool_or(x.skotning_avslutad is not null) and not bool_or(coalesce(x.skotning_ej_klar, false)) st,
           bool_or(coalesce(x.skordning_ej_klar, false) or coalesce(x.skotning_ej_klar, false)) ej,
           max(x.skordning_avslutad) skd, max(x.skotning_avslutad) std,
           max(x.skordning_auto_skal) sks, max(x.skotning_auto_skal) sts
      into d from dim_objekt x where x.objekt_id = any (r.bids);

    klar := not coalesce(d.ej, false)
      and (coalesce(d.sk, false) or (coalesce(r.bskordat, 0) = 0 and r.bskd is null))
      and (coalesce(d.st, false) or r.bej)
      and (coalesce(d.sk, false) or coalesce(d.st, false));
    borjat := senast is not null and senast >= coalesce(r.oskapad::date, date '1900-01-01') - 30;
    ny := null;

    if klar and r.ostatus <> 'avslutat' then
      ny := 'avslutat';
      slut := greatest(d.skd, d.std);
      ny_skal := 'Klar ' || sv_kort_datum(slut) || coalesce(' · ' || coalesce(d.sts, case when d.std is null then d.sks end), '');
    elsif not klar and r.ostatus in ('oplanerad', 'planerad') and borjat then
      ny := 'pagaende';
      ny_skal := 'Maskinerna har kört här ' || sv_kort_datum(senast);
    elsif not klar and r.ostatus = 'avslutat' and r.oskal is not null then
      ny := 'pagaende';
      ny_skal := 'Maskinerna har kört här igen ' || sv_kort_datum(senast);
    end if;

    -- Fasen: bara för det som inte är (eller blir) avslutat.
    v_fas := null;
    if coalesce(ny, r.ostatus) <> 'avslutat' and borjat and not klar then
      if coalesce(d.sk, false) and not r.bej then
        v_fas := case when r.bstd is not null and r.bstd >= coalesce(d.skd, r.bstd) - 30 then 'skotas' else 'vantar_skotare' end;
      elsif not coalesce(d.sk, false) and r.bskd is not null then
        v_fas := 'skordas';
      elsif r.bstd is not null then
        v_fas := 'skotas';
      end if;
    end if;
    if p_skriv and v_fas is distinct from r.ofas then
      update objekt set fas = v_fas where id = r.oid;
    end if;

    if ny is not null then
      trakt := r.onamn; fran := r.ostatus; till := ny; varfor := ny_skal;
      if p_skriv then
        update objekt set status = ny, status_auto_skal = ny_skal,
          avslutad_timestamp = case when ny = 'avslutat' then coalesce(avslutad_timestamp, slut::timestamptz, now()) else null end,
          pagaende_startad_timestamp = case when ny = 'pagaende' then coalesce(pagaende_startad_timestamp, now()) else pagaende_startad_timestamp end
        where id = r.oid;
      end if;
      return next;
    end if;
  end loop;
end
$f$;
revoke all on function public.objekt_status_ur_maskindata(boolean) from public, anon, authenticated;
