-- Realtime på kartkommentar (Martin 2026-11-24, "Nytt från …" i körvyn): en ny eller ändrad kommentar från någon annan ska nå maskinen på sekunder, som markeringarna
-- (planering_markeringar ligger redan i publikationen). Klienten prenumererar på INSERT/UPDATE filtrerat på objekt_id (lib/hooks/useKartkommentarer) och läser om var minut
-- som reserv om anslutningen tappas — appen fungerar alltså även innan den här körts.
--
-- RLS: realtime levererar bara rader som den inloggade får SELECT:a, och policyn kartkommentar_select är `using (true)` för authenticated — samma rader som läsningen ger idag
-- (maskinkontot ingår; kartkommentar är inte bland de spärrade tabellerna). Ingen policy ändras här.
--
-- Idempotent: ALTER PUBLICATION ... ADD TABLE felar om tabellen redan är med.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kartkommentar') then
    alter publication supabase_realtime add table public.kartkommentar;
  end if;
end $$;
