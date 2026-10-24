alter policy "Allow all for anon" on public.brand_brandvakt to authenticated;
revoke all on public.brand_brandvakt from anon;