alter policy "Allow all access to briefing_status" on public.briefing_status to authenticated;
revoke all on public.briefing_status from anon;