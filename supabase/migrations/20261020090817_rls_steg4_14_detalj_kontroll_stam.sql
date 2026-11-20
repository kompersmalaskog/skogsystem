alter policy "stam_read" on public.detalj_kontroll_stam to authenticated;
alter policy "stam_write" on public.detalj_kontroll_stam to authenticated;
revoke all on public.detalj_kontroll_stam from anon;