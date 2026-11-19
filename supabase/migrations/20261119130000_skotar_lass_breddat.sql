-- Lasskortet: breddat eller smalt lastrum (en av två) per lass. Additiv: en kolumn och en funktion som skriver den.
-- Gamla appversioner skickar inget breddat (false), nya läser '*' och tål att kolumnen saknas.
alter table skotar_lass add column if not exists breddat boolean not null default false;

create or replace function skotar_lass_rad_spara(p_id uuid, l jsonb) returns void
language plpgsql
set search_path = public
as $$
begin
  insert into skotar_lass (id, objekt_id, vo_nummer, maskin_id, medarbetare_id, lass_nummer, datum, status, bekraftad_av, bekraftad_tid,
                           breddat, spar, vagar, skapad, andrad)
  values (p_id, (l ->> 'objekt_id')::uuid, l ->> 'vo_nummer', l ->> 'maskin_id', nullif(l ->> 'medarbetare_id', '')::uuid,
          (l ->> 'lass_nummer')::int, (l ->> 'datum')::date, l ->> 'status', nullif(l ->> 'bekraftad_av', ''),
          nullif(l ->> 'bekraftad_tid', '')::timestamptz, coalesce((l ->> 'breddat')::boolean, false),
          coalesce(l -> 'spar', '[]'::jsonb), coalesce(l -> 'vagar', '[]'::jsonb),
          coalesce((l ->> 'skapad')::timestamptz, now()), coalesce((l ->> 'andrad')::timestamptz, now()))
  on conflict (id) do update set
    status = excluded.status, bekraftad_av = excluded.bekraftad_av, bekraftad_tid = excluded.bekraftad_tid, breddat = excluded.breddat,
    spar = excluded.spar, vagar = excluded.vagar, andrad = excluded.andrad, mottagen = now();
end;
$$;
