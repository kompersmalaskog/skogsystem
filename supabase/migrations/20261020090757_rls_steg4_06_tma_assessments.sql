alter policy "Allow all for anon" on public.tma_assessments to authenticated;
revoke all on public.tma_assessments from anon;