alter policy "Allow all access to gps_tracks" on public.gps_tracks to authenticated;
alter policy "Autentiserade kan hantera gps_tracks" on public.gps_tracks to authenticated;
revoke all on public.gps_tracks from anon;