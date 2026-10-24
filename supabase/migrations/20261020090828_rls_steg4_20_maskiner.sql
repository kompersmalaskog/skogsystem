alter policy "Allow all maskiner" on public.maskiner to authenticated;
alter policy "read_maskiner" on public.maskiner to authenticated;
revoke all on public.maskiner from anon;