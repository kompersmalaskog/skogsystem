alter policy "Allow all for anon" on public.brand_tillbud to authenticated;
revoke all on public.brand_tillbud from anon;