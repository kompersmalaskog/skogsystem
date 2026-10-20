alter policy "Allow all for anon" on public.avlagg_assessments to authenticated;
revoke all on public.avlagg_assessments from anon;