alter policy "Allow all for anon" on public.brand_samrad to authenticated;
revoke all on public.brand_samrad from anon;