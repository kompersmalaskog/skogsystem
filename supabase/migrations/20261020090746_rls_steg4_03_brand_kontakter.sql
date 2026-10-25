alter policy "Allow all for anon" on public.brand_kontakter to authenticated;
revoke all on public.brand_kontakter from anon;