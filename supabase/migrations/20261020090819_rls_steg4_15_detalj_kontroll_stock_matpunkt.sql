alter policy "matpunkt_read" on public.detalj_kontroll_stock_matpunkt to authenticated;
alter policy "matpunkt_write" on public.detalj_kontroll_stock_matpunkt to authenticated;
revoke all on public.detalj_kontroll_stock_matpunkt from anon;