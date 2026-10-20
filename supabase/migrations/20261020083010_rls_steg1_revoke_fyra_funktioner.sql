-- RLS-granskning steg 1 (docs/rls-anon-granskning.md): de fyra volatila SECURITY DEFINER-funktionerna som anon kunde köra utan kontroll av anroparen.
-- EXECUTE kom både via PUBLIC (=X/postgres) och som explicit grant till anon, så båda tas bort. authenticated och service_role har egna explicita grants och berörs inte.
revoke execute on function public."fortnox_kör_sync"()        from public, anon;
revoke execute on function public."avtal_kör_notify"()        from public, anon;
revoke execute on function public."fordon_kör_notify"()       from public, anon;
revoke execute on function public.fyll_dim_fran_trakt(uuid)   from public, anon;