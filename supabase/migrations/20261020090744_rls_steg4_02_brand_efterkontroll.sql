alter policy "Allow all for anon" on public.brand_efterkontroll to authenticated;
revoke all on public.brand_efterkontroll from anon;