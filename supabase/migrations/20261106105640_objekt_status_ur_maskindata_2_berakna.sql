-- Del 2: avslut_ur_maskindata_berakna — 810E (manuell maskin) räknas med via appens körspår och lass, och appens lass räknas
-- bara när föraren tryckt Klar (status bekraftat, inte 'auto'). Patch av den befintliga definitionen (MCP hänger på hela texten).
do $do$
declare d text := pg_get_functiondef('public.avslut_ur_maskindata_berakna()'::regprocedure);
  par text[][] := array[
    array['l.datum FROM fakt_lass l', 'l.datum, ''fil''::text kalla FROM fakt_lass l'],
    array['t.datum FROM fakt_tid t', 't.datum, ''fil'' FROM fakt_tid t'],
    array[E's.datum FROM skotar_lass s WHERE s.status <> ''struket''\n)',
          E's.datum, ''app'' FROM skotar_lass s WHERE s.status <> ''struket''\n  UNION ALL\n  SELECT h.maskin_id, NULL, NULL, h.objekt_id, h.datum, ''app'' FROM hyttspar h\n    JOIN dim_maskin hm ON hm.maskin_id = h.maskin_id AND hm.datakalla = ''manuell''\n    WHERE h.roll = ''skotare'' AND h.objekt_id IS NOT NULL\n)'],
    array['AND coalesce(dm.datakalla, '''') <> ''manuell''', 'AND (coalesce(dm.datakalla, '''') <> ''manuell'' OR a.kalla = ''app'')'],
    array[E'WHERE s.status <> ''struket''\n            AND (s.objekt_id::text', E'WHERE s.status = ''bekraftat'' AND coalesce(s.bekraftad_av, '''') <> ''auto''\n            AND (s.objekt_id::text']
  ];
  i int; n int;
begin
  for i in 1 .. array_length(par, 1) loop
    n := (length(d) - length(replace(d, par[i][1], ''))) / length(par[i][1]);
    if n <> 1 then raise exception 'Patch % hittades % gånger', i, n; end if;
    d := replace(d, par[i][1], par[i][2]);
  end loop;
  execute d;
end
$do$;
