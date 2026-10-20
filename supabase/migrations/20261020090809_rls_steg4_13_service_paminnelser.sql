alter policy "service_paminnelser_all" on public.service_paminnelser to authenticated;
revoke all on public.service_paminnelser from anon;