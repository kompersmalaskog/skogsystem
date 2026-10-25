alter policy "objekt_kvittering allow all" on public.objekt_kvittering to authenticated;
revoke all on public.objekt_kvittering from anon;