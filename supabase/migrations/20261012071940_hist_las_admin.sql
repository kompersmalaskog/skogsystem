-- Historikimport (steg 10): bara admin får läsa historiken.
-- Admin avgörs som i resten av Skogsystem: public.ar_admin() = finns medarbetare med user_id = auth.uid() och roll = 'admin'
-- (SECURITY DEFINER, se 20260524115934_rls_hjalpfunktioner.sql). Chef räknas alltså INTE som admin här.
--
-- Rör bara: de sju läspolicyerna på hist_* (ALTER POLICY, samma namn, samma roll authenticated, ny USING) och EN ny policy på storage.objects
-- som gäller bucketen 'historik' och inget annat. Inga andra tabeller, vyer, funktioner eller befintliga policyer ändras.
-- vy_hist_* är security_invoker och ärver därför admin-kravet. service_role kringgår RLS och påverkas inte (importskriptet fungerar som förut).
-- (select public.ar_admin()) i stället för public.ar_admin() så att Postgres räknar ut det en gång per fråga, inte per rad.

alter policy hist_maskin_las on hist_maskin using ((select public.ar_admin()));
alter policy hist_forare_las on hist_forare using ((select public.ar_admin()));
alter policy hist_rapport_las on hist_rapport using ((select public.ar_admin()));
alter policy hist_objekt_las on hist_objekt using ((select public.ar_admin()));
alter policy hist_skift_las on hist_skift using ((select public.ar_admin()));
alter policy hist_forare_objekt_las on hist_forare_objekt using ((select public.ar_admin()));
alter policy hist_stopp_las on hist_stopp using ((select public.ar_admin()));

-- Läs i bucketen 'historik' (för createSignedUrl): bara admin. Ingen skrivpolicy (skrivning sker bara med service_role).
create policy historik_las_admin on storage.objects for select to authenticated
  using (bucket_id = 'historik' and (select public.ar_admin()));
