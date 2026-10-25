alter policy "Allow all access to feedback" on public.feedback to authenticated;
revoke all on public.feedback from anon;