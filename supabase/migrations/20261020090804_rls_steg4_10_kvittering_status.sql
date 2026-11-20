alter policy "Allow all access to kvittering_status" on public.kvittering_status to authenticated;
revoke all on public.kvittering_status from anon;