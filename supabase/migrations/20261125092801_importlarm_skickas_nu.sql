do $$
declare src text;
begin
  select pg_get_functiondef('public.import_larm_kontroll()'::regprocedure) into src;
  src := replace(src, '''infinity''::timestamptz', 'now()');
  execute src;
end $$;
update "notis_kö" set skickas_at = now() where id = '6bdb40d2-9bad-4672-945c-c8c810f53ffe';