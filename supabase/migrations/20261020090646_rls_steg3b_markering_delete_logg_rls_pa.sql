-- RLS-granskning steg 3b: markering_delete_logg. Skrivs bara av triggern logg_raderad_markering (SECURITY DEFINER, ägare postgres med bypassrls); inget i appen läser den.
alter table public.markering_delete_logg enable row level security;
revoke all on public.markering_delete_logg from anon;