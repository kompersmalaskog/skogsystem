alter policy "vagdata_select" on public.objekt_vagdata to authenticated;
revoke all on public.objekt_vagdata from anon;