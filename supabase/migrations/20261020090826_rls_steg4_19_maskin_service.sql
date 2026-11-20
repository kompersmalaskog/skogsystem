alter policy "maskin_service_all" on public.maskin_service to authenticated;
revoke all on public.maskin_service from anon;