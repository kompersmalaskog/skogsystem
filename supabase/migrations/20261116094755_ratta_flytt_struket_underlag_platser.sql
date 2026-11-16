-- Ett struket underlag visar samma maskin och platser som flytten (Martin 2026-11-16).
--
-- ratta_flytt uppdaterade underlagets maskin/från/till bara när flytten fortfarande faktureras. Rättades en flytt till något
-- som inte faktureras (H8 till skogsdagen i Tingsryd → typ Annat) ströks underlaget med de GAMLA platserna, så fakturasidans
-- "Vad är struket?" sa "H8E -26 till Järnemåla Rapp Au" när flytten var rättad till Kompersmåla Ga avd 210.
--
-- Ändringen läggs in i den befintliga funktionen med en ersättning på dess definition (resten är orört), och kastar om stället
-- inte hittas. Sedan rättas de underlag som redan står med andra platser än sin flytt — bara strukna och aldrig fakturerade
-- (prod 2026-11-16: 4 rader, alla strukna; inget aktivt eller fakturerat underlag skiljer).

do $patch$
declare
  d   text;
  gammal constant text := $g$        atgard := 'struket';
      end if;
    else
      if u.status = 'struken' then$g$;
  ny constant text := $n$        atgard := 'struket';
      end if;
      -- Struket eller inte: underlaget visar samma maskin och platser som flytten (aldrig ett fakturerat).
      update fakturaunderlag_flytt set
        maskin = coalesce(n_extern, n_maskin),
        fran_objekt_id = n_fran_o::text, fran_plats_id = n_fran_p, till_objekt_id = n_till_o::text, till_plats_id = n_till_p
       where id = u.id and fakturerad_tid is null
         and (maskin is distinct from coalesce(n_extern, n_maskin) or fran_objekt_id is distinct from n_fran_o::text
              or fran_plats_id is distinct from n_fran_p or till_objekt_id is distinct from n_till_o::text
              or till_plats_id is distinct from n_till_p);
    else
      if u.status = 'struken' then$n$;
begin
  select pg_get_functiondef('public.ratta_flytt(uuid,jsonb,text,text)'::regprocedure) into d;
  if position(ny in d) > 0 then
    raise notice 'ratta_flytt har redan ändringen';
    return;
  end if;
  if position(gammal in d) = 0 then
    raise exception 'ratta_flytt ser inte ut som väntat — ändringen lades inte in';
  end if;
  execute replace(d, gammal, ny);
end
$patch$;

update fakturaunderlag_flytt u set
  maskin = coalesce(f.extern_maskin, f.maskin_id),
  fran_objekt_id = f.fran_objekt_id::text, fran_plats_id = f.fran_plats_id,
  till_objekt_id = f.till_objekt_id::text, till_plats_id = f.till_plats_id
from maskin_flytt f
where f.id = u.flytt_id and u.status = 'struken' and u.fakturerad_tid is null
  and (u.maskin is distinct from coalesce(f.extern_maskin, f.maskin_id)
       or u.fran_objekt_id is distinct from f.fran_objekt_id::text or u.fran_plats_id is distinct from f.fran_plats_id
       or u.till_objekt_id is distinct from f.till_objekt_id::text or u.till_plats_id is distinct from f.till_plats_id);
