-- SÄKERHET: anon och authenticated ska inte ha TRUNCATE, TRIGGER eller REFERENCES på något i schemat public.
--
-- Före (prod 2026-10-23): `anon` hade TRUNCATE/TRIGGER/REFERENCES på 178 av 223 tabeller och 25 av 37 vyer, `authenticated`
-- på 213 respektive 35 — Supabases standard-rättigheter (default privileges ger `arwdDxtm` till anon, authenticated och
-- service_role på varje ny tabell). Appen använder aldrig någon av dem via API:et (PostgREST exponerar inte TRUNCATE), men
-- TRUNCATE kringgår RLS helt, TRIGGER låter en roll lägga en trigger på en tabell och REFERENCES låter den skapa främmande
-- nycklar mot den — rättigheter ingen webbläsare ska ha. SELECT/INSERT/UPDATE/DELETE rörs inte (RLS styr dem).
--
-- 1) Återkalla på allt som finns. 2) Ändra default privileges så att NYA tabeller inte får dem:
--    för rollen som kör migrationen (postgres) och — om rättigheten finns — för supabase_admin, som äger vissa objekt.
--    Prod 2026-10-23: postgres är INTE medlem i supabase_admin (pg_has_role = false), så den raden ger insufficient_privilege och
--    skippas med en NOTICE. Följden är liten: nya tabeller som skapas av supabase_admin (inte av postgres, som skapar allt som
--    migrationer och Table Editor gör) får fortfarande standard-rättigheterna. Kontrollera efter varje ny tabell, eller kör raden
--    som supabase_admin om det går.
-- service_role och postgres behåller allt.
--
-- Schemat storage har samma standard-rättigheter (storage.objects m.fl.) men förvaltas av Supabase och rörs inte här.
--
-- KÖRS INTE AV KODSESSIONEN — Martin kör via apply_migration.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

do $$
begin
  alter default privileges for role supabase_admin in schema public revoke truncate, trigger, references on tables from anon, authenticated;
exception when insufficient_privilege or undefined_object then
  raise notice 'Kunde inte ändra default privileges för supabase_admin — kör: alter default privileges for role supabase_admin in schema public revoke truncate, trigger, references on tables from anon, authenticated;';
end;
$$;
