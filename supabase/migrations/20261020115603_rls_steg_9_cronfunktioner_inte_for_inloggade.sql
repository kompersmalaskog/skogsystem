-- Tre SECURITY DEFINER-funktioner som bara pg_cron (som postgres) anropar och som inte kontrollerar anroparen:
-- vilken inloggad som helst kunde trigga en Fortnox-synk eller ett utskick via /rest/v1/rpc/. EXECUTE tas bort från authenticated;
-- postgres (pg_cron) och service_role behåller det. anon och PUBLIC saknade det redan (steg 1).
-- MEDVETET INTE med: fyll_dim_fran_trakt (anropas av INVOKER-triggrarna objekt_autofyll_dim och dim_objekt_autofyll_fran_trakt som den
-- inloggade — en revoke skulle få varje objektskrivning att falla) och helikopter_notis_vecka/_manad (admin-kontroll i kroppen; _vecka anropas av appen).
revoke execute on function public."fortnox_kör_sync"() from authenticated;
revoke execute on function public."avtal_kör_notify"() from authenticated;
revoke execute on function public."fordon_kör_notify"() from authenticated;
