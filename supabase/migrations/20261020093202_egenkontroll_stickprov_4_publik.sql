-- Egenkontrollens månadsstickprov, del 4 av 4: ingången. Anropas av appen (första läsningen i en ny månad) OCH av /api/notis/flush
-- (Vercel-cronen, var 5:e minut) — vilken som kommer först drar; den andra får samma rad. Ingen pg_cron.
--
-- FÖRSTA DRAGNING: november 2026 (Martin: "börja om med stickprov från november"). Före det returnerar funktionen null och drar inget.
--
-- PUSH: den transaktion som skapar månadens rad köar EN notis till Martin (typ egenkontroll_stickprov, dedup per mottagare + månad).
--   * skickas_at = 'infinity' — som ledighets- och lassnotiserna: den gamla flushen på production skickar okända typer som en generisk
--     "Notis" + rå JSON, så raden får inte kunna tas av den. Den nya flushen tar typen oavsett skickas_at.
--   * payload.skicka_efter = 07:00 svensk tid samma dag, eller nu om dragningen sker senare (cronen drar strax efter midnatt;
--     en push 00:05 är fel). Texten byggs färskt vid utskick ur egenkontroll_stickprov.
--   * Tom månad (inga objekt) köar ingen notis.
create or replace function egenkontroll_stickprov()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c_forsta  constant date := date '2026-11-01';
  c_epost   constant text := 'martin.lindqvist@kompersmalaskog.com';
  v_manad   date := date_trunc('month', (now() at time zone 'Europe/Stockholm'))::date;
  v_idag    date := (now() at time zone 'Europe/Stockholm')::date;
  v         jsonb;
  r         record;
begin
  if v_manad < c_forsta then
    return null;
  end if;

  v := egenkontroll_stickprov_dra(v_manad);

  if (v ->> 'ny')::boolean and jsonb_array_length(v -> 'valda') > 0 then
    for r in select id from medarbetare where epost = c_epost loop
      insert into notis_kö (mottagare_id, typ, payload, skickas_at, datum)
      values (r.id, 'egenkontroll_stickprov',
              jsonb_build_object('manad', v_manad,
                                 'skicka_efter', greatest(now(), (v_idag::timestamp + interval '7 hours') at time zone 'Europe/Stockholm')),
              'infinity', v_manad)
      on conflict (typ, mottagare_id, datum) where datum is not null do nothing;
    end loop;
  end if;

  return v;
end $$;

revoke all on function egenkontroll_stickprov() from public, anon;
grant execute on function egenkontroll_stickprov() to authenticated, service_role;
