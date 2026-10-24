alter policy "kvittering_reset_logg allow all" on public.kvittering_reset_logg to authenticated;
revoke all on public.kvittering_reset_logg from anon;