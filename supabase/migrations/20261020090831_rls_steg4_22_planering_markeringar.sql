alter policy "Anon full access" on public.planering_markeringar to authenticated;
revoke all on public.planering_markeringar from anon;