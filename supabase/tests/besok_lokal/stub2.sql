-- Tillägg till stub.sql för migrationen 20261023190000_besok_uppstramning.sql: ar_admin() (finns i prod, security definer).
create or replace function public.ar_admin() returns boolean language sql stable security definer set search_path to 'public' as $$ select exists (select 1 from public.medarbetare where user_id = auth.uid() and roll = 'admin') $$;
grant execute on function public.ar_admin() to authenticated, service_role;
-- Som i Supabase: service_role kringgår RLS.
alter role service_role bypassrls;
